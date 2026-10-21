import { useState, useRef, useEffect, useMemo } from "react";
import type { TreeCanvasHandle } from "./components/TreeCanvas";
import TreeCanvas from "./components/TreeCanvas";
import DetailPanel from "./components/DetailPanel";
import Header from "./components/Header";
import Legend from "./components/Legend";
import ZoomControls from "./components/ZoomControls";
import KeyboardHints from "./components/KeyboardHints";
import AdminPanel from "./components/admin/AdminPanel";
import AdminLogin from "./components/admin/AdminLogin";
import DepartmentFilterPanel from "./components/DepartmentFilterPanel";
import LoadingScreen from "./components/LoadingScreen";
import BackgroundGradient from "./components/BackgroundGradient";
import DustParticles from "./components/DustParticles";
import { useTreeData } from "./state/useTreeData";
import { useAuth } from "./lib/useAuth";
import { buildGraph, collectFamily, type GraphNode } from "./lib/layout";
import { useSearch } from "./lib/useSearch";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { matchesDepartment, parseDepartments, type DepartmentInfo } from "./lib/departments";
import { supabase } from "./lib/supabase";

// ─── Types ──────────────────────────────────────────────────────

type View = "tree" | "admin";

const CORE_COLOR = "#8fb6c0";

interface FilteredNode {
  id: string;
  title: string;
  tier: string;
  kind: "node" | "general";
  color: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
  valueTitle: string;
}

// ─── Main Component ──────────────────────────────────────────────

export default function App() {
  const { data, modified, loading, updateNode, updateCompany, replaceValues, reset, updateNodePosition, resetAllPositions } = useTreeData();
  const { session, checking, authed } = useAuth();
  const [view, setView] = useState<View>("tree");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGeneralId, setSelectedGeneralId] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [showDepartmentPanel, setShowDepartmentPanel] = useState(false);
  // Запоминаем, была ли открыта панель фильтра до открытия карточки,
  // чтобы восстановить её после закрытия карточки
  const [panelStateBeforeCard, setPanelStateBeforeCard] = useState<boolean | null>(null);
  const canvasRef = useRef<TreeCanvasHandle>(null);
  // Пропускаем первую центровку: начальную анимацию делает сам TreeCanvas
  const firstCameraRun = useRef(true);

  const graph = useMemo(() => buildGraph(data.company, data.values, data.customPositions), [data]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const search = useSearch(graph.nodes);

  const generalPromises = data.generalPromises ?? [];

  const selectedNode = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedGeneral = useMemo(
    () => generalPromises.find((p) => p.id === selectedGeneralId) ?? null,
    [generalPromises, selectedGeneralId],
  );

  const familySet = useMemo(
    () => (selectedId ? collectFamily(selectedId, byId) : null),
    [selectedId, byId],
  );

  /**
   * Массив предков для хлебных крошек: от ценности до непосредственного родителя.
   * Порядок — от верхнего уровня к нижнему (ценность → корневое → поддерживающее).
   */
  const ancestors = useMemo(() => {
    if (!selectedNode) return [];
    if (selectedNode.tier === "company" || selectedNode.tier === "value") return [];

    const chain: GraphNode[] = [];
    let current = selectedNode;

    // Идём вверх по parentId, собирая предков (без самой компании)
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent || parent.tier === "company") break;
      chain.unshift(parent);
      current = parent;
    }

    return chain;
  }, [selectedNode, byId]);

  const counts = useMemo(() => {
    const c = { value: 0, root: 0, support: 0, general: generalPromises.length };
    for (const n of graph.nodes) if (n.tier in c) c[n.tier as keyof typeof c] += 1;
    return c;
  }, [graph, generalPromises]);

  useEffect(() => {
    if (selectedId && !byId.has(selectedId)) setSelectedId(null);
  }, [byId, selectedId]);

  useEffect(() => {
    if (selectedGeneralId && !generalPromises.some((p) => p.id === selectedGeneralId)) {
      setSelectedGeneralId(null);
    }
  }, [generalPromises, selectedGeneralId]);

  /** Скрывает панель фильтра при открытии карточки, запоминая её состояние */
  const hidePanelForCard = () => {
    if (showDepartmentPanel && panelStateBeforeCard === null) {
      setPanelStateBeforeCard(true);
      setShowDepartmentPanel(false);
    }
  };

  const navigate = (id: string | null) => {
    if (!id) {
      setSelectedId(null);
      return;
    }
    hidePanelForCard();
    setSelectedGeneralId(null);
    setSelectedId(id);
  };

  const navigateGeneral = (id: string) => {
    hidePanelForCard();
    setSelectedId(null);
    setSelectedGeneralId(id);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedGeneralId(null);
    // Возвращаемся к фильтрации: восстанавливаем панель, если она была открыта до карточки
    if (panelStateBeforeCard) {
      setShowDepartmentPanel(true);
      setPanelStateBeforeCard(null);
    }
  };

  useKeyboardShortcuts(view, canvasRef, clearSelection);

  // Единая точка управления камерой: срабатывает ПОСЛЕ коммита DOM,
  // когда контейнер канваса уже получил финальную ширину.
  useEffect(() => {
    if (firstCameraRun.current) {
      firstCameraRun.current = false;
      return;
    }

    const raf = requestAnimationFrame(() => {
      if (selectedId) {
        const branchIds = collectFamily(selectedId, byId);
        canvasRef.current?.focusBranch(Array.from(branchIds));
      } else {
        canvasRef.current?.fit(true);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [selectedId, selectedGeneralId, showDepartmentPanel, byId]);

  // ─── Фильтрация по подразделениям ──────────────────────────────

  // Извлекаем уникальные подразделения из поля «Кто даёт» (узлы + общие обещания)
  const departments: DepartmentInfo[] = useMemo(() => {
    const deptMap = new Map<string, number>();

    for (const node of graph.nodes) {
      if (node.tier !== "root" && node.tier !== "support") continue;
      for (const dept of parseDepartments(node.who)) {
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      }
    }

    for (const gp of generalPromises) {
      for (const dept of parseDepartments(gp.who)) {
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      }
    }

    return Array.from(deptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [graph.nodes, generalPromises]);

  // Находим узлы дерева, где выбранное подразделение фигурирует в поле «Кто даёт»
  const filterHighlightIds = useMemo(() => {
    if (!departmentFilter) return null;

    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (node.tier !== "root" && node.tier !== "support") continue;
      if (matchesDepartment(node.who, departmentFilter)) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [departmentFilter, graph.nodes]);

  // Формируем список отфильтрованных обещаний (узлы + общие) с деталями
  const filteredNodes: FilteredNode[] = useMemo(() => {
    if (!departmentFilter) return [];

    const result: FilteredNode[] = [];
    const valueTitles = new Map<string, string>();

    for (const value of data.values) {
      valueTitles.set(value.id, value.title);
    }

    for (const node of graph.nodes) {
      if (node.tier !== "root" && node.tier !== "support") continue;
      if (matchesDepartment(node.who, departmentFilter)) {
        result.push({
          id: node.id,
          title: node.title,
          tier: node.tier,
          kind: "node",
          color: node.color,
          who: node.who,
          toWhom: node.toWhom,
          metrics: node.metrics,
          valueTitle: valueTitles.get(node.familyId) || "",
        });
      }
    }

    for (const gp of generalPromises) {
      if (matchesDepartment(gp.who, departmentFilter)) {
        result.push({
          id: gp.id,
          title: gp.title,
          tier: "general",
          kind: "general",
          color: CORE_COLOR,
          who: gp.who,
          toWhom: gp.toWhom,
          metrics: gp.metrics,
          valueTitle: "",
        });
      }
    }

    return result.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }, [departmentFilter, graph.nodes, generalPromises, data.values]);

  // ─── Рендеринг ─────────────────────────────────────────────────

  if (loading || checking) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-ink-950 font-body text-mist-100">
        <BackgroundGradient />
        <DustParticles />
        <LoadingScreen message={checking ? "Проверка авторизации..." : "Загрузка данных из облака..."} />
      </div>
    );
  }

  if (view === "admin") {
    return (
      <div className="relative h-full w-full overflow-hidden bg-ink-950 font-body text-mist-100">
        <BackgroundGradient />
        <DustParticles />
        {authed ? (
          <AdminPanel
            data={data}
            modified={modified}
            onBack={() => setView("tree")}
            onLogout={async () => await supabase.auth.signOut()}
            onSave={updateNode}
            onUpdateCompany={updateCompany}
            onApplyImport={(r) => replaceValues(r.values, r.generalPromises)}
            onReset={reset}
            onResetAllPositions={resetAllPositions}
          />
        ) : (
          <AdminLogin onSuccess={() => {}} onBack={() => setView("tree")} />
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950 font-body text-mist-100">
      <BackgroundGradient />
      <DustParticles />

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
          filterHighlightIds={filterHighlightIds}
          isFilterPanelOpen={showDepartmentPanel}
          isCardOpen={selectedId !== null || selectedGeneralId !== null}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(4,10,15,0.55) 100%)" }}
      />

      <Header
        companyTitle={data.company.title}
        companyLogo={data.company.logo}
        counts={counts}
        search={search}
        onAdminClick={() => setView("admin")}
        onNavigate={navigate}
        onDepartmentFilterClick={() => {
          const next = !showDepartmentPanel;
          setShowDepartmentPanel(next);
          // Панель открыта вручную — автовозврат после карточки не нужен
          if (next) setPanelStateBeforeCard(null);
        }}
        isFilterActive={departmentFilter !== null}
      />

      <Legend companyLogo={data.company.logo} />
      <KeyboardHints isAdmin={authed} />
      <ZoomControls canvasRef={canvasRef} />

      <DetailPanel
        node={selectedNode}
        parent={selectedNode?.parentId ? byId.get(selectedNode.parentId) ?? null : null}
        children={selectedNode ? selectedNode.childrenIds.map((id) => byId.get(id)!).filter(Boolean) : []}
        valueNode={selectedNode ? byId.get(selectedNode.familyId) ?? null : null}
        generalPromises={generalPromises}
        generalPromise={selectedGeneral}
        ancestors={ancestors}
        onClose={clearSelection}
        onNavigate={navigate}
        onNavigateGeneral={navigateGeneral}
        onBackToCompany={() => navigate(data.company.id)}
      />

      {/* Панель фильтрации по подразделению */}
      {showDepartmentPanel && (
        <DepartmentFilterPanel
          departments={departments}
          selectedDepartment={departmentFilter}
          filteredNodes={filteredNodes}
          onSelectDepartment={setDepartmentFilter}
          onNavigateToNode={(target) => {
            if (target.kind === "general") navigateGeneral(target.id);
            else navigate(target.id);
          }}
          onClose={() => setShowDepartmentPanel(false)}
        />
      )}
    </div>
  );
}
