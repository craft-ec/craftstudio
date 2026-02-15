import { create } from "zustand";

interface IdentityState {
  did: string | null;
  displayName: string | null;
  setDid: (did: string) => void;
}

export const useIdentityStore = create<IdentityState>((set) => ({
  did: null,
  displayName: null,
  setDid: (did) => set({ did }),
}));
