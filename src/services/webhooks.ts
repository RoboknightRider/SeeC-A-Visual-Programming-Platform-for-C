import { useEffect, useRef, useCallback } from 'react';

export interface TerminalMessage {
  event: 'Outputs' | 'Error' | 'Status';
  text: string;
}

export function useGlobalTerminal(
  onMessage: (message: TerminalMessage) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);

  // Log helper for debugging (no-op in production)
  const debugLog = useCallback((message: string) => {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
    if (!env?.DEV) return;
    const timestamp = new Date().toISOString();
    console.log(`[useGlobalTerminal] [${timestamp}] ${message}`);
  }, []);

  const getWsUrl = useCallback(() => {
    const env = (import.meta as ImportMeta & { env?: { VITE_WS_URL?: string } }).env;
    const configuredUrl = env?.VITE_WS_URL?.trim();
    if (configuredUrl) {
      return configuredUrl;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }, []);

  // Establish WebSocket connection
  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      debugLog('Connection already established or in progress');
      return;
    }

    isConnectingRef.current = true;
    debugLog('Establishing WebSocket connection...');

    try {
      const ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        debugLog('✓ WebSocket connected');
        isConnectingRef.current = false;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TerminalMessage;
          debugLog(`Received: ${data.event} - ${data.text.substring(0, 50)}...`);
          onMessage(data);
        } catch (error) {
          debugLog(`✗ Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
        }
      };

      ws.onclose = () => {
        debugLog('✗ WebSocket disconnected');
        isConnectingRef.current = false;
        if (wsRef.current === ws) wsRef.current = null;

        // Attempt to reconnect after 3 seconds (never after unmount)
        if (!isUnmountedRef.current && !reconnectTimeoutRef.current) {
          debugLog('Scheduling reconnection in 3 seconds...');
          reconnectTimeoutRef.current = setTimeout(() => {
            // Clear first so a failed attempt can schedule the next retry.
            reconnectTimeoutRef.current = null;
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        debugLog(`✗ WebSocket error: ${error.type}`);
        isConnectingRef.current = false;
      };

      wsRef.current = ws;
    } catch (error) {
      debugLog(`✗ Connection error: ${error instanceof Error ? error.message : String(error)}`);
      isConnectingRef.current = false;
    }
  }, [debugLog, getWsUrl, onMessage]);

  // Initialize connection on mount
  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Close sockets that are still connecting too, otherwise they leak (e.g. StrictMode remounts).
      const ws = wsRef.current;
      wsRef.current = null;
      isConnectingRef.current = false;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [connect]);

  type WsAction =
    | 'RUN_CODE'
    | 'DEBUG'
    | 'DEBUG_STEP_OVER'
    | 'DEBUG_STEP_INTO'
    | 'DEBUG_STEP_OUT'
    | 'SEND_INPUT'
    | 'STOP_EXECUTION';

  const sendAction = useCallback((action: WsAction, data?: string, successDetail?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog(`⚠ WebSocket not connected, cannot send ${action}`);
      return;
    }

    try {
      wsRef.current.send(JSON.stringify({ action, data }));
      debugLog(successDetail || `✓ ${action} sent`);
    } catch (error) {
      debugLog(`✗ Error sending ${action}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  const runCode = useCallback((codeString: string) => sendAction('RUN_CODE', codeString), [sendAction]);
  const startDebug = useCallback((codeString: string) => sendAction('DEBUG', codeString), [sendAction]);
  const debugStep = useCallback((mode: 'OVER' | 'INTO' | 'OUT') => sendAction(`DEBUG_STEP_${mode}`), [sendAction]);
  const sendInput = useCallback((text: string) => sendAction('SEND_INPUT', text, `✓ Input sent: ${text}`), [sendAction]);
  const stopExecution = useCallback(() => sendAction('STOP_EXECUTION'), [sendAction]);

  return {
    runCode,
    sendInput,
    stopExecution,
    startDebug,
    debugStep,
  };
}
