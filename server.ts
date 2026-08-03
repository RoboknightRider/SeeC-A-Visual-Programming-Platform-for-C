import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execSync, ChildProcess } from "child_process";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import {
  SYSTEM_INSTRUCTION,
  parseAIRequestPayload,
  normalizeGeminiApiKey,
  generateGeminiServerResponse,
  generateLocalServerResponse,
} from "./src/services/codingAgent.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerConfig {
  appPort: number;
  wsPath: string;
  localAiPort: number;
}

function getPortFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = Number(raw);
  if (!raw || Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function loadServerConfig(): ServerConfig {
  return {
    appPort: getPortFromEnv("PORT", 3000),
    wsPath: process.env.WS_PATH?.trim() || "/ws",
    localAiPort: getPortFromEnv("LOCAL_AI_PORT", 8080),
  };
}

const serverConfig = loadServerConfig();

function getLocalAICompletionsEndpoint(config: ServerConfig): string {
  return `http://127.0.0.1:${config.localAiPort}/v1/chat/completions`;
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = normalizeGeminiApiKey(process.env.GEMINI_API_KEY);
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

// ===== Local AI (llama-server) Process Reference =====
let llamaServerProcess: ChildProcess | null = null;

function startLlamaServer(localAiPort: number) {
  const llamaExecutable = path.join(process.cwd(), "bin", "llama-server.exe");
  const modelPath = path.join(process.cwd(), "models", "seec-tutor.gguf");

  if (!fs.existsSync(llamaExecutable)) {
    console.warn(`[Local AI] llama-server.exe not found at ${llamaExecutable}. Local AI fallback will be disabled.`);
    return;
  }

  if (!fs.existsSync(modelPath)) {
    console.warn(`[Local AI] Model weights not found at ${modelPath}. Local AI fallback will be disabled.`);
    return;
  }

  console.log("[Local AI] Booting llama-server.exe...");
  llamaServerProcess = spawn(llamaExecutable, [
    "-m", modelPath,
    "--port", String(localAiPort),
    "-c", "2048",
    "--threads", "4"
  ]);

  llamaServerProcess.stdout?.on("data", (data) => {
    console.log(`[llama-server]: ${data.toString().trim()}`);
  });

  llamaServerProcess.stderr?.on("data", (data) => {
    console.log(`[llama-server err]: ${data.toString().trim()}`);
  });

  llamaServerProcess.on("close", (code) => {
    console.log(`[Local AI] Process exited with code ${code}`);
    llamaServerProcess = null;
  });
}

function getLocalAIStatus() {
  const llamaExecutable = path.join(process.cwd(), "bin", "llama-server.exe");
  const modelPath = path.join(process.cwd(), "models", "seec-tutor.gguf");

  const executableExists = fs.existsSync(llamaExecutable);
  const modelExists = fs.existsSync(modelPath);
  const processRunning = Boolean(llamaServerProcess && !llamaServerProcess.killed);

  return {
    executableExists,
    modelExists,
    processRunning,
    available: executableExists && modelExists,
  };
}

interface DebugSession {
  gdbProcess: ChildProcess;
  programStdout: string;
  programStderr: string;
  lastStdoutIndex: number;
  lastStderrIndex: number;
  currentLine: number | null;
  completed: boolean;
  exitCode: number | null;
  stepPoll: NodeJS.Timeout | null;
  stepInProgress: boolean;
  waitingForInput: boolean;
  miStdoutBuffer: string;
  miStderrBuffer: string;
  sourceLines: string[];
}

let activeDebugSession: DebugSession | null = null;

// ===== WebSocket Global State =====
interface WebSocketMessage {
  action: 'RUN_CODE' | 'DEBUG' | 'DEBUG_STEP_OVER' | 'DEBUG_STEP_INTO' | 'DEBUG_STEP_OUT' | 'SEND_INPUT' | 'STOP_EXECUTION';
  data?: string;
}

let runningProcess: ChildProcess | null = null;
let wsClient: WebSocket | null = null;

// Debug logging helper
function wsLog(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[WS] [${timestamp}] ${message}`);
}

function sanitizeDiagnosticText(text: string) {
  return text
    .replace(/\b[A-Za-z]:[\\/][^:\r\n]*[\\/]([^\\/:\r\n]+\.(?:c|h|cpp|cc|cxx|exe))(?=:\d|:\s|$)/g, "$1")
    .replace(/(^|\s)\/[^:\r\n]*\/([^\/:\r\n]+\.(?:c|h|cpp|cc|cxx|exe))(?=:\d|:\s|$)/g, (_, prefix: string, fileName: string) => `${prefix}${fileName}`);
}

function sendToClient(event: string, text: string) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify({ event, text }));
  }
}

function sendLineStatus(prefix: 'Paused' | 'Waiting for input', line: number | null | undefined) {
  if (line && line > 0) {
    sendToClient('Status', `${prefix} at line ${line}`);
    return;
  }
  sendToClient('Status', prefix);
}

function getGccPath() {
  const localGcc = path.join(process.cwd(), "gcc", "bin", "gcc.exe");
  if (fs.existsSync(localGcc)) {
    return localGcc;
  }

  try {
    execSync("gcc --version", { stdio: "ignore" });
    return "gcc";
  } catch (error) {
    return null;
  }
}

function requireGccPath() {
  const gccPath = getGccPath();
  if (gccPath) {
    return gccPath;
  }
  wsLog('✗ GCC not found');
  sendToClient('Error', 'GCC not found. Please install GCC or place a portable version in the gcc folder.');
  return null;
}

function stopRunningProcess(logMessage?: string) {
  if (!runningProcess) {
    return false;
  }
  if (logMessage) {
    wsLog(logMessage);
  }
  runningProcess.kill();
  runningProcess = null;
  return true;
}

function attachCompilerDiagnostics(compileProcess: ChildProcess, stdoutLabel: string, stderrLabel: string) {
  let stdout = '';
  let stderr = '';

  compileProcess.stdout?.on('data', (data: Buffer) => {
    const s = data.toString();
    stdout += s;
    wsLog(`${stdoutLabel} ${sanitizeDiagnosticText(s)}`);
  });

  compileProcess.stderr?.on('data', (data: Buffer) => {
    const s = data.toString();
    stderr += s;
    wsLog(`${stderrLabel} ${sanitizeDiagnosticText(s)}`);
  });

  return {
    getOutput: () => stderr || stdout,
  };
}

function decodeGdbMiString(value: string) {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function parseGdbMiLine(session: DebugSession, line: string, appendNewline = false) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  const streamMatch = trimmed.match(/^(~|&|@)"((?:\\.|[^"\\])*)"$/);
  if (streamMatch) {
    const decoded = decodeGdbMiString(streamMatch[2]);
    if (streamMatch[1] === "@") {
      session.programStdout += decoded;
    } else if (streamMatch[1] === "&") {
      session.programStderr += decoded;
    }
    return;
  }

  const mixedMiMatch = line.match(/(?:\d+\^|[\^*+=](?=[A-Za-z-])|[~&@]")/);
  if (mixedMiMatch && mixedMiMatch.index !== undefined && mixedMiMatch.index > 0) {
    const plainPrefix = line.slice(0, mixedMiMatch.index);
    if (plainPrefix) {
      session.programStdout += plainPrefix;
    }

    const miSuffix = line.slice(mixedMiMatch.index);
    if (miSuffix.trim()) {
      parseGdbMiLine(session, miSuffix, false);
    }
    return;
  }

  const isMiMetaRecord = /^(?:\d+)?[\^*+=]/.test(trimmed) || trimmed === "(gdb)";
  if (!isMiMetaRecord) {
    session.programStdout += appendNewline ? `${line}\n` : line;
    return;
  }

  if (!trimmed.startsWith("*stopped")) {
    return;
  }

  const lineMatch = trimmed.match(/line="(\d+)"/);
  if (lineMatch) {
    session.currentLine = parseInt(lineMatch[1], 10);
  }

  if (/reason="exited-normally"/.test(trimmed) || /reason="exited"/.test(trimmed)) {
    session.completed = true;
    session.exitCode = 0;
  }

  const exitCodeMatch = trimmed.match(/exit-code="(\d+)"/);
  if (exitCodeMatch) {
    session.completed = true;
    session.exitCode = parseInt(exitCodeMatch[1], 10);
  }
}

function processGdbMiChunk(session: DebugSession, chunk: string, stream: "stdout" | "stderr") {
  const key = stream === "stdout" ? "miStdoutBuffer" : "miStderrBuffer";
  session[key] = (session[key] + chunk).replace(/\r/g, "");
  while (true) {
    const buffer = session[key];
    const newlineIdx = buffer.indexOf("\n");
    const promptIdx = buffer.indexOf("(gdb)");

    const hasNewline = newlineIdx !== -1;
    const hasPrompt = promptIdx !== -1;

    if (!hasNewline && !hasPrompt) {break;}

    const usePrompt = hasPrompt && (!hasNewline || promptIdx < newlineIdx);
    const splitIdx = usePrompt ? promptIdx : newlineIdx;
    const consumeLen = usePrompt ? 5 : 1;

    const record = buffer.slice(0, splitIdx);
    session[key] = buffer.slice(splitIdx + consumeLen);

    if (record.trim()) {parseGdbMiLine(session, record, !usePrompt);}
  }
}

function flushDebugOutput(session: DebugSession) {
  if (session.programStdout.length > session.lastStdoutIndex) {
    const out = session.programStdout.slice(session.lastStdoutIndex);
    session.lastStdoutIndex = session.programStdout.length;
    if (out) sendToClient('Outputs', out);
  }

  if (session.programStderr.length > session.lastStderrIndex) {
    const err = sanitizeDiagnosticText(session.programStderr.slice(session.lastStderrIndex));
    session.lastStderrIndex = session.programStderr.length;
    if (err) sendToClient('Error', err);
  }
}

function isLikelyInputLine(session: DebugSession, lineNumber: number | null) {
  if (!lineNumber || lineNumber < 1 || lineNumber > session.sourceLines.length) {
    return false;
  }

  const sourceLine = session.sourceLines[lineNumber - 1] || "";
  return /\b(scanf|fscanf|sscanf|gets|fgets|getchar|getc|fgetc)\b/.test(sourceLine);
}

function cleanActiveGdbSession() {
  if (!activeDebugSession) {
    return;
  }

  if (activeDebugSession.stepPoll) {
    clearInterval(activeDebugSession.stepPoll);
    activeDebugSession.stepPoll = null;
  }

  try {
    activeDebugSession.gdbProcess.stdin?.write("-gdb-exit\n");
    activeDebugSession.gdbProcess.kill();
  } catch (error) {
    console.error("Error cleaning up GDB process:", error);
  } finally {
    activeDebugSession = null;
  }
}

function ensureCodeDirectories() {
  const cDir = path.join(process.cwd(), "C_Source");
  const exeDir = path.join(process.cwd(), "C_Build");

  if (!fs.existsSync(cDir)) fs.mkdirSync(cDir, { recursive: true });
  if (!fs.existsSync(exeDir)) fs.mkdirSync(exeDir, { recursive: true });

  return { cDir, exeDir };
}

function getCodePaths(programName: string) {
  const { cDir, exeDir } = ensureCodeDirectories();
  const cFilename = path.join(cDir, `${programName}.c`);
  let exeFilename = path.join(exeDir, programName);

  if (process.platform === "win32") {
    exeFilename += ".exe";
  }

  return { cDir, exeDir, cFilename, exeFilename };
}

function registerAIRoutes(app: express.Express, config: ServerConfig, geminiClient: GoogleGenAI | null) {
  app.get("/api/ai-status", (_req, res) => {
    const geminiConfigured = Boolean(geminiClient);
    const local = getLocalAIStatus();

    res.json({
      geminiConfigured,
      local,
    });
  });

  app.post("/api/gemini", async (req, res) => {
    const payload = parseAIRequestPayload(req.body);
    if ("error" in payload) {
      res.status(400).json({ error: payload.error });
      return;
    }

    if (!geminiClient) {
      console.error("Gemini configuration missing.");
      res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      return;
    }

    try {
      const text = await generateGeminiServerResponse(
        geminiClient,
        payload.prompt,
        payload.messages,
        payload.systemInstruction || SYSTEM_INSTRUCTION
      );
      res.json({ text });
    } catch (error) {
      console.error("Gemini API Error:", error);
      const detail = error instanceof Error && error.message.trim()
        ? error.message
        : "Error connecting to Gemini API.";
      res.status(502).json({ error: detail });
    }
  });

  app.post("/api/local-ai", async (req, res) => {
    const payload = parseAIRequestPayload(req.body);
    if ("error" in payload) {
      res.status(400).json({ error: payload.error });
      return;
    }

    try {
      const text = await generateLocalServerResponse(
        payload.prompt,
        payload.messages,
        getLocalAICompletionsEndpoint(config),
        payload.systemInstruction
      );
      res.json({ text });
    } catch (error) {
      console.error("Local AI Endpoint Error:", error);
      res.status(503).json({ error: "Local AI model server is offline or busy." });
    }
  });
}

async function setupFrontend(app: express.Express) {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    return;
  }

  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

function setupWebSocketServer(httpServer: ReturnType<express.Express["listen"]>, wsPath: string) {
  const wss = new WebSocketServer({ server: httpServer, path: wsPath });
  wsLog(`WebSocket server initialized on ws://localhost:${serverConfig.appPort}${wsPath}`);

  wss.on("connection", (ws: WebSocket) => {
    wsLog("✓ Client connected");
    wsClient = ws;

    ws.on("message", (message: Buffer) => {
      try {
        const event = JSON.parse(message.toString()) as WebSocketMessage;
        wsLog(`Received action: ${event.action}`);

        switch (event.action) {
          case "RUN_CODE": {handleRunCode(event.data || "");break;}
          case "DEBUG": {handleDebug(event.data || "");break;}
          case "DEBUG_STEP_OVER": {handleDebugStepOver();break;}
          case "DEBUG_STEP_INTO": {handleDebugStepInto();break;}
          case "DEBUG_STEP_OUT": {handleDebugStepOut();break;}
          case "SEND_INPUT": {handleSendInput(event.data || "");break;}
          case "STOP_EXECUTION": {handleStopExecution();break;}
          default: {wsLog(`⚠ Unknown action: ${event.action}`);}
        }
      } catch (error) {
        wsLog(`✗ Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    ws.on("close", () => {
      wsLog("✓ Client disconnected");
      stopRunningProcess("Killing running process on client disconnect...");
      if (activeDebugSession) {
        wsLog("Cleaning up debug session on client disconnect...");
        cleanActiveGdbSession();
      }
      wsClient = null;
    });

    ws.on("error", (error) => {
      wsLog(`✗ WebSocket error: ${error.message}`);
    });
  });

  return wss;
}

function registerShutdownHandlers(httpServer: any, wss: WebSocketServer) {
  process.on("SIGINT", () => {
    wsLog("SIGINT received, shutting down gracefully...");
    gracefulShutdown(httpServer, wss);
  });

  process.on("SIGTERM", () => {
    wsLog("SIGTERM received, shutting down gracefully...");
    gracefulShutdown(httpServer, wss);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    gracefulShutdown(httpServer, wss);
  });
}

async function startServer() {
  const app = express();
  const { appPort, wsPath, localAiPort } = serverConfig;
  const geminiClient = createGeminiClient();

  startLlamaServer(localAiPort);

  app.use(express.json());
  registerAIRoutes(app, serverConfig, geminiClient);
  await setupFrontend(app);

  const httpServer = app.listen(appPort, "0.0.0.0", () => {
    console.log(`[HTTP] Server running on http://localhost:${appPort}`);
  });

  const wss = setupWebSocketServer(httpServer, wsPath);
  registerShutdownHandlers(httpServer, wss);
}

function gracefulShutdown(httpServer: any, wss: WebSocketServer) {
  wsLog('Closing WebSocket server...');

  // Kill local AI server process if running
  if (llamaServerProcess) {
    console.log("[Local AI] Shutting down llama-server...");
    llamaServerProcess.kill();
    llamaServerProcess = null;
  }
  
  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close(1000, 'Server shutting down');
  });
  
  // Close the WebSocket server
  wss.close(() => {
    wsLog('✓ WebSocket server closed');
  });
  
  // Close the HTTP server
  wsLog('Closing HTTP server...');
  httpServer.close(() => {
    wsLog('✓ HTTP server closed');
    stopRunningProcess('Killing running process...');
    
    if (activeDebugSession) {
      wsLog('Killing debug session...');
      cleanActiveGdbSession();
    }
    
    wsLog('Exiting...');
    process.exit(0);
  });
  
  setTimeout(() => {
    wsLog('✗ Graceful shutdown timeout, forcing exit...');
    process.exit(1);
  }, 5000);
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});

// ===== WebSocket Action Handlers =====

function handleRunCode(codeString: string) {
  wsLog('Processing RUN_CODE...');

  stopRunningProcess('Killing existing process...');

  const gccPath = requireGccPath();
  if (!gccPath) {
    return;
  }

  const { cFilename, exeFilename } = getCodePaths('program');

  try {
    let finalCode = codeString;
    if (!finalCode.includes("#include <stdlib.h>")) {
      finalCode = "#include <stdlib.h>\n" + finalCode;
    }
    if (!finalCode.includes("#include <stdio.h>")) {
      finalCode = "#include <stdio.h>\n" + finalCode;
    }
    finalCode = finalCode.replace(
      /(\bmain\s*\([^)]*\)\s*\{)/,
      "$1\n    setvbuf(stdout, NULL, _IONBF, 0);\n    setvbuf(stderr, NULL, _IONBF, 0);\n"
    );

    fs.writeFileSync(cFilename, finalCode);
    wsLog(`Wrote code to ${path.basename(cFilename)}`);

    wsLog('Compiling C code...');
    const compileProcess = spawn(gccPath, [cFilename, '-o', exeFilename]);
    const compilerLogs = attachCompilerDiagnostics(compileProcess, '[compiler stdout]', '[compiler stderr]');

    compileProcess.on('close', (exitCode) => {
      if (exitCode !== 0) {
        wsLog(`✗ Compilation failed with code ${exitCode}`);
        sendToClient('Error', `Compilation error:\n${sanitizeDiagnosticText(compilerLogs.getOutput())}`);
        return;
      }

      wsLog('✓ Compilation successful, spawning process...');

      runningProcess = spawn(exeFilename, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      runningProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        wsLog(`[program stdout] ${output}`);
        sendToClient('Outputs', output);
      });

      runningProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        const sanitizedOutput = sanitizeDiagnosticText(output);
        wsLog(`[program stderr] ${sanitizedOutput}`);
        sendToClient('Error', sanitizedOutput);
      });

      runningProcess.on('close', (code) => {
        wsLog(`✓ Process exited with code ${code}`);
        sendToClient('Status', `Process exited with code ${code}`);
        runningProcess = null;
      });

      runningProcess.on('error', (err) => {
        wsLog(`✗ Process error: ${err.message}`);
        sendToClient('Error', `Process error: ${err.message}`);
        runningProcess = null;
      });
    });

    compileProcess.on('error', (err) => {
      wsLog(`✗ Compiler spawn error: ${err.message}`);
      sendToClient('Error', `Compiler error: ${err.message}`);
    });
  } catch (error) {
    wsLog(`✗ Exception in handleRunCode: ${error instanceof Error ? error.message : String(error)}`);
    sendToClient('Error', `Internal error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function handleSendInput(inputText: string) {
  wsLog(`Sending input: ${inputText}`);

  const textToSend = inputText.endsWith('\n') ? inputText : inputText + '\n';

  if (activeDebugSession?.gdbProcess.stdin && activeDebugSession.gdbProcess.stdin.writable) {
    try {
      activeDebugSession.gdbProcess.stdin.write(textToSend);
      wsLog('✓ Input sent to debug session');
      return;
    } catch (error) {
      wsLog(`✗ Error sending input to debug session: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }

  if (runningProcess?.stdin && runningProcess.stdin.writable) {
    try {
      runningProcess.stdin.write(textToSend);
      wsLog('✓ Input sent to run session');
      return;
    } catch (error) {
      wsLog(`✗ Error sending input to run session: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }

  wsLog('⚠ No active session with writable stdin');
  sendToClient('Error', 'No active run/debug session available for input.');
}

function handleStopExecution() {
  wsLog('Processing STOP_EXECUTION...');

  if (activeDebugSession) {
    wsLog('Terminating active debug session...');
    cleanActiveGdbSession();
    sendToClient('Status', 'Execution stopped by user.');
    return;
  }

  if (stopRunningProcess('Terminating running process...')) {
    sendToClient('Status', 'Execution stopped by user.');
    return;
  }

  wsLog('⚠ No active run/debug session to stop');
}

function handleDebug(codeString: string) {
  wsLog('Processing DEBUG...');

  cleanActiveGdbSession();

  const gccPath = requireGccPath();
  if (!gccPath) {
    return;
  }

  const { cFilename, exeFilename } = getCodePaths('SeeC_Debug_Workspace');

  try {
    let debugCode = codeString;
    debugCode = debugCode.replace(
      /(\bmain\s*\([^)]*\)\s*\{)/,
      "$1 setvbuf(stdout, NULL, _IONBF, 0); setvbuf(stderr, NULL, _IONBF, 0);"
    );

    fs.writeFileSync(cFilename, debugCode);
    wsLog(`Wrote debug code to ${path.basename(cFilename)}`);

    const compileProcess = spawn(gccPath, ['-g', '-O0', '-Wall', '-Wextra', cFilename, '-o', exeFilename]);
    const compilerLogs = attachCompilerDiagnostics(compileProcess, '[DEBUG compiler stdout]', '[DEBUG compiler stderr]');

    compileProcess.on('close', (exitCode) => {
      if (exitCode !== 0) {
        wsLog(`✗ Debug compilation failed with code ${exitCode}`);
        sendToClient('Error', `Debug compilation error:\n${sanitizeDiagnosticText(compilerLogs.getOutput())}`);
        return;
      }

      wsLog('✓ Debug build successful, initializing GDB...');

      const gdbProcess = spawn('gdb', ['-q', '--interpreter=mi2', exeFilename]);

      const session: DebugSession = {
        gdbProcess,
        programStdout: '',
        programStderr: '',
        lastStdoutIndex: 0,
        lastStderrIndex: 0,
        currentLine: null,
        completed: false,
        exitCode: null,
        stepPoll: null,
        stepInProgress: false,
        waitingForInput: false,
        miStdoutBuffer: '',
        miStderrBuffer: '',
        sourceLines: debugCode.replace(/\r/g, '').split('\n'),
      };

      activeDebugSession = session;
      let responseAlreadySent = false;

      gdbProcess.stdout?.on('data', (data: Buffer) => {
        try {
          const chunk = data.toString();
          console.log(`[GDB E stdout] ${chunk}`);
          processGdbMiChunk(session, chunk, "stdout");
          flushDebugOutput(session);
        } catch (e) {
          wsLog(`✗ Error parsing GDB MI stdout: ${e}`);
        }
      });

      gdbProcess.stderr?.on('data', (data: Buffer) => {
        try {
          const chunk = data.toString();
          console.log(`[GDB E stderr] ${chunk}`);
          processGdbMiChunk(session, chunk, "stderr");
          flushDebugOutput(session);
        } catch (e) {
          wsLog(`✗ Error parsing GDB MI stderr: ${e}`);
        }
      });

      const waitForInitial = setInterval(() => {
        if (responseAlreadySent) return;
        
        if (session.currentLine !== null) {
          responseAlreadySent = true;
          clearInterval(waitForInitial);
          
          wsLog(`✓ GDB paused at line ${session.currentLine}`);
          sendLineStatus('Paused', session.currentLine);
        }
      }, 50);

      gdbProcess.stdin?.write('-break-insert -f main\n');
      gdbProcess.stdin?.write('-exec-run\n');

      gdbProcess.on('error', (err) => {
        wsLog(`✗ GDB error: ${err.message}`);
        if (!responseAlreadySent) {
          responseAlreadySent = true;
          clearInterval(waitForInitial);
          cleanActiveGdbSession();
          sendToClient('Error', `GDB runtime error: ${err.message}`);
        }
      });
    });

    compileProcess.on('error', (err) => {
      wsLog(`✗ Debug compiler spawn error: ${err.message}`);
      sendToClient('Error', `Compiler error: ${err.message}`);
    });
  } catch (error) {
    wsLog(`✗ Exception in handleDebug: ${error instanceof Error ? error.message : String(error)}`);
    cleanActiveGdbSession();
    sendToClient('Error', `Debug error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function handleDebugStep(mode: "over" | "into" | "out") {
  const actionName = mode === "over" ? "DEBUG_STEP_OVER" : mode === "into" ? "DEBUG_STEP_INTO" : "DEBUG_STEP_OUT";
  const modeLabel = mode === "over" ? "Step over" : mode === "into" ? "Step into" : "Step out";
  const gdbCommand = mode === "over" ? "-exec-next\n" : mode === "into" ? "-exec-step\n" : "-exec-finish\n";

  wsLog(`Processing ${actionName}...`);

  if (!activeDebugSession) {
    wsLog('⚠ No active debug session');
    sendToClient('Error', 'No active debug session running');
    return;
  }

  const session = activeDebugSession;
  if (session.stepInProgress) {
    wsLog(`⚠ ${modeLabel} already in progress`);
    return;
  }

  if (session.waitingForInput) {
    wsLog(`⚠ ${modeLabel} is waiting for input and cannot advance until input is sent`);
    sendLineStatus('Waiting for input', session.currentLine);
    return;
  }

  const previousLine = session.currentLine;
  const startedAt = Date.now();

  session.stepInProgress = true;
  session.waitingForInput = false;

  session.gdbProcess.stdin?.write(gdbCommand);

  const clearStepPoll = () => {
    if (session.stepPoll) {
      clearInterval(session.stepPoll);
      session.stepPoll = null;
    }
  };

  clearStepPoll();

  session.stepPoll = setInterval(() => {
    const hasLineChange = session.currentLine !== previousLine;
    const isComplete = session.completed;
    const elapsed = Date.now() - startedAt;
    
    if (!hasLineChange && !isComplete && elapsed > 800 && !session.waitingForInput) {
      const currentLine = session.currentLine ?? previousLine;
      if (isLikelyInputLine(session, currentLine)) {
        session.waitingForInput = true;
        wsLog('ℹ Debugger waiting for program input');
        sendLineStatus('Waiting for input', currentLine);
        return;
      }

      clearStepPoll();
      session.stepInProgress = false;
      session.waitingForInput = false;
      wsLog('ℹ Step timeout on non-input line; returning to paused state');
      sendLineStatus('Paused', currentLine);
      return;
    }

    if (hasLineChange || isComplete) {
      clearStepPoll();
      session.stepInProgress = false;
      session.waitingForInput = false;

      if (isComplete) {
        wsLog('✓ Debug process completed');
        cleanActiveGdbSession();
        sendToClient('Status', `Debug process exited with code ${session.exitCode}`);
      } else {
        wsLog(`✓ GDB stepped to line ${session.currentLine}`);
        sendLineStatus('Paused', session.currentLine);
      }

      return;
    }

    if (!hasLineChange && session.completed) {
      clearStepPoll();
      session.stepInProgress = false;
      session.waitingForInput = false;
      wsLog('✓ Debug completion detected without line change');
      cleanActiveGdbSession();
      sendToClient('Status', `Debug process exited with code ${session.exitCode}`);
    }
  }, 50);
}

function handleDebugStepOver() {
  handleDebugStep("over");
}

function handleDebugStepInto() {
  handleDebugStep("into");
}

function handleDebugStepOut() {
  handleDebugStep("out");
}