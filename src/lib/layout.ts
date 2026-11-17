import type { CompanyDef, Tier, ValueDef, RootDef, SupportDef } from "../data/tree";

export interface GraphNode {
  id: string;
  tier: Tier;
  title: string;
  short: string;
  description: string;
  parentId: string | null;
  familyId: string;
  familyTitle: string;
  color: string;
  x: number;
  y: number;
  r: number;
  delay: number;
  childrenIds: string[];
  who?: string;
  toWhom?: string;
  metrics?: string;
  /** id дополнительных корневых обещаний, которым этот support также является поддерживающим */
  extraParentIds?: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  color: string;
  d: string;
  delay: number;
}

export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const NODE_R: Record<Tier, number> = {
  company: 400,
  value: 324,
  root: 120,
  support: 60,
};

const CORE_COLOR = "#8fb6c0";
const NODE_GAP = 100;
// Минимальное физическое расстояние между двумя supporting на одном кольце.
const SUPPORT_MIN_SPACING = 2 * NODE_R.support + NODE_GAP;
// Радиальный зазор между уровнями цепочки (больше диаметра support + gap).
const SUPPORT_LEVEL_STEP = 2 * NODE_R.support + NODE_GAP + 40;

function minRingRadius(n: number, r: number): number {
  if (n <= 1) return r + 60;
  return (n * (2 * r + NODE_GAP)) / (2 * Math.PI);
}

function trimmed(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
): [number, number, number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  return [
    x1 + ux * (r1 + 4),
    y1 + uy * (r1 + 4),
    x2 - ux * (r2 + 6),
    y2 - uy * (r2 + 6),
  ];
}

/** Число листьев поддерева supporting (лист = 1). Используется для угловых интервалов. */
function supportLeaves(s: SupportDef): number {
  const kids = s.supports ?? [];
  if (kids.length === 0) return 1;
  return kids.reduce((acc, k) => acc + supportLeaves(k), 0);
}

function rootLeaves(r: RootDef): number {
  return (r.supports ?? []).reduce((acc, s) => acc + supportLeaves(s), 0);
}

interface SupportCtx {
  familyId: string;
  familyTitle: string;
  color: string;
  valueIdx: number;
  rootIdx: number;
}

export function buildGraph(
  company: CompanyDef,
  values: ValueDef[],
  customPositions?: Record<string, { x: number; y: number }>,
): { nodes: GraphNode[]; edges: GraphEdge[]; bounds: GraphBounds } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const totalRoots = values.reduce((sum, v) => sum + v.promises.length, 0);
  const totalSupportLeaves = values.reduce(
    (sum, v) => sum + v.promises.reduce((s2, r) => s2 + rootLeaves(r), 0),
    0,
  );

  const scaleFactor = Math.max(1, Math.sqrt(values.length + totalRoots + totalSupportLeaves) / 5);
  const valueRingR = Math.max(1050, minRingRadius(values.length, NODE_R.value));
  const rootRingR = Math.max(valueRingR + 900 * scaleFactor, minRingRadius(totalRoots, NODE_R.root));

  // Радиус первого кольца supporting: достаточно места для всех листьев
  // И для самого «узкого» сектора корня (чтобы листовой интервал физически помещался).
  let supportRingR = Math.max(
    rootRingR + 840 * scaleFactor,
    minRingRadius(totalSupportLeaves, NODE_R.support),
  );
  const valueAngleStep = (2 * Math.PI) / Math.max(1, values.length);
  values.forEach((value) => {
    const rootCount = value.promises.length;
    if (rootCount === 0) return;
    const rootSector = valueAngleStep / rootCount;
    value.promises.forEach((root) => {
      const leaves = rootLeaves(root);
      if (leaves > 0) {
        supportRingR = Math.max(supportRingR, (SUPPORT_MIN_SPACING * leaves) / rootSector);
      }
    });
  });

  if (!nodeIds.has(company.id)) {
    nodeIds.add(company.id);
    nodes.push({
      id: company.id,
      tier: "company",
      title: company.title,
      short: company.short,
      description: company.description,
      parentId: null,
      familyId: "core",
      familyTitle: company.title,
      color: CORE_COLOR,
      x: 0, y: 0,
      r: NODE_R.company,
      delay: 0.05,
      childrenIds: values.map((v) => v.id),
    });
  }

  /**
   * Радиальная tidy-раскладка поддерева supporting.
   * Интервал [start, start+width) выделяется пропорционально числу листьев,
   * узел ставится в центр своего интервала на кольцо глубины depth,
   * дети делят интервал родителя пропорционально своим листьям.
   * Интервалы веток не пересекаются ни на какой глубине → нет запутывания.
   */
  const placeSupport = (
    sup: SupportDef,
    start: number,
    width: number,
    depth: number,
    parentId: string,
    ctx: SupportCtx,
  ): void => {
    const angle = start + width / 2;
    const radius = supportRingR + depth * SUPPORT_LEVEL_STEP;
    const sx = Math.cos(angle) * radius;
    const sy = Math.sin(angle) * radius;

    if (!nodeIds.has(sup.id)) {
      nodeIds.add(sup.id);
      nodes.push({
        id: sup.id,
        tier: "support",
        title: sup.title,
        short: "",
        description: sup.description,
        parentId,
        familyId: ctx.familyId,
        familyTitle: ctx.familyTitle,
        color: ctx.color,
        x: sx, y: sy,
        r: NODE_R.support,
        delay: 0.95 + ctx.valueIdx * 0.05 + ctx.rootIdx * 0.04 + depth * 0.06,
        childrenIds: sup.supports?.map((s) => s.id) ?? [],
        who: sup.who,
        toWhom: sup.toWhom,
        metrics: sup.metrics,
        extraParentIds: sup.extraParentIds,
      });
    }

    const kids = sup.supports ?? [];
    if (kids.length === 0) return;
    const total = kids.reduce((acc, k) => acc + supportLeaves(k), 0);
    let cursor = start;
    for (const kid of kids) {
      const kidWidth = width * (supportLeaves(kid) / total);
      placeSupport(kid, cursor, kidWidth, depth + 1, sup.id, ctx);
      cursor += kidWidth;
    }
  };

  values.forEach((value, i) => {
    const valueAngle = -Math.PI / 2 + valueAngleStep * i;
    const vx = Math.cos(valueAngle) * valueRingR;
    const vy = Math.sin(valueAngle) * valueRingR;

    if (!nodeIds.has(value.id)) {
      nodeIds.add(value.id);
      nodes.push({
        id: value.id,
        tier: "value",
        title: value.title,
        short: value.short,
        description: value.description,
        parentId: company.id,
        familyId: value.id,
        familyTitle: value.title,
        color: value.color,
        x: vx, y: vy,
        r: NODE_R.value,
        delay: 0.18 + i * 0.07,
        childrenIds: value.promises.map((p) => p.id),
      });
    }

    const rootCount = value.promises.length;
    if (rootCount === 0) return;
    const rootStep = valueAngleStep / rootCount;

    value.promises.forEach((root, j) => {
      const rootAngle = valueAngle - valueAngleStep / 2 + rootStep * (j + 0.5);
      const rx = Math.cos(rootAngle) * rootRingR;
      const ry = Math.sin(rootAngle) * rootRingR;

      if (!nodeIds.has(root.id)) {
        nodeIds.add(root.id);
        nodes.push({
          id: root.id,
          tier: "root",
          title: root.title,
          short: root.short,
          description: root.description,
          parentId: value.id,
          familyId: value.id,
          familyTitle: value.title,
          color: value.color,
          x: rx, y: ry,
          r: NODE_R.root,
          delay: 0.55 + i * 0.06 + j * 0.05,
          childrenIds: root.supports.map((s) => s.id),
          who: root.who,
          toWhom: root.toWhom,
          metrics: root.metrics,
        });
      }

      const ctx: SupportCtx = {
        familyId: value.id,
        familyTitle: value.title,
        color: value.color,
        valueIdx: i,
        rootIdx: j,
      };
      const supports = root.supports ?? [];
      const total = supports.reduce((acc, s) => acc + supportLeaves(s), 0);
      if (total === 0) return;
      let cursor = rootAngle - rootStep / 2;
      for (const sup of supports) {
        const w = rootStep * (supportLeaves(sup) / total);
        placeSupport(sup, cursor, w, 0, root.id, ctx);
        cursor += w;
      }
    });
  });

  // Перекрытия разрешаем только для ценностей/корневых; supporting уже
  // разведены интервалами и кольцами — трогать их нельзя (иначе пересечения).
  resolveOverlaps(nodes, ["value", "root"]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Доп. связи: пополняем childrenIds дополнительных родителей, но НЕ переселяем
  // сам узел (переселение после раскладки детей рвало рёбра и путало ветки).
  for (const node of nodes) {
    if (node.tier !== "support" || !node.extraParentIds) continue;
    for (const pid of node.extraParentIds) {
      const extraParent = nodeMap.get(pid);
      if (extraParent && !extraParent.childrenIds.includes(node.id)) {
        extraParent.childrenIds.push(node.id);
      }
    }
  }

  // Дети без повторов (защита от накопления дублей).
  for (const n of nodes) {
    n.childrenIds = Array.from(new Set(n.childrenIds));
  }

  if (customPositions) {
    for (const node of nodes) {
      const pos = customPositions[node.id];
      if (pos) { node.x = pos.x; node.y = pos.y; }
    }
  }

  nodes.forEach((node) => {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        const [x1, y1, x2, y2] = trimmed(parent.x, parent.y, parent.r, node.x, node.y, node.r);
        edges.push({
          id: `e-${parent.id}-${node.id}`,
          from: parent.id,
          to: node.id,
          color: node.tier === "value" ? CORE_COLOR : node.color,
          d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
          delay: node.delay - 0.1,
        });
      }
    }
    if (node.extraParentIds) {
      for (const extraPid of node.extraParentIds) {
        if (extraPid === node.parentId) continue;
        const extraParent = nodeMap.get(extraPid);
        if (extraParent) {
          const [x1, y1, x2, y2] = trimmed(extraParent.x, extraParent.y, extraParent.r, node.x, node.y, node.r);
          edges.push({
            id: `e-${extraPid}-${node.id}`,
            from: extraPid,
            to: node.id,
            color: node.color,
            d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
            delay: node.delay - 0.1,
          });
        }
      }
    }
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const nd of nodes) {
    minX = Math.min(minX, nd.x - nd.r - 90);
    minY = Math.min(minY, nd.y - nd.r - 90);
    maxX = Math.max(maxX, nd.x + nd.r + 90);
    maxY = Math.max(maxY, nd.y + nd.r + 90);
  }

  return { nodes, edges, bounds: { minX, minY, maxX, maxY } };
}

export function collectFamily(id: string, byId: Map<string, GraphNode>): Set<string> {
  const result = new Set<string>();
  const node = byId.get(id);
  if (!node) return result;

  result.add(id);

  const queue = [...node.childrenIds];
  while (queue.length > 0) {
    const childId = queue.shift()!;
    if (result.has(childId)) continue;
    result.add(childId);
    const child = byId.get(childId);
    if (child) queue.push(...child.childrenIds);
  }

  const parentQueue: string[] = [];
  if (node.parentId) parentQueue.push(node.parentId);
  if (node.extraParentIds) parentQueue.push(...node.extraParentIds);
  while (parentQueue.length > 0) {
    const pid = parentQueue.shift()!;
    if (result.has(pid)) continue;
    result.add(pid);
    const parent = byId.get(pid);
    if (!parent) continue;
    if (parent.parentId) parentQueue.push(parent.parentId);
    if (parent.extraParentIds) parentQueue.push(...parent.extraParentIds);
  }

  return result;
}

function resolveOverlaps(nodes: GraphNode[], tiers: Tier[]): void {
  tiers.forEach((tier) => {
    const tierNodes = nodes.filter((n) => n.tier === tier);
    if (tierNodes.length < 2) return;

    tierNodes.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));

    for (let i = 0; i < tierNodes.length; i++) {
      const current = tierNodes[i];
      const next = tierNodes[(i + 1) % tierNodes.length];
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = current.r + next.r + NODE_GAP;
      if (distance < minDistance) {
        const overlap = minDistance - distance;
        const angle = Math.atan2(dy, dx);
        const pushX = (Math.cos(angle) * overlap) / 2;
        const pushY = (Math.sin(angle) * overlap) / 2;
        current.x -= pushX; current.y -= pushY;
        next.x += pushX; next.y += pushY;
      }
    }
  });
}
