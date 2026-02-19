import { create } from "zustand";

export interface VFSEntry {
  id: string;
  name: string;
  type: "file" | "directory";
  parentId: string | null;
  size: number;
  cid: string | null;
  permissions: string;
  createdAt: number;
  modifiedAt: number;
  children?: VFSEntry[];
}

interface FilesystemState {
  entries: VFSEntry[];
  currentPath: string[];
  selectedEntry: VFSEntry | null;
  loading: boolean;
  error: string | null;
  stats: {
    totalFiles: number;
    totalDirs: number;
    totalSize: number;
    dbSize: number;
  };
  loadEntries: () => void;
  navigateTo: (path: string[]) => void;
  selectEntry: (entry: VFSEntry | null) => void;
  createDir: (name: string) => void;
  deleteEntry: (id: string) => void;
}

const mockEntries: VFSEntry[] = [
  { id: "dir-root-docs", name: "documents", type: "directory", parentId: null, size: 0, cid: null, permissions: "rwxr-xr-x", createdAt: Date.now() - 86400000 * 30, modifiedAt: Date.now() - 3600000 },
  { id: "dir-root-media", name: "media", type: "directory", parentId: null, size: 0, cid: null, permissions: "rwxr-xr-x", createdAt: Date.now() - 86400000 * 20, modifiedAt: Date.now() - 86400000 },
  { id: "dir-root-data", name: "datasets", type: "directory", parentId: null, size: 0, cid: null, permissions: "rwxr-x---", createdAt: Date.now() - 86400000 * 10, modifiedAt: Date.now() - 7200000 },
  { id: "file-readme", name: "README.md", type: "file", parentId: null, size: 2048, cid: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzd", permissions: "rw-r--r--", createdAt: Date.now() - 86400000 * 30, modifiedAt: Date.now() - 86400000 * 2 },
  { id: "file-config", name: "config.toml", type: "file", parentId: null, size: 512, cid: "bafkreixyz789abc123def456ghi789jkl012mno", permissions: "rw-------", createdAt: Date.now() - 86400000 * 15, modifiedAt: Date.now() - 43200000 },
  { id: "file-doc1", name: "report-2026.pdf", type: "file", parentId: "dir-root-docs", size: 1048576, cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuyl", permissions: "rw-r--r--", createdAt: Date.now() - 86400000 * 5, modifiedAt: Date.now() - 86400000 * 5 },
  { id: "file-doc2", name: "notes.txt", type: "file", parentId: "dir-root-docs", size: 4096, cid: "bafkreiqwerty123456789asdfghjklzxcvbnm", permissions: "rw-r--r--", createdAt: Date.now() - 86400000 * 2, modifiedAt: Date.now() - 7200000 },
  { id: "file-media1", name: "photo.jpg", type: "file", parentId: "dir-root-media", size: 3145728, cid: "bafybeie5gq4jnaenirfkl5rgq33ndkbmop3mpkr", permissions: "rw-r--r--", createdAt: Date.now() - 86400000 * 10, modifiedAt: Date.now() - 86400000 * 10 },
  { id: "file-data1", name: "training-set.csv", type: "file", parentId: "dir-root-data", size: 52428800, cid: "bafybeiabc123def456ghi789jkl012mno345pqr", permissions: "rw-r-----", createdAt: Date.now() - 86400000 * 3, modifiedAt: Date.now() - 86400000 * 3 },
];

export const useFilesystemStore = create<FilesystemState>((set) => ({
  entries: mockEntries,
  currentPath: [],
  selectedEntry: null,
  loading: false,
  error: null,
  stats: {
    totalFiles: 6,
    totalDirs: 3,
    totalSize: 56629248,
    dbSize: 1048576,
  },
  loadEntries: () => {
    set({ loading: true });
    setTimeout(() => set({ loading: false }), 300);
  },
  navigateTo: (path) => set({ currentPath: path, selectedEntry: null }),
  selectEntry: (entry) => set({ selectedEntry: entry }),
  createDir: (name) => {
    const newDir: VFSEntry = {
      id: `dir-${Date.now()}`,
      name,
      type: "directory",
      parentId: null,
      size: 0,
      cid: null,
      permissions: "rwxr-xr-x",
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    set((s) => ({ entries: [...s.entries, newDir], stats: { ...s.stats, totalDirs: s.stats.totalDirs + 1 } }));
  },
  deleteEntry: (id) => {
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id && e.parentId !== id),
      selectedEntry: s.selectedEntry?.id === id ? null : s.selectedEntry,
    }));
  },
}));
