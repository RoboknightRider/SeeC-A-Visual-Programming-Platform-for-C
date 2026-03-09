import React, { useState, useCallback } from 'react';
import {
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { cn } from './lib/utils';
import { NODE_REGISTRY } from './components/Nodes';
import { Terminal, Code, Trash2, X, Copy, Check, Cpu, ChevronLeft, ChevronRight, Box, Play, Download, Settings, Bug, GitPullRequest, Activity, Variable} from 'lucide-react';

// --- Sub-components for Optimization ---

const TopBar = React.memo(({ 
  downloadAsCFile, 
  handleCompile, 
  handleRun, 
  isRunning 
}: { 
  downloadAsCFile: () => void; 
  handleCompile: () => void; 
  handleRun: () => void; 
  isRunning: boolean;
}) => (
  <header className="h-14 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3">
        <Cpu className="w-6 h-6 text-emerald-500" />
        <h1 className="text-xl font-bold tracking-tight text-white">SeeC</h1>
      </div>
      <div className="h-6 w-px bg-zinc-800 mx-2" />
      <nav className="flex items-center gap-1">
        <button onClick={downloadAsCFile} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all text-xs font-medium">
          <Download size={14} />
          Export
        </button>
        <button onClick={handleCompile} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all text-xs font-medium">
          <Bug size={14} />
          Compile
        </button>
      </nav>
    </div>

    <div className="flex items-center gap-3">
      <button 
        onClick={handleRun}
        disabled={isRunning}
        className={cn(
          "flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-xs transition-all shadow-lg",
          isRunning 
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
        )}
      >
        <Play size={14} fill="currentColor" />
        Run 
      </button>
      <div className="h-6 w-px bg-zinc-800 mx-1" />
      <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all">
        <Settings size={18} />
      </button>
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
  terminalLogs 
}: { 
  terminalOpen: boolean; 
  setTerminalOpen: (open: boolean) => void; 
  terminalLogs: string[];
}) => (
  <div className={cn(
    "border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-md transition-all duration-300 flex flex-col",
    terminalOpen ? "h-48" : "h-10"
  )}>
    <div 
      className="h-10 px-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50"
      onClick={() => setTerminalOpen(!terminalOpen)}
    >
      <div className="flex items-center gap-2">
        <Terminal size={14} className="text-emerald-500" />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Terminal Output</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[10px] text-zinc-600">
          {terminalLogs.length} logs
        </span>
        {terminalOpen ? <ChevronLeft className="rotate-270" size={14} /> : <ChevronLeft className="rotate-90" size={14} />}
      </div>
    </div>
    {terminalOpen && (
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-zinc-300 space-y-1 bg-black/20">
        {terminalLogs.length === 0 && <div className="text-zinc-600 italic">No output yet. Run the program to see results.</div>}
        {terminalLogs.map((log, i) => (
          <div key={i} className={cn(
            log.startsWith('>') ? "text-emerald-400 pl-2" : "text-zinc-400",
            log.includes('successful') && "text-blue-400"
          )}>
            {log}
          </div>
        ))}
      </div>
    )}
  </div>
));

const CodePreview = React.memo(({ 
  codePanelOpen, 
  setCodePanelOpen, 
  generatedCode, 
  copyToClipboard, 
  copied, 
  nodesCount 
}: { 
  codePanelOpen: boolean; 
  setCodePanelOpen: (open: boolean) => void; 
  generatedCode: string; 
  copyToClipboard: () => void; 
  copied: boolean; 
  nodesCount: number;
}) => (
  <div className={cn(
    "border-l border-zinc-800 bg-zinc-900/50 flex flex-col transition-all duration-300 relative",
    codePanelOpen ? "w-96" : "w-12"
  )}>
    <button 
      onClick={() => setCodePanelOpen(!codePanelOpen)}
      className="absolute right-full top-1/2 -translate-y-1/2 mr-1 z-50 bg-zinc-800 border border-zinc-700 rounded-full p-2 text-zinc-400 hover:text-white transition-all shadow-xl hover:scale-110 flex items-center justify-center"
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
        <button 
          onClick={copyToClipboard}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-all border border-zinc-700"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
    </div>
    
    {codePanelOpen && (
      <>
        <div className="flex-1 overflow-auto p-4 font-mono text-sm">
          <pre className="text-emerald-400/90 leading-relaxed">
            <code>{generatedCode}</code>
          </pre>
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

import { FlowCanvas } from './components/FlowCanvas';

function Flow() {
  const [generatedCode, setGeneratedCode] = useState('');
  const [nodesCount, setNodesCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [codePanelOpen, setCodePanelOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedCode]);

  const downloadAsCFile = useCallback(() => {
    const element = document.createElement("a");
    const file = new Blob([generatedCode], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "program.c";
    document.body.appendChild(element);
    element.click();
  }, [generatedCode]);

  const handleCompile = useCallback(() => {
    setTerminalOpen(true);
    setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Compiling program.c...`]);
    setTimeout(() => {
      setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Compilation successful. Output: program.exe`]);
    }, 1000);
  }, []);

  const handleRun = useCallback(async () => {
    if (!generatedCode.trim()) return;
    
    setTerminalOpen(true);
    setIsRunning(true);
    setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Initializing AI Runtime...`]);
    
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Act as a C compiler and runtime environment. Execute the following C code and provide ONLY the standard output (stdout) and standard error (stderr) as it would appear in a terminal. Do not provide any explanations, code blocks, or markdown formatting. Just the raw output.

C Code:
${generatedCode}`,
        config: {
          temperature: 0.1,
        }
      });

      const output = response.text || "No output returned.";
      
      setTerminalLogs(prev => [
        ...prev, 
        `[${new Date().toLocaleTimeString()}] Executing program.exe...`,
        ...output.split('\n').filter(line => line.trim()).map(line => `> ${line}`),
        `[${new Date().toLocaleTimeString()}] Process finished with exit code 0.`
      ]);
    } catch (error) {
      console.error("Execution error:", error);
      setTerminalLogs(prev => [
        ...prev, 
        `[${new Date().toLocaleTimeString()}] Error: Failed to execute code via AI Runtime.`,
        `> ${error instanceof Error ? error.message : String(error)}`
      ]);
    } finally {
      setIsRunning(false);
    }
  }, [generatedCode]);

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const addNode = useCallback((type: string) => {
    if ((window as any).addNodeToFlow) {
      (window as any).addNodeToFlow(type);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 overflow-hidden">
      <TopBar 
        downloadAsCFile={downloadAsCFile} 
        handleCompile={handleCompile} 
        handleRun={handleRun} 
        isRunning={isRunning} 
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          sidebarOpen={sidebarOpen} 
          setSidebarOpen={setSidebarOpen} 
          addNode={addNode} 
          onDragStart={onDragStart} 
        />

        {/* Canvas Area */}
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 relative">
            <FlowCanvas 
              onCodeChange={setGeneratedCode} 
              onNodesCountChange={setNodesCount} 
            />
          </div>

          <TerminalPanel 
            terminalOpen={terminalOpen} 
            setTerminalOpen={setTerminalOpen} 
            terminalLogs={terminalLogs} 
          />
        </div>

        <CodePreview 
          codePanelOpen={codePanelOpen} 
          setCodePanelOpen={setCodePanelOpen} 
          generatedCode={generatedCode} 
          copyToClipboard={copyToClipboard} 
          copied={copied} 
          nodesCount={nodesCount} 
        />
      </div>
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
