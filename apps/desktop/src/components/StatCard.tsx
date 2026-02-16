import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export default function StatCard({ icon: Icon, label, value, sub, color = "text-craftec-500" }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={color} />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
