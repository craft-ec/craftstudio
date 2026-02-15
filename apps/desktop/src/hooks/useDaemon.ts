import { useInstanceStore } from "../store/instanceStore";
import { getClient } from "../services/daemon";
import type { DaemonClient } from "../services/daemon";

/**
 * Returns the DaemonClient for the currently active instance.
 * Returns undefined if no instance is active.
 */
export function useDaemon(): DaemonClient | undefined {
  const activeId = useInstanceStore((s) => s.activeId);
  if (!activeId) return undefined;
  return getClient(activeId);
}

/**
 * Returns connection status for the active instance.
 */
export function useActiveConnection(): {
  connected: boolean;
  status: "connected" | "disconnected" | "connecting";
} {
  const activeId = useInstanceStore((s) => s.activeId);
  const connectionStatus = useInstanceStore((s) => s.connectionStatus);
  const status = activeId ? connectionStatus[activeId] ?? "disconnected" : "disconnected";
  return { connected: status === "connected", status };
}
