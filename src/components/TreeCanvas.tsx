import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import type { GraphBounds, GraphEdge, GraphNode } from "../lib/layout";

export interface TreeCanvasHandle {
  focusBranch: (ids: string[]) => void;
  fit: (animate?: boolean) => void;
  zoomBy: (factor: number) => void;
}

interface View {
  x: number;
  y: number;
  k: number;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bounds: GraphBounds;
  selectedId: string | null;
  familySet: Set<string> | null;
  onSelect: (id: string | null) => void;
  isAdmin?: boolean;
  onNodeDrag?: (id: string, x: number, y: number) => void;
  companyLogo?: string;
}

const K_MIN = 0.08;
const K_MAX = 4;

function clampK(k: number) {
  return Math.min(K_MAX, Math.max(K_MIN, k));
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Конвертация цвета (HSL или HEX) в RGB значения [0-1]
function colorToRGB(color: string): [number, number, number] {
  // Если цвет в формате HEX (#RRGGBB)
  if (color.startsWith('#')) {
    return [
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ];
  }
  
  // Если цвет в формате HSL (hsl(hue, saturation%, lightness%))
  if (color.startsWith('hsl')) {
    const match = color.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    if (match) {
      const h = parseFloat(match[1]) / 360;
      const s = parseFloat(match[2]) / 100;
      const l = parseFloat(match[3]) / 100;
      
      // Конвертация HSL в RGB
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      return [
        hue2rgb(p, q, h + 1/3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1/3),
      ];
    }
  }
  
  // По умолчанию - белый цвет
  return [1, 1, 1];
}

const TreeCanvas = forwardRef<TreeCanvasHandle, Props>(function TreeCanvas(props, ref) {
  const { nodes, edges, bounds, selectedId, familySet, onSelect, isAdmin, onNodeDrag, companyLogo } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const viewRef = useRef(view);
  viewRef.current = view;
  const animRef = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const downInfo = useRef<{ moved: number; nodeId: string | null } | null>(null);
  const dragState = useRef<{ nodeId: string; startWorldX: number; startWorldY: number; nodeStartX: number; nodeStartY: number } | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const nodeById = useRef(new Map<string, GraphNode>());
  
  // Удаляем дубликаты узлов, сохраняя первый встреченный
  const uniqueNodes = useMemo(() => {
    const seen = new Map<string, GraphNode>();
    nodes.forEach((n) => {
      if (!seen.has(n.id)) {
        seen.set(n.id, n);
      } else {
        console.warn(`Duplicate node found: ${n.id}. Keeping first occurrence.`);
      }
    });
    return Array.from(seen.values());
  }, [nodes]);
  
  nodeById.current = new Map(uniqueNodes.map((n) => [n.id, n]));

  const ringRadii = useMemo(() => {
    const valueNodes = uniqueNodes.filter((n) => n.tier === "value");
    const rootNodes = uniqueNodes.filter((n) => n.tier === "root");
    const supportNodes = uniqueNodes.filter((n) => n.tier === "support");

    const avgRadius = (nds: GraphNode[]) => {
      if (nds.length === 0) return 0;
      const sum = nds.reduce((s, n) => s + Math.hypot(n.x, n.y), 0);
      return sum / nds.length;
    };

    return [avgRadius(valueNodes), avgRadius(rootNodes), avgRadius(supportNodes)];
  }, [uniqueNodes]);



  function stopAnim() {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }

  function animateTo(target: View, dur = 520) {
    stopAnim();
    const from = { ...viewRef.current };
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = easeInOutCubic(p);
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        k: from.k + (target.k - from.k) * e,
      });
      if (p < 1) animRef.current = requestAnimationFrame(tick);
      else animRef.current = null;
    };
    animRef.current = requestAnimationFrame(tick);
  }

  function fitTarget(): View {
    const el = containerRef.current;
    if (!el) return viewRef.current;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    const k = clampK(Math.min((w * 0.85) / bw, (h * 0.85) / bh));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    return { x: w / 2 - cx * k, y: h / 2 - cy * k, k };
  }

  function zoomAt(px: number, py: number, factor: number, animate = false) {
    const v = viewRef.current;
    const k = clampK(v.k * factor);
    const wx = (px - v.x) / v.k;
    const wy = (py - v.y) / v.k;
    const target = { x: px - wx * k, y: py - wy * k, k };
    if (animate) animateTo(target, 320);
    else setView(target);
  }

  useImperativeHandle(ref, () => ({
    fit: (animate = true) => {
      const t = fitTarget();
      if (animate) animateTo(t, 620);
      else setView(t);
    },
    zoomBy: (factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor, true);
    },
    focusBranch: (ids: string[]) => {
      const el = containerRef.current;
      if (!el || ids.length === 0) return;

      const branchNodes = ids.map((id) => nodeById.current.get(id)).filter((n): n is GraphNode => n !== undefined);
      if (branchNodes.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const nd of branchNodes) {
        minX = Math.min(minX, nd.x - nd.r);
        minY = Math.min(minY, nd.y - nd.r);
        maxX = Math.max(maxX, nd.x + nd.r);
        maxY = Math.max(maxY, nd.y + nd.r);
      }

      const boxCenterX = (minX + maxX) / 2;
      const boxCenterY = (minY + maxY) / 2;
      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;

      const w = el.clientWidth;
      const h = el.clientHeight;
      const isDesktop = w >= 1024;
      const availableWidth = isDesktop ? w * 0.5 : w;
      const centerX = isDesktop ? w * 0.25 : w * 0.5;
      const centerY = h * 0.5;

      const padding = isDesktop ? 80 : 60;
      const scaleX = (availableWidth - padding * 2) / boxWidth;
      const scaleY = (h - padding * 2) / boxHeight;
      let targetK = clampK(Math.min(Math.min(scaleX, scaleY), 2.5));

      animateTo({ x: centerX - boxCenterX * targetK, y: centerY - boxCenterY * targetK, k: targetK }, 600);
    },
  }));

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = fitTarget();
    setView({ x: t.x, y: t.y, k: t.k * 0.45 });
    const raf = requestAnimationFrame(() => animateTo(t, 1100));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.00125));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const dimming = selectedId !== null;
  function edgeActive(ed: GraphEdge): boolean {
    if (selectedId && familySet) return familySet.has(ed.from) && familySet.has(ed.to);
    if (hoverId) return ed.from === hoverId || ed.to === hoverId;
    return false;
  }

  const hoverNode = hoverId ? nodeById.current.get(hoverId) : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden touch-none select-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={(e) => {
        const el = containerRef.current;
        if (!el) return;
        el.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        
        if (pointers.current.size === 1) {
          stopAnim();
          const target = (e.target as Element).closest?.("[data-node]") ?? null;
          const nodeId = target?.getAttribute("data-node") ?? null;
          downInfo.current = { moved: 0, nodeId };
          
          // Если админ и клик по узлу - начинаем drag
          if (isAdmin && nodeId && nodeId !== "company-core") {
            const node = nodeById.current.get(nodeId);
            if (node) {
              const v = viewRef.current;
              const worldX = (e.clientX - el.getBoundingClientRect().left - v.x) / v.k;
              const worldY = (e.clientY - el.getBoundingClientRect().top - v.y) / v.k;
              dragState.current = {
                nodeId,
                startWorldX: worldX,
                startWorldY: worldY,
                nodeStartX: node.x,
                nodeStartY: node.y,
              };
              setDragNodeId(nodeId);
            }
          } else {
            setIsPanning(true);
          }
        }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) {
          if (e.pointerType === "mouse" && pointers.current.size === 0) {
            const target = (e.target as Element).closest?.("[data-node]") ?? null;
            setHoverId(target?.getAttribute("data-node") ?? null);
          }
          return;
        }

        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (downInfo.current) downInfo.current.moved += Math.abs(dx) + Math.abs(dy);

        // Если drag - обновляем позицию узла
        if (dragState.current && isAdmin) {
          const el = containerRef.current;
          if (!el) return;
          const v = viewRef.current;
          const rect = el.getBoundingClientRect();
          const worldX = (e.clientX - rect.left - v.x) / v.k;
          const worldY = (e.clientY - rect.top - v.y) / v.k;
          
          const deltaX = worldX - dragState.current.startWorldX;
          const deltaY = worldY - dragState.current.startWorldY;
          
          const newX = dragState.current.nodeStartX + deltaX;
          const newY = dragState.current.nodeStartY + deltaY;
          
          const node = nodeById.current.get(dragState.current.nodeId);
          if (node) {
            node.x = newX;
            node.y = newY;
            setDragNodeId(dragState.current.nodeId);
          }
        } else {
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
      }}
      onPointerUp={(e) => {
        const el = containerRef.current;
        if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        pointers.current.delete(e.pointerId);
        
        if (pointers.current.size === 0) {
          setIsPanning(false);
          const info = downInfo.current;
          downInfo.current = null;
          
          // Если был drag - сохраняем позицию
          if (dragState.current && isAdmin && onNodeDrag) {
            const node = nodeById.current.get(dragState.current.nodeId);
            if (node) {
              onNodeDrag(dragState.current.nodeId, node.x, node.y);
            }
          }
          
          dragState.current = null;
          setDragNodeId(null);
          
          if (info && info.moved < 7) onSelect(info.nodeId);
        }
      }}
      onPointerCancel={() => {
        pointers.current.clear();
        setIsPanning(false);
        downInfo.current = null;
        dragState.current = null;
        setDragNodeId(null);
      }}
      onPointerLeave={() => setHoverId(null)}
    >
      <svg className="block h-full w-full">
        <defs>
          <pattern id="dotGrid" width="34" height="34" patternUnits="userSpaceOnUse">
            <circle cx="1.3" cy="1.3" r="1.15" fill="rgba(147,171,178,0.11)" />
          </pattern>
          <radialGradient id="coreHalo">
            <stop offset="0%" stopColor="rgba(67,214,181,0.10)" />
            <stop offset="55%" stopColor="rgba(67,214,181,0.035)" />
            <stop offset="100%" stopColor="rgba(67,214,181,0)" />
          </radialGradient>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect x={-2600} y={-2600} width={5200} height={5200} fill="url(#dotGrid)" />

          {ringRadii.map((r, i) => (
            <circle
              key={i}
              cx={0}
              cy={0}
              r={r}
              fill="none"
              stroke="rgba(147,171,178,0.09)"
              strokeWidth={i === 0 ? 1.2 : 1}
              strokeDasharray={i === 2 ? "2 10" : "1 7"}
            />
          ))}
          <circle cx={0} cy={0} r={540} fill="url(#coreHalo)" />

          {edges.map((ed) => {
            const active = edgeActive(ed);
            const dim = dimming && !active;
            return (
              <g key={ed.id} className="edge-g" style={{ opacity: dim ? 0.06 : 1 }}>
                <path
                  d={ed.d}
                  pathLength={1}
                  className="edge-draw"
                  style={{ animationDelay: `${ed.delay}s` }}
                  fill="none"
                  stroke={ed.color}
                  strokeWidth={active ? 18 : 13}
                  strokeLinecap="round"
                  opacity={active ? 0.2 : 0.08}
                />
                <path
                  d={ed.d}
                  pathLength={1}
                  className={`edge-draw ${active ? "edge-flow" : ""}`}
                  style={{ animationDelay: `${ed.delay}s` }}
                  fill="none"
                  stroke={ed.color}
                  strokeWidth={active ? 5.2 : 3.2}
                  strokeLinecap="round"
                  opacity={active ? 1 : 0.42}
                />
              </g>
            );
          })}

          {uniqueNodes.map((nd) => (
            <NodeGlyph
              key={nd.id}
              node={nd}
              hovered={hoverId === nd.id}
              selected={selectedId === nd.id}
              dimmed={dimming && familySet ? !familySet.has(nd.id) : false}
              companyLogo={(nd.tier === "company" || nd.tier === "root") ? companyLogo : undefined}
            />
          ))}
        </g>
      </svg>

      {(() => {
        const hoverNode = hoverId ? nodeById.current.get(hoverId) : undefined;
        if (!hoverNode || isPanning) return null;
        return (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-lg border bg-ink-900/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur-sm"
          style={{
            left: hoverNode.x * view.k + view.x,
            top: (hoverNode.y - hoverNode.r - 12) * view.k + view.y,
            transform: "translate(-50%, -100%)",
            borderColor: `${hoverNode.color}55`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hoverNode.color }} />
            <span className="text-[13px] font-semibold text-mist-100">{hoverNode.title}</span>
          </div>
          <div className="mt-0.5 pl-4 text-[10.5px] font-medium uppercase tracking-[0.14em] text-mist-500">
            {hoverNode.tier === "value" ? "ценность" : hoverNode.tier === "root" ? "корневое обещание" : hoverNode.tier === "support" ? "поддерживающее" : "ядро"}
            <span className="normal-case tracking-normal"> · клик — карточка</span>
          </div>
        </div>
        );
      })()}
    </div>
  );
});

function NodeGlyph({
  node,
  hovered,
  selected,
  dimmed,
  companyLogo,
}: {
  node: GraphNode;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  companyLogo?: string;
}) {
  const { tier, r, color, short } = node;
  const lines = tier === "root" ? short.split(" ") : [];

  return (
    <g
      data-node={node.id}
      transform={`translate(${node.x} ${node.y})`}
      className="node-g cursor-pointer"
      style={{ opacity: dimmed ? 0.16 : 1 }}
    >
      <g className="node-pop" style={{ animationDelay: `${node.delay}s` }}>
        <circle r={r + 10} fill="rgba(0,0,0,0)" />

        {tier === "company" && (
          <>
            <circle r={r + 44} fill="none" stroke="rgba(143,182,192,0.25)" strokeWidth={2} strokeDasharray="2 12" className="ring-spin" />
            <circle r={r} className="pulse-ring" fill="none" stroke="rgba(242,180,90,0.5)" strokeWidth={3} />
            <circle r={r} fill="#0e2029" stroke="#8fb6c0" strokeWidth={4} />
            {companyLogo ? (
              <image
                href={companyLogo}
                x={-r * 0.7}
                y={-r * 0.7}
                width={r * 1.4}
                height={r * 1.4}
                preserveAspectRatio="xMidYMid meet"
                clipPath="circle(100%)"
              />
            ) : (
              <>
                <circle r={8.4} fill="#eaf4f2" opacity={0.92} />
                {[
                  { a: -90, c: "#43d6b5" },
                  { a: 30, c: "#f2b45a" },
                  { a: 150, c: "#f2836b" },
                ].map(({ a, c }) => {
                  const rad = (a * Math.PI) / 180;
                  const x2 = Math.cos(rad) * 38;
                  const y2 = Math.sin(rad) * 38;
                  return (
                    <g key={a}>
                      <line x1={Math.cos(rad) * 12} y1={Math.sin(rad) * 12} x2={Math.cos(rad) * 30} y2={Math.sin(rad) * 30} stroke="#8fb6c0" strokeWidth={2.6} opacity={0.7} />
                      <circle cx={x2} cy={y2} r={6.8} fill={c} />
                    </g>
                  );
                })}
              </>
            )}
            <text
              y={r + 48}
              textAnchor="middle"
              fontSize={21}
              letterSpacing="0.22em"
              fill="#93abb2"
              style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}
            >
              {short.toUpperCase()}
            </text>
          </>
        )}

        {tier === "value" && (
          <>
            <circle r={r + 60} fill={color} opacity={hovered || selected ? 0.13 : 0.07} />
            <circle r={r + 30} fill="none" stroke={color} strokeWidth={3.6} strokeDasharray="9 27" opacity={0.5} className="ring-spin" />
            <circle r={r} fill="#0d1b24" stroke={color} strokeWidth={7.8} />
            <circle r={r - 21} fill="none" stroke={color} strokeWidth={3} opacity={0.22} />
            <text
              y={12}
              textAnchor="middle"
              fontSize={Math.min(50, Math.max(22, (r * 1.5) / (short.length * 0.65)))}
              fill="#eaf4f2"
              style={{ fontFamily: "var(--font-display)", fontWeight: 500, letterSpacing: "0.01em" }}
            >
              {short}
            </text>
          </>
        )}

        {tier === "root" && (
          <>
            <circle r={r + 22} fill={color} opacity={hovered || selected ? 0.14 : 0.06} />
            <circle r={r} fill="#0d1b24" stroke={color} strokeWidth={4.2} />
            
            {/* Логотип компании с перекрашиванием в цвет ветки */}
            {companyLogo ? (
              <>
                {(() => {
                  const [r, g, b] = colorToRGB(color);
                  return (
                    <defs>
                      <filter id={`recolor-${node.id}`}>
                        <feColorMatrix
                          type="matrix"
                          values={`0 0 0 0 ${r}
                                   0 0 0 0 ${g}
                                   0 0 0 0 ${b}
                                   0 0 0 1 0`}
                        />
                      </filter>
                    </defs>
                  );
                })()}
                <image
                  href={companyLogo}
                  x={-r * 0.5}
                  y={-r * 0.5}
                  width={r}
                  height={r}
                  preserveAspectRatio="xMidYMid meet"
                  filter={`url(#recolor-${node.id})`}
                  opacity={0.9}
                />
              </>
            ) : (
              /* Fallback: текст если нет логотипа */
              (() => {
                const maxFontSize = 22;
                const minFontSize = 12;
                const fontSize = Math.min(maxFontSize, Math.max(minFontSize, (r * 0.8) / (short.length * 0.55)));
                
                if (lines.length === 1) {
                  return (
                    <text y={7} textAnchor="middle" fontSize={fontSize} fill="#eaf4f2" style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}>
                      {lines[0]}
                    </text>
                  );
                } else {
                  return lines.map((ln, i) => (
                    <text key={i} y={i === 0 ? -8 : 16} textAnchor="middle" fontSize={fontSize} fill="#eaf4f2" style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}>
                      {ln}
                    </text>
                  ));
                }
              })()
            )}
          </>
        )}

        {tier === "support" && (
          <>
            <circle r={r + 16} fill={color} opacity={hovered || selected ? 0.16 : 0} />
            <circle r={r} fill="#0d1b24" stroke={color} strokeWidth={3.4} opacity={0.95} />
            <circle r={8.8} fill={color} opacity={0.9} />
          </>
        )}

        {selected && (
          <circle
            r={r + (tier === "value" ? 34 : tier === "company" ? 24 : 16)}
            fill="none"
            stroke={color}
            strokeWidth={3.2}
            strokeDasharray="10 14"
            opacity={0.95}
            className="ring-spin-rev"
          />
        )}
        {hovered && !selected && (
          <circle r={r + 10} fill="none" stroke={color} strokeWidth={2.8} opacity={0.6} />
        )}
      </g>
    </g>
  );
}

export default TreeCanvas;
