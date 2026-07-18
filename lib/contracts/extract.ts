import promptConfig from "@/config/prompts/contract-extraction.v1.json";
import type { NewFindingInput } from "@/lib/db/repository";
import type { RiskFlag } from "@/lib/domain/types";

// ─────────────────────────────────────────────────────────────────────────────
// LLM-assisted contract clause extraction.
//
// The model is used ONLY to extract/flag clauses from a vendor contract. It is
// NEVER used for EU AI Act risk tiering. Every finding it produces lands as a
// PENDING draft (see repository.createFindings) and requires human acceptance.
//
// prompt_version and model_id are stamped on every finding for auditability.
//
// If ANTHROPIC_API_KEY is unset, a deterministic offline mock runs instead, so
// the whole flow is demonstrable without external calls.
// ─────────────────────────────────────────────────────────────────────────────

const CLAUSE_TYPES = (promptConfig.clause_types as Array<{ key: string; label: string }>);
const VALID_FLAGS: RiskFlag[] = ["NONE", "LOW", "MEDIUM", "HIGH"];

export interface ExtractionResult {
  prompt_version: string;
  model_id: string;
  used_mock: boolean;
  findings: NewFindingInput[];
}

interface RawFinding {
  clause_type?: string;
  extracted_text_summary?: string;
  source_quote?: string;
  source_location?: string;
  risk_flag?: string;
  llm_confidence?: number;
}

function normaliseFindings(raw: RawFinding[], promptVersion: string, modelId: string): NewFindingInput[] {
  const validTypes = new Set(CLAUSE_TYPES.map((c) => c.key));
  return raw
    .filter((f) => f.clause_type && validTypes.has(f.clause_type))
    .map((f) => ({
      clause_type: f.clause_type as string,
      extracted_text_summary: (f.extracted_text_summary ?? "").slice(0, 2000),
      source_quote: (f.source_quote ?? "").slice(0, 2000),
      source_location: (f.source_location ?? "").slice(0, 200),
      risk_flag: (VALID_FLAGS.includes(f.risk_flag as RiskFlag) ? f.risk_flag : "NONE") as RiskFlag,
      llm_confidence: clampConfidence(f.llm_confidence),
      prompt_version: promptVersion,
      model_id: modelId,
    }));
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Extract AI-relevant clauses from contract text.
 * Uses the Anthropic API when configured; a deterministic mock otherwise.
 */
export async function extractContractFindings(contractText: string): Promise<ExtractionResult> {
  const promptVersion = promptConfig.prompt_version;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const modelId = process.env.ANTHROPIC_MODEL || promptConfig.default_model;

  if (!apiKey) {
    return {
      prompt_version: promptVersion,
      model_id: `mock:${modelId}`,
      used_mock: true,
      findings: mockExtract(contractText, promptVersion, `mock:${modelId}`),
    };
  }

  const raw = await anthropicExtract(contractText, apiKey, modelId);
  return {
    prompt_version: promptVersion,
    model_id: modelId,
    used_mock: false,
    findings: normaliseFindings(raw, promptVersion, modelId),
  };
}

// ── Anthropic path ───────────────────────────────────────────────────────────
// Structured output via a forced tool call (version-robust and auditable): the
// model must return findings through the record_findings tool schema.
async function anthropicExtract(
  contractText: string,
  apiKey: string,
  modelId: string,
): Promise<RawFinding[]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const system = `${promptConfig.system}\n\nClause types to look for:\n${CLAUSE_TYPES.map(
    (c) => `- ${c.key}: ${c.label}`,
  ).join("\n")}\n\nInstructions:\n${(promptConfig.instructions as string[]).join("\n")}`;

  const tool = {
    name: "record_findings",
    description: "Record the structured contract findings for human review.",
    input_schema: {
      type: "object" as const,
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              clause_type: { type: "string", enum: CLAUSE_TYPES.map((c) => c.key) },
              extracted_text_summary: { type: "string" },
              source_quote: { type: "string" },
              source_location: { type: "string" },
              risk_flag: { type: "string", enum: VALID_FLAGS },
              llm_confidence: { type: "number" },
            },
            required: ["clause_type", "extracted_text_summary", "risk_flag", "llm_confidence"],
          },
        },
      },
      required: ["findings"],
    },
  };

  // Bound the input so a very large contract cannot blow the context window.
  const boundedText = contractText.slice(0, 120_000);

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: "record_findings" },
    messages: [
      {
        role: "user",
        content: `Vendor contract text follows between the markers.\n\n<<<CONTRACT>>>\n${boundedText}\n<<<END>>>`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "record_findings") {
      const input = block.input as { findings?: RawFinding[] };
      return Array.isArray(input.findings) ? input.findings : [];
    }
  }
  return [];
}

// ── Deterministic offline mock ────────────────────────────────────────────────
// Scans the text for clause-type keywords and emits a finding per clause type
// (ABSENT when the keyword set is not found). Reproducible for local demos/tests.
const MOCK_MATCHERS: Array<{
  clause_type: string;
  keywords: RegExp;
  present: { summary: string; flag: RiskFlag };
  absentFlag: RiskFlag;
}> = [
  {
    clause_type: "data_used_for_training",
    keywords: /train(ing)?\s+(data|the\s+model|models)|improve\s+(our|the)\s+models?|fine-?tun/i,
    present: { summary: "Contract addresses use of data for model training/improvement.", flag: "HIGH" },
    absentFlag: "MEDIUM",
  },
  {
    clause_type: "data_residency",
    keywords: /data\s+residency|stored?\s+in|processed?\s+in|region|EEA|European\s+Union|United\s+Kingdom/i,
    present: { summary: "Contract references data residency / processing location.", flag: "LOW" },
    absentFlag: "MEDIUM",
  },
  {
    clause_type: "sub_processors",
    keywords: /sub-?processors?/i,
    present: { summary: "Contract references sub-processors.", flag: "LOW" },
    absentFlag: "MEDIUM",
  },
  {
    clause_type: "audit_rights",
    keywords: /audit\s+rights?|right\s+to\s+audit|audit\s+the/i,
    present: { summary: "Contract grants some form of audit right.", flag: "LOW" },
    absentFlag: "MEDIUM",
  },
  {
    clause_type: "liability_cap",
    keywords: /limitation\s+of\s+liability|liability\s+(shall|is|will)\s+.*cap|aggregate\s+liability/i,
    present: { summary: "Contract contains a limitation-of-liability clause.", flag: "MEDIUM" },
    absentFlag: "LOW",
  },
  {
    clause_type: "ip_indemnity",
    keywords: /indemnif|intellectual\s+property\s+.*indemn|IP\s+indemn/i,
    present: { summary: "Contract addresses IP indemnity.", flag: "LOW" },
    absentFlag: "MEDIUM",
  },
  {
    clause_type: "security_obligations",
    keywords: /security\s+(measures|obligations|controls)|breach\s+notif|incident\s+notif/i,
    present: { summary: "Contract sets out security obligations / incident notice.", flag: "LOW" },
    absentFlag: "MEDIUM",
  },
  {
    clause_type: "data_retention",
    keywords: /retention|retain(ed)?\s+for|retained\s+period/i,
    present: { summary: "Contract addresses data retention.", flag: "LOW" },
    absentFlag: "LOW",
  },
  {
    clause_type: "data_deletion",
    keywords: /delet(e|ion)\s+.*(termination|expiry)|return\s+.*data|erasure/i,
    present: { summary: "Contract addresses data deletion/return on termination.", flag: "LOW" },
    absentFlag: "MEDIUM",
  },
  {
    clause_type: "confidentiality",
    keywords: /confidential/i,
    present: { summary: "Contract contains confidentiality obligations.", flag: "NONE" },
    absentFlag: "MEDIUM",
  },
];

function findSnippet(text: string, re: RegExp): string {
  const m = re.exec(text);
  if (!m) return "";
  const start = Math.max(0, m.index - 60);
  const end = Math.min(text.length, m.index + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function mockExtract(text: string, promptVersion: string, modelId: string): NewFindingInput[] {
  return MOCK_MATCHERS.map((matcher) => {
    const present = matcher.keywords.test(text);
    const quote = present ? findSnippet(text, matcher.keywords) : "";
    return {
      clause_type: matcher.clause_type,
      extracted_text_summary: present
        ? matcher.present.summary
        : `ABSENT: ${matcher.clause_type} not addressed in the supplied text.`,
      source_quote: quote,
      source_location: "",
      risk_flag: present ? matcher.present.flag : matcher.absentFlag,
      llm_confidence: present ? 0.72 : 0.6,
      prompt_version: promptVersion,
      model_id: modelId,
    };
  });
}
