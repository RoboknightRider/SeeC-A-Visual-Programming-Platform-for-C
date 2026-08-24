import { Chatbox } from './components/Chatbox';
import React, { useState, useCallback } from 'react';
import {
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { cn, getTimestamp } from './lib/utils';
import { NODE_REGISTRY } from './components/Nodes';
import { FlowCanvas } from './components/FlowCanvas';
import { useGlobalTerminal, TerminalMessage } from './services/webhooks';
import {
  Terminal, Code, X, Copy, Check, Cpu,
  ChevronLeft, ChevronRight, Box, Play, Download,
  Settings, Bug, GitPullRequest, Activity, Variable, Eraser,
  RefreshCw, MessageSquare, Square, SkipForward
} from 'lucide-react';

const toolbarButtonClass = "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap";

const toolbarActionClass = "flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-xs transition-all shadow-lg whitespace-nowrap";

// --- Sub-components for Optimization ---

const TopBar = React.memo(({
  downloadAsCFile,
  handleRun,
  handleStopRun,
  handleDebug,
  handleStepInto,
  handleStepOver,
  handleStepOut,
  handleStopDebug,
  isRunning,
  isDebugStyleMode,
  isCurrentlyDebugging,
  currentDebugLine,
  saveProject,
  loadProject,
  showChat,
  setShowChat
}: {
  downloadAsCFile: () => void;
  handleRun: () => void;
  handleStopRun: () => void;
  handleDebug: () => void;
  handleStepInto: () => void;
  handleStepOver: () => void;
  handleStepOut: () => void;
  handleStopDebug: () => void;
  isRunning: boolean;
  isDebugStyleMode: boolean;
  isCurrentlyDebugging: boolean;
  currentDebugLine: number | null;
  saveProject: () => void;
  loadProject: () => void;
  showChat: boolean;
  setShowChat: (show: boolean) => void;
}) => (
  <header className="h-14 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md px-4 sm:px-6 shrink-0 z-50 overflow-x-auto overflow-y-hidden">
    <div className="flex min-w-max items-center justify-between gap-3 h-full">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-3">
          <Cpu className="w-6 h-6 text-emerald-500" />
          <h1 className="text-xl font-bold tracking-tight text-white">SeeC</h1>
        </div>
        <div className="hidden h-6 w-px bg-zinc-800 sm:block" />
        <nav className="flex items-center gap-1">
          <button type="button" onClick={saveProject} className={cn(toolbarButtonClass, "hover:bg-zinc-800 text-zinc-400 hover:text-white")}>
            <Download size={14} />
            Save Project
          </button>
          <button type="button" onClick={loadProject} className={cn(toolbarButtonClass, "hover:bg-zinc-800 text-zinc-400 hover:text-white")}>
            <Copy size={14} className="rotate-180" />
            Load Project
          </button>
          <div className="hidden h-4 w-px bg-zinc-800 mx-1 sm:block" />
          <button type="button" onClick={downloadAsCFile} className={cn(toolbarButtonClass, "hover:bg-zinc-800 text-zinc-400 hover:text-white")}>
            <Code size={14} />
            Export C
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        <button
          type="button"
          onClick={() => setShowChat(!showChat)}
          className={cn(
            toolbarActionClass,
            showChat
              ? "bg-blue-600 text-white shadow-blue-900/20"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
          )}
        >
          <MessageSquare size={14} />
          Chat
        </button>

        {isCurrentlyDebugging ? (
          <div className="flex items-center gap-2 bg-zinc-950 px-2 py-1 rounded-lg border border-amber-500/30 shadow-lg shadow-amber-950/20 animate-fade-in whitespace-nowrap">
            <div className="flex items-center gap-1 text-[10px] uppercase font-mono text-amber-500 font-bold px-1.5 bg-amber-500/10 border border-amber-500/20 rounded mr-1">
              Line {currentDebugLine}
            </div>

            <button
              type="button"
              onClick={handleStepInto}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold transition-all"
              title="Step Into Function Calls (-exec-step)"
            >
              <SkipForward size={12} fill="currentColor" className="rotate-90" />
              Step Into
            </button>

            <button
              type="button"
              onClick={handleStepOver}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all"
              title="Execute Next Line (-exec-next)"
            >
              <SkipForward size={12} fill="currentColor" />
              Step Over
            </button>

            <button
              type="button"
              onClick={handleStepOut}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-800 hover:bg-amber-700 text-white text-xs font-bold transition-all"
              title="Run Until Current Function Returns (-exec-finish)"
            >
              <SkipForward size={12} fill="currentColor" className="-rotate-90" />
              Step Out
            </button>

            <button
              type="button"
              onClick={handleStopDebug}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-800 hover:bg-red-950 hover:text-red-400 text-zinc-400 border border-zinc-700 hover:border-red-950 text-xs font-bold transition-all"
              title="Terminate GDB Debugger Instance"
            >
              <Square size={12} fill="currentColor" />
              Stop
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleDebug}
              disabled={isRunning && !isDebugStyleMode}
              className={cn(
                toolbarActionClass,
                isRunning && !isDebugStyleMode
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20"
              )}
            >
              <Bug size={14} className={cn(isDebugStyleMode && "animate-pulse")} />
              Debug Mode
            </button>

            <button
              type="button"
              onClick={isRunning && !isDebugStyleMode ? handleStopRun : handleRun}
              disabled={isDebugStyleMode}
              className={cn(
                toolbarActionClass,
                isDebugStyleMode
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : isRunning
                    ? "bg-red-600 hover:bg-red-500 text-white shadow-red-900/20"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
              )}
            >
              {isRunning && !isDebugStyleMode ? (
                <>
                  <Square size={14} fill="currentColor" />
                  Stop
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  Run
                </>
              )}
            </button>
          </>
        )}

        <div className="hidden h-6 w-px bg-zinc-800 mx-1 sm:block" />
        <button type="button" className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all shrink-0">
          <Settings size={18} />
        </button>
      </div>
    </div>
  </header>
));

const Sidebar = React.memo(({
  sidebarOpen,
  setSidebarOpen,
  addNode,
  onDragStart
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  addNode: (type: string) => void;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}) => (
  <div className={cn(
    "border-r border-zinc-800 bg-zinc-900/50 flex flex-col transition-all duration-300 relative",
    sidebarOpen ? "w-64" : "w-12"
  )}>
    <button
      onClick={() => setSidebarOpen(!sidebarOpen)}
      className="absolute left-full top-1/2 -translate-y-1/2 ml-1 z-50 bg-zinc-800 border border-zinc-700 rounded-full p-2 text-zinc-400 hover:text-white transition-all shadow-xl hover:scale-110 flex items-center justify-center"
      title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
    >
      {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
    </button>

    <div className={cn("flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6", !sidebarOpen && "px-0 py-4 space-y-4 no-scrollbar")}>
      {(['Structure', 'Data', 'Control', 'I/O'] as const).map(category => (
        <div key={category}>
          {sidebarOpen && (
            <h2 className="text-[10px] font-bold text-zinc-500 uppercase mb-3 tracking-widest flex items-center gap-2">
              {category === 'Structure' && <Box size={10} />}
              {category === 'Data' && <Variable size={10} />}
              {category === 'Control' && <GitPullRequest size={10} />}
              {category === 'I/O' && <Terminal size={10} />}
              {category}
            </h2>
          )}
          <div className="grid grid-cols-1 gap-2">
            {Object.values(NODE_REGISTRY)
              .filter(item => item.category === category)
              .map(item => {
                const Icon = item.icon;
                const iconColorClass =
                  item.color === 'blue' ? 'text-blue-500' :
                    item.color === 'emerald' ? 'text-emerald-500' :
                      item.color === 'amber' ? 'text-amber-500' :
                        item.color === 'purple' ? 'text-purple-500' :
                          item.color === 'rose' ? 'text-rose-500' :
                            item.color === 'orange' ? 'text-orange-500' : 'text-zinc-500';

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

const TerminalPanel = React.memo(({
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

const CodePreview = React.memo(({
  codePanelOpen,
  setCodePanelOpen,
  generatedCode,
  onCodeChange,
  copyToClipboard,
  reloadCodeToNodes,
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
        <div className="flex-1 min-h-0 overflow-auto p-4 font-mono text-sm">
          <textarea
            value={generatedCode}
            onChange={(event) => onCodeChange(event.target.value)}
            spellCheck={false}
            aria-label="Editable generated C code"
            className="w-full h-full min-h-[16rem] resize-none bg-transparent text-emerald-400/90 leading-relaxed outline-none"
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

// --- Main Component ---

function Flow() {
  // Core editor state
  const [generatedCode, setGeneratedCode] = useState('');
  const [nodesCount, setNodesCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Layout panel state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [codePanelOpen, setCodePanelOpen] = useState(true);

  // Runtime / terminal state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isCurrentlyDebugging, setIsCurrentlyDebugging] = useState(false);
  const [isDebugWaitingForInput, setIsDebugWaitingForInput] = useState(false);
  const [currentDebugLine, setCurrentDebugLine] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const [activeErrorLog, setActiveErrorLog] = useState('');
  const [isWsConnected, setWsConnected] = useState(false);

  // Chat / import modal state
  const [showChat, setShowChat] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const flowActionsRef = React.useRef<import('./components/FlowCanvas').FlowCanvasActions | null>(null);

  const registerFlowActions = React.useCallback((actions: import('./components/FlowCanvas').FlowCanvasActions | null) => {
    flowActionsRef.current = actions;
  }, []);

  const handleAskAI = useCallback(() => {
    const fullLogString = terminalLogs.join("\n");
    setActiveErrorLog(fullLogString);
    setShowChat(true);
  }, [terminalLogs]);

  const saveProject = useCallback(() => {
    const json = flowActionsRef.current?.exportProject();
    if (json) {
      const element = document.createElement('a');
      const file = new Blob([json], { type: 'application/json' });
      element.href = URL.createObjectURL(file);
      element.download = 'project.seec';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  }, []);

  const loadProject = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file && flowActionsRef.current?.importProject) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        flowActionsRef.current?.importProject(content);
      };
      reader.readAsText(file);
    }

    event.target.value = '';
  }, []);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedCode]);

  const reloadCodeToNodes = useCallback(() => {
    if (generatedCode.trim()) {
      void flowActionsRef.current?.importCode(generatedCode);
    }
  }, [generatedCode]);

  const downloadAsCFile = useCallback(() => {
    (async () => {
      addTerminalLog('Status', `[${getTimestamp()}] Validating compilation before download...`);
      try {
        const res = await fetch('/api/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: generatedCode })
        });
        const data = await res.json();
        if (!res.ok) {
          addTerminalLog('Error', `[${getTimestamp()}] Compile endpoint error: ${data.error || 'Unknown error'}`);
          setTerminalOpen(true);
          return;
        }

        if (!data.ok) {
          addTerminalLog('Error', `[${getTimestamp()}] Compilation failed:\n${data.output || 'No output'}`);
          setTerminalOpen(true);
          return;
        }

        // Compilation succeeded; proceed to download source file
        const element = document.createElement('a');
        const file = new Blob([generatedCode], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = 'program.c';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        addTerminalLog('Status', `[${getTimestamp()}] Compilation OK — source downloaded.`);
      } catch (err) {
        addTerminalLog('Error', `[${getTimestamp()}] Network or compile error: ${err instanceof Error ? err.message : String(err)}`);
        setTerminalOpen(true);
      }
    })();
  }, [generatedCode]);

  const clearTerminal = useCallback(() => {
    setTerminalLogs([]);
    setHasError(false);
    setActiveErrorLog('');
  }, []);

  type TerminalLogType = 'Status' | 'Error' | 'Outputs';
  const lastLogTypeRef = React.useRef<TerminalLogType | null>(null);

  const resetExecutionState = useCallback(() => {
    setIsRunning(false);
    setIsDebugMode(false);
    setIsCurrentlyDebugging(false);
    setIsDebugWaitingForInput(false);
    setCurrentDebugLine(null);
  }, []);

  const addTerminalLog = useCallback((type: TerminalLogType, message: string) => {
    if (!message) return;

    const normalized = message.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const segments = normalized.split("\n");
    const prefix = type === "Error" ? "! " : type === "Outputs" ? "> " : "";
    const isContinuousOutput = type === "Outputs" && lastLogTypeRef.current === "Outputs";

    setTerminalLogs(prev => {
      // If empty logs array, initialize with prefix on all lines so styling applies
      if (prev.length === 0) {
        return segments.map(seg => `${prefix}${seg}`);
      }

      const next = [...prev];

      if (isContinuousOutput) {
        // 1. Append the first segment to the existing output line
        next[next.length - 1] += segments[0];

        // 2. Any line created by \n gets the prefix so it keeps the output color!
        for (let i = 1; i < segments.length; i++) {
          next.push(`${prefix}${segments[i]}`);
        }
      } else {
        // Different log type: start new lines, all carrying the new prefix
        segments.forEach((segment) => {
          next.push(`${prefix}${segment}`);
        });
      }

      return next;
  });

  lastLogTypeRef.current = type;
  if (type === "Error") {
    setHasError(true);
  }
}, []);

  // ===== WebSocket Terminal Handler =====
  const handleTerminalMessage = useCallback((message: TerminalMessage) => {
    const { event, text } = message;

    if (!text) return;

    if (event === 'Outputs') {
      addTerminalLog('Outputs', text);
      return;
    }

    if (event === 'Error') {
      addTerminalLog('Error', text);
      if (
        /Compilation error|Compiler error|Internal error|Debug error|GDB runtime error|No active debug session running/i.test(text)
      ) {
        resetExecutionState();
      }
      return;
    }

    if (event === 'Status') {
      const pausedMatch = text.match(/Paused at line\s+(\d+)/i);
      if (pausedMatch) {
        setIsDebugWaitingForInput(false);
        setIsRunning(true);
        setIsDebugMode(true);
        setIsCurrentlyDebugging(true);
        setCurrentDebugLine(Number(pausedMatch[1]));
        return;
      }
      
      addTerminalLog('Status', text);
      const waitingMatch = text.match(/Waiting for input at line\s+(\d+)/i);
      if (waitingMatch) {
        setIsDebugWaitingForInput(true);
        setIsRunning(true);
        setIsDebugMode(true);
        setIsCurrentlyDebugging(true);
        setCurrentDebugLine(Number(waitingMatch[1]));
        return;
      }

      if (/Process exited with code|Execution stopped by user\./i.test(text)) {
        resetExecutionState();
        return;
      }

      if (/Debug process exited with code|Debug session stopped\./i.test(text)) {
        resetExecutionState();
      }
    }
  }, [addTerminalLog, resetExecutionState]);

  // Initialize WebSocket connection
  const { runCode, sendInput, stopExecution, startDebug, debugStepOver, debugStepInto, debugStepOut, isConnected } = useGlobalTerminal(handleTerminalMessage);

  React.useEffect(() => {
    setWsConnected(isConnected);
  }, [isConnected]);

  const handleRun = useCallback(async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setTerminalOpen(true);
    if (!generatedCode.trim() || generatedCode.includes("// Add a 'Main' node")) { 
      addTerminalLog("Error", `[${getTimestamp()}] Error: Please add a 'Main' node to your flow before running.`); 
      return; 
    }

    setIsRunning(true);
    setHasError(false);
    setActiveErrorLog("");
    addTerminalLog("Status", `[${getTimestamp()}] Starting execution via WebSocket...`);

    runCode(generatedCode);
  }, [generatedCode, runCode, addTerminalLog]);

  const handleStopRun = useCallback(() => {
    addTerminalLog("Status", `[${getTimestamp()}] Stop requested...`);
    stopExecution();
  }, [stopExecution, addTerminalLog]);

  const handleTerminalInputSubmit = useCallback(() => {
    if (!terminalInput.trim()) {
      return;
    }

    const inputValue = terminalInput;
    addTerminalLog("Outputs", inputValue);
    setTerminalInput('');

    sendInput(inputValue);
  }, [terminalInput, sendInput, addTerminalLog]);

  const handleDebug = useCallback(() => {
    if (!generatedCode.trim() || generatedCode.includes("// Add a 'Main' node")) {
      setTerminalOpen(true);
      addTerminalLog("Error", `[${getTimestamp()}] Error: Cannot initialize Debug Mode without an active 'Main' node.`);
      return;
    }

    setTerminalOpen(true);
    setIsRunning(true);
    setIsDebugMode(true);
    setHasError(false);
    setActiveErrorLog("");
    addTerminalLog("Status", `[${getTimestamp()}] Spawning GDB Environment (-g -O0)...`);

    setIsCurrentlyDebugging(true);
    startDebug(generatedCode);
  }, [generatedCode, startDebug, addTerminalLog]);

  const handleStepOver = useCallback(() => {
    if (isDebugWaitingForInput) {
      return;
    }
    debugStepOver();
  }, [debugStepOver, isDebugWaitingForInput]);

  const handleStepInto = useCallback(() => {
    if (isDebugWaitingForInput) {
      return;
    }
    debugStepInto();
  }, [debugStepInto, isDebugWaitingForInput]);

  const handleStepOut = useCallback(() => {
    if (isDebugWaitingForInput) {
      return;
    }
    debugStepOut();
  }, [debugStepOut, isDebugWaitingForInput]);

  const handleStopDebug = useCallback(() => {
    stopExecution();
    resetExecutionState();
  }, [stopExecution, resetExecutionState]);

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const addNode = useCallback((type: string) => {
    flowActionsRef.current?.addNode(type);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".seec,application/json"
        className="hidden"
      />
      <TopBar
        downloadAsCFile={downloadAsCFile}
        handleRun={handleRun}
        handleStopRun={handleStopRun}
        handleDebug={handleDebug}
        handleStepInto={handleStepInto}
        handleStepOver={handleStepOver}
        handleStepOut={handleStepOut}
        handleStopDebug={handleStopDebug}
        isRunning={isRunning}
        isDebugStyleMode={isDebugMode}
        isCurrentlyDebugging={isCurrentlyDebugging}
        currentDebugLine={currentDebugLine}
        saveProject={saveProject}
        loadProject={loadProject}
        showChat={showChat}
        setShowChat={setShowChat}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          addNode={addNode}
          onDragStart={onDragStart}
        />

        {/* Canvas Area */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          <div className="flex-1 relative">
            <FlowCanvas
              onCodeChange={setGeneratedCode}
              onNodesCountChange={setNodesCount}
              registerActions={registerFlowActions}
            />
          </div>

          <TerminalPanel
            terminalOpen={terminalOpen}
            setTerminalOpen={setTerminalOpen}
            terminalHeight={terminalHeight}
            setTerminalHeight={setTerminalHeight}
            terminalLogs={terminalLogs}
            onClear={clearTerminal}
            hasError={hasError}
            handleAskAI={handleAskAI}
            terminalInput={terminalInput}
            setTerminalInput={setTerminalInput}
            onSubmitInput={handleTerminalInputSubmit}
          />
        </div>

        <CodePreview
          codePanelOpen={codePanelOpen}
          setCodePanelOpen={setCodePanelOpen}
          generatedCode={generatedCode}
          onCodeChange={setGeneratedCode}
          copyToClipboard={copyToClipboard}
          reloadCodeToNodes={reloadCodeToNodes}
          copied={copied}
          nodesCount={nodesCount}
          isCurrentlyDebugging={isCurrentlyDebugging}
          currentDebugLine={currentDebugLine}
        />
      </div>

      {/* Linked Chatbox instance */}
      <Chatbox
        showChat={showChat}
        setShowChat={setShowChat}
        initialError={activeErrorLog}
        initialCode={generatedCode}
        clearInitialError={() => setActiveErrorLog('')}
      />

    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}