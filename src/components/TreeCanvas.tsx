import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import type { GraphBounds, GraphEdge, GraphNode } from "../lib/layout";

// ─── Constants ───────────────────────────────────────────────────

const ZOOM_MIN = 0.08;
const ZOOM_MAX = 4;
const ZOOM_SENSITIVITY = 0.00125;
const FIT_PADDING = 0.85;
const INITIAL_ZOOM_FACTOR = 0.45;
const FIT_ANIMATION_DURATION = 620;
const ZOOM_ANIMATION_DURATION = 320;
const INITIAL_ANIMATION_DURATION = 1100;
const FOCUS_ANIMATION_DURATION = 600;
const CLICK_THRESHOLD = 7;
const LOW_ZOOM_THRESHOLD = 0.3;
const LOW_ZOOM_BOOST = 1.5;
const GRID_SIZE = 5200;
const CORE_HALO_RADIUS = 540;
const DOT_GRID_SIZE = 34;

const EDGE_STYLES = {
  background: { width: { active: 18, inactive: 13 }, opacity: { active: 0.2, inactive: 0.08 } },
  foreground: { width: { active: 5.2, inactive: 3.2 }, opacity: { active: 1, inactive: 0.42 } },
} as const;

const NODE_STYLES = {
  company: { fontSize: 45, letterSpacing: "0.22em" },
  value: { minFontSize: 44, maxFontSize: 100, lengthFactor: 0.65, maxWidthFactor: 1.6 },
  root: { minFontSize: 18, maxFontSize: 33, lengthFactor: 0.55, widthFactor: 1.2 },
} as const;

// ─── Types ───────────────────────────────────────────────────────

export interface TreeCanvasHandle {
  focusBranch: (ids: string[]) => void;
  fit: (animate?: boolean) => void;
  zoomBy: (factor: number) => void;
}

interface ViewState {
  x: number;
  y: number;
  k: number;
}

interface DragState {
  nodeId: string;
  startWorldX: number;
  startWorldY: number;
  nodeStartX: number;
  nodeStartY: number;
}

interface PointerInfo {
  x: number;
  y: number;
}

interface DownInfo {
  moved: number;
  nodeId: string | null;
}

interface DragOffset {
  nodeId: string;
  dx: number;
  dy: number;
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
  /** Множество узлов для подсветки при фильтрации по подразделению */
  filterHighlightIds?: Set<string> | null;
  /** Флаг открытия панели фильтра (для центровки дерева в правой части) */
  isFilterPanelOpen?: boolean;
}

// ─── Utilities ───────────────────────────────────────────────────

function clampZoom(k: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Корректирует путь рёбра с учётом смещения перетаскиваемого узла.
 */
function getAdjustedEdgePath(edge: GraphEdge, dragOffset: DragOffset | null): string {
  if (!dragOffset) return edge.d;

  const isFromDragged = edge.from === dragOffset.nodeId;
  const isToDragged = edge.to === dragOffset.nodeId;

  if (!isFromDragged && !isToDragged) return edge.d;

  const match = edge.d.match(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/);
  if (!match) return edge.d;

  let x1 = parseFloat(match[1]);
  let y1 = parseFloat(match[2]);
  let x2 = parseFloat(match[3]);
  let y2 = parseFloat(match[4]);

  if (isFromDragged) {
    x1 += dragOffset.dx;
    y1 += dragOffset.dy;
  }
  if (isToDragged) {
    x2 += dragOffset.dx;
    y2 += dragOffset.dy;
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/**
 * Конвертирует цвет (HEX или HSL) в нормализованные RGB значения [0-1].
 */
function colorToRGB(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    return [
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ];
  }

  if (color.startsWith("hsl")) {
    const match = color.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    if (match) {
      const h = parseFloat(match[1]) / 360;
      const s = parseFloat(match[2]) / 100;
      const l = parseFloat(match[3]) / 100;

      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
    }
  }

  return [1, 1, 1];
}

// ─── Custom Hooks ────────────────────────────────────────────────

/**
 * Управляет состоянием вида камеры (позиция и зум) и анимациями.
 */
function useCanvasView(bounds: GraphBounds, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, k: 0.5 });
  const viewRef = useRef(view);
  const animRef = useRef<number | null>(null);

  viewRef.current = view;

  const stopAnimation = () => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  const animateTo = (target: ViewState, duration = 520) => {
    stopAnimation();
    const from = { ...viewRef.current };
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(progress);

      setView({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        k: from.k + (target.k - from.k) * eased,
      });

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
      }
    };

    animRef.current = requestAnimationFrame(tick);
  };

  const calculateFitView = (): ViewState => {
    const el = containerRef.current;
    if (!el) return viewRef.current;

    const width = el.clientWidth;
    const height = el.clientHeight;
    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;

    const zoom = clampZoom(Math.min((width * FIT_PADDING) / boundsWidth, (height * FIT_PADDING) / boundsHeight));
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    return { x: width / 2 - centerX * zoom, y: height / 2 - centerY * zoom, k: zoom };
  };

  const zoomAt = (px: number, py: number, factor: number, animate = false) => {
    const v = viewRef.current;
    const newZoom = clampZoom(v.k * factor);
    const worldX = (px - v.x) / v.k;
    const worldY = (py - v.y) / v.k;
    const target = { x: px - worldX * newZoom, y: py - worldY * newZoom, k: newZoom };

    if (animate) {
      animateTo(target, ZOOM_ANIMATION_DURATION);
    } else {
      setView(target);
    }
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const target = calculateFitView();
    setView({ x: target.x, y: target.y, k: target.k * INITIAL_ZOOM_FACTOR });
    const raf = requestAnimationFrame(() => animateTo(target, INITIAL_ANIMATION_DURATION));

    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnimation();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * ZOOM_SENSITIVITY));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return { view, setView, viewRef, animateTo, calculateFitView, zoomAt, stopAnimation };
}

/**
 * Управляет взаимодействием с указателем: панорамирование, hover, перетаскивание
 * и пинч-зум (двумя пальцами на мобильных устройствах).
 */
function usePointerInteraction(
  containerRef: React.RefObject<HTMLDivElement | null>,
  isAdmin: boolean | undefined
) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const pointers = useRef(new Map<number, PointerInfo>());
  const downInfo = useRef<DownInfo | null>(null);
  // Расстояние между пальцами на предыдущем кадре (для пинч-зума)
  const prevPinchDistance = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent, onStartDrag: (nodeId: string) => void) => {
    const el = containerRef.current;
    if (!el) return;

    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      const target = (e.target as Element).closest?.("[data-node]") ?? null;
      const nodeId = target?.getAttribute("data-node") ?? null;
      downInfo.current = { moved: 0, nodeId };

      if (isAdmin && nodeId && nodeId !== "company-core") {
        onStartDrag(nodeId);
      } else {
        setIsPanning(true);
      }
    } else if (pointers.current.size === 2) {
      // Второй палец появился — прерываем drag и пан, включаем пинч-зум
      prevPinchDistance.current = null;
      downInfo.current = null;
    }
  };

  const handlePointerMove = (
    e: React.PointerEvent,
    onDrag: (dx: number, dy: number) => void,
    onPinch: (centerX: number, centerY: number, scaleFactor: number) => void
  ) => {
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

    // Режим пинч-зума: два активных указателя
    if (pointers.current.size === 2) {
      const [p1, p2] = Array.from(pointers.current.values());
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (prevPinchDistance.current !== null && prevPinchDistance.current > 0) {
        const scaleFactor = distance / prevPinchDistance.current;
        // Центрируем зум на средней точке между пальцами
        const el = containerRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const centerX = (p1.x + p2.x) / 2 - rect.left;
          const centerY = (p1.y + p2.y) / 2 - rect.top;
          onPinch(centerX, centerY, scaleFactor);
        }
      }
      prevPinchDistance.current = distance;
      return;
    }

    // Обычный режим: одиночный указатель
    prevPinchDistance.current = null;

    if (downInfo.current) {
      downInfo.current.moved += Math.abs(dx) + Math.abs(dy);
    }

    onDrag(dx, dy);
  };

  const handlePointerUp = (e: React.PointerEvent, onEndDrag: () => void, onSelect: (nodeId: string | null) => void) => {
    const el = containerRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    pointers.current.delete(e.pointerId);
    prevPinchDistance.current = null;

    if (pointers.current.size === 0) {
      setIsPanning(false);
      const info = downInfo.current;
      downInfo.current = null;

      onEndDrag();

      if (info && info.moved < CLICK_THRESHOLD) {
        onSelect(info.nodeId);
      }
    } else if (pointers.current.size === 1) {
      // Один палец остался — сбрасываем пан, чтобы не было рывка
      setIsPanning(false);
      downInfo.current = null;
    }
  };

  const handlePointerCancel = () => {
    pointers.current.clear();
    setIsPanning(false);
    downInfo.current = null;
    prevPinchDistance.current = null;
  };

  return {
    hoverId,
    setHoverId,
    isPanning,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}

/**
 * Управляет перетаскиванием узлов для администраторов.
 * Использует временный offset для мгновенного визуального перемещения
 * без мутации исходных данных дерева.
 */
function useDragNode(
  containerRef: React.RefObject<HTMLDivElement | null>,
  nodeById: React.MutableRefObject<Map<string, GraphNode>>,
  viewRef: React.MutableRefObject<ViewState>,
  onNodeDrag?: (id: string, x: number, y: number) => void
) {
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<DragOffset | null>(null);
  const dragState = useRef<DragState | null>(null);

  const startDrag = (nodeId: string, clientX: number, clientY: number) => {
    const el = containerRef.current;
    const node = nodeById.current.get(nodeId);
    if (!el || !node) return;

    const v = viewRef.current;
    const rect = el.getBoundingClientRect();
    const worldX = (clientX - rect.left - v.x) / v.k;
    const worldY = (clientY - rect.top - v.y) / v.k;

    dragState.current = {
      nodeId,
      startWorldX: worldX,
      startWorldY: worldY,
      nodeStartX: node.x,
      nodeStartY: node.y,
    };
    setDragNodeId(nodeId);
  };

  const updateDrag = (clientX: number, clientY: number) => {
    if (!dragState.current) return;

    const el = containerRef.current;
    if (!el) return;

    const v = viewRef.current;
    const rect = el.getBoundingClientRect();
    const worldX = (clientX - rect.left - v.x) / v.k;
    const worldY = (clientY - rect.top - v.y) / v.k;

    const deltaX = worldX - dragState.current.startWorldX;
    const deltaY = worldY - dragState.current.startWorldY;

    setDragOffset({
      nodeId: dragState.current.nodeId,
      dx: deltaX,
      dy: deltaY,
    });
  };

  const endDrag = () => {
    if (dragState.current && dragOffset && onNodeDrag) {
      const finalX = dragState.current.nodeStartX + dragOffset.dx;
      const finalY = dragState.current.nodeStartY + dragOffset.dy;
      onNodeDrag(dragState.current.nodeId, finalX, finalY);
    }
    dragState.current = null;
    setDragNodeId(null);
    setDragOffset(null);
  };

  return { dragNodeId, dragOffset, startDrag, updateDrag, endDrag };
}

// ─── Sub-Components ──────────────────────────────────────────────

interface EdgeRendererProps {
  edge: GraphEdge;
  isActive: boolean;
  isDimmed: boolean;
  zoomBoost: number;
  dragOffset: DragOffset | null;
}

function EdgeRenderer({ edge, isActive, isDimmed, zoomBoost, dragOffset }: EdgeRendererProps) {
  const bgStyle = EDGE_STYLES.background;
  const fgStyle = EDGE_STYLES.foreground;

  const adjustedD = useMemo(
    () => getAdjustedEdgePath(edge, dragOffset),
    [edge.d, dragOffset]
  );

  return (
    <g className="edge-g" style={{ opacity: isDimmed ? 0.06 : 1 }}>
      <path
        d={adjustedD}
        pathLength={1}
        className="edge-draw"
        style={{ animationDelay: `${edge.delay}s` }}
        fill="none"
        stroke={edge.color}
        strokeWidth={(isActive ? bgStyle.width.active : bgStyle.width.inactive) * zoomBoost}
        strokeLinecap="round"
        opacity={isActive ? bgStyle.opacity.active : bgStyle.opacity.inactive}
      />
      <path
        d={adjustedD}
        pathLength={1}
        className={`edge-draw ${isActive ? "edge-flow" : ""}`}
        style={{ animationDelay: `${edge.delay}s` }}
        fill="none"
        stroke={edge.color}
        strokeWidth={(isActive ? fgStyle.width.active : fgStyle.width.inactive) * zoomBoost}
        strokeLinecap="round"
        opacity={isActive ? fgStyle.opacity.active : fgStyle.opacity.inactive}
      />
    </g>
  );
}

interface NodeGlyphProps {
  node: GraphNode;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  companyLogo?: string;
  zoom: number;
  dragOffset: DragOffset | null;
  isDragging: boolean;
}

function NodeGlyph({ node, hovered, selected, dimmed, companyLogo, dragOffset, isDragging }: NodeGlyphProps) {
  const { tier, r, color, short, delay } = node;
  const lines = tier === "root" ? short.split(" ") : [];

  const offsetDx = dragOffset?.nodeId === node.id ? dragOffset.dx : 0;
  const offsetDy = dragOffset?.nodeId === node.id ? dragOffset.dy : 0;
  const finalX = node.x + offsetDx;
  const finalY = node.y + offsetDy;

  const renderCompanyTier = () => (
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
        fontSize={NODE_STYLES.company.fontSize}
        letterSpacing={NODE_STYLES.company.letterSpacing}
        fill="#93abb2"
        style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}
      >
        {short.toUpperCase()}
      </text>
    </>
  );

  const renderValueTier = () => {
    const { minFontSize, maxFontSize, lengthFactor, maxWidthFactor } = NODE_STYLES.value;
    const fontSize = Math.min(maxFontSize, Math.max(minFontSize, (r * 3) / (short.length * lengthFactor)));
    const maxWidth = r * maxWidthFactor;
    const words = short.split(" ");
    const textLines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = testLine.length * fontSize * 0.5;

      if (testWidth > maxWidth && currentLine) {
        textLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) textLines.push(currentLine);

    const lineHeight = fontSize * 1.2;
    const totalHeight = textLines.length * lineHeight;
    const startY = -(totalHeight / 2) + lineHeight / 2;

    return (
      <>
        <circle r={r + 60} fill={color} opacity={hovered || selected ? 0.13 : 0.07} />
        <circle r={r + 30} fill="none" stroke={color} strokeWidth={3.6} strokeDasharray="9 27" opacity={0.5} className="ring-spin" />
        <circle r={r} fill="#0d1b24" stroke={color} strokeWidth={7.8} />
        <circle r={r - 21} fill="none" stroke={color} strokeWidth={3} opacity={0.22} />
        {textLines.map((line, i) => (
          <text
            key={i}
            y={startY + i * lineHeight}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
            fill="#eaf4f2"
            style={{ fontFamily: "var(--font-display)", fontWeight: 500, letterSpacing: "0.01em" }}
          >
            {line}
          </text>
        ))}
      </>
    );
  };

  const renderRootTier = () => {
    const [rColor, gColor, bColor] = colorToRGB(color);

    const renderWithLogo = () => (
      <>
        <defs>
          <filter id={`recolor-${node.id}`}>
            <feColorMatrix
              type="matrix"
              values={`0 0 0 0 ${rColor}
                       0 0 0 0 ${gColor}
                       0 0 0 0 ${bColor}
                       0 0 0 1 0`}
            />
          </filter>
        </defs>
        <image
          href={companyLogo!}
          x={-r * 0.5}
          y={-r * 0.5}
          width={r}
          height={r}
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#recolor-${node.id})`}
          opacity={0.9}
        />
      </>
    );

    const renderWithoutLogo = () => {
      const { minFontSize, maxFontSize, lengthFactor, widthFactor } = NODE_STYLES.root;
      const fontSize = Math.min(maxFontSize, Math.max(minFontSize, (r * widthFactor) / (short.length * lengthFactor)));

      if (lines.length === 1) {
        return (
          <text y={7} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fill="#eaf4f2" style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}>
            {lines[0]}
          </text>
        );
      }

      return lines.map((ln, i) => (
        <text key={i} y={i === 0 ? -12 : 24} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fill="#eaf4f2" style={{ fontFamily: "var(--font-body)", fontWeight: 600 }}>
          {ln}
        </text>
      ));
    };

    return (
      <>
        <circle r={r + 22} fill={color} opacity={hovered || selected ? 0.14 : 0.06} />
        <circle r={r} fill="#0d1b24" stroke={color} strokeWidth={4.2} />
        {companyLogo ? renderWithLogo() : renderWithoutLogo()}
      </>
    );
  };

  const renderSupportTier = () => (
    <>
      <circle r={r + 16} fill={color} opacity={hovered || selected ? 0.16 : 0} />
      <circle r={r} fill="#0d1b24" stroke={color} strokeWidth={3.4} opacity={0.95} />
      <circle r={8.8} fill={color} opacity={0.9} />
    </>
  );

  const renderTierContent = () => {
    switch (tier) {
      case "company":
        return renderCompanyTier();
      case "value":
        return renderValueTier();
      case "root":
        return renderRootTier();
      case "support":
        return renderSupportTier();
      default:
        return null;
    }
  };

  const selectedRadius = r + (tier === "value" ? 34 : tier === "company" ? 24 : 16);

  return (
    <g
      data-node={node.id}
      transform={`translate(${finalX} ${finalY})`}
      className="node-g cursor-pointer"
      style={{
        opacity: dimmed ? 0.16 : 1,
        filter: isDragging ? "drop-shadow(0 8px 16px rgba(0, 0, 0, 0.5))" : "none",
        transition: isDragging ? "none" : "filter 0.2s ease-out",
      }}
    >
      <g className="node-pop" style={{ animationDelay: `${delay}s` }}>
        <circle r={r + 10} fill="rgba(0,0,0,0)" />
        {renderTierContent()}
        {selected && (
          <circle r={selectedRadius} fill="none" stroke={color} strokeWidth={3.2} strokeDasharray="10 14" opacity={0.95} className="ring-spin-rev" />
        )}
        {hovered && !selected && <circle r={r + 10} fill="none" stroke={color} strokeWidth={2.8} opacity={0.6} />}
      </g>
    </g>
  );
}

function Tooltip({ node, view }: { node: GraphNode; view: ViewState }) {
  const tierLabel =
    node.tier === "value"
      ? "ценность"
      : node.tier === "root"
        ? "корневое обещание"
        : node.tier === "support"
          ? "поддерживающее"
          : "ядро";

  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[240px] rounded-lg border bg-ink-900/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur-sm"
      style={{
        left: node.x * view.k + view.x,
        top: (node.y - node.r - 12) * view.k + view.y,
        transform: "translate(-50%, -100%)",
        borderColor: `${node.color}55`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: node.color }} />
        <span className="text-[13px] font-semibold text-mist-100">{node.title}</span>
      </div>
      <div className="mt-0.5 pl-4 text-[10.5px] font-medium uppercase tracking-[0.14em] text-mist-500">
        {tierLabel}
        <span className="normal-case tracking-normal"> · клик — карточка</span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

const TreeCanvas = forwardRef<TreeCanvasHandle, Props>(function TreeCanvas(props, ref) {
  const {
    nodes,
    edges,
    bounds,
    selectedId,
    familySet,
    onSelect,
    isAdmin,
    onNodeDrag,
    companyLogo,
    filterHighlightIds,
    isFilterPanelOpen,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeById = useRef(new Map<string, GraphNode>());

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
    const calculateAverageRadius = (tierNodes: GraphNode[]) => {
      if (tierNodes.length === 0) return 0;
      const sum = tierNodes.reduce((s, n) => s + Math.hypot(n.x, n.y), 0);
      return sum / tierNodes.length;
    };

    return [
      calculateAverageRadius(uniqueNodes.filter((n) => n.tier === "value")),
      calculateAverageRadius(uniqueNodes.filter((n) => n.tier === "root")),
      calculateAverageRadius(uniqueNodes.filter((n) => n.tier === "support")),
    ];
  }, [uniqueNodes]);

  const canvasView = useCanvasView(bounds, containerRef);
  const pointerInteraction = usePointerInteraction(containerRef, isAdmin);
  const dragNode = useDragNode(containerRef, nodeById, canvasView.viewRef, onNodeDrag);

  useImperativeHandle(
    ref,
    () => ({
      fit: (animate = true) => {
        const target = canvasView.calculateFitView();
        if (animate) {
          canvasView.animateTo(target, FIT_ANIMATION_DURATION);
        } else {
          canvasView.setView(target);
        }
      },
      zoomBy: (factor: number) => {
        const el = containerRef.current;
        if (!el) return;
        canvasView.zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor, true);
      },
      focusBranch: (ids: string[]) => {
        const el = containerRef.current;
        if (!el || ids.length === 0) return;

        const branchNodes = ids.map((id) => nodeById.current.get(id)).filter((n): n is GraphNode => n !== undefined);
        if (branchNodes.length === 0) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

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

        const width = el.clientWidth;
        const height = el.clientHeight;
        const isDesktop = width >= 1024;
        const availableWidth = isDesktop ? width * 0.5 : width;
        const centerX = isDesktop ? width * 0.25 : width * 0.5;
        const centerY = height * 0.5;

        const padding = isDesktop ? 80 : 60;
        const scaleX = (availableWidth - padding * 2) / boxWidth;
        const scaleY = (height - padding * 2) / boxHeight;
        const targetZoom = clampZoom(Math.min(Math.min(scaleX, scaleY), 2.5));

        canvasView.animateTo(
          {
            x: centerX - boxCenterX * targetZoom,
            y: centerY - boxCenterY * targetZoom,
            k: targetZoom,
          },
          FOCUS_ANIMATION_DURATION
        );
      },
    }),
    [canvasView]
  );

  // Логика подсветки: выбор узла ИЛИ фильтрация по подразделению
  const isFilterActive = filterHighlightIds !== null && filterHighlightIds !== undefined;
  const isDimming = selectedId !== null || isFilterActive;

  const isEdgeActive = (edge: GraphEdge) => {
    // Режим выбора узла (приоритет)
    if (selectedId && familySet) return familySet.has(edge.from) && familySet.has(edge.to);
    // Режим фильтрации по подразделению
    if (isFilterActive && filterHighlightIds!.size > 0) {
      return filterHighlightIds!.has(edge.from) || filterHighlightIds!.has(edge.to);
    }
    // Режим наведения
    if (pointerInteraction.hoverId) return edge.from === pointerInteraction.hoverId || edge.to === pointerInteraction.hoverId;
    return false;
  };

  const zoomBoost = canvasView.view.k < LOW_ZOOM_THRESHOLD ? LOW_ZOOM_BOOST : 1;
  const hoverNode = pointerInteraction.hoverId ? nodeById.current.get(pointerInteraction.hoverId) : undefined;

  // ─── Event Handlers ────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent) => {
    canvasView.stopAnimation();
    pointerInteraction.handlePointerDown(e, (nodeId) => dragNode.startDrag(nodeId, e.clientX, e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    pointerInteraction.handlePointerMove(
      e,
      // Callback для одиночного указателя (панорамирование или перетаскивание узла)
      (dx, dy) => {
        if (dragNode.dragNodeId && isAdmin) {
          dragNode.updateDrag(e.clientX, e.clientY);
        } else {
          canvasView.setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
      },
      // Callback для пинч-зума (два указателя)
      (centerX, centerY, scaleFactor) => {
        canvasView.zoomAt(centerX, centerY, scaleFactor, false);
      }
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointerInteraction.handlePointerUp(e, dragNode.endDrag, onSelect);
  };

  const handlePointerCancel = () => {
    pointerInteraction.handlePointerCancel();
    dragNode.endDrag();
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-full overflow-hidden touch-none select-none transition-all duration-300 ${
        isFilterPanelOpen ? "w-full md:w-1/2 md:ml-auto" : "w-full"
      } ${pointerInteraction.isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={() => pointerInteraction.setHoverId(null)}
    >
      <svg className="block h-full w-full">
        <defs>
          <pattern id="dotGrid" width={DOT_GRID_SIZE} height={DOT_GRID_SIZE} patternUnits="userSpaceOnUse">
            <circle cx="1.3" cy="1.3" r="1.15" fill="rgba(147,171,178,0.11)" />
          </pattern>
          <radialGradient id="coreHalo">
            <stop offset="0%" stopColor="rgba(67,214,181,0.10)" />
            <stop offset="55%" stopColor="rgba(67,214,181,0.035)" />
            <stop offset="100%" stopColor="rgba(67,214,181,0)" />
          </radialGradient>
        </defs>

        <g transform={`translate(${canvasView.view.x} ${canvasView.view.y}) scale(${canvasView.view.k})`}>
          <rect x={-GRID_SIZE / 2} y={-GRID_SIZE / 2} width={GRID_SIZE} height={GRID_SIZE} fill="url(#dotGrid)" />

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
          <circle cx={0} cy={0} r={CORE_HALO_RADIUS} fill="url(#coreHalo)" />

          {edges.map((edge) => {
            const active = isEdgeActive(edge);
            const dimmed = isDimming && !active;
            return (
              <EdgeRenderer
                key={edge.id}
                edge={edge}
                isActive={active}
                isDimmed={dimmed}
                zoomBoost={zoomBoost}
                dragOffset={dragNode.dragOffset}
              />
            );
          })}

          {uniqueNodes.map((node) => {
            const isFilteredOut = isFilterActive && filterHighlightIds ? !filterHighlightIds.has(node.id) : false;
            const shouldDim = selectedId && familySet ? !familySet.has(node.id) : isFilteredOut;

            return (
              <NodeGlyph
                key={node.id}
                node={node}
                hovered={pointerInteraction.hoverId === node.id}
                selected={selectedId === node.id}
                dimmed={isDimming && shouldDim}
                companyLogo={node.tier === "company" || node.tier === "root" ? companyLogo : undefined}
                zoom={canvasView.view.k}
                dragOffset={dragNode.dragOffset}
                isDragging={dragNode.dragNodeId === node.id}
              />
            );
          })}
        </g>
      </svg>

      {hoverNode && !pointerInteraction.isPanning && !dragNode.dragNodeId && (
        <Tooltip node={hoverNode} view={canvasView.view} />
      )}
    </div>
  );
});

export default TreeCanvas;
