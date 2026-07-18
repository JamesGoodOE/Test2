import { getRepository } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";

export default async function AuditPage() {
  const { tenantId } = await requireSession();
  const repo = getRepository();
  const entries = await repo.listAudit(tenantId, { limit: 200 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-slate-500">
          Append-only record of every change — the product&apos;s auditability guarantee.
        </p>
      </div>

      <div className="card overflow-x-auto">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap py-2 pr-4 text-xs text-slate-500">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">{e.actor}</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs text-brand-700">{e.action}</code>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{e.entity}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500">
                    {e.diff_json ? (
                      <code>{JSON.stringify(e.diff_json)}</code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
