import { useState, useEffect, useRef } from "react";
import { useDaemon, useActiveConnection } from "./useDaemon";

export interface PeerInfo {
  capabilities: string[];
  score: number;
  avg_latency_ms: number;
  storage_committed_bytes: number;
  storage_used_bytes: number;
}

export interface PeerStats {
  total: number;
  storage: number;
  client: number;
  aggregator: number;
  peers: Record<string, PeerInfo>;
}

export function usePeers(refreshMs = 30_000): PeerStats {
  const { connected } = useActiveConnection();
  const client = useDaemon();
  const [stats, setStats] = useState<PeerStats>({
    total: 0, storage: 0, client: 0, aggregator: 0, peers: {},
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!connected || !client) {
      setStats({ total: 0, storage: 0, client: 0, aggregator: 0, peers: {} });
      return;
    }

    const load = async () => {
      try {
        const peers = await client.listPeers();
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
  }, [connected, client, refreshMs]);

  return stats;
}
