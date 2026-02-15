import { Shield, Database, User, Globe, Wallet, Settings, LayoutDashboard } from "lucide-react";
import type { Page } from "../App";

interface Props {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; icon: typeof Shield; label: string }[] = [
  { page: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { page: "tunnel", icon: Shield, label: "TunnelCraft" },
  { page: "data", icon: Database, label: "DataCraft" },
  { page: "identity", icon: User, label: "Identity" },
  { page: "network", icon: Globe, label: "Network" },
  { page: "wallet", icon: Wallet, label: "Wallet" },
  { page: "settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({ activePage, onNavigate }: Props) {
  return (
    <nav className="w-16 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4 gap-2">
      <div className="text-craftec-500 font-bold text-lg mb-4">CS</div>
      {navItems.map(({ page, icon: Icon, label }) => (
        <button
          key={page}
          onClick={() => onNavigate(page)}
          title={label}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            activePage === page
              ? "bg-craftec-600 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          }`}
        >
          <Icon size={20} />
        </button>
      ))}
    </nav>
  );
}
