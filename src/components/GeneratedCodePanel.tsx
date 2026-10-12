import React from 'react';
import { Activity, Check, ChevronLeft, ChevronRight, Code, Copy, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

export const CodePreview = React.memo(({
  codePanelOpen,
  setCodePanelOpen,
  generatedCode,
  onCodeChange,
  copyToClipboard,
  reloadCodeToNodes,
  editingDisabled,
  copied,
  nodesCount,
  isCurrentlyDebugging,
  currentDebugLine,
}: {
  codePanelOpen: boolean;
  setCodePanelOpen: (open: boolean) => void;
  generatedCode: string;
  onCodeChange: (code: string) => void;
  copyToClipboard: () => void;
  reloadCodeToNodes: () => void;
  editingDisabled: boolean;
  copied: boolean;
  nodesCount: number;
  isCurrentlyDebugging: boolean;
  currentDebugLine: number | null;
}) => (
  <div className={cn(
    "border-l border-zinc-800 bg-zinc-900/50 flex flex-col transition-all duration-300 relative",
    codePanelOpen ? "w-96" : "w-12"
  )}>
    <button
      onClick={() => setCodePanelOpen(!codePanelOpen)}
      className="absolute right-full top-1/2 -translate-y-1/2 ml-1 z-50 bg-zinc-800 border border-zinc-700 rounded-full p-2 text-zinc-400 hover:text-white transition-all shadow-xl hover:scale-110 flex items-center justify-center"
      title={codePanelOpen ? "Collapse Code Panel" : "Expand Code Panel"}
    >
      {codePanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
    </button>

    <div className={cn("p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900", !codePanelOpen && "justify-center")}>
      <div className="flex items-center gap-2">
        <Code className="w-4 h-4 text-emerald-500 shrink-0" />
        {codePanelOpen && <span className="text-sm font-bold text-zinc-100 truncate">Generated C Code</span>}
      </div>
      {codePanelOpen && (
        <div className="flex items-center gap-1">
          <button
            onClick={reloadCodeToNodes}
            disabled={editingDisabled}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all border border-zinc-700"
            title="Reload code into nodes"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-all border border-zinc-700"
            title="Copy generated code"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>

    {codePanelOpen && (
      <>
        <div className="relative flex-1 min-h-0 overflow-hidden p-4 font-mono text-sm">
          <pre
            aria-hidden="true"
            className="absolute inset-4 overflow-auto text-emerald-400/90 leading-relaxed pointer-events-none whitespace-pre"
          >
            {generatedCode.replace(/\r/g, '').split('\n').map((line, index) => {
              const lineNumber = index + 1;
              const isActiveLine = isCurrentlyDebugging && currentDebugLine === lineNumber;
              return (
                <div
                  key={`code-line-${index}`}
                  className={cn('whitespace-pre', isActiveLine && 'bg-emerald-500/20 text-emerald-100')}
                >
                  {line || '\u00A0'}
                </div>
              );
            })}
          </pre>
          <textarea
            value={generatedCode}
            onChange={(event) => onCodeChange(event.target.value)}
            disabled={editingDisabled}
            wrap="off"
            onScroll={(event) => {
              const highlightLayer = event.currentTarget.previousElementSibling as HTMLElement | null;
              if (highlightLayer) {
                highlightLayer.scrollTop = event.currentTarget.scrollTop;
                highlightLayer.scrollLeft = event.currentTarget.scrollLeft;
              }
            }}
            spellCheck={false}
            aria-label="Editable generated C code"
            className="relative w-full h-full min-h-[16rem] resize-none bg-transparent text-transparent caret-emerald-400 selection:bg-emerald-500/30 leading-relaxed outline-none overflow-auto whitespace-pre"
          />
        </div>
        <div className="p-4 bg-zinc-900/80 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-2">
            <Activity className="w-3 h-3" />
            Status
          </div>
          <div className="text-xs text-zinc-400">
            {nodesCount} nodes active.
          </div>
        </div>
      </>
    )}
  </div>
));
