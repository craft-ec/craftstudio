import { useState } from "react";
import {
  Shield, Users, Key, FileCheck, Plus, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Clock, AlertTriangle,
} from "lucide-react";
import StatCard from "../../components/StatCard";
import Modal from "../../components/Modal";
import { useSecurityStore, type SigningGroup, type Attestation } from "../../store/securityStore";

function shortenCid(cid: string): string {
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 10)}…${cid.slice(-6)}`;
}

function shortenPeer(peer: string): string {
  if (peer.length <= 16) return peer;
  return `${peer.slice(0, 8)}…${peer.slice(-4)}`;
}

function groupStatusBadge(status: SigningGroup["status"]) {
  const map = {
    active: "bg-green-50 text-green-600",
    pending: "bg-amber-50 text-amber-600",
    expired: "bg-gray-100 text-gray-500",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status]}`}>{status}</span>;
}

function attestationStatusBadge(status: Attestation["status"]) {
  const map = {
    pending: { bg: "bg-amber-50 text-amber-600", icon: Clock },
    verified: { bg: "bg-green-50 text-green-600", icon: CheckCircle },
    rejected: { bg: "bg-red-50 text-red-600", icon: XCircle },
    expired: { bg: "bg-gray-100 text-gray-500", icon: AlertTriangle },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg}`}>
      <Icon size={12} /> {status}
    </span>
  );
}

export default function SecurityPage() {
  const { groups, keys, attestations, createGroup } = useSecurityStore();
  const [activeTab, setActiveTab] = useState<"groups" | "keys" | "attestations">("groups");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState("");
  const [newThreshold, setNewThreshold] = useState(2);

  const handleCreate = () => {
    if (!newName.trim() || !newMembers.trim()) return;
    const members = newMembers.split(",").map((m) => m.trim()).filter(Boolean);
    if (members.length < newThreshold) return;
    createGroup(newName.trim(), members, newThreshold);
    setNewName("");
    setNewMembers("");
    setNewThreshold(2);
    setShowCreate(false);
  };

  const tabs = [
    { key: "groups" as const, label: "Groups", icon: Users, count: groups.length },
    { key: "keys" as const, label: "Derived Keys", icon: Key, count: keys.length },
    { key: "attestations" as const, label: "Attestations", icon: FileCheck, count: attestations.length },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="text-craftec-500" /> CraftSEC
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus size={16} /> Create Group
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Signing Groups" value={String(groups.length)} sub={`${groups.filter((g) => g.status === "active").length} active`} />
        <StatCard icon={Key} label="Derived Keys" value={String(keys.length)} sub="program-derived" color="text-purple-500" />
        <StatCard icon={FileCheck} label="Attestations" value={String(attestations.length)} sub={`${attestations.filter((a) => a.status === "verified").length} verified`} color="text-green-600" />
        <StatCard icon={Shield} label="Security Status" value="Healthy" color="text-green-600" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key ? "bg-white text-craftec-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={16} /> {tab.label}
              <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded-full">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        {activeTab === "groups" && (
          <>
            <h3 className="font-semibold text-lg mb-4">Threshold Signing Groups</h3>
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Users size={32} className="mb-2 opacity-50" />
                <p className="text-sm">No signing groups — create one!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => (
                  <div key={group.id} className="border border-gray-200 rounded-lg">
                    <button
                      onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedGroup === group.id ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        <div className="text-left">
                          <p className="font-medium text-gray-900">{group.name}</p>
                          <p className="text-xs text-gray-400">{group.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600 font-mono">{group.threshold}-of-{group.totalMembers}</span>
                        {groupStatusBadge(group.status)}
                      </div>
                    </button>
                    {expandedGroup === group.id && (
                      <div className="px-4 pb-3 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-4 mt-3 mb-3">
                          <div>
                            <span className="text-xs text-gray-400">Created</span>
                            <p className="text-sm">{new Date(group.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400">Threshold</span>
                            <p className="text-sm">{group.threshold} of {group.totalMembers} required</p>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">Members</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {group.members.map((m) => (
                            <span key={m} className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-mono">{shortenPeer(m)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "keys" && (
          <>
            <h3 className="font-semibold text-lg mb-4">Program-Derived Keys (PDK)</h3>
            {keys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Key size={32} className="mb-2 opacity-50" />
                <p className="text-sm">No derived keys yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Program CID</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Public Key</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Derived</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key.programCid} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-mono text-xs">{shortenCid(key.programCid)}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-gray-500">{key.publicKey}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-400">{new Date(key.derivedAt).toLocaleDateString()}</td>
                        <td className="py-2.5 px-3 text-gray-600">{key.usageCount} times</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === "attestations" && (
          <>
            <h3 className="font-semibold text-lg mb-4">Recent Attestations</h3>
            {attestations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <FileCheck size={32} className="mb-2 opacity-50" />
                <p className="text-sm">No attestations yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">ID</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Program</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Group</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Status</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Signers</th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attestations.map((att) => (
                      <tr key={att.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-mono text-xs text-gray-600">{att.id}</td>
                        <td className="py-2.5 px-3 font-mono text-xs">{shortenCid(att.programCid)}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{att.groupId}</td>
                        <td className="py-2.5 px-3">{attestationStatusBadge(att.status)}</td>
                        <td className="py-2.5 px-3 text-gray-600">{att.signers}/{att.requiredSigners}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-400">{new Date(att.requestedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Group Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Signing Group">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Group Name</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Signing Group"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Members (comma-separated peer IDs)</label>
            <textarea value={newMembers} onChange={(e) => setNewMembers(e.target.value)} placeholder="peer-abc123, peer-def456, peer-ghi789"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-craftec-500 h-20 resize-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Threshold (k of n)</label>
            <input type="number" value={newThreshold} onChange={(e) => setNewThreshold(parseInt(e.target.value) || 2)} min={1}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
          </div>
          <button onClick={handleCreate} disabled={!newName.trim() || !newMembers.trim()}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors">
            Create Group
          </button>
        </div>
      </Modal>
    </div>
  );
}
