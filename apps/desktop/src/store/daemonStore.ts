import { create } from "zustand";
import { useInstanceStore } from "./instanceStore";
import { getClient } from "../services/daemon";

/**
 * Daemon store - now delegates to instance store for connection status.
 * Kept for backward compatibility with components that still import it.
 */
interface DaemonState {
  connected: boolean;
  reconnect: () => void;
}

export const useDaemonStore = create<DaemonState>((set) => {
  // Subscribe to instance store changes to derive connection status
  useInstanceStore.subscribe((state) => {
    const activeId = state.activeId;
    const connected = activeId
      ? state.connectionStatus[activeId] === "connected"
      : false;
    set({ connected });
  });

  return {
    connected: false,
    reconnect: () => {
      const { activeId } = useInstanceStore.getState();
      if (!activeId) return;
      const client = getClient(activeId);
      client?.reconnect();
    },
  };
});
