import { useState } from "react";
import {
  FolderOpen, File, Upload, Download, FolderPlus, Trash2,
  HardDrive, Database, ChevronRight, ArrowLeft, FileText,
} from "lucide-react";
import StatCard from "../../components/StatCard";
import Modal from "../../components/Modal";
import { useFilesystemStore, type VFSEntry } from "../../store/filesystemStore";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function shortenCid(cid: string | null): string {
  if (!cid) return "—";
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 10)}…${cid.slice(-6)}`;
}

export default function FilesystemPage() {
  const { entries, currentPath, selectedEntry, stats, navigateTo, selectEntry, createDir, deleteEntry } = useFilesystemStore();
  const [showMkdir, setShowMkdir] = useState(false);
  const [newDirName, setNewDirName] = useState("");

  // Get current directory's parent ID
  const currentParentId = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;

  // Filter entries for current directory
  const visibleEntries = entries.filter((e) => e.parentId === currentParentId);
  const dirs = visibleEntries.filter((e) => e.type === "directory").sort((a, b) => a.name.localeCompare(b.name));
  const files = visibleEntries.filter((e) => e.type === "file").sort((a, b) => a.name.localeCompare(b.name));
  const sortedEntries = [...dirs, ...files];

  const handleNavigateInto = (entry: VFSEntry) => {
    if (entry.type === "directory") {
      navigateTo([...currentPath, entry.id]);
    } else {
      selectEntry(entry);
    }
  };

  const handleNavigateUp = () => {
    navigateTo(currentPath.slice(0, -1));
    selectEntry(null);
  };

  const handleMkdir = () => {
    if (!newDirName.trim()) return;
    createDir(newDirName.trim());
    setNewDirName("");
    setShowMkdir(false);
  };

  // Build breadcrumb
  const breadcrumb: { label: string; path: string[] }[] = [{ label: "/", path: [] }];
  for (let i = 0; i < currentPath.length; i++) {
    const entry = entries.find((e) => e.id === currentPath[i]);
    breadcrumb.push({ label: entry?.name || "?", path: currentPath.slice(0, i + 1) });
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen className="text-craftec-500" /> CraftVFS
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowMkdir(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm">
            <FolderPlus size={16} /> New Folder
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm">
            <Upload size={16} /> Upload
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={File} label="Total Files" value={String(stats.totalFiles)} sub={`${stats.totalDirs} directories`} />
        <StatCard icon={HardDrive} label="Total Size" value={formatBytes(stats.totalSize)} sub="across all files" />
        <StatCard icon={Database} label="CraftSQL DB" value={formatBytes(stats.dbSize)} sub="metadata store" color="text-purple-500" />
        <StatCard icon={FolderOpen} label="Current Dir" value={breadcrumb[breadcrumb.length - 1].label} sub={`${sortedEntries.length} items`} />
      </div>

      <div className="flex gap-4">
        {/* File Browser */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
            {currentPath.length > 0 && (
              <button onClick={handleNavigateUp} className="p-1 hover:bg-gray-200 rounded transition-colors mr-1">
                <ArrowLeft size={14} className="text-gray-500" />
              </button>
            )}
            {breadcrumb.map((b, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
                <button
                  onClick={() => navigateTo(b.path)}
                  className={`text-sm px-1.5 py-0.5 rounded hover:bg-gray-200 transition-colors ${
                    i === breadcrumb.length - 1 ? "font-medium text-gray-900" : "text-gray-500"
                  }`}
                >
                  {b.label}
                </button>
              </div>
            ))}
          </div>

          {/* File List */}
          <div className="divide-y divide-gray-100">
            {sortedEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <FolderOpen size={32} className="mb-2 opacity-50" />
                <p className="text-sm">Empty directory</p>
              </div>
            ) : (
              sortedEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleNavigateInto(entry)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left ${
                    selectedEntry?.id === entry.id ? "bg-craftec-50" : ""
                  }`}
                >
                  {entry.type === "directory" ? (
                    <FolderOpen size={18} className="text-amber-500 shrink-0" />
                  ) : (
                    <FileText size={18} className="text-gray-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
                    <p className="text-xs text-gray-400">
                      {entry.type === "file" ? formatBytes(entry.size) : `${entries.filter((e) => e.parentId === entry.id).length} items`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">{entry.permissions}</span>
                  {entry.type === "directory" && <ChevronRight size={14} className="text-gray-300" />}
                </button>
              ))
            )}
          </div>
        </div>

        {/* File Detail Panel */}
        <div className="w-72 bg-white rounded-xl shadow-sm border border-gray-200 p-4 shrink-0">
          {selectedEntry ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                {selectedEntry.type === "directory" ? (
                  <FolderOpen size={24} className="text-amber-500" />
                ) : (
                  <FileText size={24} className="text-gray-400" />
                )}
                <h3 className="font-semibold text-gray-900 truncate">{selectedEntry.name}</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-gray-400">Type</span>
                  <p className="text-sm text-gray-700">{selectedEntry.type === "directory" ? "Directory" : "File"}</p>
                </div>
                {selectedEntry.type === "file" && (
                  <div>
                    <span className="text-xs text-gray-400">Size</span>
                    <p className="text-sm text-gray-700">{formatBytes(selectedEntry.size)}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-gray-400">CID</span>
                  <p className="text-sm font-mono text-gray-500">{shortenCid(selectedEntry.cid)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Permissions</span>
                  <p className="text-sm font-mono text-gray-700">{selectedEntry.permissions}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Created</span>
                  <p className="text-sm text-gray-700">{new Date(selectedEntry.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Modified</span>
                  <p className="text-sm text-gray-700">{new Date(selectedEntry.modifiedAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                {selectedEntry.type === "file" && (
                  <button className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-xs">
                    <Download size={14} /> Download
                  </button>
                )}
                <button
                  onClick={() => deleteEntry(selectedEntry.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-xs"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <File size={28} className="mb-2 opacity-50" />
              <p className="text-sm">Select a file to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Mkdir Modal */}
      <Modal open={showMkdir} onClose={() => setShowMkdir(false)} title="Create Directory">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Directory Name</label>
            <input type="text" value={newDirName} onChange={(e) => setNewDirName(e.target.value)} placeholder="my-folder"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
          </div>
          <button onClick={handleMkdir} disabled={!newDirName.trim()}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors">
            Create
          </button>
        </div>
      </Modal>
    </div>
  );
}
