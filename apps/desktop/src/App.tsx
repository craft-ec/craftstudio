import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import TunnelDashboard from "./modules/tunnel/TunnelDashboard";
import DataDashboard from "./modules/data/DataDashboard";
import WalletPage from "./modules/wallet/WalletPage";
import IdentityPage from "./modules/identity/IdentityPage";
import NodePage from "./modules/node/NodePage";
import SettingsPage from "./modules/settings/SettingsPage";
import { useConfigStore } from "./store/configStore";
import { useIdentityStore } from "./store/identityStore";
import { useWalletStore } from "./store/walletStore";
import { daemon } from "./services/daemon";
import { invoke } from "@tauri-apps/api/core";

export type Page = "tunnel" | "data" | "identity" | "node" | "wallet" | "settings";

function App() {
  const [page, setPage] = useState<Page>("tunnel");
  const loadConfig = useConfigStore((s) => s.load);
  const configLoaded = useConfigStore((s) => s.loaded);

  // Bootstrap: load config → init daemon → load identity
  useEffect(() => {
    (async () => {
      await loadConfig();
      daemon.init();

      // Load identity from Tauri backend
      try {
        const identity = await invoke<{ did: string }>("get_identity");
        useIdentityStore.getState().setDid(identity.did);
        useWalletStore.getState().setAddress(identity.did);
      } catch (e) {
        console.warn("[identity] Failed to load:", e);
      }
    })();
  }, [loadConfig]);

  const renderPage = () => {
    switch (page) {
      case "tunnel": return <TunnelDashboard />;
      case "data": return <DataDashboard />;
      case "wallet": return <WalletPage />;
      case "identity": return <IdentityPage />;
      case "node": return <NodePage />;
      case "settings": return <SettingsPage />;
    }
  };

  if (!configLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </div>
        <StatusBar />
      </main>
    </div>
  );
}

export default App;
