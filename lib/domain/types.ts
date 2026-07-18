// Core domain types for the Registry platform. Mirrors db/schema.sql.
// Every persisted entity carries tenant_id for multi-tenant isolation.

export type Role = "ADMIN" | "CONTRIBUTOR" | "VIEWER";

export type RiskTier = "PROHIBITED" | "HIGH" | "LIMITED" | "MINIMAL";

export type DeploymentStatus =
  | "PLANNED"
  | "IN_DEVELOPMENT"
  | "PILOT"
  | "PRODUCTION"
  | "RETIRED";

export type ControlStatus = "MISSING" | "IN_PROGRESS" | "DONE" | "N_A";

export type DDStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export type ReviewStatus = "PENDING" | "IN_REVIEW" | "REVIEWED";

export type HumanStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export type AnswerSource = "MANUAL" | "EXTRACTED";

export type RiskFlag = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface Tenant {
  id: string;
  name: string;
  plan: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: Role;
}

// Answers to the classification questionnaire. Values are booleans or enum strings.
export type ClassificationAnswerValue = boolean | string | null;
export type ClassificationAnswers = Record<string, ClassificationAnswerValue>;

export interface AiSystem {
  id: string;
  tenant_id: string;
  name: string;
  vendor_id: string | null;
  purpose: string;
  owner: string;
  status: DeploymentStatus;
  data_categories: string[];
  risk_tier: RiskTier | null;
  classified_at: string | null;
  classifier_version: string | null;
}

export interface ClassificationAnswerRow {
  id: string;
  ai_system_id: string;
  question_key: string;
  answer: ClassificationAnswerValue;
  answered_by: string;
}

export interface Control {
  id: string;
  ai_system_id: string;
  control_key: string;
  status: ControlStatus;
  evidence_note: string | null;
  evidence_file_id: string | null;
}

export interface Vendor {
  id: string;
  tenant_id: string;
  name: string;
  website: string;
  dd_status: DDStatus;
}

export interface VendorQuestionnaireAnswer {
  id: string;
  vendor_id: string;
  question_key: string;
  answer: string;
  source: AnswerSource;
}

export interface Contract {
  id: string;
  vendor_id: string;
  tenant_id: string;
  file_id: string;
  file_name: string;
  uploaded_by: string;
  review_status: ReviewStatus;
  prompt_version: string | null;
  model_id: string | null;
  extracted_at: string | null;
}

export interface ContractFinding {
  id: string;
  tenant_id: string;
  contract_id: string;
  clause_type: string;
  extracted_text_summary: string;
  source_quote: string;
  source_location: string;
  risk_flag: RiskFlag;
  llm_confidence: number;
  human_status: HumanStatus;
  reviewed_by: string | null;
  prompt_version: string;
  model_id: string;
}

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  timestamp: string;
  diff_json: Record<string, unknown> | null;
}

// ─── Classifier result (not persisted verbatim; tier + version are) ───
export interface RuleTraceEntry {
  rule_id: string;
  order: number;
  matched: boolean;
  tier: string;
  citation: string;
}

export interface ClassificationResult {
  tier: RiskTier;
  classifier_version: string;
  questionnaire_version: string;
  deciding_rule_id: string | null;
  citation: string;
  rationale: string;
  notes: string[];
  // Full ordered trace for reproducibility / audit.
  trace: RuleTraceEntry[];
}
