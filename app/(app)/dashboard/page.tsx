import Link from "next/link";
import { getRepository } from "@/lib/db";
import { requireSession, hasRole } from "@/lib/auth/session";
import { createSystemAction } from "@/lib/actions";
import { buildSystemGapReport } from "@/lib/gap";
import { TierBadge } from "@/components/tier";
import type { RiskTier } from "@/lib/domain/types";

export default async function DashboardPage() {
  const { tenantId, user } = await requireSession();
  const repo = getRepository();
  const [systems, vendors] = await Promise.all([
    repo.listSystems(tenantId),
    repo.listVendors(tenantId),
  ]);
  const canEdit = hasRole(user.role, "CONTRIBUTOR");

  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

  // KPIs
  const byTier: Record<string, number> = { PROHIBITED: 0, HIGH: 0, LIMITED: 0, MINIMAL: 0 };
  for (const s of systems) {
    if (s.risk_tier) byTier[s.risk_tier] += 1;
  }
  // Fetch controls for all systems in parallel, then sum open gaps.
  const controlsPerSystem = await Promise.all(
    systems.map((s) => repo.listControls(tenantId, s.id)),
  );
  const openGaps = systems.reduce(
    (sum, s, i) => sum + buildSystemGapReport(s, controlsPerSystem[i]).open_gaps.length,
    0,
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI System Register</h1>
          <p className="text-sm text-slate-500">
            {systems.length} systems · {vendors.length} vendors
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn-secondary" href="/api/exports/register">
            Export register (xlsx)
          </a>
          <a className="btn-secondary" href="/api/exports/gap" target="_blank">
            Gap report (PDF)
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label="Prohibited" value={byTier.PROHIBITED} tone="#b91c1c" />
        <Kpi label="High-risk" value={byTier.HIGH} tone="#c2410c" />
        <Kpi label="Limited" value={byTier.LIMITED} tone="#a16207" />
        <Kpi label="Minimal" value={byTier.MINIMAL} tone="#15803d" />
        <Kpi label="Open gaps" value={openGaps} tone="#1f47c2" />
      </div>

      <div className="card overflow-x-auto">
        {systems.length === 0 ? (
          <p className="text-sm text-slate-500">
            No AI systems yet. Add one below to start classifying.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Tier</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/systems/${s.id}`} className="font-medium text-brand-700">
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {s.vendor_id ? vendorName.get(s.vendor_id) ?? "—" : "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{s.owner || "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.status}</td>
                  <td className="py-2 pr-4">
                    <TierBadge tier={s.risk_tier as RiskTier | null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canEdit && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Add an AI system</h2>
          <form action={createSystemAction} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input name="name" required className="input" placeholder="e.g. Support chatbot" />
            </div>
            <div>
              <label className="label">Business owner</label>
              <input name="owner" className="input" placeholder="e.g. Head of CX" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Purpose</label>
              <input name="purpose" className="input" placeholder="What the system does" />
            </div>
            <div>
              <label className="label">Deployment status</label>
              <select name="status" className="select" defaultValue="PLANNED">
                {["PLANNED", "IN_DEVELOPMENT", "PILOT", "PRODUCTION", "RETIRED"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Vendor</label>
              <select name="vendor_id" className="select" defaultValue="">
                <option value="">— none —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Data categories (comma-separated)</label>
              <input name="data_categories" className="input" placeholder="e.g. HR data, CVs" />
            </div>
            <div className="md:col-span-2">
              <button className="btn" type="submit">
                Add system
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card">
      <div className="text-3xl font-bold" style={{ color: tone }}>
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
