import { Position, type Edge, type Node } from '@xyflow/react';
import { NODE_REGISTRY } from '../components/Nodes';

export const GRID_SIZE = 5;

export const snapToGrid = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

const LAYOUT_CONFIG = {
  defaultNodeWidth: GRID_SIZE * 13,
  defaultNodeHeight: GRID_SIZE * 8,
  startX: GRID_SIZE * 3,
  startY: GRID_SIZE * 3,
  minIndentStep: GRID_SIZE * 4,
  maxIndentStep: GRID_SIZE * 8,
  indentStepFactor: 0.35,
  minLineGap: GRID_SIZE * 2,     // Uniform vertical gap (2 grid units)
  sectionGap: GRID_SIZE * 4,     // Extra gap between functions/sections (4 grid units)
} as const;

type Placement = { id: string; indentLevel: number };

const getRegistryItem = (node: Node) =>
  NODE_REGISTRY[(node.data as { type?: string } | undefined)?.type || (node.type as string)];

const readNumericSize = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getNodeDimensions = (node: Node) => {
  const style = node.style as { width?: number | string; height?: number | string } | undefined;

  const width =
    readNumericSize(node.measured?.width) ??
    readNumericSize(node.width) ??
    readNumericSize(style?.width) ??
    LAYOUT_CONFIG.defaultNodeWidth;

  const height =
    readNumericSize(node.measured?.height) ??
    readNumericSize(node.height) ??
    readNumericSize(style?.height) ??
    LAYOUT_CONFIG.defaultNodeHeight;

  return { width, height };
};

/**
 * Lays nodes out top-to-bottom like source code: each `next` chain is one column and
 * `body` children are indented under their container (if/while/function...).
 */
export const layoutCodeLike = (nodes: Node[], edges: Edge[]) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nextBySource = new Map<string, string>();
  const bodyBySource = new Map<string, string>();
  const incomingCount = new Map<string, number>(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);

    if (edge.sourceHandle === 'body') {
      bodyBySource.set(edge.source, edge.target);
      return;
    }

    if ((edge.sourceHandle === 'next' || !edge.sourceHandle) && !nextBySource.has(edge.source)) {
      nextBySource.set(edge.source, edge.target);
    }
  });

  const getRootSortWeight = (node: Node) => {
    const registryItem = getRegistryItem(node);
    if (registryItem?.hidePrevHandle) return 0;
    if (registryItem?.category === 'Structure') return 1;
    if (registryItem?.category === 'Control') return 2;
    return 3;
  };

  const sortedNodes = [...nodes].sort((a, b) => {
    const aPriority = getRootSortWeight(a);
    const bPriority = getRootSortWeight(b);

    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    return a.id.localeCompare(b.id);
  });

  const rootIds = sortedNodes
    .filter((node) => (incomingCount.get(node.id) || 0) === 0)
    .map((node) => node.id);

  const preferredRoots = sortedNodes
    .filter((node) => getRegistryItem(node)?.hidePrevHandle)
    .map((node) => node.id);

  const placed = new Set<string>();
  const blockTrees: Placement[][] = [];

  const placeBlock = (nodeId: string, indentLevel: number, currentTree: Placement[]) => {
    if (placed.has(nodeId)) return;

    const node = nodeById.get(nodeId);
    if (!node) return;

    currentTree.push({ id: nodeId, indentLevel });
    placed.add(nodeId);

    const registry = getRegistryItem(node);
    const bodyTarget = bodyBySource.get(nodeId);

    if (bodyTarget) {
      const isContainer = registry?.category === 'Structure' || registry?.category === 'Control' || registry?.hidePrevHandle;
      placeBlock(bodyTarget, indentLevel + (isContainer ? 1 : 0), currentTree);
    }

    const nextTarget = nextBySource.get(nodeId);
    if (nextTarget) {
      placeBlock(nextTarget, indentLevel, currentTree);
    }
  };

  // Preferred roots first, then other roots, then anything left over (e.g. cycles).
  [...preferredRoots, ...rootIds, ...sortedNodes.map((node) => node.id)].forEach((rootId) => {
    if (placed.has(rootId)) return;
    const tree: Placement[] = [];
    placeBlock(rootId, 0, tree);
    if (tree.length > 0) {
      blockTrees.push(tree);
    }
  });

  const allPlacements = blockTrees.flat();
  const avgPlacementWidth = allPlacements.length
    ? allPlacements.reduce((sum, p) => sum + getNodeDimensions(nodeById.get(p.id)!).width, 0) / allPlacements.length
    : LAYOUT_CONFIG.defaultNodeWidth;

  const indentStep = snapToGrid(Math.max(
    LAYOUT_CONFIG.minIndentStep,
    Math.min(LAYOUT_CONFIG.maxIndentStep, Math.round(avgPlacementWidth * LAYOUT_CONFIG.indentStepFactor))
  ));

  const positions = new Map<string, { x: number; y: number }>();
  let currentY = LAYOUT_CONFIG.startY;

  blockTrees.forEach((tree, treeIndex) => {
    tree.forEach(({ id, indentLevel }) => {
      const { height } = getNodeDimensions(nodeById.get(id)!);

      positions.set(id, {
        x: LAYOUT_CONFIG.startX + indentLevel * indentStep,
        y: currentY,
      });

      // Snap the measured height UP to the grid so rows stay grid-aligned
      currentY += snapToGrid(Math.ceil(height)) + LAYOUT_CONFIG.minLineGap;
    });

    if (treeIndex < blockTrees.length - 1) {
      currentY += LAYOUT_CONFIG.sectionGap;
    }
  });

  return {
    nodes: nodes.map((node) => ({
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: positions.get(node.id) || node.position,
    })),
    edges,
  };
};
