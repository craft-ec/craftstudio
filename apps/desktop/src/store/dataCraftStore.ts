import { create } from "zustand";
import { daemon } from "../services/daemon";

export interface ContentItem {
  cid: string;
  name: string;
  size: number;
  encrypted: boolean;
  shards: number;
  healthRatio: number;
  poolBalance: number;
  publishedAt: string;
}

export interface AccessEntry {
  did: string;
  grantedAt: string;
}

interface DataCraftState {
  content: ContentItem[];
  accessLists: Record<string, AccessEntry[]>;
  loading: boolean;
  error: string | null;

  loadContent: () => Promise<void>;
  publishContent: (path: string, encrypted: boolean) => Promise<void>;
  grantAccess: (cid: string, did: string) => Promise<void>;
  revokeAccess: (cid: string, did: string) => Promise<void>;
  loadAccessList: (cid: string) => Promise<void>;
}

export const useDataCraftStore = create<DataCraftState>((set) => ({
  content: [],
  accessLists: {},
  loading: false,
  error: null,

  loadContent: async () => {
    set({ loading: true, error: null });
    try {
      const items = await daemon.listContent();
      const content: ContentItem[] = (items || []).map((item) => ({
        cid: item.cid,
        name: item.name || item.cid.slice(0, 12),
        size: item.size,
        encrypted: false, // daemon doesn't expose this in list yet
        shards: item.chunks,
        healthRatio: 1.0,
        poolBalance: 0,
        publishedAt: new Date().toISOString(),
      }));
      set({ content, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  publishContent: async (path, encrypted) => {
    set({ error: null });
    try {
      const result = await daemon.publish(path, encrypted);
      // Add to local list immediately
      set((state) => ({
        content: [
          {
            cid: result.cid,
            name: path.split("/").pop() || path,
            size: result.size,
            encrypted,
            shards: result.chunks,
            healthRatio: 1.0,
            poolBalance: 0,
            publishedAt: new Date().toISOString(),
          },
          ...state.content,
        ],
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  grantAccess: async (cid, did) => {
    set({ error: null });
    try {
      // For now we pass empty strings for secrets - the UI will need to
      // provide these from the identity store in a future iteration
      await daemon.grantAccess(cid, "", did, "");
      // Optimistic update
      set((state) => ({
        accessLists: {
          ...state.accessLists,
          [cid]: [
            ...(state.accessLists[cid] || []),
            { did, grantedAt: new Date().toISOString() },
          ],
        },
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  revokeAccess: async (cid, did) => {
    set({ error: null });
    try {
      await daemon.revokeAccess(cid, did);
      set((state) => ({
        accessLists: {
          ...state.accessLists,
          [cid]: (state.accessLists[cid] || []).filter((e) => e.did !== did),
        },
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  loadAccessList: async (cid) => {
    try {
      const result = await daemon.listAccess(cid);
      const entries: AccessEntry[] = (result.authorized || []).map((did) => ({
        did,
        grantedAt: "", // daemon doesn't track grant time
      }));
      set((state) => ({
        accessLists: { ...state.accessLists, [cid]: entries },
      }));
    } catch {
      // Silently fail - will show empty list
    }
  },
}));
