import { create } from "zustand";
import { daemon } from "../services/daemon";
import { useConfigStore } from "./configStore";

interface DaemonState {
  connected: boolean;
  reconnect: () => void;
}

export const useDaemonStore = create<DaemonState>((set) => {
  // Subscribe to connection changes from the singleton
  daemon.onConnection((connected) => set({ connected }));

  // Watch config for daemon URL changes
  useConfigStore.subscribe((state, prev) => {
    const newUrl = state.config.daemons.datacraft.url;
    const oldUrl = prev.config.daemons.datacraft.url;
    if (newUrl !== oldUrl) {
      daemon.setUrl(newUrl);
    }
  });

  return {
    connected: daemon.connected,
    reconnect: () => daemon.reconnect(),
  };
});
