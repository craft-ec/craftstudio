// JSON-RPC 2.0 client helper for daemon communication
// Used by useWebSocket hook - re-exported for convenience

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcEvent {
  jsonrpc: "2.0";
  method: "event";
  params: {
    type: string;
    data: unknown;
  };
}
