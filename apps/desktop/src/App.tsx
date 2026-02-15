import { useState } from "react";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import TunnelDashboard from "./modules/tunnel/TunnelDashboard";
import DataDashboard from "./modules/data/DataDashboard";
import WalletPage from "./modules/wallet/WalletPage";
import IdentityPage from "./modules/identity/IdentityPage";
import NodePage from "./modules/node/NodePage";
import SettingsPage from "./modules/settings/SettingsPage";

export type Page = "tunnel" | "data" | "identity" | "node" | "wallet" | "settings";

function App() {
  const [page, setPage] = useState<Page>("tunnel");

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
