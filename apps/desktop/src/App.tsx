import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import InstanceTabBar from "./components/InstanceTabBar";
import EmptyState from "./components/EmptyState";
import AddInstanceModal from "./components/AddInstanceModal";
import TunnelDashboard from "./modules/tunnel/TunnelDashboard";
import DataDashboard from "./modules/data/DataDashboard";
import WalletPage from "./modules/wallet/WalletPage";
import IdentityPage from "./modules/identity/IdentityPage";
import NetworkPage from "./modules/node/NodePage";
import SettingsPage from "./modules/settings/SettingsPage";
import DashboardPage from "./modules/dashboard/DashboardPage";
import { useConfigStore } from "./store/configStore";
import { useInstanceStore } from "./store/instanceStore";
import { useIdentityStore } from "./store/identityStore";
import { useWalletStore } from "./store/walletStore";
import { invoke } from "@tauri-apps/api/core";

export type Page = "dashboard" | "tunnel" | "data" | "identity" | "network" | "wallet" | "settings";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [showAddModal, setShowAddModal] = useState(false);
  const loadConfig = useConfigStore((s) => s.load);
  const configLoaded = useConfigStore((s) => s.loaded);
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);

  useEffect(() => {
    (async () => {
      await loadConfig();
      try {
        const identity = await invoke<{ did: string }>("get_identity");
        useIdentityStore.getState().setDid(identity.did);
        useWalletStore.getState().setAddress(identity.did);
      } catch (e) {
        console.warn("[identity] Failed to load:", e);
      }
    })();
  }, [loadConfig]);

  if (!configLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">
        Loading...
      </div>
    );
  }

  // No instances → show empty state
  if (instances.length === 0 || activeId === null) {
    return (
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
        <InstanceTabBar onAddInstance={() => setShowAddModal(true)} />
        <EmptyState />
        <AddInstanceModal open={showAddModal} onClose={() => setShowAddModal(false)} />
      </div>
    );
  }

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardPage />;
      case "tunnel": return <TunnelDashboard />;
      case "data": return <DataDashboard />;
      case "wallet": return <WalletPage />;
      case "identity": return <IdentityPage />;
      case "network": return <NetworkPage />;
      case "settings": return <SettingsPage />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <InstanceTabBar onAddInstance={() => setShowAddModal(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activePage={page} onNavigate={setPage} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            {renderPage()}
          </div>
          <StatusBar />
        </main>
      </div>
      <AddInstanceModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}

export default App;
