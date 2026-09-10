import { useEffect, useMemo, useRef, useState } from "react";
import TreeCanvas from "./components/TreeCanvas";
import type { TreeCanvasHandle } from "./components/TreeCanvas";
import DetailPanel from "./components/DetailPanel";
import AdminLogin from "./components/admin/AdminLogin";
import AdminPanel from "./components/admin/AdminPanel";
import { buildGraph, collectFamily } from "./lib/layout";
import { useTreeData } from "./state/useTreeData";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";

const DUST = [
  { left: "12%", top: "22%", size: 5, color: "rgba(67,214,181,0.35)", dur: "17s" },
  { left: "82%", top: "18%", size: 4, color: "rgba(242,180,90,0.32)", dur: "14s" },
  { left: "70%", top: "78%", size: 6, color: "rgba(111,180,242,0.28)", dur: "19s" },
  { left: "22%", top: "72%", size: 4, color: "rgba(242,131,107,0.3)", dur: "15s" },
  { left: "48%", top: "10%", size: 3, color: "rgba(155,211,86,0.32)", dur: "13s" },
  { left: "90%", top: "56%", size: 5, color: "rgba(67,214,181,0.25)", dur: "21s" },
  { left: "6%", top: "48%", size: 3, color: "rgba(242,180,90,0.26)", dur: "16s" },
];

type View = "tree" | "admin";

export default function App() {
  const { data, modified, loading, updateNode, updateCompany, replaceValues, reset, updateNodePosition, resetAllPositions } = useTreeData();

  const graph = useMemo(() => buildGraph(data.company, data.values, data.customPositions), [data]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("tree");
  const [session, setSession] = useState<Session | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const canvasRef = useRef<TreeCanvasHandle>(null);
  
  // Проверка сессии Supabase при загрузке
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecking(false);
    });
    
    // Подписка на изменения сессии (вход/выход)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    
    return () => subscription.unsubscribe();
  }, []);
  
  const authed = session !== null;

  const selectedNode = selectedId ? byId.get(selectedId) ?? null : null;
  const familySet = useMemo(
    () => (selectedId ? collectFamily(selectedId, byId) : null),
    [selectedId, byId],
  );

  useEffect(() => {
    if (selectedId && !byId.has(selectedId)) setSelectedId(null);
  }, [byId, selectedId]);

  const counts = useMemo(() => {
    const c = { value: 0, root: 0, support: 0 };
    for (const n of graph.nodes) if (n.tier in c) c[n.tier as keyof typeof c] += 1;
    return c;
  }, [graph]);

  const navigate = (id: string | null) => {
    setSelectedId(id);
    if (id) {
      const branchIds = collectFamily(id, byId);
      canvasRef.current?.focusBranch(Array.from(branchIds));
    }
  };

  useEffect(() => {
    if (view !== "tree") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
      else if (e.key === "+" || e.key === "=") canvasRef.current?.zoomBy(1.35);
      else if (e.key === "-") canvasRef.current?.zoomBy(1 / 1.35);
      else if (e.key === "0") canvasRef.current?.fit(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return graph.nodes.filter((n) => {
      if (n.tier === "company") return false;
      const inTitle = n.title.toLowerCase().includes(q);
      const inDesc = n.description.toLowerCase().includes(q);
      const inWho = n.who?.toLowerCase().includes(q) ?? false;
      return inTitle || inDesc || inWho;
    }).slice(0, 15);
  }, [searchQuery, graph.nodes]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950 font-body text-mist-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 700px at 18% 8%, rgba(67,214,181,0.075), transparent 62%)," +
            "radial-gradient(1000px 640px at 85% 90%, rgba(242,180,90,0.06), transparent 60%)," +
            "radial-gradient(800px 520px at 88% 12%, rgba(111,180,242,0.05), transparent 60%)," +
            "linear-gradient(160deg, #08151d 0%, #071219 55%, #0a1418 100%)",
        }}
      />
      {DUST.map((d, i) => (
        <span
          key={i}
          className="dust"
          style={{
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            background: d.color,
            boxShadow: `0 0 ${d.size * 3}px ${d.color}`,
            ["--dur" as string]: d.dur,
          }}
        />
      ))}

      {loading || authChecking ? (
        <div className="relative z-10 flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-ink-700 border-t-gold"></div>
            <p className="text-mist-400">{authChecking ? "Проверка авторизации..." : "Загрузка данных из облака..."}</p>
          </div>
        </div>
      ) : view === "admin" ? (
        authed ? (
          <AdminPanel
            data={data}
            modified={modified}
            onBack={() => setView("tree")}
            onLogout={async () => {
              await supabase.auth.signOut();
            }}
            onSave={updateNode}
            onUpdateCompany={updateCompany}
            onApplyImport={(r) => replaceValues(r.values)}
            onReset={reset}
            onResetAllPositions={resetAllPositions}
          />
        ) : (
          <AdminLogin onSuccess={() => {}} onBack={() => setView("tree")} />
        )
      ) : (
        <>
          <div className="absolute inset-0">
            <TreeCanvas
              ref={canvasRef}
              nodes={graph.nodes}
              edges={graph.edges}
              bounds={graph.bounds}
              selectedId={selectedId}
              familySet={familySet}
              onSelect={navigate}
              isAdmin={authed}
              onNodeDrag={updateNodePosition}
              companyLogo={data.company.logo}
            />
          </div>

          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(4,10,15,0.55) 100%)" }}
          />

          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4 md:p-5">
            <div className="hint-in pointer-events-auto flex items-center gap-3.5 rounded-xl border border-ink-700/50 bg-ink-900/80 py-2.5 pr-5 pl-3 backdrop-blur-md">
              <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-ink-700/70 bg-ink-850">
                {data.company.logo ? (
                  <img src={data.company.logo} alt="Логотип" className="h-full w-full object-cover" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="4.4" stroke="#8fb6c0" strokeWidth="1.7" />
                    <circle cx="16" cy="16" r="1.8" fill="#eaf4f2" />
                    <path d="M16 11.5V6.5M20 18.5l4.3 2.6M12 18.5l-4.3 2.6" stroke="#8fb6c0" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="16" cy="5" r="2.6" fill="#43d6b5" />
                    <circle cx="25.5" cy="21.8" r="2.6" fill="#f2b45a" />
                    <circle cx="6.5" cy="21.8" r="2.6" fill="#f2836b" />
                  </svg>
                )}
              </span>
              <span>
                <h1 className="font-display text-[15px] leading-tight font-bold tracking-tight md:text-[17px]">
                  {data.company.title}
                </h1>
                <p className="mt-0.5 text-[11px] leading-tight text-mist-500">
                  дерево обещаний
                </p>
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="hint-in pointer-events-auto hidden items-center gap-2 rounded-xl border border-ink-700/50 bg-ink-900/80 px-4 py-3 backdrop-blur-md lg:flex">
                <Stat n={counts.value} label="ценностей" color="#f2b45a" />
                <span className="mx-1 h-6 w-px bg-ink-700/70" />
                <Stat n={counts.root} label="корневых" color="#43d6b5" />
                <span className="mx-1 h-6 w-px bg-ink-700/70" />
                <Stat n={counts.support} label="поддерживающих" color="#6fb4f2" />
              </div>

              <div className="hint-in pointer-events-auto relative hidden lg:block">
                <div className="flex items-center rounded-xl border border-ink-700/50 bg-ink-900/80 backdrop-blur-md px-3 py-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-mist-500">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 150)}
                    placeholder="Поиск обещаний или подразделения..."
                    className="w-56 bg-transparent pl-2 text-[13px] text-mist-100 placeholder-mist-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setSearchQuery(""); setShowSearchResults(false); }}
                      className="ml-2 text-mist-500 hover:text-mist-300"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-ink-700/50 bg-ink-900/95 p-2 shadow-xl backdrop-blur-md z-30">
                    {searchResults.map((node) => (
                      <button
                        key={node.id}
                        className="flex w-full flex-col items-start gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ink-800/70"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          navigate(node.id);
                          setSearchQuery("");
                          setShowSearchResults(false);
                        }}
                      >
                        <span className="text-[13px] font-medium text-mist-100 truncate w-full">{node.title}</span>
                        <div className="flex items-center gap-2 text-[11px] text-mist-400 w-full">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: node.color }}></span>
                          <span>
                            {node.tier === "value" ? "Ценность" : node.tier === "root" ? "Корневое" : "Поддерживающее"}
                          </span>
                          {node.who && (
                            <>
                              <span>·</span>
                              <span className="font-medium text-mist-300 truncate">{node.who}</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {showSearchResults && searchQuery && searchResults.length === 0 && (
                  <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-ink-700/50 bg-ink-900/95 p-4 text-center text-[13px] text-mist-400 shadow-xl backdrop-blur-md z-30">
                    Ничего не найдено
                  </div>
                )}
              </div>

              <button
                onClick={() => setView("admin")}
                title="Админ-панель"
                className="hint-in group pointer-events-auto flex h-[46px] items-center gap-2.5 rounded-xl border border-gold/35 bg-ink-900/80 px-4 text-[12px] font-semibold text-gold backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/70 hover:bg-gold/10 hover:shadow-lg hover:shadow-gold/10"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5.2 7V5.4a2.8 2.8 0 115.6 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="8" cy="10.5" r="1.2" fill="currentColor" />
                </svg>
                Админ
              </button>
            </div>
          </header>

          <div className="hint-in pointer-events-none absolute bottom-4 left-4 z-20 hidden flex-col gap-4 rounded-xl border border-ink-700/50 bg-ink-900/80 px-6 py-5 backdrop-blur-md sm:flex md:bottom-5 md:left-5">
            <p className="text-[14px] font-bold uppercase tracking-[0.18em] text-mist-500">Легенда</p>
            
            <LegendRow
              circle={
                <svg width="30" height="30" viewBox="0 0 30 30">
                  <circle cx="15" cy="15" r="13.5" fill="#0d1b24" stroke="#f2b45a" strokeWidth="2.7" />
                  <circle cx="15" cy="10.5" r="2.25" fill="#f2b45a" />
                  <circle cx="10.5" cy="18" r="2.25" fill="#f2b45a" />
                  <circle cx="19.5" cy="18" r="2.25" fill="#f2b45a" />
                </svg>
              }
              label="Ценность"
            />
            
            <LegendRow
              circle={
                <svg width="30" height="30" viewBox="0 0 30 30">
                  <defs>
                    <clipPath id="legend-logo-clip">
                      <circle cx="15" cy="15" r="12" />
                    </clipPath>
                  </defs>
                  <circle cx="15" cy="15" r="13.5" fill="#0d1b24" stroke="#43d6b5" strokeWidth="2.7" />
                  {data.company.logo ? (
                    <image
                      href={data.company.logo}
                      x="3"
                      y="3"
                      width="24"
                      height="24"
                      preserveAspectRatio="xMidYMid meet"
                      clipPath="url(#legend-logo-clip)"
                    />
                  ) : (
                    <rect x="10.5" y="10.5" width="9" height="9" fill="#43d6b5" opacity="0.9" />
                  )}
                </svg>
              }
              label="Корневое обещание"
            />
            
            <LegendRow
              circle={
                <svg width="30" height="30" viewBox="0 0 30 30">
                  <circle cx="15" cy="15" r="13.5" fill="#0d1b24" stroke="#6fb4f2" strokeWidth="2.7" />
                  <circle cx="15" cy="15" r="4.5" fill="#6fb4f2" />
                </svg>
              }
              label="Поддерживающее"
            />
          </div>
          <div className="hint-in pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-ink-700/50 bg-ink-900/75 px-4 py-2 text-[11px] text-mist-500 backdrop-blur-md md:flex">
            <Key>колесо</Key> масштаб
            <span className="text-ink-700">·</span>
            <Key>перетаскивание</Key> обзор
            <span className="text-ink-700">·</span>
            <Key>клик</Key> карточка узла
            <span className="text-ink-700">·</span>
            <Key>Esc</Key> закрыть
            {authed && (
              <>
                <span className="text-ink-700">·</span>
                <span className="text-lagoon">админ: перетаскивание узлов</span>
              </>
            )}
          </div>
          <div className="hint-in pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-ink-700/50 bg-ink-900/75 px-4 py-2 text-[11px] text-mist-500 backdrop-blur-md md:hidden">
            щипок — масштаб · тап по узлу — карточка
          </div>

          <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-2 md:right-5 md:bottom-5">
            <ZoomBtn label="Приблизить" onClick={() => canvasRef.current?.zoomBy(1.4)}>
              <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </ZoomBtn>
            <ZoomBtn label="Отдалить" onClick={() => canvasRef.current?.zoomBy(1 / 1.4)}>
              <path d="M2.5 7h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </ZoomBtn>
            <ZoomBtn label="Показать всё дерево" onClick={() => canvasRef.current?.fit(true)}>
              <path
                d="M2 5.2V3.4C2 2.6 2.6 2 3.4 2h1.8M10.8 2h1.8c.8 0 1.4.6 1.4 1.4v1.8M14 8.8v1.8c0 .8-.6 1.4-1.4 1.4h-1.8M5.2 12H3.4C2.6 12 2 11.4 2 10.6V8.8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </ZoomBtn>
          </div>

          <DetailPanel
            node={selectedNode}
            parent={selectedNode?.parentId ? byId.get(selectedNode.parentId) ?? null : null}
            children={selectedNode ? selectedNode.childrenIds.map((id) => byId.get(id)!).filter(Boolean) : []}
            valueNode={selectedNode ? byId.get(selectedNode.familyId) ?? null : null}
            onClose={() => setSelectedId(null)}
            onNavigate={navigate}
          />
        </>
      )}
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-display text-[16px] font-bold" style={{ color }}>
        {n}
      </span>
      <span className="text-[11px] text-mist-500">{label}</span>
    </span>
  );
}

function LegendRow({ circle, label }: { circle: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-3.5 text-[17px] text-mist-400">
      {circle}
      {label}
    </span>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-ink-700/70 bg-ink-850 px-1.5 py-0.5 font-body text-[10px] font-medium text-mist-400">
      {children}
    </kbd>
  );
}

function ZoomBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-11 w-11 place-items-center rounded-xl border border-ink-700/60 bg-ink-900/85 text-mist-300 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-lagoon/60 hover:text-lagoon active:translate-y-0 active:scale-95"
    >
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
        {children}
      </svg>
    </button>
  );
}
