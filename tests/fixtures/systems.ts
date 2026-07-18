import type {
  ClassificationAnswers,
  RiskTier,
} from "@/lib/domain/types";

// Baseline: EU nexus, nothing risky. Override per fixture.
export function baseAnswers(
  overrides: Partial<ClassificationAnswers> = {},
): ClassificationAnswers {
  return {
    deploys_in_eu: true,
    social_scoring: false,
    realtime_biometric_public: false,
    emotion_recognition_work_edu: false,
    biometric_categorization_sensitive: false,
    predictive_policing_profiling: false,
    untargeted_scraping_facial: false,
    safety_component_regulated_product: false,
    annex_iii_domain: "none",
    annex_iii_derogation: false,
    interacts_with_humans: false,
    generates_synthetic_content: false,
    ...overrides,
  };
}

export interface SystemFixture {
  name: string;
  answers: ClassificationAnswers;
  expectedTier: RiskTier;
  expectedRuleId: string | null;
  citationContains?: string;
  expectNote?: boolean;
}

export const SYSTEM_FIXTURES: SystemFixture[] = [
  // ── PROHIBITED ──────────────────────────────────────────────────────────
  {
    name: "Citizen social-scoring platform",
    answers: baseAnswers({ social_scoring: true }),
    expectedTier: "PROHIBITED",
    expectedRuleId: "P-social-scoring",
    citationContains: "Art. 5(1)(c)",
  },
  {
    name: "Public-space live facial ID for police",
    answers: baseAnswers({ realtime_biometric_public: true }),
    expectedTier: "PROHIBITED",
    expectedRuleId: "P-realtime-biometric-public",
    citationContains: "Art. 5(1)(h)",
  },
  {
    name: "Call-centre agent emotion monitor",
    answers: baseAnswers({ emotion_recognition_work_edu: true }),
    expectedTier: "PROHIBITED",
    expectedRuleId: "P-emotion-recognition-work-edu",
    citationContains: "Art. 5(1)(f)",
  },
  {
    name: "Sensitive-trait biometric categoriser",
    answers: baseAnswers({ biometric_categorization_sensitive: true }),
    expectedTier: "PROHIBITED",
    expectedRuleId: "P-biometric-categorisation-sensitive",
    citationContains: "Art. 5(1)(g)",
  },
  {
    name: "Predictive-policing profiler",
    answers: baseAnswers({ predictive_policing_profiling: true }),
    expectedTier: "PROHIBITED",
    expectedRuleId: "P-predictive-policing",
    citationContains: "Art. 5(1)(d)",
  },
  {
    name: "Face-DB web scraper",
    answers: baseAnswers({ untargeted_scraping_facial: true }),
    expectedTier: "PROHIBITED",
    expectedRuleId: "P-untargeted-scraping",
    citationContains: "Art. 5(1)(e)",
  },
  {
    name: "Prohibited practice takes precedence over Annex III + transparency",
    answers: baseAnswers({
      social_scoring: true,
      annex_iii_domain: "employment",
      interacts_with_humans: true,
    }),
    expectedTier: "PROHIBITED",
    expectedRuleId: "P-social-scoring",
    citationContains: "Art. 5",
  },

  // ── HIGH ────────────────────────────────────────────────────────────────
  {
    name: "AI safety component of a medical device",
    answers: baseAnswers({ safety_component_regulated_product: true }),
    expectedTier: "HIGH",
    expectedRuleId: "H-annex-i-safety-component",
    citationContains: "Art. 6(1)",
  },
  {
    name: "CV-screening / recruitment ranking",
    answers: baseAnswers({ annex_iii_domain: "employment" }),
    expectedTier: "HIGH",
    expectedRuleId: "H-annex-iii",
    citationContains: "Annex III(4)",
  },
  {
    name: "Consumer credit scoring",
    answers: baseAnswers({ annex_iii_domain: "essential_services" }),
    expectedTier: "HIGH",
    expectedRuleId: "H-annex-iii",
    citationContains: "Annex III(5)",
  },
  {
    name: "Exam proctoring / grading",
    answers: baseAnswers({ annex_iii_domain: "education" }),
    expectedTier: "HIGH",
    expectedRuleId: "H-annex-iii",
    citationContains: "Annex III(3)",
  },
  {
    name: "Electricity-grid load balancer (safety)",
    answers: baseAnswers({ annex_iii_domain: "critical_infrastructure" }),
    expectedTier: "HIGH",
    expectedRuleId: "H-annex-iii",
    citationContains: "Annex III(2)",
  },
  {
    name: "HR system that is Annex III AND a chatbot → HIGH beats LIMITED",
    answers: baseAnswers({
      annex_iii_domain: "employment",
      interacts_with_humans: true,
    }),
    expectedTier: "HIGH",
    expectedRuleId: "H-annex-iii",
    citationContains: "Annex III(4)",
  },

  // ── LIMITED (transparency) ───────────────────────────────────────────────
  {
    name: "Customer-support chatbot",
    answers: baseAnswers({ interacts_with_humans: true }),
    expectedTier: "LIMITED",
    expectedRuleId: "L-human-interaction",
    citationContains: "Art. 50(1)",
  },
  {
    name: "Marketing copy / image generator",
    answers: baseAnswers({ generates_synthetic_content: true }),
    expectedTier: "LIMITED",
    expectedRuleId: "L-synthetic-content",
    citationContains: "Art. 50(2)",
  },
  {
    name: "Annex III HR tool with Art. 6(3) derogation + chatbot → LIMITED w/ note",
    answers: baseAnswers({
      annex_iii_domain: "employment",
      annex_iii_derogation: true,
      interacts_with_humans: true,
    }),
    expectedTier: "LIMITED",
    expectedRuleId: "L-human-interaction",
    citationContains: "Art. 50(1)",
    expectNote: true,
  },

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  {
    name: "Internal demand-forecasting model",
    answers: baseAnswers(),
    expectedTier: "MINIMAL",
    expectedRuleId: null,
  },
  {
    name: "Spam / anomaly filter",
    answers: baseAnswers({ annex_iii_domain: "none" }),
    expectedTier: "MINIMAL",
    expectedRuleId: null,
  },
  {
    name: "Predictive-maintenance model (no Annex III)",
    answers: baseAnswers({ deploys_in_eu: true }),
    expectedTier: "MINIMAL",
    expectedRuleId: null,
  },
  {
    name: "Annex III tool fully within Art. 6(3) derogation → MINIMAL w/ note",
    answers: baseAnswers({
      annex_iii_domain: "employment",
      annex_iii_derogation: true,
    }),
    expectedTier: "MINIMAL",
    expectedRuleId: null,
    expectNote: true,
  },
  {
    name: "Non-EU internal tool, no risky features",
    answers: baseAnswers({ deploys_in_eu: false }),
    expectedTier: "MINIMAL",
    expectedRuleId: null,
  },
];
