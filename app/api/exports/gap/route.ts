import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { buildSystemGapReport } from "@/lib/gap";
import { gapReportHtml } from "@/lib/exports/assessment";
import { htmlToPdf } from "@/lib/exports/pdf";

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { tenantId, user } = session;
  const repo = getRepository();

  const [tenant, systems] = await Promise.all([
    repo.getTenant(tenantId),
    repo.listSystems(tenantId),
  ]);

  const reports = await Promise.all(
    systems.map(async (s) => buildSystemGapReport(s, await repo.listControls(tenantId, s.id))),
  );

  const html = gapReportHtml({
    tenantName: tenant?.name ?? "Tenant",
    generatedAt: new Date().toISOString(),
    reports,
  });

  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "EXPORT",
    entity: "gap_report",
    entity_id: tenantId,
    diff_json: { systems: systems.length },
  });

  const pdf = await htmlToPdf(html);
  if (pdf) {
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="gap-report.pdf"`,
      },
    });
  }
  // Fallback: serve the print-ready HTML if Chromium is unavailable.
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
