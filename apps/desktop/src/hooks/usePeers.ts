import { useState, useEffect, useRef } from "react";
import { daemon } from "../services/daemon";
import { useDaemonStore } from "../store/daemonStore";

export interface PeerInfo {
  capabilities: string[];
  last_seen: number;
}

export interface PeerStats {
  total: number;
  storage: number;
  client: number;
  aggregator: number;
  peers: Record<string, PeerInfo>;
}

export function usePeers(refreshMs = 30_000): PeerStats {
  const { connected } = useDaemonStore();
  const [stats, setStats] = useState<PeerStats>({
    total: 0, storage: 0, client: 0, aggregator: 0, peers: {},
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!connected) {
      setStats({ total: 0, storage: 0, client: 0, aggregator: 0, peers: {} });
      return;
    }

    const load = async () => {
      try {
        const peers = await daemon.listPeers();
        const entries = Object.values(peers || {});
        setStats({
          total: entries.length,
          storage: entries.filter((p) => p.capabilities.includes("Storage")).length,
          client: entries.filter((p) => p.capabilities.includes("Client")).length,
          aggregator: entries.filter((p) => p.capabilities.includes("Aggregator")).length,
          peers: peers || {},
        });
      } catch {
        /* daemon may be temporarily unavailable */
      }
    };

    load();
    intervalRef.current = setInterval(load, refreshMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [connected, refreshMs]);

  return stats;
}
