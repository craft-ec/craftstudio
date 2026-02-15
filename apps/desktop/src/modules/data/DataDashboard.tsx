import { Database, MonitorSmartphone, HardDrive, Layers } from "lucide-react";
import { useActiveInstance } from "../../hooks/useActiveInstance";
import DaemonOffline from "../../components/DaemonOffline";
import Tabs, { TabDef } from "../../components/Tabs";
import DataCraftActivity from "../../components/DataCraftActivity";
import ClientTab from "./tabs/ClientTab";
import StorageTab from "./tabs/StorageTab";
import AggregatorTab from "./tabs/AggregatorTab";

export default function DataDashboard() {
  const instance = useActiveInstance();
  const caps = instance?.capabilities ?? [];

  const tabs: TabDef[] = [
    { key: "client", label: "Client", icon: <MonitorSmartphone size={16} /> },
    ...(caps.includes('storage') ? [{ key: "storage", label: "Storage", icon: <HardDrive size={16} /> }] : []),
    ...(caps.includes('aggregator') ? [{ key: "aggregator", label: "Aggregator", icon: <Layers size={16} /> }] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <DaemonOffline />

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Database className="text-craftec-500" /> DataCraft
      </h1>

      <Tabs tabs={tabs} defaultTab="client">
        {(active) => {
          switch (active) {
            case "client": return <ClientTab />;
            case "storage": return <StorageTab />;
            case "aggregator": return <AggregatorTab />;
            default: return null;
          }
        }}
      </Tabs>

      <DataCraftActivity />
    </div>
  );
}
