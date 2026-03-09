import React, { useCallback } from 'react';
import { Handle, Position, useReactFlow, Node, Edge } from '@xyflow/react';
import { cn } from '../lib/utils';
import { 
  Terminal, Hash, Play, Variable, Calculator, ArrowRight, 
  GitBranch, Repeat, LogOut, Layers, Box, Activity 
} from 'lucide-react';

import { NodeType, NodeData, CNode, NodeContext, NodeField, NodeHandle, NodeRegistryItem } from './Nodes';

export const icons: Record<string, any> = {
  include: Hash,
  main: Play,
  variable: Variable,
  array: Layers,
  printf: Terminal,
  scanf: Terminal,
  arithmetic: Calculator,
  assignment: ArrowRight,
  if: GitBranch,
  else: GitBranch,
  'else-if': GitBranch,
  while: Repeat,
  for: Repeat,
  'do-while': Repeat,
  switch: GitBranch,
  case: GitBranch,
  break: LogOut,
  continue: Repeat,
  'function-def': Box,
  'function-call': Box,
  return: LogOut,
  comment: Hash,
};

export const HandleLabel = ({ children, position, className }: { children: React.ReactNode; position: 'top' | 'bottom' | 'left' | 'right'; className?: string }) => (
  <span className={cn(
    "handle-label whitespace-nowrap",
    position === 'top' ? "-top-8 left-0" : 
    position === 'bottom' ? "-bottom-8 left-0" :
    position === 'left' ? "-left-12 top-1/2 -translate-y-1/2" :
    "-right-12 top-1/2 -translate-y-1/2",
    className
  )}>
    {children}
  </span>
);

interface NodeWrapperProps {
  id: string;
  data: NodeData;
  selected?: boolean;
  children?: React.ReactNode;
  className?: string;
  showDefaultHandles?: boolean;
  showInputHandle?: boolean;
  showOutputHandle?: boolean;
  color?: string;
}

export const NodeWrapper = React.memo(({ 
  id, 
  data, 
  selected, 
  children, 
  className, 
  showDefaultHandles = true,
  showInputHandle = false,
  showOutputHandle = false,
  color
}: NodeWrapperProps) => {
  const Icon = icons[data.type] || Terminal;

  const colorClass = color === 'blue' ? 'border-blue-500 shadow-blue-500/20' :
                    color === 'emerald' ? 'border-emerald-500 shadow-emerald-500/20' :
                    color === 'amber' ? 'border-amber-500 shadow-amber-500/20' :
                    color === 'purple' ? 'border-purple-500 shadow-purple-500/20' :
                    color === 'rose' ? 'border-rose-500 shadow-rose-500/20' :
                    'border-zinc-800';

  const iconColorClass = color === 'blue' ? 'text-blue-500' :
                        color === 'emerald' ? 'text-emerald-500' :
                        color === 'amber' ? 'text-amber-500' :
                        color === 'purple' ? 'text-purple-500' :
                        color === 'rose' ? 'text-rose-500' :
                        'text-emerald-500';

  return (
    <div className={cn(
      "min-w-[220px] p-4 bg-zinc-900 border-2 rounded-xl text-zinc-100 shadow-2xl relative group",
      selected ? (color ? colorClass : "border-emerald-500 shadow-emerald-500/20") : "border-zinc-800",
      className
    )}>
      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", iconColorClass)} />
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{data.type}</span>
        </div>
      </div>
      
      <div className="space-y-3">
        {children}
      </div>

      {showDefaultHandles && (
        <>
          <div className="absolute top-0 left-[20px] -translate-y-1/2 handle-wrapper">
            <Handle type="target" position={Position.Top} id="prev" className="!bg-zinc-700 !border-zinc-900 !w-3 !h-3" />
            <HandleLabel position="top">Prev</HandleLabel>
          </div>
          <div className="absolute bottom-0 left-[20px] translate-y-1/2 handle-wrapper">
            <Handle type="source" position={Position.Bottom} id="next" className={cn("!border-zinc-900 !w-3 !h-3", color === 'blue' ? "!bg-blue-500" : "!bg-emerald-500")} />
            <HandleLabel position="bottom">Next</HandleLabel>
          </div>
        </>
      )}

      {showInputHandle && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 handle-wrapper">
          <Handle type="target" position={Position.Left} id="input" className="!bg-blue-500 !border-zinc-900" />
          <HandleLabel position="left">Input</HandleLabel>
        </div>
      )}

      {showOutputHandle && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 handle-wrapper">
          <Handle type="source" position={Position.Right} id="output" className="!bg-purple-500 !border-zinc-900" />
          <HandleLabel position="right">Output</HandleLabel>
        </div>
      )}
    </div>
  );
});

export const DataInput = React.memo(({ label, value, onChange, placeholder, type = "text", className }: any) => (
  <div className="space-y-1">
    {label && <label className="text-[9px] uppercase font-bold text-zinc-600">{label}</label>}
    <input 
      type={type}
      value={value || ''} 
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-500/50 nodrag", className)}
    />
  </div>
));

export const TypeSelector = React.memo(({ value, onChange }: any) => (
  <select 
    value={value || 'int'} 
    onChange={(e) => onChange(e.target.value)}
    className="bg-zinc-950 border border-zinc-800 rounded px-1 text-[10px] font-mono text-emerald-400 outline-none nodrag"
  >
    {['int', 'float', 'char', 'double', 'void', 'long'].map(t => (
      <option key={t} value={t}>{t}</option>
    ))}
  </select>
));

export const GenericNode = React.memo((props: any) => {
  const { data, registryItem, id } = props;
  const { setNodes } = useReactFlow();

  const updateData = useCallback((key: string, val: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, [key]: val } };
        }
        return node;
      })
    );
    // Dispatch event to trigger code generation in FlowCanvas
    window.dispatchEvent(new CustomEvent('seec-data-change'));
  }, [id, setNodes]);
  
  return (
    <NodeWrapper {...props} color={registryItem?.color}>
      {registryItem?.fields?.map((field: NodeField) => (
        <div key={field.key}>
          {field.type === 'type-selector' ? (
            <div className="flex flex-col gap-1">
              {field.label && <label className="text-[9px] uppercase font-bold text-zinc-600">{field.label}</label>}
              <TypeSelector 
                value={data[field.key]} 
                onChange={(val: string) => updateData?.(field.key, val)} 
              />
            </div>
          ) : field.type === 'select' ? (
             <div className="flex flex-col gap-1">
              {field.label && <label className="text-[9px] uppercase font-bold text-zinc-600">{field.label}</label>}
              <select 
                value={data[field.key]} 
                onChange={(e) => updateData?.(field.key, e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded px-1 text-[10px] font-mono text-emerald-400 outline-none nodrag"
              >
                {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          ) : (
            <DataInput 
              label={field.label}
              value={data[field.key]}
              onChange={(val: string) => updateData?.(field.key, val)}
              placeholder={field.placeholder}
              className={field.className}
            />
          )}
        </div>
      ))}
      
      {registryItem?.handles?.map((h: NodeHandle) => (
        <div 
          key={h.id} 
          className="absolute -right-2 handle-wrapper" 
          style={{ top: h.top || '50%', transform: 'translate(50%, -50%)' }}
        >
          <Handle 
            type={h.type} 
            position={h.position} 
            id={h.id} 
            className={cn(
              "!border-zinc-900 !w-3 !h-3",
              h.color === 'amber' ? "!bg-amber-500" : 
              h.color === 'blue' ? "!bg-blue-500" : 
              h.color === 'purple' ? "!bg-purple-500" : "!bg-zinc-500"
            )} 
          />
          <HandleLabel position={h.position === Position.Right ? 'right' : 'left'}>{h.label}</HandleLabel>
        </div>
      ))}
    </NodeWrapper>
  );
});
