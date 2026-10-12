import React from 'react';
import { ChevronLeft, Eraser, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';

export const TerminalPanel = React.memo(({
  terminalOpen,
  setTerminalOpen,
  terminalHeight,
  setTerminalHeight,
  terminalLogs,
  onClear,
  hasError,
  handleAskAI,
  terminalInput,
  setTerminalInput,
  onSubmitInput
}: {
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  terminalHeight: number;
  setTerminalHeight: React.Dispatch<React.SetStateAction<number>>;
  terminalLogs: string[];
  onClear: () => void;
  hasError: boolean;
  handleAskAI: () => void;
  terminalInput: string;
  setTerminalInput: (value: string) => void;
  onSubmitInput: () => void;
}) => {
  const MIN_TERMINAL_HEIGHT = 220;
  const MAX_TERMINAL_VIEWPORT_RATIO = 0.7;

  const terminalContentRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const terminalBottomRef = React.useRef<HTMLDivElement>(null);
  const isResizingRef = React.useRef(false);
  const dragStartYRef = React.useRef(0);
  const startHeightRef = React.useRef(terminalHeight);
  const draftHeightRef = React.useRef(terminalHeight);
  const rafIdRef = React.useRef<number | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);

  const clampTerminalHeight = React.useCallback((nextHeight: number) => {
    const maxHeight = Math.max(MIN_TERMINAL_HEIGHT, Math.floor(window.innerHeight * MAX_TERMINAL_VIEWPORT_RATIO));
    return Math.min(maxHeight, Math.max(MIN_TERMINAL_HEIGHT, nextHeight));
  }, []);

  const handleResizeStart = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = true;
    setIsResizing(true);
    dragStartYRef.current = event.clientY;
    startHeightRef.current = terminalHeight;
    draftHeightRef.current = terminalHeight;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }, [terminalHeight]);

  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = dragStartYRef.current - event.clientY;
      const nextHeight = clampTerminalHeight(startHeightRef.current + delta);
      draftHeightRef.current = nextHeight;

      if (rafIdRef.current !== null) {
        return;
      }

      rafIdRef.current = window.requestAnimationFrame(() => {
        if (panelRef.current && terminalOpen) {
          panelRef.current.style.height = `${draftHeightRef.current}px`;
        }
        rafIdRef.current = null;
      });
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      setTerminalHeight(draftHeightRef.current);

      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [clampTerminalHeight, setTerminalHeight, terminalOpen]);

  React.useEffect(() => {
    if (terminalOpen) {
      terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [terminalLogs, terminalOpen]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-md flex flex-col w-full min-w-0",
        isResizing ? "transition-none" : "transition-all duration-300"
      )}
      style={{ height: terminalOpen ? `${terminalHeight}px` : '40px' }}
    >
      {terminalOpen && (
        <div
          role="separator"
          aria-label="Resize terminal panel"
          onMouseDown={handleResizeStart}
          className="h-1 cursor-row-resize bg-zinc-800/70 hover:bg-emerald-500/40 transition-colors"
        />
      )}
      <div
        className="h-10 px-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50"
        onClick={() => setTerminalOpen(!terminalOpen)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Terminal size={14} className="text-emerald-500" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Terminal Output</span>
        </div>
        <div className="flex items-center gap-4">
          {terminalOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-1.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1.5"
              title="Clear Terminal"
            >
              <Eraser size={12} />
              <span className="text-[9px] font-bold uppercase">Clear</span>
            </button>
          )}
          <span className="text-[10px] text-zinc-600">
            {terminalLogs.length} logs
          </span>
          {terminalOpen ? <ChevronLeft className="rotate-270" size={14} /> : <ChevronLeft className="rotate-90" size={14} />}
        </div>
      </div>
      {terminalOpen && (
        <>
          <div
            ref={terminalContentRef}
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 font-mono text-xs text-zinc-300 space-y-1 bg-black/20"
          >
            {terminalLogs.length === 0 && <div className="text-zinc-600 italic">No output yet. Run or Debug the program to see results.</div>}
            {terminalLogs.map((log, i) => (
              <div key={i} className={cn(
                "whitespace-pre-wrap break-all [overflow-wrap:anywhere] max-w-full",
                log.startsWith('>') ? "text-emerald-400 pl-2" : log.startsWith('!') ? "text-red-400" : "text-zinc-400",
                log.includes('successful') && "text-blue-400"
              )}>
                {log}
              </div>
            ))}

            {/* 🤖 Action Button to open Chatbox with captured execution bugs */}
            {hasError && (
              <div className="mt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); handleAskAI(); }}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg"
                >
                  🤖 Explain
                </button>
              </div>
            )}
            <div ref={terminalBottomRef} />
          </div>
          <div className="border-t border-zinc-800 p-3 bg-zinc-950/95 flex items-center gap-2">
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmitInput();
                }
              }}
              placeholder="Type stdin here and press Enter"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <button
              type="button"
              onClick={onSubmitInput}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-all"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
});
