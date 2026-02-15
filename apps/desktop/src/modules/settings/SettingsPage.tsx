import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Settings,
  Globe,
  Key,
  Database,
  Shield,
  Monitor,
  RotateCcw,
  Save,
  Check,
  Loader2,
} from 'lucide-react';
import { useConfigStore } from '../../store/configStore';
import { CraftStudioConfig } from '../../types/config';

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

/* ─── Main component ─── */
export default function SettingsPage() {
  const { config, loaded, saving, load, reset } = useConfigStore();
  const updateStore = useConfigStore((s) => s.update);

  // Local draft state so we can batch changes and save
  const [draft, setDraft] = useState<CraftStudioConfig>(config);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    setDraft(config);
    setDirty(false);
  }, [config]);

  const patch = (fn: (d: CraftStudioConfig) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    await updateStore(draft);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    await reset();
    setSaved(false);
  };

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
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              dirty
                ? 'bg-craftec-500 hover:bg-craftec-600 text-white'
                : saved
                  ? 'bg-green-600/20 text-green-400'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <Check size={14} />
            ) : (
              <Save size={14} />
            )}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* ── Network / Solana ── */}
        <Section icon={Globe} title="Network">
          <Select
            label="Solana Cluster"
            value={draft.solana.cluster}
            onChange={(v) =>
              patch((d) => {
                d.solana.cluster = v as CraftStudioConfig['solana']['cluster'];
              })
            }
            options={[
              { value: 'devnet', label: 'Devnet' },
              { value: 'mainnet-beta', label: 'Mainnet Beta' },
              { value: 'custom', label: 'Custom RPC' },
            ]}
          />
          {draft.solana.cluster === 'custom' && (
            <Input
              label="Custom RPC URL"
              value={draft.solana.customRpcUrl ?? ''}
              onChange={(v) => patch((d) => { d.solana.customRpcUrl = v || undefined; })}
              placeholder="https://my-rpc.example.com"
              mono
            />
          )}
          <Input
            label="USDC Mint Override (optional)"
            value={draft.solana.usdcMintOverride ?? ''}
            onChange={(v) => patch((d) => { d.solana.usdcMintOverride = v || undefined; })}
            placeholder="Leave empty for default"
            mono
          />
        </Section>

        {/* ── Identity ── */}
        <Section icon={Key} title="Identity">
          <Input
            label="Keypair Path"
            value={draft.identity.keypairPath}
            onChange={(v) => patch((d) => { d.identity.keypairPath = v; })}
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

        {/* ── DataCraft Daemon ── */}
        <Section icon={Database} title="DataCraft">
          <Input
            label="Daemon URL"
            value={draft.daemons.datacraft.url}
            onChange={(v) => patch((d) => { d.daemons.datacraft.url = v; })}
            placeholder="ws://127.0.0.1:9091"
            mono
          />
          <Toggle
            label="Auto-connect on startup"
            checked={draft.daemons.datacraft.autoConnect}
            onChange={(v) => patch((d) => { d.daemons.datacraft.autoConnect = v; })}
          />
          <Input
            label="Storage Path"
            value={draft.node.storagePath}
            onChange={(v) => patch((d) => { d.node.storagePath = v; })}
            mono
          />
          <Slider
            label="Max Storage"
            value={draft.node.maxStorageGB}
            onChange={(v) => patch((d) => { d.node.maxStorageGB = v; })}
            min={1}
            max={500}
            step={1}
            unit="GB"
          />
        </Section>

        {/* ── TunnelCraft Daemon ── */}
        <Section icon={Shield} title="TunnelCraft">
          <Input
            label="Daemon URL"
            value={draft.daemons.tunnelcraft.url}
            onChange={(v) => patch((d) => { d.daemons.tunnelcraft.url = v; })}
            placeholder="ws://127.0.0.1:9092"
            mono
          />
          <Toggle
            label="Auto-connect on startup"
            checked={draft.daemons.tunnelcraft.autoConnect}
            onChange={(v) => patch((d) => { d.daemons.tunnelcraft.autoConnect = v; })}
          />
        </Section>

        {/* ── Node ── */}
        <Section icon={Monitor} title="Node">
          <div className="space-y-2">
            <span className="text-sm text-gray-400">Capabilities</span>
            <Toggle
              label="Client"
              checked={draft.node.capabilities.client}
              onChange={(v) => patch((d) => { d.node.capabilities.client = v; })}
            />
            <Toggle
              label="Storage Node"
              checked={draft.node.capabilities.storage}
              onChange={(v) => patch((d) => { d.node.capabilities.storage = v; })}
            />
            <Toggle
              label="Aggregator"
              checked={draft.node.capabilities.aggregator}
              onChange={(v) => patch((d) => { d.node.capabilities.aggregator = v; })}
            />
          </div>
          <Input
            label="Listen Port"
            value={String(draft.node.port)}
            onChange={(v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n > 0 && n < 65536) patch((d) => { d.node.port = n; });
            }}
            type="number"
          />
          <Input
            label="Bandwidth Limit (Mbps, optional)"
            value={draft.node.bandwidthLimitMbps != null ? String(draft.node.bandwidthLimitMbps) : ''}
            onChange={(v) => {
              const n = parseInt(v, 10);
              patch((d) => { d.node.bandwidthLimitMbps = isNaN(n) ? undefined : n; });
            }}
            placeholder="Unlimited"
            type="number"
          />
        </Section>

        {/* ── UI ── */}
        <Section icon={Monitor} title="Interface">
          <Select
            label="Theme"
            value={draft.ui.theme}
            onChange={(v) => patch((d) => { d.ui.theme = v as CraftStudioConfig['ui']['theme']; })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
          <Toggle
            label="Notifications"
            checked={draft.ui.notifications}
            onChange={(v) => patch((d) => { d.ui.notifications = v; })}
          />
          <Toggle
            label="Start Minimized"
            checked={draft.ui.startMinimized}
            onChange={(v) => patch((d) => { d.ui.startMinimized = v; })}
          />
          <Toggle
            label="Launch on Startup"
            checked={draft.ui.launchOnStartup}
            onChange={(v) => patch((d) => { d.ui.launchOnStartup = v; })}
          />
        </Section>
      </div>
    </div>
  );
}
