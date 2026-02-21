/**
 * Identity store — per-instance DID from the running daemon.
 *
 * Each daemon instance has a did:craftec: identity derived from its node.key.
 * This store fetches the DID for the active instance from list_craftobj_daemons.
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface DaemonInfo {
  pid: number;
  ws_port: number;
  data_dir: string;
  did: string;
}

interface IdentityState {
  did: string | null;
  displayName: string | null;
  loading: boolean;
  setDid: (did: string) => void;
  /** Fetch the DID for the active instance by matching ws_port */
  refreshDid: (wsPort: number) => Promise<void>;
}

export const useIdentityStore = create<IdentityState>((set) => ({
  did: null,
  displayName: null,
  loading: false,
  setDid: (did) => set({ did }),
  refreshDid: async (wsPort: number) => {
    set({ loading: true });
    try {
      const daemons = await invoke<DaemonInfo[]>("list_craftobj_daemons");
      const match = daemons.find((d) => d.ws_port === wsPort);
      if (match?.did) {
        set({ did: match.did, loading: false });
      } else {
        // Fallback: try the old get_identity command
        try {
          const id = await invoke<{ did: string }>("get_identity");
          set({ did: id.did, loading: false });
        } catch {
          set({ did: null, loading: false });
        }
      }
    } catch {
      set({ did: null, loading: false });
    }
  },
}));
