import { useState } from "react";

export interface TabDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface Props {
  tabs: TabDef[];
  defaultTab?: string;
  children: (activeTab: string) => React.ReactNode;
}

export default function Tabs({ tabs, defaultTab, children }: Props) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.key || "");

  if (tabs.length === 0) return null;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab.key
                ? "border-craftec-500 text-craftec-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {children(active)}
    </div>
  );
}
