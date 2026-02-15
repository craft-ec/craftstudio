import React, { useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { useConfigStore } from '../../store/configStore';
import { useInstanceStore } from '../../store/instanceStore';
import { useActiveInstance } from '../../hooks/useActiveInstance';
import { getClient } from '../../services/daemon';
import { CraftStudioConfig, InstanceConfig, DaemonConfig } from '../../types/config';

/* ─── tiny helpers ─── */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-sm text-gray-300 group-hover:text-gray-100">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
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
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-craftec-500 focus:ring-1 focus:ring-craftec-500/30 transition-colors ${
          mono ? 'font-mono' : ''
        }`}
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
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-100">
        <Icon className="text-craftec-500" size={20} />
        {title}
      </h2>
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

/* ─── Daemon Config section ─── */
function DaemonConfigSection({ instanceId }: { instanceId: string }) {
  const status = useInstanceStore((s) => s.connectionStatus[instanceId]);
  const [daemonCfg, setDaemonCfg] = React.useState<DaemonConfig | null>(null);
  const [loading, setLoading] = React.useState(false);
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load daemon config when connected
  useEffect(() => {
    if (status !== 'connected') {
      setDaemonCfg(null);
      return;
    }
    const client = getClient(instanceId);
    if (!client) return;
    setLoading(true);
    client.getDaemonConfig()
      .then((cfg) => setDaemonCfg(cfg))
      .catch(() => setDaemonCfg(null))
      .finally(() => setLoading(false));
  }, [instanceId, status]);

  const patchDaemonCfg = useCallback((field: keyof DaemonConfig, value: number) => {
    if (!daemonCfg) return;
    const next = { ...daemonCfg, [field]: value };
    setDaemonCfg(next);
    // Debounced save
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      const client = getClient(instanceId);
      if (client?.connected) {
        client.setDaemonConfig({ [field]: value }).catch(console.error);
      }
    }, 500);
  }, [daemonCfg, instanceId]);

  if (status !== 'connected') return null;

  if (loading) {
    return (
      <Section icon={Timer} title="Daemon Timing">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="animate-spin" size={16} /> Loading daemon config…
        </div>
      </Section>
    );
  }

  if (!daemonCfg) return null;

  return (
    <Section icon={Timer} title="Daemon Timing">
      <Input
        label="Capability Announce Interval (secs)"
        value={String(daemonCfg.capability_announce_interval_secs)}
        onChange={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) patchDaemonCfg('capability_announce_interval_secs', n); }}
        type="number"
      />
      <Input
        label="Re-announce Interval (secs)"
        value={String(daemonCfg.reannounce_interval_secs)}
        onChange={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) patchDaemonCfg('reannounce_interval_secs', n); }}
        type="number"
      />
      <Input
        label="Re-announce Threshold (secs)"
        value={String(daemonCfg.reannounce_threshold_secs)}
        onChange={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) patchDaemonCfg('reannounce_threshold_secs', n); }}
        type="number"
      />
      {daemonCfg.challenger_interval_secs != null && (
        <Input
          label="Challenger Interval (secs)"
          value={String(daemonCfg.challenger_interval_secs)}
          onChange={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) patchDaemonCfg('challenger_interval_secs', n); }}
          type="number"
        />
      )}
    </Section>
  );
}

/* ─── Main component ─── */
export default function SettingsPage() {
  const { config, loaded, load } = useConfigStore();
  const updateStore = useConfigStore((s) => s.update);
  const instance = useActiveInstance();
  const updateInstance = useInstanceStore((s) => s.updateInstance);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Auto-save global settings with debounce
  const patchGlobal = useCallback((fn: (d: CraftStudioConfig) => void) => {
    const next = structuredClone(config);
    fn(next);
    // Debounce the save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateStore(next);
    }, 300);
    // Optimistic update for immediate UI feedback
    updateStore(next);
  }, [config, updateStore]);

  // Instance field updater — persists immediately via instanceStore
  const patchInstance = useCallback((fields: Partial<InstanceConfig>) => {
    if (!instance) return;
    updateInstance(instance.id, fields);
  }, [instance, updateInstance]);

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
        {/* ── Global: Network / Solana ── */}
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
            label="USDC Mint Override (optional)"
            value={config.solana.usdcMintOverride ?? ''}
            onChange={(v) => patchGlobal((d) => { d.solana.usdcMintOverride = v || undefined; })}
            placeholder="Leave empty for default"
            mono
          />
        </Section>

        {/* ── Global: UI ── */}
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

        {/* ── Per-Instance Settings ── */}
        {instance ? (
          <>
            <div className="border-t border-gray-800 pt-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                Instance: {instance.name}
              </p>
            </div>

            <Section icon={Server} title="Instance">
              <Input
                label="Name"
                value={instance.name}
                onChange={(v) => patchInstance({ name: v })}
              />
              <Input
                label="Daemon URL"
                value={instance.url}
                onChange={(v) => patchInstance({ url: v })}
                placeholder="ws://127.0.0.1:9091"
                mono
              />
              <Input
                label="Listen Port"
                value={String(instance.port)}
                onChange={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n > 0 && n < 65536) patchInstance({ port: n });
                }}
                type="number"
              />
              <Toggle
                label="Auto-start on launch"
                checked={instance.autoStart}
                onChange={(v) => patchInstance({ autoStart: v })}
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

            <Section icon={Database} title="Node">
              <div className="space-y-2">
                <span className="text-sm text-gray-400">Capabilities</span>
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
              <Input
                label="Bandwidth Limit (Mbps, optional)"
                value={instance.bandwidthLimitMbps != null ? String(instance.bandwidthLimitMbps) : ''}
                onChange={(v) => {
                  const n = parseInt(v, 10);
                  patchInstance({ bandwidthLimitMbps: isNaN(n) ? undefined : n });
                }}
                placeholder="Unlimited"
                type="number"
              />
            </Section>

            <DaemonConfigSection instanceId={instance.id} />
          </>
        ) : (
          <div className="bg-gray-900 rounded-xl p-5 text-center text-gray-500 text-sm">
            No active instance selected. Create or select an instance to configure per-instance settings.
          </div>
        )}
      </div>
    </div>
  );
}
