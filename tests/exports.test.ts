import { describe, it, expect } from "vitest";
import { buildRegisterWorkbook } from "@/lib/exports/register-xlsx";
import { assessmentHtml, gapReportHtml } from "@/lib/exports/assessment";
import { classify } from "@/lib/classifier/engine";
import { decorateControls, controlKeysForTier } from "@/lib/controls";
import { buildSystemGapReport } from "@/lib/gap";
import { baseAnswers } from "./fixtures/systems";
import type { AiSystem, Control } from "@/lib/domain/types";

function highRiskSystem(): AiSystem {
  return {
    id: "s1",
    tenant_id: "t1",
    name: "CV Screener",
    vendor_id: "v1",
    purpose: "Rank job applicants",
    owner: "Head of Talent",
    status: "PRODUCTION",
    data_categories: ["HR data", "CVs"],
    risk_tier: "HIGH",
    classified_at: "2026-01-02T00:00:00.000Z",
    classifier_version: "v1",
  };
}

describe("register xlsx export", () => {
  it("produces a non-trivial xlsx buffer with the right magic bytes", async () => {
    const buf = await buildRegisterWorkbook({
      tenantName: "Acme",
      generatedAt: "2026-07-18T00:00:00.000Z",
      systems: [{ ...highRiskSystem(), vendorName: "Acme AI" }],
      vendors: [{ id: "v1", tenant_id: "t1", name: "Acme AI", website: "https://x", dd_status: "IN_PROGRESS" }],
    });
    expect(buf.length).toBeGreaterThan(1000);
    // xlsx is a zip → starts with "PK"
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

describe("assessment + gap report HTML", () => {
  it("renders a reproducible assessment with citations and controls", () => {
    const answers = baseAnswers({ annex_iii_domain: "employment" });
    const classification = classify(answers);
    const controls: Control[] = controlKeysForTier("HIGH").map((k, i) => ({
      id: k,
      ai_system_id: "s1",
      control_key: k,
      status: i === 0 ? "DONE" : "MISSING",
      evidence_note: i === 0 ? "Signed off" : null,
      evidence_file_id: null,
    }));
    const gap = buildSystemGapReport(highRiskSystem(), controls);

    const html = assessmentHtml({
      tenantName: "Acme",
      generatedAt: "2026-07-18",
      system: highRiskSystem(),
      vendorName: "Acme AI",
      answers,
      classification,
      controls: decorateControls(controls),
      gap,
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("HIGH");
    expect(html).toContain("Annex III(4)");
    expect(html).toContain("Human oversight");
    expect(html).toContain("compliance tooling, not legal advice");
  });

  it("escapes HTML in user-supplied fields", () => {
    const sys = { ...highRiskSystem(), name: "<script>alert(1)</script>" };
    const answers = baseAnswers();
    const html = assessmentHtml({
      tenantName: "Acme",
      generatedAt: "2026-07-18",
      system: sys,
      answers,
      classification: classify(answers),
      controls: [],
      gap: buildSystemGapReport(sys, []),
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a tenant gap report", () => {
    const gap = buildSystemGapReport(highRiskSystem(), []);
    const html = gapReportHtml({ tenantName: "Acme", generatedAt: "2026-07-18", reports: [gap] });
    expect(html).toContain("Gap Report");
    expect(html).toContain("CV Screener");
  });
});
