import { Plus, X } from "lucide-react";
import { useInstanceStore } from "../store/instanceStore";

interface Props {
  onAddInstance: () => void;
}

export default function InstanceTabBar({ onAddInstance }: Props) {
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const connectionStatus = useInstanceStore((s) => s.connectionStatus);
  const setActive = useInstanceStore((s) => s.setActive);
  const removeInstance = useInstanceStore((s) => s.removeInstance);

  const statusDot = (id: string) => {
    const status = connectionStatus[id] ?? "disconnected";
    if (status === "connected") return "🟢";
    if (status === "connecting") return "🟡";
    return "🔴";
  };

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-2 gap-1 shrink-0" data-tauri-drag-region>
      {instances.map((inst) => (
        <button
          key={inst.id}
          onClick={() => setActive(inst.id)}
          className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-sm transition-colors max-w-[200px] ${
            activeId === inst.id
              ? "bg-gray-950 text-white border-t border-x border-gray-700"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          }`}
        >
          <span className="text-xs">{statusDot(inst.id)}</span>
          <span className="truncate">{inst.name}</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              removeInstance(inst.id);
            }}
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
          >
            <X size={12} />
          </span>
        </button>
      ))}
      <button
        onClick={onAddInstance}
        className="flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
        title="New instance"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
