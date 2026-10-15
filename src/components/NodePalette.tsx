import React from 'react';
import { Box, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { NODE_CATEGORY_ORDER, NODE_REGISTRY } from './Nodes';

const NODE_ICON_COLOR_CLASSES: Record<string, string> = {
  blue: 'text-blue-500',
  emerald: 'text-emerald-500',
  amber: 'text-amber-500',
  purple: 'text-purple-500',
  rose: 'text-rose-500',
  orange: 'text-orange-500',
};

const getCategoryIcon = (category: string) => {
  const Icon = Object.values(NODE_REGISTRY).find(item => item.category === category)?.icon || Box;
  return <Icon size={10} />;
};

const getCategoriesInDisplayOrder = (): string[] => {
  const registeredCategories = [...new Set(Object.values(NODE_REGISTRY).map(item => item.category))];
  const preferredCategories = NODE_CATEGORY_ORDER.filter(category => registeredCategories.includes(category));
  const additionalCategories = registeredCategories
    .filter(category => !NODE_CATEGORY_ORDER.includes(category as (typeof NODE_CATEGORY_ORDER)[number]))
    .sort((first, second) => first.localeCompare(second));

  return [...preferredCategories, ...additionalCategories];
};

export const Sidebar = React.memo(({
  sidebarOpen,
  setSidebarOpen,
  sidebarWidth,
  onResizeStart,
  addNode,
  onDragStart
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  addNode: (type: string) => void;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}) => (
  <div className={cn(
    "border-r border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0 relative",
    !sidebarOpen && "w-12"
  )} style={{ width: sidebarOpen ? sidebarWidth : 48 }}>
    {sidebarOpen && (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize node palette"
        title="Drag to resize node palette"
        onPointerDown={onResizeStart}
        className="absolute right-0 top-0 z-40 h-full w-1.5 cursor-col-resize touch-none hover:bg-emerald-500/40"
      />
    )}
    <button
      onClick={() => setSidebarOpen(!sidebarOpen)}
      className="absolute left-full top-1/2 -translate-y-1/2 ml-1 z-50 bg-zinc-800 border border-zinc-700 rounded-full p-2 text-zinc-400 hover:text-white transition-all shadow-xl hover:scale-110 flex items-center justify-center"
      title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
    >
      {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
    </button>

    <div className={cn("flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6", !sidebarOpen && "px-0 py-4 space-y-4 no-scrollbar")}>
      {getCategoriesInDisplayOrder().map(category => (
        <div key={category}>
          {sidebarOpen && (
            <h2 className="text-[10px] font-bold text-zinc-500 uppercase mb-3 tracking-widest flex items-center gap-2">
              {getCategoryIcon(category)}
              {category}
            </h2>
          )}
          <div className="grid grid-cols-1 gap-2">
            {Object.values(NODE_REGISTRY)
              .filter(item => item.category === category)
              .map(item => {
                const Icon = item.icon;
                const iconColorClass = NODE_ICON_COLOR_CLASSES[item.color || ''] || 'text-zinc-500';

                return (
                  <button
                    key={item.type}
                    onClick={() => addNode(item.type)}
                    onDragStart={(event) => onDragStart(event, item.type)}
                    draggable
                    title={!sidebarOpen ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-all text-xs text-zinc-300 group cursor-grab active:cursor-grabbing",
                      !sidebarOpen && "aspect-square justify-center p-0 w-8 h-8 mx-auto"
                    )}
                  >
                    <Icon className={cn("w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity", iconColorClass)} />
                    {sidebarOpen && item.label}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  </div>
));
