import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export default function StatCard({ icon: Icon, label, value, sub, color = "text-craftec-400" }: Props) {
  return (
    <div className="glass-panel rounded-xl p-4 glass-panel-hover">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={color} />
        <span className="text-sm text-theme-muted font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-theme-text mt-2">{value}</p>
      {sub && <p className="text-xs text-theme-muted/70 mt-1">{sub}</p>}
    </div>
  );
}
