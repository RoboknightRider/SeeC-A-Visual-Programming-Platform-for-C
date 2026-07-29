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

  // Log helper for debugging
  const debugLog = useCallback((message: string) => {
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
        wsRef.current = null;

        // Attempt to reconnect after 3 seconds
        if (!reconnectTimeoutRef.current) {
          debugLog('Scheduling reconnection in 3 seconds...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
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
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Send RUN_CODE action
  const runCode = useCallback((codeString: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog('⚠ WebSocket not connected, cannot send RUN_CODE');
      return;
    }

    try {
      const message = JSON.stringify({ action: 'RUN_CODE', data: codeString });
      wsRef.current.send(message);
      debugLog('✓ RUN_CODE sent');
    } catch (error) {
      debugLog(`✗ Error sending RUN_CODE: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  // Send DEBUG action
  const startDebug = useCallback((codeString: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog('⚠ WebSocket not connected, cannot send DEBUG');
      return;
    }

    try {
      const message = JSON.stringify({ action: 'DEBUG', data: codeString });
      wsRef.current.send(message);
      debugLog('✓ DEBUG sent');
    } catch (error) {
      debugLog(`✗ Error sending DEBUG: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  // Send DEBUG_STEP_OVER action
  const debugStepOver = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog('⚠ WebSocket not connected, cannot send DEBUG_STEP_OVER');
      return;
    }

    try {
      const message = JSON.stringify({ action: 'DEBUG_STEP_OVER' });
      wsRef.current.send(message);
      debugLog('✓ DEBUG_STEP_OVER sent');
    } catch (error) {
      debugLog(`✗ Error sending DEBUG_STEP_OVER: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  // Send DEBUG_STEP_INTO action
  const debugStepInto = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog('⚠ WebSocket not connected, cannot send DEBUG_STEP_INTO');
      return;
    }

    try {
      const message = JSON.stringify({ action: 'DEBUG_STEP_INTO' });
      wsRef.current.send(message);
      debugLog('✓ DEBUG_STEP_INTO sent');
    } catch (error) {
      debugLog(`✗ Error sending DEBUG_STEP_INTO: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  // Send DEBUG_STEP_OUT action
  const debugStepOut = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog('⚠ WebSocket not connected, cannot send DEBUG_STEP_OUT');
      return;
    }

    try {
      const message = JSON.stringify({ action: 'DEBUG_STEP_OUT' });
      wsRef.current.send(message);
      debugLog('✓ DEBUG_STEP_OUT sent');
    } catch (error) {
      debugLog(`✗ Error sending DEBUG_STEP_OUT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  // Send SEND_INPUT action
  const sendInput = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog('⚠ WebSocket not connected, cannot send input');
      return;
    }

    try {
      const message = JSON.stringify({ action: 'SEND_INPUT', data: text });
      wsRef.current.send(message);
      debugLog(`✓ Input sent: ${text}`);
    } catch (error) {
      debugLog(`✗ Error sending input: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  // Send STOP_EXECUTION action
  const stopExecution = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      debugLog('⚠ WebSocket not connected, cannot stop execution');
      return;
    }

    try {
      const message = JSON.stringify({ action: 'STOP_EXECUTION' });
      wsRef.current.send(message);
      debugLog('✓ STOP_EXECUTION sent');
    } catch (error) {
      debugLog(`✗ Error sending STOP_EXECUTION: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [debugLog]);

  const isConnected = wsRef.current?.readyState === WebSocket.OPEN;

  return {
    runCode,
    sendInput,
    stopExecution,
    startDebug,
    debugStepOver,
    debugStepInto,
    debugStepOut,
    isConnected,
  };
}
