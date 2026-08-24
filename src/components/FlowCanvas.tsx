import React, { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  Panel,
  useReactFlow,
  ConnectionLineType,
  useNodesInitialized,
} from '@xyflow/react';
import { X, Trash2, Layout, Copy, Clipboard, Undo2, Redo2 } from 'lucide-react';
import { BaseNode, NODE_REGISTRY, NodeData } from './Nodes';
import { generateCCode } from '../services/codeGenerator';
import { parseCodeToNodes } from '../services/codeParser';
import dagre from 'dagre';

const GRID_SIZE = 5;

const snapToGrid = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

const LAYOUT_CONFIG = {
  defaultNodeWidth: GRID_SIZE * 13,
  defaultNodeHeight: GRID_SIZE * 8,
  startX: GRID_SIZE * 3,         // 3 grid units (3 * 20)
  startY: GRID_SIZE * 3,         // 3 grid units (3 * 20)
  minIndentStep: GRID_SIZE * 4,  // 4 grid units (4 * 20)
  maxIndentStep: GRID_SIZE * 8, // 8 grid units (8 * 20)
  indentStepFactor: 0.35,
  minLineGap: GRID_SIZE * 2,     // Uniform vertical gap (2 grid units)
  sectionGap: GRID_SIZE * 4,     // Extra gap between functions/sections (4 grid units)
  dagre: {
    minNodeSep: GRID_SIZE * 2,
    minRankSep: GRID_SIZE * 2,
    nodeSepFactor: 0.18,
    rankSepFactor: 0.5,
    marginX: GRID_SIZE,
    marginY: GRID_SIZE,
  },
} as const;

const getNodeDataType = (node: Node) => (node.data as unknown as NodeData).type;
const getRegistryItem = (node: Node) => NODE_REGISTRY[getNodeDataType(node)];

const readNumericSize = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getNodeDimensions = (node: Node) => {
  const measured = (node as any).measured as { width?: number; height?: number } | undefined;
  const style = node.style as { width?: number | string; height?: number | string } | undefined;

  const width =
    readNumericSize(measured?.width) ??
    readNumericSize(node.width) ??
    readNumericSize(style?.width) ??
    LAYOUT_CONFIG.defaultNodeWidth;

  const height =
    readNumericSize(measured?.height) ??
    readNumericSize(node.height) ??
    readNumericSize(style?.height) ??
    LAYOUT_CONFIG.defaultNodeHeight;

  return { width, height };
};

const getDagreLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const dims = nodes.map(getNodeDimensions);
  const avgWidth = dims.length ? dims.reduce((sum, d) => sum + d.width, 0) / dims.length : LAYOUT_CONFIG.defaultNodeWidth;
  const avgHeight = dims.length ? dims.reduce((sum, d) => sum + d.height, 0) / dims.length : LAYOUT_CONFIG.defaultNodeHeight;
  
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: Math.max(LAYOUT_CONFIG.dagre.minNodeSep, Math.round(avgWidth * LAYOUT_CONFIG.dagre.nodeSepFactor)),
    ranksep: Math.max(LAYOUT_CONFIG.dagre.minRankSep, Math.round(avgHeight * LAYOUT_CONFIG.dagre.rankSepFactor)),
    marginx: LAYOUT_CONFIG.dagre.marginX,
    marginy: LAYOUT_CONFIG.dagre.marginY,
  });

  nodes.forEach((node) => {
    const { width, height } = getNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      const { width, height } = getNodeDimensions(node);
      return {
        ...node,
        targetPosition: isHorizontal ? 'left' : 'top',
        sourcePosition: isHorizontal ? 'right' : 'bottom',
        position: {
          x: snapToGrid(nodeWithPosition.x - width / 2),
          y: snapToGrid(nodeWithPosition.y - height / 2),
        },
      };
    }),
    edges,
  };
};

const getCodeLikeLayoutedElements = (nodes: Node[], edges: Edge[]) => {
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

  const orderedRoots = Array.from(new Set([...preferredRoots, ...rootIds]));
  
  const placed = new Set<string>();
  const blockTrees: Array<Array<{ id: string; indentLevel: number }>> = [];

  const placeBlock = (nodeId: string, indentLevel: number, currentTree: Array<{ id: string; indentLevel: number }>) => {
    if (placed.has(nodeId)) return;

    const node = nodeById.get(nodeId);
    if (!node) return;

    currentTree.push({ id: nodeId, indentLevel });
    placed.add(nodeId);

    const registry = getRegistryItem(node);
    const bodyTarget = bodyBySource.get(nodeId);

    if (bodyTarget) {
      const isContainer = registry?.category === 'Structure' || registry?.category === 'Control' || registry?.hidePrevHandle;
      const bodyIndentDelta = isContainer ? 1 : 0;
      placeBlock(bodyTarget, indentLevel + bodyIndentDelta, currentTree);
    }

    const nextTarget = nextBySource.get(nodeId);
    if (nextTarget) {
      placeBlock(nextTarget, indentLevel, currentTree);
    }
  };

  orderedRoots.forEach((rootId) => {
    if (placed.has(rootId)) return;
    const tree: Array<{ id: string; indentLevel: number }> = [];
    placeBlock(rootId, 0, tree);
    if (tree.length > 0) {
      blockTrees.push(tree);
    }
  });

  sortedNodes.forEach((node) => {
    if (placed.has(node.id)) return;
    const tree: Array<{ id: string; indentLevel: number }> = [];
    placeBlock(node.id, 0, tree);
    if (tree.length > 0) {
      blockTrees.push(tree);
    }
  });

  const allPlacements = blockTrees.flat();
  const avgPlacementWidth = allPlacements.length
    ? allPlacements.reduce((sum, p) => {
        const node = nodeById.get(p.id);
        return sum + (node ? getNodeDimensions(node).width : LAYOUT_CONFIG.defaultNodeWidth);
      }, 0) / allPlacements.length
    : LAYOUT_CONFIG.defaultNodeWidth;

  const rawIndentStep = Math.max(
    LAYOUT_CONFIG.minIndentStep,
    Math.min(LAYOUT_CONFIG.maxIndentStep, Math.round(avgPlacementWidth * LAYOUT_CONFIG.indentStepFactor))
  );
  const indentStep = snapToGrid(rawIndentStep);

  const maxIndent = allPlacements.reduce((max, p) => Math.max(max, p.indentLevel), 0);
  const xByIndent = new Map<number, number>();
  xByIndent.set(0, LAYOUT_CONFIG.startX);
  for (let i = 1; i <= maxIndent; i += 1) {
    xByIndent.set(i, LAYOUT_CONFIG.startX + i * indentStep);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let currentY = LAYOUT_CONFIG.startY;

  blockTrees.forEach((tree, treeIndex) => {
    tree.forEach(({ id, indentLevel }) => {
      const node = nodeById.get(id);
      if (!node) return;

      const { height } = getNodeDimensions(node);

      // Snap the measured height UP to the nearest grid step
      const gridAlignedHeight = snapToGrid(Math.ceil(height));

      positions.set(id, {
        x: xByIndent.get(indentLevel) || LAYOUT_CONFIG.startX,
        y: currentY,
      });

      // Advance currentY strictly on grid units
      currentY += gridAlignedHeight + LAYOUT_CONFIG.minLineGap;
    });

    if (treeIndex < blockTrees.length - 1) {
      currentY += LAYOUT_CONFIG.sectionGap;
    }
  });

  return {
    nodes: nodes.map((node) => ({
      ...node,
      targetPosition: 'top',
      sourcePosition: 'bottom',
      position: positions.get(node.id) || node.position,
    })),
    edges,
  };
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  if (direction === 'TB' || !direction) {
    return getCodeLikeLayoutedElements(nodes, edges);
  }

  return getDagreLayoutedElements(nodes, edges, direction);
};

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export type FlowCanvasActions = {
  addNode: (type: string) => void;
  layout: () => void;
  undo: () => void;
  redo: () => void;
  exportProject: () => string;
  importProject: (json: string) => void;
  importCode: (code: string) => Promise<void>;
};

const internalNodeTypes = Object.keys(NODE_REGISTRY).reduce((acc, key) => {
  acc[key] = BaseNode;
  return acc;
}, {} as Record<string, React.ComponentType<any>>);

interface FlowCanvasProps {
  onCodeChange: (code: string) => void;
  onNodesCountChange: (count: number) => void;
  registerActions?: (actions: FlowCanvasActions | null) => void;
}

type FlowSnapshot = { nodes: Node[]; edges: Edge[] };
const HISTORY_LIMIT = 50;
const cloneFlow = (nodes: Node[], edges: Edge[]): FlowSnapshot =>
  JSON.parse(JSON.stringify({ nodes, edges })) as FlowSnapshot;
const flowSignature = (flow: FlowSnapshot) => JSON.stringify(flow);

export const FlowCanvas = React.memo(({ onCodeChange, onNodesCountChange, registerActions }: FlowCanvasProps) => {
  const { screenToFlowPosition, deleteElements, getNodes, getEdges, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  const nodesInitialized = useNodesInitialized();

  const lastEdgesRef = useRef<string>('');
  const lastDataRef = useRef<string>('');
  const historyRef = useRef<{ past: FlowSnapshot[]; future: FlowSnapshot[]; last: string; pending: string | null }>({
    past: [],
    future: [],
    last: '',
    pending: null,
  });
  const isApplyingHistoryRef = useRef(false);
  const isDraggingRef = useRef(false);
  const clipboardRef = useRef<string | null>(null);

  const triggerCodeGeneration = useCallback((forceNodes?: Node[], forceEdges?: Edge[]) => {
    const currentNodes = forceNodes || getNodes();
    const currentEdges = forceEdges || getEdges();

    const edgesSig = JSON.stringify(
      currentEdges.map((edge) => ({
        s: edge.source,
        t: edge.target,
        sh: edge.sourceHandle,
        th: edge.targetHandle,
      }))
    );
    const dataSig = JSON.stringify(currentNodes.map((node) => ({ id: node.id, d: node.data })));

    if (forceNodes || forceEdges || edgesSig !== lastEdgesRef.current || dataSig !== lastDataRef.current) {
      lastEdgesRef.current = edgesSig;
      lastDataRef.current = dataSig;
      const code = generateCCode(currentNodes, currentEdges);
      onCodeChange(code);
      onNodesCountChange(currentNodes.length);
    }
  }, [getNodes, getEdges, onCodeChange, onNodesCountChange]);

  const queueCodeGeneration = useCallback((forceNodes?: Node[], forceEdges?: Edge[]) => {
    setTimeout(() => triggerCodeGeneration(forceNodes, forceEdges), 0);
  }, [triggerCodeGeneration]);

  const recordHistory = useCallback(() => {
    if (isApplyingHistoryRef.current) return;
    const current = cloneFlow(getNodes(), getEdges());
    const signature = flowSignature(current);
    if (signature === historyRef.current.pending) return;
    historyRef.current.past = [...historyRef.current.past, current].slice(-HISTORY_LIMIT);
    historyRef.current.future = [];
    historyRef.current.pending = signature;
  }, [getEdges, getNodes]);

  const applySnapshot = useCallback((snapshot: FlowSnapshot) => {
    isApplyingHistoryRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    historyRef.current.last = flowSignature(snapshot);
    historyRef.current.pending = null;
    triggerCodeGeneration(snapshot.nodes, snapshot.edges);
    setTimeout(() => { isApplyingHistoryRef.current = false; }, 0);
  }, [setEdges, setNodes, triggerCodeGeneration]);

  const undo = useCallback(() => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.unshift(cloneFlow(getNodes(), getEdges()));
    applySnapshot(previous);
  }, [applySnapshot, getEdges, getNodes]);

  const redo = useCallback(() => {
    const next = historyRef.current.future.shift();
    if (!next) return;
    historyRef.current.past.push(cloneFlow(getNodes(), getEdges()));
    applySnapshot(next);
  }, [applySnapshot, getEdges, getNodes]);

  const copySelection = useCallback(async () => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    if (!selectedNodes.length) return;
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const selectedEdges = getEdges().filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target));
    const payload = JSON.stringify({ nodes: selectedNodes, edges: selectedEdges });
    clipboardRef.current = payload;
    try {
      await navigator.clipboard.writeText(`seec-flow:${payload}`);
    } catch {}
  }, [getEdges, getNodes]);

  const pasteSelection = useCallback(async () => {
    let payload = clipboardRef.current;
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText.startsWith('seec-flow:')) payload = clipboardText.slice('seec-flow:'.length);
    } catch {}
    if (!payload) return;

    try {
      const copied = JSON.parse(payload) as FlowSnapshot;
      if (!copied.nodes?.length) return;
      recordHistory();
      const idMap = new Map(copied.nodes.map((node) => [node.id, Math.random().toString(36).slice(2, 11)]));
      const minX = Math.min(...copied.nodes.map((node) => node.position.x));
      const minY = Math.min(...copied.nodes.map((node) => node.position.y));
      const pastedNodes = copied.nodes.map((node) => ({
        ...node,
        id: idMap.get(node.id)!,
        selected: true,
        position: { x: node.position.x - minX + 40, y: node.position.y - minY + 40 },
      }));
      const pastedEdges = copied.edges.map((edge) => ({
        ...edge,
        id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${Math.random().toString(36).slice(2, 7)}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
      }));
      const nextNodes = getNodes().map((node) => ({ ...node, selected: false })).concat(pastedNodes);
      const nextEdges = getEdges().concat(pastedEdges);
      setNodes(nextNodes);
      setEdges(nextEdges);
      historyRef.current.last = flowSignature(cloneFlow(nextNodes, nextEdges));
      triggerCodeGeneration(nextNodes, nextEdges);
    } catch {}
  }, [getEdges, getNodes, recordHistory, setEdges, setNodes, triggerCodeGeneration]);

  useEffect(() => {
    triggerCodeGeneration();
    const handleDataChange = () => triggerCodeGeneration();
    const handleBeforeDataChange = () => recordHistory();
    window.addEventListener('seec-data-change', handleDataChange);
    window.addEventListener('seec-before-data-change', handleBeforeDataChange);
    return () => {
      window.removeEventListener('seec-data-change', handleDataChange);
      window.removeEventListener('seec-before-data-change', handleBeforeDataChange);
    };
  }, [recordHistory, triggerCodeGeneration]);

  useEffect(() => {
    historyRef.current.last = flowSignature(cloneFlow(nodes, edges));
    historyRef.current.pending = null;
  }, [edges, nodes]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT' || element?.isContentEditable;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key.toLowerCase() === 'c') {
        void copySelection();
      } else if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void pasteSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelection, pasteSelection, redo, undo]);

  const onNodesChangeInternal = useCallback((changes: any) => {
    const hasHistoryChange = changes.some((change: any) => change.type !== 'select' && change.type !== 'position');
    if (hasHistoryChange && !isDraggingRef.current) {
      recordHistory();
    }
    onNodesChange(changes);
    const hasSignificantChange = changes.some((c: any) => 
      c.type === 'add' || c.type === 'remove' || c.type === 'reset' || c.type === 'data'
    );
    if (hasSignificantChange) {
      triggerCodeGeneration();
    }
  }, [onNodesChange, recordHistory, triggerCodeGeneration]);

  const onEdgesChangeInternal = useCallback((changes: any) => {
    if (changes.some((change: any) => change.type !== 'select')) recordHistory();
    onEdgesChange(changes);
    const hasSignificantChange = changes.some((c: any) => 
      c.type === 'add' || c.type === 'remove' || c.type === 'reset'
    );
    if (hasSignificantChange) {
      triggerCodeGeneration();
    }
  }, [onEdgesChange, recordHistory, triggerCodeGeneration]);

  const onConnect = useCallback(
    (params: Connection) => {
      recordHistory();
      setEdges((eds) => {
        const filteredEdges = eds.filter(
          (edge) =>
            !(edge.source === params.source && edge.sourceHandle === params.sourceHandle) &&
            !(edge.target === params.target && edge.targetHandle === params.targetHandle)
        );
        const newEdges = addEdge(params, filteredEdges);
        queueCodeGeneration();
        return newEdges;
      });
    },
    [queueCodeGeneration, recordHistory, setEdges]
  );

  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      recordHistory();
      setEdges((eds) => {
        const newEdges = eds.filter((e) => e.id !== edge.id);
        queueCodeGeneration();
        return newEdges;
      });
    },
    [queueCodeGeneration, recordHistory, setEdges]
  );

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const sourceNode = getNodes().find((n) => n.id === connection.source);
      const targetNode = getNodes().find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return false;

      const sourceData = sourceNode.data as unknown as NodeData;
      const targetData = targetNode.data as unknown as NodeData;
      const targetRegistry = NODE_REGISTRY[targetData.type];
      
      if (targetRegistry?.strictPrev && connection.targetHandle === 'prev') {
        return targetRegistry.strictPrev.includes(sourceData.type);
      }

      if (connection.targetHandle?.startsWith('field:')) {
        const sourceRegistry = NODE_REGISTRY[sourceData.type];
        return !!sourceRegistry?.toExpression;
      }

      return true;
    },
    [getNodes]
  );

  const addNode = useCallback((type: string, position?: { x: number, y: number }) => {
    recordHistory();
    const id = Math.random().toString(36).slice(2, 11);
    const registryItem = NODE_REGISTRY[type];

    const rawPosition = position || screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const finalPosition = {
      x: snapToGrid(rawPosition.x),
      y: snapToGrid(rawPosition.y),
    };

    const newNode: Node = {
      id,
      type,
      position: finalPosition,
      data: {
        label: registryItem?.label || `New ${type}`,
        type: type as any,
        ...(registryItem?.defaultData || {}),
      },
    };

    setNodes((nds) => {
      const nextNodes = nds.concat(newNode);
      queueCodeGeneration(nextNodes, getEdges());
      return nextNodes;
    });
  }, [getEdges, queueCodeGeneration, recordHistory, screenToFlowPosition, setNodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, position);
    },
    [screenToFlowPosition, addNode]
  );

  const handleLayout = useCallback((direction?: string, forceNodes?: Node[], forceEdges?: Edge[]) => {
    recordHistory();
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      forceNodes || getNodes(),
      forceEdges || getEdges(),
      direction
    );
    setNodes(layoutedNodes as unknown as any[]);
    setEdges([...layoutedEdges]);
    triggerCodeGeneration(layoutedNodes as unknown as Node[], layoutedEdges as unknown as Edge[]);
    setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 50);
  }, [fitView, getEdges, getNodes, recordHistory, setEdges, setNodes, triggerCodeGeneration]);

  const handleDeleteSelection = useCallback(() => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    const selectedEdges = getEdges().filter((edge) => edge.selected);
    if (!selectedNodes.length && !selectedEdges.length) return;
    recordHistory();
    deleteElements({ nodes: selectedNodes, edges: selectedEdges });
    queueCodeGeneration();
  }, [deleteElements, getEdges, getNodes, queueCodeGeneration, recordHistory]);

  const handleClearCanvas = useCallback(() => {
    recordHistory();
    setNodes([]);
    setEdges([]);
    triggerCodeGeneration([], []);
  }, [recordHistory, setEdges, setNodes, triggerCodeGeneration]);

  const handleNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    recordHistory();
  }, [recordHistory]);

  const handleNodeDragStop = useCallback(() => {
    isDraggingRef.current = false;
    triggerCodeGeneration();
  }, [triggerCodeGeneration]);

  useEffect(() => {
    const actions: FlowCanvasActions = {
      addNode,
      layout: handleLayout,
      undo,
      redo,
      exportProject: () => {
        const flow = {
          nodes: getNodes(),
          edges: getEdges(),
          viewport: { x: 0, y: 0, zoom: 1 },
        };
        return JSON.stringify(flow, null, 2);
      },
      importProject: (json: string) => {
        try {
          const flow = JSON.parse(json);
          const newNodes = flow.nodes || [];
          const newEdges = flow.edges || [];
          recordHistory();
          setNodes(newNodes);
          setEdges(newEdges);
          triggerCodeGeneration(newNodes, newEdges);
          setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 100);
        } catch (error) {
          console.error('Failed to import project', error);
          alert('Invalid project file');
        }
      },
      importCode: async (code: string) => {
        try {
          const { nodes: newNodes, edges: newEdges } = parseCodeToNodes(code);

          if (newNodes.length > 0) {
            recordHistory();
            setNodes(newNodes);
            setEdges(newEdges);
            setTimeout(() => {
              handleLayout();
            }, 50);
          } else {
            console.error('Parser returned no nodes');
            alert('Could not parse the code. Please ensure it is valid C code.');
          }
        } catch (error) {
          console.error('Parsing failed:', error);
          alert('Failed to parse code. Please check the console for details.');
        }
      },
    };

    registerActions?.(actions);

    return () => {
      registerActions?.(null);
    };
  }, [addNode, fitView, getEdges, getNodes, handleLayout, redo, recordHistory, registerActions, setEdges, setNodes, triggerCodeGeneration, undo]);

  const hasAutoLayoutedRef = useRef(false);
  useEffect(() => {
    if (nodesInitialized && !hasAutoLayoutedRef.current && nodes.length > 0) {
      hasAutoLayoutedRef.current = true;
      handleLayout();
    }
  }, [nodesInitialized, nodes.length, handleLayout]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChangeInternal}
      onEdgesChange={onEdgesChangeInternal}
      onNodeDragStart={handleNodeDragStart}
      onNodeDragStop={handleNodeDragStop}
      onConnect={onConnect}
      onEdgeDoubleClick={onEdgeDoubleClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      isValidConnection={isValidConnection}
      nodeTypes={internalNodeTypes}
      onNodesDelete={() => setTimeout(triggerCodeGeneration, 0)}
      onEdgesDelete={() => setTimeout(triggerCodeGeneration, 0)}
      defaultEdgeOptions={{ 
        type: 'smoothstep',
        style: { strokeWidth: 2, stroke: '#52525b' }
      }}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectionLineStyle={{ strokeWidth: 2, stroke: '#52525b' }}
      fitView
      snapToGrid={true}
      snapGrid={[GRID_SIZE, GRID_SIZE]}
      onlyRenderVisibleElements={true}
      deleteKeyCode={['Backspace', 'Delete']}
      className="bg-zinc-950"
    >
      <Background color="#27272a" variant={undefined} gap={GRID_SIZE} />
      <Controls />
      <MiniMap />
      
      <Panel position="top-right" className="flex gap-2">
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-2 rounded-lg flex gap-2">
          <button 
            onClick={() => handleLayout()}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-emerald-400 transition-colors"
            title="Auto Layout"
          >
            <Layout size={18} />
          </button>
          <div className="w-px h-4 bg-zinc-800 my-auto mx-1" />
          <button
            onClick={undo}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-emerald-400 transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={redo}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-emerald-400 transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={18} />
          </button>
          <div className="w-px h-4 bg-zinc-800 my-auto mx-1" />
          <button
            onClick={() => void copySelection()}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-emerald-400 transition-colors"
            title="Copy Selected (Ctrl+C)"
          >
            <Copy size={18} />
          </button>
          <button
            onClick={() => void pasteSelection()}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-emerald-400 transition-colors"
            title="Paste Nodes (Ctrl+V)"
          >
            <Clipboard size={18} />
          </button>
          <div className="w-px h-4 bg-zinc-800 my-auto mx-1" />
          <button 
            onClick={handleDeleteSelection}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400 transition-colors"
            title="Delete Selected"
          >
            <X size={18} />
          </button>
          <div className="w-px h-4 bg-zinc-800 my-auto mx-1" />
          <button 
            onClick={handleClearCanvas}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400 transition-colors"
            title="Clear Canvas"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </Panel>
    </ReactFlow>
  );
});