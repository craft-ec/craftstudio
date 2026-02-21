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
    <nav className="w-56 bg-theme-card border-r border-theme-border flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="flex items-center gap-2 px-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-craftec-500 flex items-center justify-center text-white font-bold text-sm">CS</div>
        <span className="font-semibold text-theme-text">CraftStudio</span>
      </div>
      {navItems.map(({ page, icon: Icon, label }) => (
        <button
          key={page}
          onClick={() => onNavigate(page)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${activePage === page
              ? "bg-craftec-500/10 text-craftec-400 border border-craftec-500/20 shadow-sm"
              : "text-theme-muted hover:bg-theme-border/50 hover:text-theme-text border border-transparent"
            }`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </nav>
  );
}
