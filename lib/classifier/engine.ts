import rulesV1 from "@/config/classifier.rules.v1.json";
import questionsV1 from "@/config/classification.questions.v1.json";
import type {
  ClassificationAnswers,
  ClassificationResult,
  RiskTier,
  RuleTraceEntry,
} from "@/lib/domain/types";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic EU AI Act risk classifier.
//
// Design guarantees (auditor requirements):
//   • No LLM involvement. Tier is a pure function of (answers, rule-set version).
//   • Rules are evaluated in `order`, first-match-wins, with full precedence
//     PROHIBITED > HIGH > LIMITED > MINIMAL.
//   • Every decision records the deciding rule, its citation, a rationale, and
//     a complete evaluation trace so the result is reproducible and explainable.
// ─────────────────────────────────────────────────────────────────────────────

type Op = "is_true" | "is_false" | "eq" | "neq" | "in" | "nin";

interface Condition {
  question: string;
  op: Op;
  value?: unknown;
}

interface Rule {
  id: string;
  order: number;
  tier: string;
  citation: string;
  all: Condition[];
  rationale?: string;
  note?: string;
  continue?: boolean;
  dynamic_citation?: {
    question: string;
    map: Record<string, string>;
  };
}

interface RuleSet {
  version: string;
  questionnaire_version: string;
  default: { tier: string; citation: string; rationale: string };
  rules: Rule[];
}

const RULES = rulesV1 as unknown as RuleSet;

const VALID_TIERS: ReadonlySet<string> = new Set([
  "PROHIBITED",
  "HIGH",
  "LIMITED",
  "MINIMAL",
]);

function evalCondition(cond: Condition, answers: ClassificationAnswers): boolean {
  const actual = answers[cond.question] ?? null;
  switch (cond.op) {
    case "is_true":
      return actual === true;
    case "is_false":
      // Treat missing/unknown as "not asserted true", i.e. false-ish, so a
      // derogation is only honoured when explicitly claimed.
      return actual !== true;
    case "eq":
      return actual === cond.value;
    case "neq":
      return actual !== cond.value;
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(actual as never);
    case "nin":
      return Array.isArray(cond.value) && !cond.value.includes(actual as never);
    default:
      return false;
  }
}

function ruleMatches(rule: Rule, answers: ClassificationAnswers): boolean {
  return rule.all.every((c) => evalCondition(c, answers));
}

function resolveCitation(rule: Rule, answers: ClassificationAnswers): string {
  if (rule.dynamic_citation) {
    const key = answers[rule.dynamic_citation.question];
    if (typeof key === "string" && rule.dynamic_citation.map[key]) {
      return `${rule.dynamic_citation.map[key]} (${rule.citation})`;
    }
  }
  return rule.citation;
}

/**
 * Classify a system from its questionnaire answers.
 * Pure and deterministic: identical answers always yield an identical result.
 */
export function classify(answers: ClassificationAnswers): ClassificationResult {
  const trace: RuleTraceEntry[] = [];
  const notes: string[] = [];

  const sorted = [...RULES.rules].sort((a, b) => a.order - b.order);

  for (const rule of sorted) {
    const matched = ruleMatches(rule, answers);
    trace.push({
      rule_id: rule.id,
      order: rule.order,
      matched,
      tier: rule.tier,
      citation: rule.citation,
    });

    if (!matched) continue;

    // "continue" rules (e.g. the Art. 6(3) derogation note) record context but
    // do not assign a tier; evaluation proceeds to later rules.
    if (rule.continue) {
      if (rule.note) notes.push(rule.note);
      continue;
    }

    if (!VALID_TIERS.has(rule.tier)) {
      // A non-terminal marker tier slipped through without `continue`; skip it
      // defensively rather than assign an invalid tier.
      continue;
    }

    return {
      tier: rule.tier as RiskTier,
      classifier_version: RULES.version,
      questionnaire_version: RULES.questionnaire_version,
      deciding_rule_id: rule.id,
      citation: resolveCitation(rule, answers),
      rationale: rule.rationale ?? "",
      notes,
      trace,
    };
  }

  // No rule assigned a tier → default (minimal).
  return {
    tier: RULES.default.tier as RiskTier,
    classifier_version: RULES.version,
    questionnaire_version: RULES.questionnaire_version,
    deciding_rule_id: null,
    citation: RULES.default.citation,
    rationale: RULES.default.rationale,
    notes,
    trace,
  };
}

export const CLASSIFIER_VERSION = RULES.version;
export const QUESTIONNAIRE_VERSION = RULES.questionnaire_version;

/** List of question keys the questionnaire expects (for completeness checks). */
export function classificationQuestionKeys(): string[] {
  return (questionsV1.questions as Array<{ key: string }>).map((q) => q.key);
}
