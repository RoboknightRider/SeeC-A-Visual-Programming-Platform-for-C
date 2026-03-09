import React, { useState, useCallback, useEffect, useRef } from 'react';
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
} from '@xyflow/react';
import { X, Trash2 } from 'lucide-react';
import { BaseNode, NODE_REGISTRY, NodeData } from './Nodes';
import { generateCCode } from '../codeGenerator';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'include',
    position: { x: 240, y: 40 },
    data: { label: 'Standard IO', type: 'include', value: 'stdio.h' },
  },
  {
    id: '2',
    type: 'main',
    position: { x: 240, y: 180 },
    data: { label: 'Main', type: 'main' },
  },
];

const initialEdges: Edge[] = [];

// Node types mapping
const internalNodeTypes = Object.keys(NODE_REGISTRY).reduce((acc, key) => {
  acc[key] = BaseNode;
  return acc;
}, {} as any);

interface FlowCanvasProps {
  onCodeChange: (code: string) => void;
  onNodesCountChange: (count: number) => void;
}

export const FlowCanvas = React.memo(({ onCodeChange, onNodesCountChange }: FlowCanvasProps) => {
  const { screenToFlowPosition, deleteElements, getNodes, getEdges } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // Track edges for code generation trigger
  const lastEdgesRef = useRef<string>('');
  const lastDataRef = useRef<string>('');

  const triggerCodeGeneration = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    
    // Check if anything actually changed in structure or data (excluding position)
    const edgesSig = JSON.stringify(currentEdges.map(e => ({ s: e.source, t: e.target, sh: e.sourceHandle, th: e.targetHandle })));
    const dataSig = JSON.stringify(currentNodes.map(n => ({ id: n.id, d: n.data })));

    if (edgesSig !== lastEdgesRef.current || dataSig !== lastDataRef.current) {
      lastEdgesRef.current = edgesSig;
      lastDataRef.current = dataSig;
      const code = generateCCode(currentNodes, currentEdges);
      onCodeChange(code);
      onNodesCountChange(currentNodes.length);
    }
  }, [getNodes, getEdges, onCodeChange, onNodesCountChange]);

  // Initial generation
  useEffect(() => {
    triggerCodeGeneration();
    
    const handleDataChange = () => triggerCodeGeneration();
    window.addEventListener('seec-data-change', handleDataChange);
    return () => window.removeEventListener('seec-data-change', handleDataChange);
  }, [triggerCodeGeneration]);

  // Structural changes triggers
  const onNodesChangeInternal = useCallback((changes: any) => {
    onNodesChange(changes);
    const hasSignificantChange = changes.some((c: any) => 
      c.type === 'add' || c.type === 'remove' || c.type === 'reset' || c.type === 'data'
    );
    if (hasSignificantChange) {
      triggerCodeGeneration();
    }
  }, [onNodesChange, triggerCodeGeneration]);

  const onEdgesChangeInternal = useCallback((changes: any) => {
    onEdgesChange(changes);
    const hasSignificantChange = changes.some((c: any) => 
      c.type === 'add' || c.type === 'remove' || c.type === 'reset'
    );
    if (hasSignificantChange) {
      triggerCodeGeneration();
    }
  }, [onEdgesChange, triggerCodeGeneration]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const filteredEdges = eds.filter(
          (edge) => 
            !(edge.source === params.source && edge.sourceHandle === params.sourceHandle) &&
            !(edge.target === params.target && edge.targetHandle === params.targetHandle)
        );
        const newEdges = addEdge(params, filteredEdges);
        // Trigger after state update
        setTimeout(triggerCodeGeneration, 0);
        return newEdges;
      });
    },
    [setEdges, triggerCodeGeneration]
  );

  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setEdges((eds) => {
        const newEdges = eds.filter((e) => e.id !== edge.id);
        setTimeout(triggerCodeGeneration, 0);
        return newEdges;
      });
    },
    [setEdges, triggerCodeGeneration]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = getNodes().find((n) => n.id === connection.source);
      const targetNode = getNodes().find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return false;

      const sourceData = sourceNode.data as unknown as NodeData;
      const targetData = targetNode.data as unknown as NodeData;
      const targetRegistry = NODE_REGISTRY[targetData.type];
      
      if (targetRegistry?.strictPrev && connection.targetHandle === 'prev') {
        return targetRegistry.strictPrev.includes(sourceData.type);
      }

      return true;
    },
    [getNodes]
  );

  const addNode = useCallback((type: string, position?: { x: number, y: number }) => {
    const id = Math.random().toString(36).substr(2, 9);
    const registryItem = NODE_REGISTRY[type];
    
    const finalPosition = position || screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const snappedPosition = {
      x: Math.round(finalPosition.x / 20) * 20,
      y: Math.round(finalPosition.y / 20) * 20,
    };
    
    let newNode: Node = {
      id,
      type,
      position: snappedPosition,
      data: { 
        label: registryItem?.label || `New ${type}`, 
        type: type as any,
        ...(registryItem?.defaultData || {})
      },
    };

    setNodes((nds) => {
      const newNodes = nds.concat(newNode);
      setTimeout(triggerCodeGeneration, 0);
      return newNodes;
    });
  }, [screenToFlowPosition, setNodes, triggerCodeGeneration]);

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

  // Expose addNode to window for the sidebar to call
  useEffect(() => {
    (window as any).addNodeToFlow = addNode;
    return () => { delete (window as any).addNodeToFlow; };
  }, [addNode]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChangeInternal}
      onEdgesChange={onEdgesChangeInternal}
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
      snapGrid={[20, 20]}
      onlyRenderVisibleElements={true}
      deleteKeyCode={['Backspace', 'Delete']}
      className="bg-zinc-950"
    >
      <Background color="#27272a" variant={undefined} />
      <Controls />
      <MiniMap />
      
      <Panel position="top-right" className="flex gap-2">
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-2 rounded-lg flex gap-2">
          <button 
            onClick={() => {
              const selectedNodes = getNodes().filter(n => n.selected);
              const selectedEdges = getEdges().filter(e => e.selected);
              deleteElements({ nodes: selectedNodes, edges: selectedEdges });
            }}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400 transition-colors"
            title="Delete Selected"
          >
            <X size={18} />
          </button>
          <div className="w-px h-4 bg-zinc-800 my-auto mx-1" />
          <button 
            onClick={() => { setNodes([]); setEdges([]); }}
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
