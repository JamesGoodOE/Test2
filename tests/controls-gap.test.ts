import { describe, it, expect } from "vitest";
import { controlKeysForTier, controlDefsForTier } from "@/lib/controls";
import { buildSystemGapReport } from "@/lib/gap";
import type { AiSystem, Control } from "@/lib/domain/types";

function sys(tier: AiSystem["risk_tier"], classified = true): AiSystem {
  return {
    id: "s1",
    tenant_id: "t1",
    name: "Test system",
    vendor_id: null,
    purpose: "",
    owner: "",
    status: "PRODUCTION",
    data_categories: [],
    risk_tier: tier,
    classified_at: classified ? "2026-01-01T00:00:00.000Z" : null,
    classifier_version: classified ? "v1" : null,
  };
}

function ctrl(key: string, status: Control["status"]): Control {
  return { id: key, ai_system_id: "s1", control_key: key, status, evidence_note: null, evidence_file_id: null };
}

describe("controls catalogue", () => {
  it("HIGH tier requires the core Chapter III controls", () => {
    const keys = controlKeysForTier("HIGH");
    for (const k of ["risk_management_system", "human_oversight", "record_keeping_logging", "accuracy_robustness_security"]) {
      expect(keys).toContain(k);
    }
  });

  it("LIMITED tier requires transparency controls only", () => {
    const keys = controlKeysForTier("LIMITED");
    expect(keys).toContain("ai_interaction_disclosure");
    expect(keys).not.toContain("risk_management_system");
  });

  it("every control has a citation", () => {
    for (const tier of ["PROHIBITED", "HIGH", "LIMITED", "MINIMAL"] as const) {
      for (const def of controlDefsForTier(tier)) {
        expect(def.citation.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("gap report", () => {
  it("flags unclassified systems", () => {
    const report = buildSystemGapReport(sys(null, false), []);
    expect(report.classified).toBe(false);
    expect(report.complete).toBe(false);
  });

  it("counts DONE and N_A as satisfied and lists the rest as open", () => {
    const keys = controlKeysForTier("HIGH");
    const controls = keys.map((k, i) =>
      ctrl(k, i === 0 ? "DONE" : i === 1 ? "N_A" : "MISSING"),
    );
    const report = buildSystemGapReport(sys("HIGH"), controls);
    expect(report.required_count).toBe(keys.length);
    expect(report.satisfied_count).toBe(2);
    expect(report.open_gaps.length).toBe(keys.length - 2);
    expect(report.complete).toBe(false);
  });

  it("is complete when all required controls are DONE", () => {
    const controls = controlKeysForTier("LIMITED").map((k) => ctrl(k, "DONE"));
    const report = buildSystemGapReport(sys("LIMITED"), controls);
    expect(report.complete).toBe(true);
    expect(report.open_gaps.length).toBe(0);
  });
});
