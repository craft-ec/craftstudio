import { create } from "zustand";

interface TunnelState {
  status: "disconnected" | "connecting" | "connected";
  exitNode: string | null;
  hops: number;
  speedUp: number;
  speedDown: number;
  bandwidthUsed: number;
  bandwidthLimit: number;
  connect: () => void;
  disconnect: () => void;
}

export const useTunnelStore = create<TunnelState>((set) => ({
  status: "disconnected",
  exitNode: null,
  hops: 2,
  speedUp: 0,
  speedDown: 0,
  bandwidthUsed: 0,
  bandwidthLimit: 0,
  connect: () => set({ status: "connecting" }),
  disconnect: () => set({ status: "disconnected", speedUp: 0, speedDown: 0 }),
}));
