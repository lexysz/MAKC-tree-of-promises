import type { CompanyDef, Tier, ValueDef, SupportDef } from "../data/tree";

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

function minRingRadius(n: number, r: number): number {
  if (n <= 1) return r + 60;
  return (n * (2 * r + NODE_GAP)) / (2 * Math.PI);
}

function trimmed(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
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

/**
 * Подсчитывает общее количество поддерживающих обещаний всех уровней вложенности.
 */
function countAllSupports(values: ValueDef[]): number {
  const countSupport = (supports: SupportDef[]): number => {
    return supports.reduce((sum, s) => sum + 1 + countSupport(s.supports ?? []), 0);
  };

  return values.reduce((sum, v) => {
    return sum + v.promises.reduce((sum2, r) => sum2 + countSupport(r.supports ?? []), 0);
  }, 0);
}

export function buildGraph(
  company: CompanyDef,
  values: ValueDef[],
  customPositions?: Record<string, { x: number; y: number }>,
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bounds: GraphBounds;
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const totalRoots = values.reduce((sum, v) => sum + v.promises.length, 0);
  const totalSupports = countAllSupports(values);

  const scaleFactor = Math.max(1, Math.sqrt(values.length + totalRoots + totalSupports) / 5);
  const valueRingR = Math.max(1050, minRingRadius(values.length, NODE_R.value));
  const rootRingR = Math.max(valueRingR + 900 * scaleFactor, minRingRadius(totalRoots, NODE_R.root));
  const supportRingR = Math.max(rootRingR + 840 * scaleFactor, minRingRadius(totalSupports, NODE_R.support));
  const support2RingR = supportRingR + 600 * scaleFactor; // Кольцо для поддерживающих 2-го уровня

  // Add company core
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
      x: 0,
      y: 0,
      r: NODE_R.company,
      delay: 0.05,
      childrenIds: values.map((v) => v.id),
    });
  }

  const valueAngleStep = (2 * Math.PI) / values.length;

  values.forEach((value, i) => {
    const valueAngle = -Math.PI / 2 + valueAngleStep * i;
    const vx = Math.cos(valueAngle) * valueRingR;
    const vy = Math.sin(valueAngle) * valueRingR;

    // Add value node
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
        x: vx,
        y: vy,
        r: NODE_R.value,
        delay: 0.18 + i * 0.07,
        childrenIds: value.promises.map((p) => p.id),
      });
    }

    const rootCount = value.promises.length;
    if (rootCount === 0) return;

    const sectorWidth = valueAngleStep;
    const rootStep = sectorWidth / rootCount;

    value.promises.forEach((root, j) => {
      const rootAngle = valueAngle - sectorWidth / 2 + rootStep * (j + 0.5);
      const rx = Math.cos(rootAngle) * rootRingR;
      const ry = Math.sin(rootAngle) * rootRingR;

      // Add root promise
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
          x: rx,
          y: ry,
          r: NODE_R.root,
          delay: 0.55 + i * 0.06 + j * 0.05,
          childrenIds: root.supports.map((s) => s.id),
          who: root.who,
          toWhom: root.toWhom,
          metrics: root.metrics,
        });
      }

      // Рекурсивная обработка поддерживающих обещаний
      processSupports(
        root.supports ?? [],
        root.id,
        rootAngle,
        rootStep,
        value.id,
        value.title,
        value.color,
        i,
        j,
        supportRingR,
        support2RingR,
        nodes,
        nodeIds,
        0
      );
    });
  });

  resolveOverlaps(nodes, valueRingR, rootRingR, supportRingR);

  // Apply custom positions if provided
  if (customPositions) {
    for (const node of nodes) {
      const pos = customPositions[node.id];
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
  }

  // Build edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((node) => {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        const [x1, y1, x2, y2] = trimmed(parent.x, parent.y, parent.r, node.x, node.y, node.r);
        const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        edges.push({
          id: `e-${parent.id}-${node.id}`,
          from: parent.id,
          to: node.id,
          color: node.tier === "value" ? CORE_COLOR : node.color,
          d,
          delay: node.delay - 0.1,
        });
      }
    }
  });

  // Calculate bounds
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const nd of nodes) {
    minX = Math.min(minX, nd.x - nd.r - 90);
    minY = Math.min(minY, nd.y - nd.r - 90);
    maxX = Math.max(maxX, nd.x + nd.r + 90);
    maxY = Math.max(maxY, nd.y + nd.r + 90);
  }

  return { nodes, edges, bounds: { minX, minY, maxX, maxY } };
}

/**
 * Рекурсивно обрабатывает поддерживающие обещания и их вложенные уровни.
 * depth: 0 = первый уровень (от корневого), 1 = второй уровень (от поддерживающего)
 */
function processSupports(
  supports: SupportDef[],
  parentId: string,
  parentAngle: number,
  parentStep: number,
  familyId: string,
  familyTitle: string,
  color: string,
  valueIdx: number,
  rootIdx: number,
  ringR: number,
  ringR2: number,
  nodes: GraphNode[],
  nodeIds: Set<string>,
  depth: number
): void {
  if (supports.length === 0) return;

  const supportCount = supports.length;
  const subSectorWidth = parentStep;
  const supportStep = subSectorWidth / supportCount;

  supports.forEach((sup, t) => {
    const supportAngle = parentAngle - subSectorWidth / 2 + supportStep * (t + 0.5);
    const sx = Math.cos(supportAngle) * (depth === 0 ? ringR : ringR2);
    const sy = Math.sin(supportAngle) * (depth === 0 ? ringR : ringR2);

    // Add supporting promise
    if (!nodeIds.has(sup.id)) {
      nodeIds.add(sup.id);
      nodes.push({
        id: sup.id,
        tier: "support",
        title: sup.title,
        short: "",
        description: sup.description,
        parentId,
        familyId,
        familyTitle,
        color,
        x: sx,
        y: sy,
        r: NODE_R.support,
        delay: depth === 0
          ? 0.95 + valueIdx * 0.05 + rootIdx * 0.04 + t * 0.045
          : 1.25 + valueIdx * 0.05 + rootIdx * 0.04 + t * 0.045,
        childrenIds: sup.supports?.map((s) => s.id) ?? [],
        who: sup.who,
        toWhom: sup.toWhom,
        metrics: sup.metrics,
      });
    }

    // Рекурсивно обрабатываем следующий уровень (максимум depth = 1)
    if (depth < 1 && sup.supports && sup.supports.length > 0) {
      processSupports(
        sup.supports,
        sup.id,
        supportAngle,
        supportStep,
        familyId,
        familyTitle,
        color,
        valueIdx,
        rootIdx,
        ringR,
        ringR2,
        nodes,
        nodeIds,
        depth + 1
      );
    }
  });
}

export function collectFamily(id: string, byId: Map<string, GraphNode>): Set<string> {
  const result = new Set<string>();
  const node = byId.get(id);
  if (!node) return result;

  // Add the node itself
  result.add(id);

  // Add all descendants
  const queue = [...node.childrenIds];
  while (queue.length > 0) {
    const childId = queue.shift()!;
    if (result.has(childId)) continue;
    result.add(childId);
    const child = byId.get(childId);
    if (child) queue.push(...child.childrenIds);
  }

  // Add parent chain
  let current = node;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    result.add(parent.id);
    current = parent;
  }

  return result;
}

function resolveOverlaps(
  nodes: GraphNode[],
  _valueRingR: number,
  _rootRingR: number,
  _supportRingR: number,
): void {
  // Phase 1: resolve overlaps within each tier
  const tiers: Tier[] = ["value", "root", "support"];
  
  tiers.forEach((tier) => {
    const tierNodes = nodes.filter((n) => n.tier === tier);
    if (tierNodes.length < 2) return;

    // Sort by angle
    tierNodes.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));

    // Check and resolve overlaps
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

        current.x -= pushX;
        current.y -= pushY;
        next.x += pushX;
        next.y += pushY;
      }
    }
  });

  // Phase 2: resolve overlaps between tiers (simplified)
  // This is a placeholder for more sophisticated collision detection
  // if needed in the future
}
