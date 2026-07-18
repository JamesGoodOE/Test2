import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { classify } from "@/lib/classifier/engine";
import { decorateControls } from "@/lib/controls";
import { buildSystemGapReport } from "@/lib/gap";
import { assessmentHtml } from "@/lib/exports/assessment";
import { htmlToPdf } from "@/lib/exports/pdf";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { tenantId, user } = session;
  const repo = getRepository();

  const system = await repo.getSystem(tenantId, id);
  if (!system) return new NextResponse("Not found", { status: 404 });
  if (!system.risk_tier || !system.classified_at) {
    return new NextResponse("System is not yet classified", { status: 409 });
  }

  const [tenant, answers, controlRows, vendors] = await Promise.all([
    repo.getTenant(tenantId),
    repo.getAnswers(tenantId, id),
    repo.listControls(tenantId, id),
    repo.listVendors(tenantId),
  ]);

  const html = assessmentHtml({
    tenantName: tenant?.name ?? "Tenant",
    generatedAt: new Date().toISOString(),
    system,
    vendorName: system.vendor_id ? vendors.find((v) => v.id === system.vendor_id)?.name : undefined,
    answers,
    classification: classify(answers),
    controls: decorateControls(controlRows),
    gap: buildSystemGapReport(system, controlRows),
  });

  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "EXPORT",
    entity: "risk_assessment",
    entity_id: id,
    diff_json: { format: "pdf" },
  });

  const pdf = await htmlToPdf(html);
  if (pdf) {
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="risk-assessment-${id}.pdf"`,
      },
    });
  }
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
