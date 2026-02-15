import { useEffect, useRef, useCallback } from "react";

const DAEMON_WS_URL = "ws://127.0.0.1:9091/ws";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
  params?: unknown;
};

type EventHandler = (params: unknown) => void;

export function useWebSocket(onEvent?: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);
  const pendingRef = useRef<Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map());

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(DAEMON_WS_URL);

      ws.onopen = () => console.log("[ws] connected to daemon");
      ws.onclose = () => {
        console.log("[ws] disconnected, retrying in 3s...");
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (ev) => {
        const msg: JsonRpcResponse = JSON.parse(ev.data);
        if (msg.id !== undefined && pendingRef.current.has(msg.id)) {
          const { resolve, reject } = pendingRef.current.get(msg.id)!;
          pendingRef.current.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method === "event" && onEvent) {
          onEvent(msg.params);
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, [onEvent]);

  const call = useCallback(async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");

    const id = ++idRef.current;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, ...(params && { params }) };
    ws.send(JSON.stringify(req));

    return new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    });
  }, []);

  return { call };
}
