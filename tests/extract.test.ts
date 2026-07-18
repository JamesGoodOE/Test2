import { describe, it, expect } from "vitest";
import { extractContractFindings } from "@/lib/contracts/extract";
import promptConfig from "@/config/prompts/contract-extraction.v1.json";

const SAMPLE = `
DATA PROCESSING ADDENDUM
1. Sub-processors. The Vendor engages the sub-processors listed in Annex 2.
2. Training. Customer Data shall NOT be used to train or improve the models.
3. Residency. All Customer Data is stored in the European Union (EEA).
4. Deletion. Upon termination the Vendor will delete Customer Data within 30 days.
5. Confidentiality. Each party shall keep the other's information confidential.
6. Limitation of Liability. The aggregate liability shall be capped at fees paid.
`;

describe("contract extraction (offline mock)", () => {
  it("uses the mock when no API key is set and stamps prompt/model versions", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = await extractContractFindings(SAMPLE);
      expect(result.used_mock).toBe(true);
      expect(result.prompt_version).toBe(promptConfig.prompt_version);
      expect(result.model_id.startsWith("mock:")).toBe(true);
      // Every finding carries prompt + model version (audit requirement).
      for (const f of result.findings) {
        expect(f.prompt_version).toBe(promptConfig.prompt_version);
        expect(f.model_id).toBe(result.model_id);
        expect(f.llm_confidence).toBeGreaterThanOrEqual(0);
        expect(f.llm_confidence).toBeLessThanOrEqual(1);
      }
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("is deterministic — same input yields same findings", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const a = await extractContractFindings(SAMPLE);
    const b = await extractContractFindings(SAMPLE);
    expect(a.findings).toEqual(b.findings);
  });

  it("produces one finding per configured clause type", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await extractContractFindings(SAMPLE);
    const types = new Set(result.findings.map((f) => f.clause_type));
    expect(types.size).toBe(promptConfig.clause_types.length);
  });

  it("detects present clauses and flags absent ones", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await extractContractFindings(SAMPLE);
    const residency = result.findings.find((f) => f.clause_type === "data_residency");
    expect(residency?.extracted_text_summary).not.toMatch(/^ABSENT/);
    const audit = result.findings.find((f) => f.clause_type === "audit_rights");
    expect(audit?.extracted_text_summary).toMatch(/^ABSENT/);
  });
});
