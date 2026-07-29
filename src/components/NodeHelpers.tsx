import React, { useCallback } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { cn } from '../lib/utils';
import { 
  Terminal, Hash, Play, Variable, Calculator, ArrowRight, 
  GitBranch, Repeat, LogOut, Layers, Box,
} from 'lucide-react';

import { NodeData, NodeField } from './Nodes';

const FIELD_LABEL_CLASS = 'text-[9px] uppercase font-bold text-zinc-600';
const FIELD_CONTROL_CLASS = 'w-full h-8 bg-zinc-950 border border-zinc-800 rounded px-2 text-[11px] font-mono text-emerald-400 outline-none focus:border-emerald-500/50 nodrag';
const HEADER_ROW_CLASS = 'h-4 flex items-center gap-1 mb-1';
const FIELDS_ROW_CLASS = 'h-[52px] flex flex-nowrap items-end gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5';
const FIELD_SLOT_CLASS = 'h-[52px] min-w-[104px] flex-none';
const FIELD_STACK_CLASS = 'h-full flex flex-col justify-between';

type IconComponent = React.ComponentType<{ className?: string }>;

export const icons: Record<string, IconComponent> = {
  include: Hash,
  main: Play,
  variable: Variable,
  literal: Variable,
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

const HandleLabel = ({ children, position, className }: { children: React.ReactNode; position: 'top' | 'bottom' | 'left' | 'right'; className?: string }) => (
  <span className={cn(
    "handle-label whitespace-nowrap",
    position === 'top' ? "bottom-full mb-2 left-1/2 -translate-x-1/2" : 
    position === 'bottom' ? "top-full mt-2 left-1/2 -translate-x-1/2" :
    position === 'left' ? "right-full mr-2 top-1/2 -translate-y-1/2" :
    "left-full ml-2 top-1/2 -translate-y-1/2",
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
  color?: string;
  hidePrevHandle?: boolean;
  hideNextHandle?: boolean;
}

const NodeWrapper = React.memo(({ 
  id, 
  data, 
  selected, 
  children, 
  className, 
  showDefaultHandles = true,
  color,
  hidePrevHandle = false,
  hideNextHandle = false
}: NodeWrapperProps) => {
  const Icon = icons[data.type] || Terminal;

  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 shadow-blue-500/20',
    emerald: 'border-emerald-500 shadow-emerald-500/20',
    amber: 'border-amber-500 shadow-amber-500/20',
    purple: 'border-purple-500 shadow-purple-500/20',
    rose: 'border-rose-500 shadow-rose-500/20',
  };

  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-500',
    emerald: 'text-emerald-500',
    amber: 'text-amber-500',
    purple: 'text-purple-500',
    rose: 'text-rose-500',
  };

  const colorClass = color ? (colorMap[color] || 'border-zinc-800') : 'border-zinc-800';
  const iconColorClass = color ? (iconColorMap[color] || 'text-emerald-500') : 'text-emerald-500';

  return (
    <div className={cn(
      "min-w-[150px] p-3 bg-zinc-900 border-2 rounded-xl text-zinc-100 shadow-2xl relative group",
      selected ? (color ? colorClass : "border-emerald-500 shadow-emerald-500/20") : "border-zinc-800",
      className
    )}>
      <div className={HEADER_ROW_CLASS}>
        <Icon className={cn("w-3 h-3", iconColorClass)} />
        <span className="text-[8px] font-bold uppercase tracking-normal opacity-60 leading-none">{data.type}</span>
      </div>
      
      <div>
        {children}
      </div>

      {showDefaultHandles && (
        <>
          {!hidePrevHandle && (
            <div className="absolute top-0 left-[20px] -translate-y-1/2 handle-wrapper">
              <Handle type="target" position={Position.Top} id="prev" className="!bg-zinc-700 !border-zinc-900 !w-3 !h-3" />
              <HandleLabel position="top">Prev</HandleLabel>
            </div>
          )}
          {!hideNextHandle && (
            <div className="absolute bottom-0 left-[20px] translate-y-1/2 handle-wrapper">
              <Handle type="source" position={Position.Bottom} id="next" className={cn("!border-zinc-900 !w-3 !h-3", color === 'blue' ? "!bg-blue-500" : "!bg-emerald-500")} />
              <HandleLabel position="bottom">{data.type === 'function-def' ? 'Body' : 'Next'}</HandleLabel>
            </div>
          )}
        </>
      )}
    </div>
  );
});

interface DataInputProps {
  label?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  disabled?: boolean;
}

const DataInput = React.memo(({ label, value, onChange, placeholder, type = "text", className, disabled }: DataInputProps) => {
  const [inputValue, setInputValue] = React.useState(value || '');

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  return (
    <div className={FIELD_STACK_CLASS}>
      {label && <label className={FIELD_LABEL_CLASS}>{label}</label>}
      <input 
        type={type}
        value={inputValue} 
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => {
          if (inputValue !== value) {
            onChange(inputValue);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          FIELD_CONTROL_CLASS,
          "transition-opacity",
          disabled && "opacity-30 cursor-not-allowed",
          className
        )}
      />
    </div>
  );
});

interface TypeSelectorProps {
  value?: string;
  onChange: (value: string) => void;
}

const TypeSelector = React.memo(({ value, onChange }: TypeSelectorProps) => (
  <select 
    value={value || 'int'} 
    onChange={(e) => onChange(e.target.value)}
    className={FIELD_CONTROL_CLASS}
  >
    {['int', 'float', 'char', 'double', 'void', 'long'].map(t => (
      <option key={t} value={t}>{t}</option>
    ))}
  </select>
));

export const GenericNode = React.memo((props: any) => {
  const { data, registryItem, id } = props;
  const { setNodes } = useReactFlow();
  const fields: NodeField[] = registryItem?.fields || [];
  const hasFields = fields.length > 0;

  const triggerDataChange = useCallback(() => {
    window.dispatchEvent(new CustomEvent('seec-data-change'));
  }, []);

  const updateData = useCallback((key: string, val: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, [key]: val } };
        }
        return node;
      })
    );
    triggerDataChange();
  }, [id, setNodes, triggerDataChange]);
  
  return (
    <NodeWrapper 
      {...props} 
      color={registryItem?.color}
      hidePrevHandle={registryItem?.hidePrevHandle}
      hideNextHandle={registryItem?.hideNextHandle}
    >
      <div className={hasFields ? FIELDS_ROW_CLASS : 'h-0'}>
        {fields.map((field: NodeField) => {
          return (
            <div key={field.key} className={FIELD_SLOT_CLASS}>
            {field.type === 'type-selector' ? (
              <div className={FIELD_STACK_CLASS}>
                {field.label && <label className={FIELD_LABEL_CLASS}>{field.label}</label>}
                <TypeSelector 
                  value={data[field.key]} 
                  onChange={(val: string) => updateData?.(field.key, val)} 
                />
              </div>
            ) : field.type === 'select' ? (
               <div className={FIELD_STACK_CLASS}>
                {field.label && <label className={FIELD_LABEL_CLASS}>{field.label}</label>}
                <select 
                  value={data[field.key]} 
                  onChange={(e) => updateData?.(field.key, e.target.value)}
                  className={FIELD_CONTROL_CLASS}
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
                disabled={false}
              />
            )}
          </div>
        );
        })}
      </div>

      {registryItem?.body && (
        <div
          className="absolute right-0 translate-x-1/2 handle-wrapper"
          style={{ top: '25%', transform: 'translate(0, -50%)' }}
        >
          <Handle
            type="source"
            position={Position.Right}
            id="body"
            className="!border-zinc-900 !w-3 !h-3 !bg-amber-500"
          />
          <HandleLabel position="right">Body</HandleLabel>
        </div>
      )}
    </NodeWrapper>
  );
});
