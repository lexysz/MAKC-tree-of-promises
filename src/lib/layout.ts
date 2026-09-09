import { COMPANY, VALUES } from "../data/tree";
import type { CompanyDef, Tier, ValueDef } from "../data/tree";

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
  company: 184,
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

function lineIntersectsCircle(
  x1: number, y1: number,
  x2: number, y2: number,
  cx: number, cy: number,
  r: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;

  let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const dist = Math.hypot(cx - closestX, cy - closestY);

  return dist < r + 2;
}

export function buildGraph(
  company: CompanyDef = COMPANY,
  values: ValueDef[] = VALUES,
  customPositions?: Record<string, { x: number; y: number }>,
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bounds: GraphBounds;
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>(); // Для отслеживания дубликатов

  const totalRoots = values.reduce((s, v) => s + v.promises.length, 0);
  const totalSupports = values.reduce(
    (s, v) => s + v.promises.reduce((s2, r) => s2 + r.supports.length, 0),
    0,
  );

  const scaleFactor = Math.max(1, Math.sqrt(values.length + totalRoots + totalSupports) / 5);
  const valueRingR = Math.max(1050, minRingRadius(values.length, NODE_R.value));
  const rootRingR = Math.max(valueRingR + 900 * scaleFactor, minRingRadius(totalRoots, NODE_R.root));
  const supportRingR = Math.max(rootRingR + 840 * scaleFactor, minRingRadius(totalSupports, NODE_R.support));

  // Добавляем ядро компании
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

    // Добавляем ценность
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
    if (rootCount > 0) {
      const sectorWidth = valueAngleStep;
      const rootStep = sectorWidth / rootCount;

      value.promises.forEach((root, j) => {
        const rootAngle = valueAngle - sectorWidth / 2 + rootStep * (j + 0.5);
        const rx = Math.cos(rootAngle) * rootRingR;
        const ry = Math.sin(rootAngle) * rootRingR;

        // Добавляем корневое обещание
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

        const supportCount = root.supports.length;
        if (supportCount > 0) {
          const subSectorWidth = rootStep;
          const supportStep = subSectorWidth / supportCount;

          root.supports.forEach((sup, t) => {
            const supportAngle = rootAngle - subSectorWidth / 2 + supportStep * (t + 0.5);
            const sx = Math.cos(supportAngle) * supportRingR;
            const sy = Math.sin(supportAngle) * supportRingR;

            // Добавляем поддерживающее обещание
            if (!nodeIds.has(sup.id)) {
              nodeIds.add(sup.id);
              nodes.push({
                id: sup.id,
                tier: "support",
                title: sup.title,
                short: "",
                description: sup.description,
                parentId: root.id,
                familyId: value.id,
                familyTitle: value.title,
                color: value.color,
                x: sx,
                y: sy,
                r: NODE_R.support,
                delay: 0.95 + i * 0.05 + j * 0.04 + t * 0.045,
                childrenIds: [],
                who: sup.who,
                toWhom: sup.toWhom,
                metrics: sup.metrics,
              });
            }
          });
        }
      });
    }
  });

  resolveOverlaps(nodes, valueRingR, rootRingR, supportRingR);

  if (customPositions) {
    for (const node of nodes) {
      const pos = customPositions[node.id];
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
  }

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

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const nd of nodes) {
    minX = Math.min(minX, nd.x - nd.r - 90);
    minY = Math.min(minY, nd.y - nd.r - 90);
    maxX = Math.max(maxX, nd.x + nd.r + 90);
    maxY = Math.max(maxY, nd.y + nd.r + 90);
  }

  return { nodes, edges, bounds: { minX, minY, maxX, maxY } };
}

function resolveOverlaps(
  nodes: GraphNode[],
  valueRingR: number,
  rootRingR: number,
  supportRingR: number,
) {
  const tiers = [
    { tier: "value" as Tier, radius: valueRingR },
    { tier: "root" as Tier, radius: rootRingR },
    { tier: "support" as Tier, radius: supportRingR },
  ];

  for (const { tier, radius } of tiers) {
    const tierNodes = nodes.filter((n) => n.tier === tier);
    if (tierNodes.length < 2) continue;

    tierNodes.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));

    for (let iter = 0; iter < 100; iter++) {
      let moved = false;

      for (let i = 0; i < tierNodes.length; i++) {
        for (let j = i + 1; j < tierNodes.length; j++) {
          const a = tierNodes[i];
          const b = tierNodes[j];

          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const minDist = a.r + b.r + NODE_GAP;

          if (dist < minDist) {
            moved = true;
            const overlap = minDist - dist;
            const angleA = Math.atan2(a.y, a.x);
            const angleB = Math.atan2(b.y, b.x);

            const pushAngle = (overlap / radius) * 0.6;
            a.x = Math.cos(angleA - pushAngle) * radius;
            a.y = Math.sin(angleA - pushAngle) * radius;
            b.x = Math.cos(angleB + pushAngle) * radius;
            b.y = Math.sin(angleB + pushAngle) * radius;
          }
        }
      }

      if (!moved) break;
    }
  }

  for (let iter = 0; iter < 60; iter++) {
    let moved = false;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.tier === "company") continue;

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        if (b.tier === "company" || a.tier === b.tier) continue;

        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const minDist = a.r + b.r + NODE_GAP;

        if (dist < minDist) {
          moved = true;
          const overlap = minDist - dist;
          const angleA = Math.atan2(a.y, a.x);
          const angleB = Math.atan2(b.y, b.x);
          const radiusA = Math.hypot(a.x, a.y);
          const radiusB = Math.hypot(b.x, b.y);

          const pushFactor = overlap * 0.5;
          if (radiusA <= radiusB) {
            a.x = Math.cos(angleA) * Math.max(150, radiusA - pushFactor * 0.3);
            a.y = Math.sin(angleA) * Math.max(150, radiusA - pushFactor * 0.3);
            b.x = Math.cos(angleB) * (radiusB + pushFactor * 0.7);
            b.y = Math.sin(angleB) * (radiusB + pushFactor * 0.7);
          } else {
            a.x = Math.cos(angleA) * (radiusA + pushFactor * 0.7);
            a.y = Math.sin(angleA) * (radiusA + pushFactor * 0.7);
            b.x = Math.cos(angleB) * Math.max(150, radiusB - pushFactor * 0.3);
            b.y = Math.sin(angleB) * Math.max(150, radiusB - pushFactor * 0.3);
          }
        }
      }
    }

    if (!moved) break;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (let iter = 0; iter < 30; iter++) {
    let moved = false;

    for (const node of nodes) {
      if (!node.parentId) continue;
      const parent = nodeMap.get(node.parentId);
      if (!parent) continue;

      const [x1, y1, x2, y2] = trimmed(parent.x, parent.y, parent.r, node.x, node.y, node.r);

      for (const other of nodes) {
        if (other.id === parent.id || other.id === node.id) continue;

        if (lineIntersectsCircle(x1, y1, x2, y2, other.x, other.y, other.r)) {
          moved = true;
          const nodeAngle = Math.atan2(node.y, node.x);
          const nodeRadius = Math.hypot(node.x, node.y);

          const crossProduct = (x2 - x1) * (other.y - y1) - (y2 - y1) * (other.x - x1);
          const newAngle = nodeAngle + (crossProduct > 0 ? 0.12 : -0.12);

          node.x = Math.cos(newAngle) * nodeRadius;
          node.y = Math.sin(newAngle) * nodeRadius;
          break;
        }
      }
    }

    if (!moved) break;
  }
}

export function collectFamily(id: string, byId: Map<string, GraphNode>): Set<string> {
  const set = new Set<string>();
  let cur: GraphNode | undefined = byId.get(id);
  
  while (cur) {
    set.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  
  const queue = [id];
  while (queue.length) {
    const nid = queue.shift()!;
    const nd = byId.get(nid);
    if (!nd) continue;
    for (const cid of nd.childrenIds) {
      if (!set.has(cid)) {
        set.add(cid);
        queue.push(cid);
      }
    }
  }
  
  return set;
}
