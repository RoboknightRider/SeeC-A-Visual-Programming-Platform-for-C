import { Chatbox } from './components/Chatbox';
import React, { useState, useCallback } from 'react';
import {ReactFlowProvider,} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getTimestamp } from './lib/utils';
import { FlowCanvas } from './components/FlowCanvas';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/NodePalette';
import { TerminalPanel } from './components/TerminalPanel';
import { CodePreview } from './components/GeneratedCodePanel';
import { SettingsDialog } from './components/SettingsDialog';
import { useGlobalTerminal, TerminalMessage } from './services/webhooks';

// --- Main Component ---

function Flow() {
  // Core editor state
  const [generatedCode, setGeneratedCode] = useState('');
  const [nodesCount, setNodesCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Layout panel state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [codePanelOpen, setCodePanelOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [codePanelWidth, setCodePanelWidth] = useState(384);

  const handlePanelResize = useCallback((panel: 'sidebar' | 'code', event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel === 'sidebar' ? sidebarWidth : codePanelWidth;
    const direction = panel === 'sidebar' ? 1 : -1;
    const minWidth = panel === 'sidebar' ? 168 : 240;
    const maxWidth = panel === 'sidebar' ? 420 : 600;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const width = Math.min(maxWidth, Math.max(minWidth, startWidth + (pointerEvent.clientX - startX) * direction));
      if (panel === 'sidebar') setSidebarWidth(width);
      else setCodePanelWidth(width);
    };
    const stopResizing = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing, { once: true });
    window.addEventListener('pointercancel', stopResizing, { once: true });
  }, [sidebarWidth, codePanelWidth]);

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
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem('seec-theme') === 'light' ? 'light' : 'dark';
  });
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
      flowActionsRef.current?.importCode(generatedCode);
    }
  }, [generatedCode]);

  const editingDisabled = isRunning || isDebugMode || isCurrentlyDebugging;

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

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('seec-theme', theme);
  }, [theme]);

  return (
    <div data-theme={theme} className="flex flex-col h-screen w-screen bg-zinc-950 overflow-hidden">
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
        onOpenSettings={() => setShowSettings(true)}
      />

      <SettingsDialog
        open={showSettings}
        theme={theme}
        onClose={() => setShowSettings(false)}
        onThemeChange={setTheme}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          sidebarWidth={sidebarWidth}
          onResizeStart={(event) => handlePanelResize('sidebar', event)}
          addNode={addNode}
          onDragStart={onDragStart}
        />

        {/* Canvas Area */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          <div className="flex-1 relative">
            <FlowCanvas
              onCodeChange={setGeneratedCode}
              onNodesCountChange={setNodesCount}
              editingDisabled={editingDisabled}
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
          codePanelWidth={codePanelWidth}
          onResizeStart={(event) => handlePanelResize('code', event)}
          generatedCode={generatedCode}
          onCodeChange={setGeneratedCode}
          copyToClipboard={copyToClipboard}
          reloadCodeToNodes={reloadCodeToNodes}
          editingDisabled={editingDisabled}
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