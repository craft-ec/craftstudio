import { Shield, Database, User, Globe, Wallet, Settings, LayoutDashboard, Cpu, Lock, FolderOpen } from "lucide-react";
import type { Page } from "../App";

interface Props {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; icon: typeof Shield; label: string }[] = [
  { page: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { page: "tunnel", icon: Shield, label: "VPN" },
  { page: "data", icon: Database, label: "Object" },
  { page: "compute", icon: Cpu, label: "Compute" },
  { page: "security", icon: Lock, label: "Security" },
  { page: "filesystem", icon: FolderOpen, label: "Filesystem" },
  { page: "identity", icon: User, label: "Identity" },
  { page: "network", icon: Globe, label: "Network" },
  { page: "wallet", icon: Wallet, label: "Wallet" },
  { page: "settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({ activePage, onNavigate }: Props) {
  return (
    <nav className="w-56 bg-white border-r border-gray-200 flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="flex items-center gap-2 px-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-craftec-500 flex items-center justify-center text-white font-bold text-sm">CS</div>
        <span className="font-semibold text-gray-900">CraftStudio</span>
      </div>
      {navItems.map(({ page, icon: Icon, label }) => (
        <button
          key={page}
          onClick={() => onNavigate(page)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            activePage === page
              ? "bg-craftec-50 text-craftec-600 shadow-sm"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </nav>
  );
}
