import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { buildRegisterWorkbook } from "@/lib/exports/register-xlsx";

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { tenantId, user } = session;
  const repo = getRepository();

  const [tenant, systems, vendors] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listSystems(tenantId),
    repo.listVendors(tenantId),
  ]);
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

  const buffer = await buildRegisterWorkbook({
    tenantName: tenant?.name ?? "Tenant",
    generatedAt: new Date().toISOString(),
    systems: systems.map((s) => ({
      ...s,
      vendorName: s.vendor_id ? vendorName.get(s.vendor_id) : undefined,
    })),
    vendors,
  });

  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "EXPORT",
    entity: "register",
    entity_id: tenantId,
    diff_json: { format: "xlsx", systems: systems.length },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ai-register.xlsx"`,
    },
  });
}
