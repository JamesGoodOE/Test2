import type {
  AiSystem,
  AuditLogEntry,
  ClassificationAnswers,
  Contract,
  ContractFinding,
  Control,
  ControlStatus,
  DDStatus,
  DeploymentStatus,
  ReviewStatus,
  Role,
  Tenant,
  User,
  Vendor,
  VendorQuestionnaireAnswer,
} from "@/lib/domain/types";

// Create/patch input shapes (ids, timestamps and tenant scoping handled by repo).

export interface NewSystemInput {
  name: string;
  vendor_id?: string | null;
  purpose?: string;
  owner?: string;
  status?: DeploymentStatus;
  data_categories?: string[];
}

export interface SystemPatch {
  name?: string;
  vendor_id?: string | null;
  purpose?: string;
  owner?: string;
  status?: DeploymentStatus;
  data_categories?: string[];
  risk_tier?: AiSystem["risk_tier"];
  classified_at?: string | null;
  classifier_version?: string | null;
}

export interface NewVendorInput {
  name: string;
  website?: string;
  dd_status?: DDStatus;
}

export interface NewContractInput {
  vendor_id: string;
  file_id: string;
  file_name: string;
  uploaded_by: string;
}

export interface NewFindingInput {
  clause_type: string;
  extracted_text_summary: string;
  source_quote: string;
  source_location: string;
  risk_flag: ContractFinding["risk_flag"];
  llm_confidence: number;
  prompt_version: string;
  model_id: string;
}

export interface AuditInput {
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  diff_json?: Record<string, unknown> | null;
}

/**
 * Tenant-scoped data access. Every method is async so a Postgres-backed
 * implementation is a drop-in replacement for the in-memory one. tenant_id is
 * an explicit parameter on every call — the analogue of the RLS GUC.
 */
export interface Repository {
  // Tenancy & identity
  getTenant(tenantId: string): Promise<Tenant | null>;
  listUsers(tenantId: string): Promise<User[]>;
  getUserByEmail(tenantId: string, email: string): Promise<User | null>;
  getUserById(userId: string): Promise<User | null>;
  upsertUser(
    tenantId: string,
    input: { email: string; name?: string; role?: Role },
  ): Promise<User>;

  // AI systems
  listSystems(tenantId: string): Promise<AiSystem[]>;
  getSystem(tenantId: string, id: string): Promise<AiSystem | null>;
  createSystem(tenantId: string, input: NewSystemInput): Promise<AiSystem>;
  updateSystem(tenantId: string, id: string, patch: SystemPatch): Promise<AiSystem | null>;
  deleteSystem(tenantId: string, id: string): Promise<boolean>;

  // Classification answers
  getAnswers(tenantId: string, systemId: string): Promise<ClassificationAnswers>;
  setAnswers(
    tenantId: string,
    systemId: string,
    answers: ClassificationAnswers,
    answeredBy: string,
  ): Promise<void>;

  // Controls checklist
  listControls(tenantId: string, systemId: string): Promise<Control[]>;
  replaceControls(tenantId: string, systemId: string, controlKeys: string[]): Promise<Control[]>;
  updateControl(
    tenantId: string,
    systemId: string,
    controlKey: string,
    patch: { status?: ControlStatus; evidence_note?: string | null },
  ): Promise<Control | null>;

  // Vendors & DD
  listVendors(tenantId: string): Promise<Vendor[]>;
  getVendor(tenantId: string, id: string): Promise<Vendor | null>;
  createVendor(tenantId: string, input: NewVendorInput): Promise<Vendor>;
  updateVendor(
    tenantId: string,
    id: string,
    patch: Partial<Pick<Vendor, "name" | "website" | "dd_status">>,
  ): Promise<Vendor | null>;
  getVendorAnswers(tenantId: string, vendorId: string): Promise<VendorQuestionnaireAnswer[]>;
  setVendorAnswer(
    tenantId: string,
    vendorId: string,
    questionKey: string,
    answer: string,
    source: VendorQuestionnaireAnswer["source"],
  ): Promise<void>;

  // Contracts & findings
  listContracts(tenantId: string, vendorId?: string): Promise<Contract[]>;
  getContract(tenantId: string, id: string): Promise<Contract | null>;
  createContract(tenantId: string, input: NewContractInput): Promise<Contract>;
  updateContract(
    tenantId: string,
    id: string,
    patch: Partial<Pick<Contract, "review_status" | "prompt_version" | "model_id" | "extracted_at">>,
  ): Promise<Contract | null>;
  listFindings(tenantId: string, contractId: string): Promise<ContractFinding[]>;
  createFindings(
    tenantId: string,
    contractId: string,
    findings: NewFindingInput[],
  ): Promise<ContractFinding[]>;
  getFinding(tenantId: string, id: string): Promise<ContractFinding | null>;
  updateFinding(
    tenantId: string,
    id: string,
    patch: { human_status?: ContractFinding["human_status"]; reviewed_by?: string | null },
  ): Promise<ContractFinding | null>;

  // Audit
  appendAudit(tenantId: string, input: AuditInput): Promise<AuditLogEntry>;
  listAudit(
    tenantId: string,
    filter?: { entity?: string; entity_id?: string; limit?: number },
  ): Promise<AuditLogEntry[]>;
}

export type { ReviewStatus };
