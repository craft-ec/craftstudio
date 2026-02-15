import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Settings,
  Globe,
  Monitor,
  Loader2,
  Server,
  Key,
  Database,
  Timer,
  Activity,
  RotateCcw,
} from 'lucide-react';
import { useConfigStore } from '../../store/configStore';
import { useInstanceStore } from '../../store/instanceStore';
import { useActiveInstance } from '../../hooks/useActiveInstance';
import { getClient } from '../../services/daemon';
import { readDaemonConfig, writeDaemonConfig } from '../../services/config';
import { CraftStudioConfig, InstanceConfig, DaemonConfig } from '../../types/config';

/* ─── tiny helpers ─── */
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div>
        <span className="text-sm text-gray-300 group-hover:text-gray-100">{label}</span>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-craftec-500' : 'bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  );
}

function Input({
  value,
  onChange,
  label,
  placeholder,
  mono,
  type = 'text',
  hint,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400 mb-1 block">{label}</span>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-craftec-500 focus:ring-1 focus:ring-craftec-500/30 transition-colors ${
          mono ? 'font-mono' : ''
        } ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
      />
    </label>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400 mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-craftec-500 focus:ring-1 focus:ring-craftec-500/30 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  onReset,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-100">
          <Icon className="text-craftec-500" size={20} />
          {title}
        </h2>
        {onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Slider({
  value,
  onChange,
  label,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between mb-1">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-sm text-gray-300 font-mono">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-craftec-500"
      />
    </label>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
      connected ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-600'}`} />
      {connected ? 'Live' : 'From file'}
    </span>
  );
}

/* ─── Main component ─── */
export default function SettingsPage() {
  const { config, loaded, load } = useConfigStore();
  const updateStore = useConfigStore((s) => s.update);
  const instance = useActiveInstance();
  const updateInstance = useInstanceStore((s) => s.updateInstance);
  const connectionStatus = useInstanceStore((s) => instance ? s.connectionStatus[instance.id] : undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Daemon config state — loaded from file or live daemon
  const [daemonCfg, setDaemonCfg] = useState<DaemonConfig | null>(null);
  const [daemonCfgLoading, setDaemonCfgLoading] = useState(false);
  const daemonSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConnected = connectionStatus === 'connected';

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Load daemon config — from WS when connected, from file when disconnected
  useEffect(() => {
    if (!instance?.dataDir) {
      setDaemonCfg(null);
      return;
    }
    setDaemonCfgLoading(true);

    if (isConnected) {
      const client = getClient(instance.id);
      if (client) {
        client.getDaemonConfig()
          .then((cfg) => setDaemonCfg(cfg))
          .catch(() => {
            // Fallback to file
            readDaemonConfig(instance.dataDir).then(setDaemonCfg).catch(() => setDaemonCfg(null));
          })
          .finally(() => setDaemonCfgLoading(false));
        return;
      }
    }

    // Read from file
    readDaemonConfig(instance.dataDir)
      .then(setDaemonCfg)
      .catch(() => setDaemonCfg(null))
      .finally(() => setDaemonCfgLoading(false));
  }, [instance?.id, instance?.dataDir, isConnected]);

  // Patch daemon config — write to file AND push via WS if connected
  const patchDaemonCfg = useCallback((field: keyof DaemonConfig, value: unknown) => {
    if (!daemonCfg || !instance?.dataDir) return;
    const next = { ...daemonCfg, [field]: value };
    setDaemonCfg(next);

    if (daemonSaveRef.current) clearTimeout(daemonSaveRef.current);
    daemonSaveRef.current = setTimeout(() => {
      // Always write to file
      writeDaemonConfig(instance.dataDir, next).catch(console.error);
      // Push via WS if connected
      const client = getClient(instance.id);
      if (client?.connected) {
        client.setDaemonConfig({ [field]: value } as Partial<DaemonConfig>).catch(console.error);
      }
    }, 500);
  }, [daemonCfg, instance?.id, instance?.dataDir]);

  // Auto-save global settings with debounce
  const patchGlobal = useCallback((fn: (d: CraftStudioConfig) => void) => {
    const next = structuredClone(config);
    fn(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateStore(next);
    }, 300);
    updateStore(next);
  }, [config, updateStore]);

  const patchInstance = useCallback((fields: Partial<InstanceConfig>) => {
    if (!instance) return;
    updateInstance(instance.id, fields);
  }, [instance, updateInstance]);

  const resetDaemonTimingDefaults = useCallback(() => {
    if (!daemonCfg || !instance?.dataDir) return;
    const defaults = {
      capability_announce_interval_secs: 300,
      reannounce_interval_secs: 600,
      reannounce_threshold_secs: 1200,
      challenger_interval_secs: null as number | null,
    };
    const next = { ...daemonCfg, ...defaults };
    setDaemonCfg(next);
    writeDaemonConfig(instance.dataDir, next).catch(console.error);
    const client = getClient(instance.id);
    if (client?.connected) {
      client.setDaemonConfig(defaults as unknown as Partial<DaemonConfig>).catch(console.error);
    }
  }, [daemonCfg, instance?.id, instance?.dataDir]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-craftec-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="text-craftec-500" /> Settings
        </h1>
        <span className="text-xs text-gray-500">Auto-saved</span>
      </div>

      <div className="space-y-4">
        {/* ── Per-Instance: Connection ── */}
        {instance ? (
          <>
            <div className="border-b border-gray-800 pb-2 mb-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Instance: <span className="text-gray-300">{instance.name}</span>
              </p>
            </div>

            <Section icon={Globe} title="Connection">
              <Input
                label="Instance Name"
                value={instance.name}
                onChange={(v) => patchInstance({ name: v })}
              />
              <Input
                label="Daemon URL"
                value={instance.url}
                onChange={(v) => patchInstance({ url: v })}
                placeholder="ws://127.0.0.1:9091"
                mono
                hint="WebSocket URL for daemon IPC"
              />
              <Input
                label="Listen Port"
                value={String(instance.port)}
                onChange={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n > 0 && n < 65536) patchInstance({ port: n });
                }}
                type="number"
                hint="libp2p listen port for peer connections"
              />
              <Toggle
                label="Auto-start on launch"
                checked={instance.autoStart}
                onChange={(v) => patchInstance({ autoStart: v })}
                hint="Start daemon automatically when CraftStudio opens"
              />
            </Section>

            <Section icon={Server} title="Node">
              <div className="space-y-2">
                <span className="text-sm text-gray-400">Capabilities</span>
                <p className="text-xs text-amber-500/80">⚠ Changes require daemon restart</p>
                <Toggle
                  label="Client"
                  checked={instance.capabilities.client}
                  onChange={(v) => patchInstance({ capabilities: { ...instance.capabilities, client: v } })}
                />
                <Toggle
                  label="Storage Node"
                  checked={instance.capabilities.storage}
                  onChange={(v) => patchInstance({ capabilities: { ...instance.capabilities, storage: v } })}
                />
                <Toggle
                  label="Aggregator"
                  checked={instance.capabilities.aggregator}
                  onChange={(v) => patchInstance({ capabilities: { ...instance.capabilities, aggregator: v } })}
                />
              </div>
              <Input
                label="Data Directory"
                value={instance.dataDir}
                onChange={() => {}}
                readOnly
                mono
                hint="Daemon data directory (set when creating instance)"
              />
            </Section>

            <Section icon={Key} title="Identity">
              <Input
                label="Keypair Path"
                value={instance.keypairPath}
                onChange={(v) => patchInstance({ keypairPath: v })}
                mono
              />
              <div className="flex gap-2 pt-1">
                <button className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                  Export Keypair
                </button>
                <button className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                  Import Keypair
                </button>
              </div>
            </Section>

            <Section icon={Database} title="Storage">
              <Input
                label="Storage Path"
                value={instance.storagePath}
                onChange={(v) => patchInstance({ storagePath: v })}
                mono
              />
              <Slider
                label="Max Storage"
                value={instance.maxStorageGB}
                onChange={(v) => patchInstance({ maxStorageGB: v })}
                min={1}
                max={500}
                step={1}
                unit="GB"
              />
              {daemonCfg && (
                <div className="text-xs text-gray-500">
                  Daemon config: {Math.round(daemonCfg.max_storage_bytes / 1e9)} GB max
                </div>
              )}
            </Section>

            <Section icon={Activity} title="Bandwidth">
              <Input
                label="Bandwidth Limit (Mbps)"
                value={instance.bandwidthLimitMbps != null ? String(instance.bandwidthLimitMbps) : ''}
                onChange={(v) => {
                  const n = parseInt(v, 10);
                  patchInstance({ bandwidthLimitMbps: isNaN(n) ? undefined : n });
                }}
                placeholder="Unlimited"
                type="number"
                hint="0 or empty = unlimited"
              />
            </Section>

            {/* ── Protocol / Daemon Timing — always visible ── */}
            <Section
              icon={Timer}
              title="Protocol"
              onReset={daemonCfg ? resetDaemonTimingDefaults : undefined}
            >
              {daemonCfgLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="animate-spin" size={16} /> Loading daemon config…
                </div>
              ) : daemonCfg ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-500">
                      Daemon timing parameters — changes are hot-reloaded (no restart needed).
                    </p>
                    <StatusBadge connected={isConnected} />
                  </div>
                  <Input
                    label="Capability Announce Interval (secs)"
                    value={String(daemonCfg.capability_announce_interval_secs)}
                    onChange={(v) => {
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n > 0) patchDaemonCfg('capability_announce_interval_secs', n);
                    }}
                    type="number"
                    hint="How often to announce capabilities to the DHT"
                  />
                  <Input
                    label="Re-announce Interval (secs)"
                    value={String(daemonCfg.reannounce_interval_secs)}
                    onChange={(v) => {
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n > 0) patchDaemonCfg('reannounce_interval_secs', n);
                    }}
                    type="number"
                    hint="How often to check for stale content that needs re-announcing"
                  />
                  <Input
                    label="Re-announce Threshold (secs)"
                    value={String(daemonCfg.reannounce_threshold_secs)}
                    onChange={(v) => {
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n > 0) patchDaemonCfg('reannounce_threshold_secs', n);
                    }}
                    type="number"
                    hint="Content older than this is considered stale and re-announced"
                  />
                  <Input
                    label="Challenger Interval (secs)"
                    value={daemonCfg.challenger_interval_secs != null ? String(daemonCfg.challenger_interval_secs) : ''}
                    onChange={(v) => {
                      if (v === '' || v === '0') {
                        patchDaemonCfg('challenger_interval_secs', null);
                      } else {
                        const n = parseInt(v, 10);
                        if (!isNaN(n) && n > 0) patchDaemonCfg('challenger_interval_secs', n);
                      }
                    }}
                    type="number"
                    placeholder="Disabled"
                    hint="Proof-of-storage challenge interval (empty = disabled)"
                  />
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  No daemon config found. Start the daemon or create an instance with a data directory.
                </p>
              )}
            </Section>
          </>
        ) : (
          <div className="bg-gray-900 rounded-xl p-5 text-center text-gray-500 text-sm">
            No active instance selected. Create or select an instance to configure per-instance settings.
          </div>
        )}

        {/* ── Global: Network / Solana ── */}
        <div className="border-t border-gray-800 pt-4 mt-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Global Settings</p>
        </div>

        <Section icon={Globe} title="Network">
          <Select
            label="Solana Cluster"
            value={config.solana.cluster}
            onChange={(v) =>
              patchGlobal((d) => {
                d.solana.cluster = v as CraftStudioConfig['solana']['cluster'];
              })
            }
            options={[
              { value: 'devnet', label: 'Devnet' },
              { value: 'mainnet-beta', label: 'Mainnet Beta' },
              { value: 'custom', label: 'Custom RPC' },
            ]}
          />
          {config.solana.cluster === 'custom' && (
            <Input
              label="Custom RPC URL"
              value={config.solana.customRpcUrl ?? ''}
              onChange={(v) => patchGlobal((d) => { d.solana.customRpcUrl = v || undefined; })}
              placeholder="https://my-rpc.example.com"
              mono
            />
          )}
          <Input
            label="USDC Mint Override"
            value={config.solana.usdcMintOverride ?? ''}
            onChange={(v) => patchGlobal((d) => { d.solana.usdcMintOverride = v || undefined; })}
            placeholder="Leave empty for default"
            mono
            hint="Override the USDC mint address (advanced)"
          />
        </Section>

        <Section icon={Monitor} title="Interface">
          <Select
            label="Theme"
            value={config.ui.theme}
            onChange={(v) => patchGlobal((d) => { d.ui.theme = v as CraftStudioConfig['ui']['theme']; })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
          <Toggle
            label="Notifications"
            checked={config.ui.notifications}
            onChange={(v) => patchGlobal((d) => { d.ui.notifications = v; })}
          />
          <Toggle
            label="Start Minimized"
            checked={config.ui.startMinimized}
            onChange={(v) => patchGlobal((d) => { d.ui.startMinimized = v; })}
          />
          <Toggle
            label="Launch on Startup"
            checked={config.ui.launchOnStartup}
            onChange={(v) => patchGlobal((d) => { d.ui.launchOnStartup = v; })}
          />
        </Section>
      </div>
    </div>
  );
}
