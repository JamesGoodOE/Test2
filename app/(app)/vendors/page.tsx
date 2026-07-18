import Link from "next/link";
import { getRepository } from "@/lib/db";
import { requireSession, hasRole } from "@/lib/auth/session";
import { createVendorAction } from "@/lib/actions";

export default async function VendorsPage() {
  const { tenantId, user } = await requireSession();
  const repo = getRepository();
  const vendors = await repo.listVendors(tenantId);
  const canEdit = hasRole(user.role, "CONTRIBUTOR");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Vendors</h1>

      <div className="card overflow-x-auto">
        {vendors.length === 0 ? (
          <p className="text-sm text-slate-500">No vendors yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Website</th>
                <th className="py-2 pr-4">DD status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/vendors/${v.id}`} className="font-medium text-brand-700">
                      {v.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{v.website || "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{v.dd_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canEdit && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Add a vendor</h2>
          <form action={createVendorAction} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input name="name" required className="input" placeholder="e.g. Acme AI Ltd" />
            </div>
            <div>
              <label className="label">Website</label>
              <input name="website" className="input" placeholder="https://" />
            </div>
            <div className="md:col-span-2">
              <button className="btn" type="submit">
                Add vendor
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
