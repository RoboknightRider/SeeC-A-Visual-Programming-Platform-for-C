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

// Cached tool paths: `undefined` = unknown, `null` = not found, string = resolved path or executable name
const cachedToolPaths: { [key: string]: string | null | undefined } = { gcc: undefined, gdb: undefined };

function resolveTool(name: 'gcc' | 'gdb', localRel: string, binName: string): string | null {
  // Check env vars first (fast, no exec)
  const envCandidates = name === 'gcc' ? ['GCC_PATH', 'GCC_HOME', 'CC'] : ['GDB_PATH'];
  for (const ev of envCandidates) {
    const raw = process.env[ev]?.trim();
    if (!raw) continue;
    let candidate = raw;
    // If env var points to a directory, try expected executable locations
    try {
      if (!fs.existsSync(candidate)) {
        const try1 = path.join(candidate, 'bin', `${binName}.exe`);
        const try2 = path.join(candidate, `${binName}.exe`);
        if (fs.existsSync(try1)) candidate = try1;
        else if (fs.existsSync(try2)) candidate = try2;
      }
    } catch (e) {}

    if (fs.existsSync(candidate)) {
      cachedToolPaths[name] = candidate;
      return candidate;
    }

    // If env var explicitly names the binary (e.g. 'gcc'), assume PATH
    if (candidate === binName) {
      cachedToolPaths[name] = binName;
      return binName;
    }
  }

  // Check for bundled portable executable
  const local = path.join(process.cwd(), localRel);
  if (fs.existsSync(local)) {
    cachedToolPaths[name] = local;
    return local;
  }

  // As a last resort, verify the binary on PATH once
  try {
    execSync(`${binName} --version`, { stdio: 'ignore' });
    cachedToolPaths[name] = binName;
    return binName;
  } catch (e) {
    cachedToolPaths[name] = null;
    return null;
  }
}

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

  wsLog("[Local AI] Booting llama-server.exe...");
  llamaServerProcess = spawn(llamaExecutable, [
    "-m", modelPath,
    "--port", String(localAiPort),
    "-c", "2048",
    "--threads", "4"
  ]);

  // Avoid logging every stdout/stderr chunk from the model server to reduce console spam.
  // Only surface critical lifecycle events and errors.
  if (llamaServerProcess.pid) {
    wsLog(`[Local AI] llama-server started (pid ${llamaServerProcess.pid})`);
  }

  llamaServerProcess.on('error', (err) => {
    console.error('[Local AI] llama-server process error:', err?.message || err);
  });

  llamaServerProcess.on("close", (code) => {
    wsLog(`[Local AI] Process exited with code ${code}`);
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

interface ClientSession {
  id: string;
  ws: WebSocket;
  runningProcess: ChildProcess | null;
  activeDebugSession: DebugSession | null;
  cDir: string;
  exeDir: string;
}

const clientSessions = new Map<WebSocket, ClientSession>();

// ===== WebSocket Global State =====
interface WebSocketMessage {
  action: 'RUN_CODE' | 'DEBUG' | 'DEBUG_STEP_OVER' | 'DEBUG_STEP_INTO' | 'DEBUG_STEP_OUT' | 'SEND_INPUT' | 'STOP_EXECUTION';
  data?: string;
}

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

function sendToClient(ws: WebSocket, event: string, text: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, text }));
  }
}

function sendLineStatus(ws: WebSocket, prefix: 'Paused' | 'Waiting for input', line: number | null | undefined) {
  if (line && line > 0) {
    sendToClient(ws, 'Status', `${prefix} at line ${line}`);
    return;
  }
  sendToClient(ws, 'Status', prefix);
}

function getGccPath() {
  if (cachedToolPaths.gcc !== undefined) return cachedToolPaths.gcc;
  return resolveTool('gcc', 'gcc/bin/gcc.exe', 'gcc');
}

function requireGccPath(ws: WebSocket | null) {
  const p = getGccPath();
  if (p) return p;
  wsLog('✗ GCC not found');
  if (ws) sendToClient(ws, 'Error', 'GCC not found. Please install GCC or place a portable version in the gcc folder.');
  return null;
}

function getGdbPath() {
  if (cachedToolPaths.gdb !== undefined) return cachedToolPaths.gdb;
  return resolveTool('gdb', 'gcc/bin/gdb.exe', 'gdb');
}

function requireGdbPath(ws: WebSocket | null) {
  const p = getGdbPath();
  if (p) return p;
  wsLog('✗ GDB not found');
  if (ws) sendToClient(ws, 'Error', 'GDB not found. Please install GDB or place a portable version in the gcc folder.');
  return null;
}

function stopRunningProcess(session: ClientSession, logMessage?: string) {
  if (!session.runningProcess) {
    return false;
  }
  if (logMessage) {
    wsLog(logMessage);
  }
  session.runningProcess.kill();
  session.runningProcess = null;
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

function flushDebugOutput(session: DebugSession, ws: WebSocket) {
  if (session.programStdout.length > session.lastStdoutIndex) {
    const out = session.programStdout.slice(session.lastStdoutIndex);
    session.lastStdoutIndex = session.programStdout.length;
    if (out) sendToClient(ws, 'Outputs', out);
  }

  if (session.programStderr.length > session.lastStderrIndex) {
    const err = sanitizeDiagnosticText(session.programStderr.slice(session.lastStderrIndex));
    session.lastStderrIndex = session.programStderr.length;
    if (err) sendToClient(ws, 'Error', err);
  }
}

function isLikelyInputLine(session: DebugSession, lineNumber: number | null) {
  if (!lineNumber || lineNumber < 1 || lineNumber > session.sourceLines.length) {
    return false;
  }

  const sourceLine = session.sourceLines[lineNumber - 1] || "";
  return /\b(scanf|fscanf|sscanf|gets|fgets|getchar|getc|fgetc)\b/.test(sourceLine);
}

function cleanActiveGdbSession(session: ClientSession) {
  if (!session.activeDebugSession) {
    return;
  }

  if (session.activeDebugSession.stepPoll) {
    clearInterval(session.activeDebugSession.stepPoll);
    session.activeDebugSession.stepPoll = null;
  }

  try {
    session.activeDebugSession.gdbProcess.stdin?.write("-gdb-exit\n");
    session.activeDebugSession.gdbProcess.kill();
  } catch (error) {
    console.error("Error cleaning up GDB process:", error);
  } finally {
    session.activeDebugSession = null;
  }
}

function getCodePaths(session: ClientSession, programName: string) {
  const cFilename = path.join(session.cDir, `${programName}.c`);
  let exeFilename = path.join(session.exeDir, programName);

  if (process.platform === "win32") {
    exeFilename += ".exe";
  }

  return { cDir: session.cDir, exeDir: session.exeDir, cFilename, exeFilename };
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
        payload.systemInstruction || SYSTEM_INSTRUCTION,
        payload.contextSummary
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
        payload.systemInstruction,
        payload.contextSummary
      );
      res.json({ text });
    } catch (error) {
      console.error("Local AI Endpoint Error:", error);
      res.status(503).json({ error: "Local AI model server is offline or busy." });
    }
  });

  // Compile-only endpoint used by the client before downloading C code
  app.post('/api/compile', (req, res) => {
    const code = req.body?.code;
    if (typeof code !== 'string') {
      res.status(400).json({ error: 'Missing or invalid `code` in request body.' });
      return;
    }

    const gccPath = getGccPath();
    if (!gccPath) {
      res.status(500).json({ error: 'GCC not found on server.' });
      return;
    }

    const exportsRoot = path.join(process.cwd(), 'SessionFiles', 'exports');
    if (!fs.existsSync(exportsRoot)) fs.mkdirSync(exportsRoot, { recursive: true });

    const compileId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const cFilename = path.join(exportsRoot, `${compileId}.c`);
    let exeFilename = path.join(exportsRoot, compileId);
    if (process.platform === 'win32') exeFilename += '.exe';

    try {
      fs.writeFileSync(cFilename, code);
    } catch (err) {
      res.status(500).json({ error: `Failed to write temp C file: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    const compile = spawn(gccPath, [cFilename, '-o', exeFilename]);
    let stdout = '';
    let stderr = '';
    compile.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    compile.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    compile.on('close', (code) => {
      const output = sanitizeDiagnosticText(stderr || stdout || `exit code ${code}`);
      if (code !== 0) {
        res.json({ ok: false, output });
      } else {
        res.json({ ok: true, output });
      }
      // best-effort cleanup of temp files
      try { if (fs.existsSync(cFilename)) fs.rmSync(cFilename); } catch {}
      try { if (fs.existsSync(exeFilename)) fs.rmSync(exeFilename); } catch {}
    });

    compile.on('error', (err) => {
      res.status(500).json({ error: `Compiler spawn error: ${err instanceof Error ? err.message : String(err)}` });
    });
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
    const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const { cDir, exeDir } = ensureClientCodeDirectories(clientId);

    const session: ClientSession = {
      id: clientId,
      ws,
      runningProcess: null,
      activeDebugSession: null,
      cDir,
      exeDir,
    };

    clientSessions.set(ws, session);

    ws.on("message", (message: Buffer) => {
      try {
        const event = JSON.parse(message.toString()) as WebSocketMessage;
        wsLog(`Received action: ${event.action}`);

        switch (event.action) {
          case "RUN_CODE": {handleRunCode(session, event.data || "");break;}
          case "DEBUG": {handleDebug(session, event.data || "");break;}
          case "DEBUG_STEP_OVER": {handleDebugStepOver(session);break;}
          case "DEBUG_STEP_INTO": {handleDebugStepInto(session);break;}
          case "DEBUG_STEP_OUT": {handleDebugStepOut(session);break;}
          case "SEND_INPUT": {handleSendInput(session, event.data || "");break;}
          case "STOP_EXECUTION": {handleStopExecution(session);break;}
          default: {wsLog(`⚠ Unknown action: ${event.action}`);}
        }
      } catch (error) {
        wsLog(`✗ Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    ws.on("close", () => {
      wsLog("✓ Client disconnected");
      const session = clientSessions.get(ws);
      if (session) {
        stopRunningProcess(session, "Killing running process on client disconnect...");
        if (session.activeDebugSession) {
          wsLog("Cleaning up debug session on client disconnect...");
          cleanActiveGdbSession(session);
        }
        cleanupClientFiles(session);
        clientSessions.delete(ws);
      }
    });

    ws.on("error", (error) => {
      wsLog(`✗ WebSocket error: ${error.message}`);
    });
  });

  return wss;
}

function ensureClientCodeDirectories(clientId: string) {
  const sessionRoot = path.join(process.cwd(), "SessionFiles", clientId);
  const cDir = path.join(sessionRoot, "C_Source");
  const exeDir = path.join(sessionRoot, "C_Build");

  if (!fs.existsSync(cDir)) fs.mkdirSync(cDir, { recursive: true });
  if (!fs.existsSync(exeDir)) fs.mkdirSync(exeDir, { recursive: true });

  return { cDir, exeDir };
}

function cleanupClientFiles(session: ClientSession) {
  try {
    const sessionRoot = path.dirname(session.cDir);
    if (fs.existsSync(sessionRoot)) {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
      wsLog(`Deleted session files for client ${session.id}: ${sessionRoot}`);
    }
  } catch (error) {
    console.error(`Error cleaning up client files for ${session.id}:`, error);
  }
}

function registerShutdownHandlers(httpServer: any, wss: WebSocketServer) {
  process.on("SIGINT", () => {
    wsLog("SIGINT received, performing immediate shutdown...");
    immediateShutdown(httpServer, wss);
  });

  process.on("SIGTERM", () => {
    wsLog("SIGTERM received, performing immediate shutdown...");
    immediateShutdown(httpServer, wss);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    immediateShutdown(httpServer, wss);
  });
}

async function startServer() {
  // Initialize components and start servers
  const { app } = createAppAndClient();
  initializeLocalAi(serverConfig.localAiPort);
  await startHttpAndWs(app);
}

function immediateShutdown(httpServer: any, wss: WebSocketServer) {
  wsLog('Immediate shutdown: killing children and exiting');

  // Kill local AI server process if running
  try {
    if (llamaServerProcess) {
      llamaServerProcess.kill();
      llamaServerProcess = null;
    }
  } catch (e) {}

  // Close all WebSocket clients
  try { wss.clients.forEach((client) => client.close(1001, 'Server shutting down')); } catch (e) {}

  // Stop and cleanup client sessions
  clientSessions.forEach((session) => {
    try { stopRunningProcess(session, 'Killing running process...'); } catch (e) {}
    try { if (session.activeDebugSession) cleanActiveGdbSession(session); } catch (e) {}
    try { cleanupClientFiles(session); } catch (e) {}
  });

  // Best-effort: remove remaining SessionFiles root to ensure no temp files remain
  try {
    const sessionsRoot = path.join(process.cwd(), 'SessionFiles');
    if (fs.existsSync(sessionsRoot)) {
      wsLog(`Deleting SessionFiles root: ${sessionsRoot}`);
      fs.rmSync(sessionsRoot, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('Error removing SessionFiles root during shutdown:', e);
  }

  // Try to close servers quickly, then exit
  try { httpServer && httpServer.close && httpServer.close(); } catch (e) {}

  process.exit(0);
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});

// ===== WebSocket Action Handlers =====

function handleRunCode(session: ClientSession, codeString: string) {
  wsLog('Processing RUN_CODE...');

  stopRunningProcess(session, 'Killing existing process...');

  const gccPath = requireGccPath(session.ws);
  if (!gccPath) {
    return;
  }

  const { cFilename, exeFilename } = getCodePaths(session, 'program');

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
        sendToClient(session.ws, 'Error', `Compilation error:\n${sanitizeDiagnosticText(compilerLogs.getOutput())}`);
        return;
      }

      wsLog('✓ Compilation successful, spawning process...');

      session.runningProcess = spawn(exeFilename, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      session.runningProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        wsLog(`[program stdout] ${output}`);
        sendToClient(session.ws, 'Outputs', output);
      });

      session.runningProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        const sanitizedOutput = sanitizeDiagnosticText(output);
        wsLog(`[program stderr] ${sanitizedOutput}`);
        sendToClient(session.ws, 'Error', sanitizedOutput);
      });

      session.runningProcess.on('close', (code) => {
        wsLog(`✓ Process exited with code ${code}`);
        sendToClient(session.ws, 'Status', `Process exited with code ${code}`);
        session.runningProcess = null;
      });

      session.runningProcess.on('error', (err) => {
        wsLog(`✗ Process error: ${err.message}`);
        sendToClient(session.ws, 'Error', `Process error: ${err.message}`);
        session.runningProcess = null;
      });
    });

    compileProcess.on('error', (err) => {
      wsLog(`✗ Compiler spawn error: ${err.message}`);
      sendToClient(session.ws, 'Error', `Compiler error: ${err.message}`);
    });
  } catch (error) {
    wsLog(`✗ Exception in handleRunCode: ${error instanceof Error ? error.message : String(error)}`);
    sendToClient(session.ws, 'Error', `Internal error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function handleSendInput(session: ClientSession, inputText: string) {
  wsLog(`Sending input: ${inputText}`);

  const textToSend = inputText.endsWith('\n') ? inputText : inputText + '\n';

  if (session.activeDebugSession?.gdbProcess.stdin && session.activeDebugSession.gdbProcess.stdin.writable) {
    try {
      session.activeDebugSession.gdbProcess.stdin.write(textToSend);
      wsLog('✓ Input sent to debug session');
      return;
    } catch (error) {
      wsLog(`✗ Error sending input to debug session: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }

  if (session.runningProcess?.stdin && session.runningProcess.stdin.writable) {
    try {
      session.runningProcess.stdin.write(textToSend);
      wsLog('✓ Input sent to run session');
      return;
    } catch (error) {
      wsLog(`✗ Error sending input to run session: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }

  wsLog('⚠ No active session with writable stdin');
  sendToClient(session.ws, 'Error', 'No active run/debug session available for input.');
}

function handleStopExecution(session: ClientSession) {
  wsLog('Processing STOP_EXECUTION...');

  if (session.activeDebugSession) {
    wsLog('Terminating active debug session...');
    cleanActiveGdbSession(session);
    sendToClient(session.ws, 'Status', 'Execution stopped by user.');
    return;
  }

  if (stopRunningProcess(session, 'Terminating running process...')) {
    sendToClient(session.ws, 'Status', 'Execution stopped by user.');
    return;
  }

  wsLog('⚠ No active run/debug session to stop');
}

function handleDebug(session: ClientSession, codeString: string) {
  wsLog('Processing DEBUG...');

  cleanActiveGdbSession(session);

  const gccPath = requireGccPath(session.ws);
  if (!gccPath) {
    return;
  }

  const { cFilename, exeFilename } = getCodePaths(session, 'SeeC_Debug_Workspace');

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
        sendToClient(session.ws, 'Error', `Debug compilation error:\n${sanitizeDiagnosticText(compilerLogs.getOutput())}`);
        return;
      }

      wsLog('✓ Debug build successful, initializing GDB...');

      const gdbPath = requireGdbPath(session.ws);
      if (!gdbPath) {
        sendToClient(session.ws, 'Error', 'GDB not found. Debugging disabled.');
        return;
      }

      const gdbProcess = spawn(gdbPath, ['-q', '--interpreter=mi2', exeFilename]);

      const debugSession: DebugSession = {
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

      session.activeDebugSession = debugSession;
      let responseAlreadySent = false;

      gdbProcess.stdout?.on('data', (data: Buffer) => {
        try {
          const chunk = data.toString();
          wsLog(`[GDB E stdout] ${chunk}`);
          processGdbMiChunk(session.activeDebugSession!, chunk, "stdout");
          flushDebugOutput(session.activeDebugSession!, session.ws);
        } catch (e) {
          wsLog(`✗ Error parsing GDB MI stdout: ${e}`);
        }
      });

      gdbProcess.stderr?.on('data', (data: Buffer) => {
        try {
          const chunk = data.toString();
          wsLog(`[GDB E stderr] ${chunk}`);
          processGdbMiChunk(session.activeDebugSession!, chunk, "stderr");
          flushDebugOutput(session.activeDebugSession!, session.ws);
        } catch (e) {
          wsLog(`✗ Error parsing GDB MI stderr: ${e}`);
        }
      });

      const waitForInitial = setInterval(() => {
        if (responseAlreadySent || !session.activeDebugSession) return;
        
        const currentLine = session.activeDebugSession.currentLine;
        if (currentLine !== null) {
          responseAlreadySent = true;
          clearInterval(waitForInitial);
          
          wsLog(`✓ GDB paused at line ${currentLine}`);
          sendLineStatus(session.ws, 'Paused', currentLine);
        }
      }, 50);

      gdbProcess.stdin?.write('-break-insert -f main\n');
      gdbProcess.stdin?.write('-exec-run\n');

      gdbProcess.on('error', (err) => {
        wsLog(`✗ GDB error: ${err.message}`);
        if (!responseAlreadySent) {
          responseAlreadySent = true;
          clearInterval(waitForInitial);
          cleanActiveGdbSession(session);
          sendToClient(session.ws, 'Error', `GDB runtime error: ${err.message}`);
        }
      });
    });

    compileProcess.on('error', (err) => {
      wsLog(`✗ Debug compiler spawn error: ${err.message}`);
      sendToClient(session.ws, 'Error', `Compiler error: ${err.message}`);
    });
  } catch (error) {
    wsLog(`✗ Exception in handleDebug: ${error instanceof Error ? error.message : String(error)}`);
    cleanActiveGdbSession(session);
    sendToClient(session.ws, 'Error', `Debug error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function handleDebugStep(session: ClientSession, mode: "over" | "into" | "out") {
  const actionName = mode === "over" ? "DEBUG_STEP_OVER" : mode === "into" ? "DEBUG_STEP_INTO" : "DEBUG_STEP_OUT";
  const modeLabel = mode === "over" ? "Step over" : mode === "into" ? "Step into" : "Step out";
  const gdbCommand = mode === "over" ? "-exec-next\n" : mode === "into" ? "-exec-step\n" : "-exec-finish\n";

  wsLog(`Processing ${actionName}...`);

  if (!session.activeDebugSession) {
    wsLog('⚠ No active debug session');
    sendToClient(session.ws, 'Error', 'No active debug session running');
    return;
  }

  const debugSession = session.activeDebugSession;
  if (debugSession.stepInProgress) {
    wsLog(`⚠ ${modeLabel} already in progress`);
    return;
  }

  if (debugSession.waitingForInput) {
    wsLog(`⚠ ${modeLabel} is waiting for input and cannot advance until input is sent`);
    sendLineStatus(session.ws, 'Waiting for input', debugSession.currentLine);
    return;
  }

  const previousLine = debugSession.currentLine;
  const startedAt = Date.now();

  debugSession.stepInProgress = true;
  debugSession.waitingForInput = false;

  debugSession.gdbProcess.stdin?.write(gdbCommand);

  const clearStepPoll = () => {
    if (debugSession.stepPoll) {
      clearInterval(debugSession.stepPoll);
      debugSession.stepPoll = null;
    }
  };

  clearStepPoll();

  debugSession.stepPoll = setInterval(() => {
    const hasLineChange = debugSession.currentLine !== previousLine;
    const isComplete = debugSession.completed;
    const elapsed = Date.now() - startedAt;
    
    if (!hasLineChange && !isComplete && elapsed > 800 && !debugSession.waitingForInput) {
      const currentLine = debugSession.currentLine ?? previousLine;
      if (isLikelyInputLine(debugSession, currentLine)) {
        debugSession.waitingForInput = true;
        wsLog('ℹ Debugger waiting for program input');
        sendLineStatus(session.ws, 'Waiting for input', currentLine);
        return;
      }

      clearStepPoll();
      debugSession.stepInProgress = false;
      debugSession.waitingForInput = false;
      wsLog('ℹ Step timeout on non-input line; returning to paused state');
      sendLineStatus(session.ws, 'Paused', currentLine);
      return;
    }

    if (hasLineChange || isComplete) {
      clearStepPoll();
      debugSession.stepInProgress = false;
      debugSession.waitingForInput = false;

      if (isComplete) {
        wsLog('✓ Debug process completed');
        cleanActiveGdbSession(session);
        sendToClient(session.ws, 'Status', `Debug process exited with code ${debugSession.exitCode}`);
      } else {
        wsLog(`✓ GDB stepped to line ${debugSession.currentLine}`);
        sendLineStatus(session.ws, 'Paused', debugSession.currentLine);
      }

      return;
    }

    if (!hasLineChange && debugSession.completed) {
      clearStepPoll();
      debugSession.stepInProgress = false;
      debugSession.waitingForInput = false;
      wsLog('✓ Debug completion detected without line change');
      cleanActiveGdbSession(session);
      sendToClient(session.ws, 'Status', `Debug process exited with code ${debugSession.exitCode}`);
    }
  }, 50);
}

function handleDebugStepOver(session: ClientSession) {
  handleDebugStep(session, "over");
}

function handleDebugStepInto(session: ClientSession) {
  handleDebugStep(session, "into");
}

function handleDebugStepOut(session: ClientSession) {
  handleDebugStep(session, "out");
}

function initializeLocalAi(localAiPort: number) {
  // Encapsulate local AI startup so startup sequence is clearer
  startLlamaServer(localAiPort);
}

function createAppAndClient() {
  const app = express();
  const geminiClient = createGeminiClient();
  app.use(express.json());
  registerAIRoutes(app, serverConfig, geminiClient);
  return { app, geminiClient };
}

async function startHttpAndWs(app: express.Express) {
  // Setup frontend (vite or static) then start listening and WebSocket server
  await setupFrontend(app);

  const httpServer = app.listen(serverConfig.appPort, "0.0.0.0", () => {
    wsLog(`[HTTP] Server running on http://localhost:${serverConfig.appPort}`);
  });

  const wss = setupWebSocketServer(httpServer, serverConfig.wsPath);
  registerShutdownHandlers(httpServer, wss);
  return { httpServer, wss };
}