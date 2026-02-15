import { create } from "zustand";
import { daemon } from "../services/daemon";

interface DaemonState {
  connected: boolean;
  reconnect: () => void;
}

export const useDaemonStore = create<DaemonState>((set) => {
  // Subscribe to connection changes from the singleton
  daemon.onConnection((connected) => set({ connected }));

  return {
    connected: daemon.connected,
    reconnect: () => daemon.reconnect(),
  };
});
