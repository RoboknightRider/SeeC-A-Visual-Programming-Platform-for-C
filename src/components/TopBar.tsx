import React from 'react';
import { Bug, Code, Copy, Cpu, Download, MessageSquare, Play, Settings, SkipForward, Square } from 'lucide-react';
import { cn } from '../lib/utils';

const toolbarButtonClass = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap';
const toolbarActionClass = 'flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-xs transition-all shadow-lg whitespace-nowrap';

export const TopBar = React.memo(({
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
