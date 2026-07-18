import { describe, it, expect } from "vitest";
import {
  classify,
  classificationQuestionKeys,
  CLASSIFIER_VERSION,
  QUESTIONNAIRE_VERSION,
} from "@/lib/classifier/engine";
import { SYSTEM_FIXTURES, baseAnswers } from "./fixtures/systems";
import questionsV1 from "@/config/classification.questions.v1.json";

describe("EU AI Act classifier — fixtures", () => {
  it("has at least 20 fixture systems covering every tier", () => {
    expect(SYSTEM_FIXTURES.length).toBeGreaterThanOrEqual(20);
    const tiers = new Set(SYSTEM_FIXTURES.map((f) => f.expectedTier));
    expect(tiers).toEqual(
      new Set(["PROHIBITED", "HIGH", "LIMITED", "MINIMAL"]),
    );
  });

  for (const fx of SYSTEM_FIXTURES) {
    it(`classifies "${fx.name}" as ${fx.expectedTier}`, () => {
      const result = classify(fx.answers);
      expect(result.tier).toBe(fx.expectedTier);
      expect(result.deciding_rule_id).toBe(fx.expectedRuleId);
      if (fx.citationContains) {
        expect(result.citation).toContain(fx.citationContains);
      }
      if (fx.expectNote) {
        expect(result.notes.length).toBeGreaterThan(0);
      }
      // Every result must carry versions + a non-empty rationale for the pack.
      expect(result.classifier_version).toBe(CLASSIFIER_VERSION);
      expect(result.questionnaire_version).toBe(QUESTIONNAIRE_VERSION);
      expect(result.rationale.length).toBeGreaterThan(0);
      expect(result.trace.length).toBeGreaterThan(0);
    });
  }
});

describe("determinism & reproducibility", () => {
  it("is a pure function — identical answers yield identical results", () => {
    const a = classify(baseAnswers({ annex_iii_domain: "employment" }));
    const b = classify(baseAnswers({ annex_iii_domain: "employment" }));
    expect(a).toEqual(b);
  });

  it("does not mutate the input answers", () => {
    const answers = baseAnswers({ social_scoring: true });
    const snapshot = JSON.stringify(answers);
    classify(answers);
    expect(JSON.stringify(answers)).toBe(snapshot);
  });

  it("records the full ordered rule trace", () => {
    const result = classify(baseAnswers({ interacts_with_humans: true }));
    const orders = result.trace.map((t) => t.order);
    const sorted = [...orders].sort((x, y) => x - y);
    expect(orders).toEqual(sorted);
    expect(result.trace.some((t) => t.matched && t.rule_id === "L-human-interaction")).toBe(true);
  });
});

describe("precedence", () => {
  it("PROHIBITED beats HIGH beats LIMITED beats MINIMAL", () => {
    const prohibited = classify(
      baseAnswers({
        social_scoring: true,
        safety_component_regulated_product: true,
        annex_iii_domain: "employment",
        interacts_with_humans: true,
      }),
    );
    expect(prohibited.tier).toBe("PROHIBITED");

    const high = classify(
      baseAnswers({
        safety_component_regulated_product: true,
        interacts_with_humans: true,
      }),
    );
    expect(high.tier).toBe("HIGH");

    const limited = classify(baseAnswers({ generates_synthetic_content: true }));
    expect(limited.tier).toBe("LIMITED");
  });
});

describe("Art. 6(3) derogation handling", () => {
  it("drops an Annex III system out of HIGH when derogation is asserted", () => {
    const withoutDerogation = classify(baseAnswers({ annex_iii_domain: "education" }));
    expect(withoutDerogation.tier).toBe("HIGH");

    const withDerogation = classify(
      baseAnswers({ annex_iii_domain: "education", annex_iii_derogation: true }),
    );
    expect(withDerogation.tier).toBe("MINIMAL");
    expect(withDerogation.notes.length).toBeGreaterThan(0);
  });
});

describe("questionnaire integrity", () => {
  it("engine question keys match the questionnaire config", () => {
    const configKeys = questionsV1.questions.map((q) => q.key).sort();
    expect(classificationQuestionKeys().sort()).toEqual(configKeys);
  });

  it("questionnaire has ~12 questions", () => {
    expect(questionsV1.questions.length).toBeGreaterThanOrEqual(10);
    expect(questionsV1.questions.length).toBeLessThanOrEqual(14);
  });
});
