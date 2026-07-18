import type {
  AiSystem,
  AuditLogEntry,
  ClassificationAnswerRow,
  ClassificationAnswers,
  Contract,
  ContractFinding,
  Control,
  Tenant,
  User,
  Vendor,
  VendorQuestionnaireAnswer,
} from "@/lib/domain/types";
import type {
  AuditInput,
  NewContractInput,
  NewFindingInput,
  NewSystemInput,
  NewVendorInput,
  Repository,
  SystemPatch,
} from "@/lib/db/repository";

// In-memory store. Seeded on first use. Persisted on globalThis so Next.js
// hot-reload in dev does not wipe demo data between requests.
interface Store {
  tenants: Tenant[];
  users: User[];
  systems: AiSystem[];
  answers: ClassificationAnswerRow[];
  controls: Control[];
  vendors: Vendor[];
  vendorAnswers: VendorQuestionnaireAnswer[];
  contracts: Contract[];
  findings: ContractFinding[];
  audit: AuditLogEntry[];
}

const uid = () => globalThis.crypto.randomUUID();
const now = () => new Date().toISOString();

export const DEMO_TENANT_ID = "11111111-1111-1111-1111-111111111111";

function seed(): Store {
  const tenant: Tenant = { id: DEMO_TENANT_ID, name: "Northwind Financial", plan: "trial" };
  const users: User[] = [
    { id: uid(), tenant_id: tenant.id, email: "admin@demo.test", name: "Ada Admin", role: "ADMIN" },
    { id: uid(), tenant_id: tenant.id, email: "contrib@demo.test", name: "Cory Contributor", role: "CONTRIBUTOR" },
    { id: uid(), tenant_id: tenant.id, email: "viewer@demo.test", name: "Val Viewer", role: "VIEWER" },
  ];
  const vendor: Vendor = {
    id: uid(),
    tenant_id: tenant.id,
    name: "Acme AI Ltd",
    website: "https://acme.example",
    dd_status: "IN_PROGRESS",
  };
  return {
    tenants: [tenant],
    users,
    systems: [],
    answers: [],
    controls: [],
    vendors: [vendor],
    vendorAnswers: [],
    contracts: [],
    findings: [],
    audit: [],
  };
}

const g = globalThis as unknown as { __registryStore?: Store };
function db(): Store {
  if (!g.__registryStore) g.__registryStore = seed();
  return g.__registryStore;
}

// Deep-ish clone so callers cannot mutate internal state by reference.
const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));

export class MemoryRepository implements Repository {
  async getTenant(tenantId: string) {
    return clone(db().tenants.find((t) => t.id === tenantId) ?? null);
  }
  async listUsers(tenantId: string) {
    return clone(db().users.filter((u) => u.tenant_id === tenantId));
  }
  async getUserByEmail(tenantId: string, email: string) {
    return clone(
      db().users.find((u) => u.tenant_id === tenantId && u.email.toLowerCase() === email.toLowerCase()) ?? null,
    );
  }
  async getUserById(userId: string) {
    return clone(db().users.find((u) => u.id === userId) ?? null);
  }
  async upsertUser(tenantId: string, input: { email: string; name?: string; role?: User["role"] }) {
    const store = db();
    let user = store.users.find(
      (u) => u.tenant_id === tenantId && u.email.toLowerCase() === input.email.toLowerCase(),
    );
    if (!user) {
      user = {
        id: uid(),
        tenant_id: tenantId,
        email: input.email,
        name: input.name ?? input.email.split("@")[0],
        role: input.role ?? "VIEWER",
      };
      store.users.push(user);
    } else {
      if (input.name) user.name = input.name;
      if (input.role) user.role = input.role;
    }
    return clone(user);
  }

  // ── AI systems ──
  async listSystems(tenantId: string) {
    return clone(db().systems.filter((s) => s.tenant_id === tenantId));
  }
  async getSystem(tenantId: string, id: string) {
    return clone(db().systems.find((s) => s.tenant_id === tenantId && s.id === id) ?? null);
  }
  async createSystem(tenantId: string, input: NewSystemInput) {
    const sys: AiSystem = {
      id: uid(),
      tenant_id: tenantId,
      name: input.name,
      vendor_id: input.vendor_id ?? null,
      purpose: input.purpose ?? "",
      owner: input.owner ?? "",
      status: input.status ?? "PLANNED",
      data_categories: input.data_categories ?? [],
      risk_tier: null,
      classified_at: null,
      classifier_version: null,
    };
    db().systems.push(sys);
    return clone(sys);
  }
  async updateSystem(tenantId: string, id: string, patch: SystemPatch) {
    const sys = db().systems.find((s) => s.tenant_id === tenantId && s.id === id);
    if (!sys) return null;
    Object.assign(sys, patch);
    return clone(sys);
  }
  async deleteSystem(tenantId: string, id: string) {
    const store = db();
    const before = store.systems.length;
    store.systems = store.systems.filter((s) => !(s.tenant_id === tenantId && s.id === id));
    store.answers = store.answers.filter((a) => a.ai_system_id !== id);
    store.controls = store.controls.filter((c) => c.ai_system_id !== id);
    return store.systems.length < before;
  }

  // ── Classification answers ──
  async getAnswers(tenantId: string, systemId: string) {
    const rows = db().answers.filter((a) => a.ai_system_id === systemId);
    const out: ClassificationAnswers = {};
    for (const r of rows) out[r.question_key] = r.answer;
    return clone(out);
  }
  async setAnswers(tenantId: string, systemId: string, answers: ClassificationAnswers, answeredBy: string) {
    const store = db();
    store.answers = store.answers.filter((a) => a.ai_system_id !== systemId);
    for (const [key, value] of Object.entries(answers)) {
      store.answers.push({
        id: uid(),
        ai_system_id: systemId,
        question_key: key,
        answer: value,
        answered_by: answeredBy,
      });
    }
  }

  // ── Controls ──
  async listControls(tenantId: string, systemId: string) {
    return clone(db().controls.filter((c) => c.ai_system_id === systemId));
  }
  async replaceControls(tenantId: string, systemId: string, controlKeys: string[]) {
    const store = db();
    const existing = store.controls.filter((c) => c.ai_system_id === systemId);
    const keep: Control[] = [];
    // Preserve status/evidence for controls that survive a re-classification.
    for (const key of controlKeys) {
      const prev = existing.find((c) => c.control_key === key);
      keep.push(
        prev ?? {
          id: uid(),
          ai_system_id: systemId,
          control_key: key,
          status: "MISSING",
          evidence_note: null,
          evidence_file_id: null,
        },
      );
    }
    store.controls = store.controls.filter((c) => c.ai_system_id !== systemId).concat(keep);
    return clone(keep);
  }
  async updateControl(
    tenantId: string,
    systemId: string,
    controlKey: string,
    patch: { status?: Control["status"]; evidence_note?: string | null },
  ) {
    const c = db().controls.find((x) => x.ai_system_id === systemId && x.control_key === controlKey);
    if (!c) return null;
    if (patch.status) c.status = patch.status;
    if (patch.evidence_note !== undefined) c.evidence_note = patch.evidence_note;
    return clone(c);
  }

  // ── Vendors ──
  async listVendors(tenantId: string) {
    return clone(db().vendors.filter((v) => v.tenant_id === tenantId));
  }
  async getVendor(tenantId: string, id: string) {
    return clone(db().vendors.find((v) => v.tenant_id === tenantId && v.id === id) ?? null);
  }
  async createVendor(tenantId: string, input: NewVendorInput) {
    const v: Vendor = {
      id: uid(),
      tenant_id: tenantId,
      name: input.name,
      website: input.website ?? "",
      dd_status: input.dd_status ?? "NOT_STARTED",
    };
    db().vendors.push(v);
    return clone(v);
  }
  async updateVendor(tenantId: string, id: string, patch: Partial<Pick<Vendor, "name" | "website" | "dd_status">>) {
    const v = db().vendors.find((x) => x.tenant_id === tenantId && x.id === id);
    if (!v) return null;
    Object.assign(v, patch);
    return clone(v);
  }
  async getVendorAnswers(tenantId: string, vendorId: string) {
    return clone(db().vendorAnswers.filter((a) => a.vendor_id === vendorId));
  }
  async setVendorAnswer(
    tenantId: string,
    vendorId: string,
    questionKey: string,
    answer: string,
    source: VendorQuestionnaireAnswer["source"],
  ) {
    const store = db();
    const existing = store.vendorAnswers.find((a) => a.vendor_id === vendorId && a.question_key === questionKey);
    if (existing) {
      existing.answer = answer;
      existing.source = source;
    } else {
      store.vendorAnswers.push({ id: uid(), vendor_id: vendorId, question_key: questionKey, answer, source });
    }
  }

  // ── Contracts & findings ──
  async listContracts(tenantId: string, vendorId?: string) {
    return clone(
      db().contracts.filter((c) => c.tenant_id === tenantId && (!vendorId || c.vendor_id === vendorId)),
    );
  }
  async getContract(tenantId: string, id: string) {
    return clone(db().contracts.find((c) => c.tenant_id === tenantId && c.id === id) ?? null);
  }
  async createContract(tenantId: string, input: NewContractInput) {
    const c: Contract = {
      id: uid(),
      tenant_id: tenantId,
      vendor_id: input.vendor_id,
      file_id: input.file_id,
      file_name: input.file_name,
      uploaded_by: input.uploaded_by,
      review_status: "PENDING",
      prompt_version: null,
      model_id: null,
      extracted_at: null,
    };
    db().contracts.push(c);
    return clone(c);
  }
  async updateContract(
    tenantId: string,
    id: string,
    patch: Partial<Pick<Contract, "review_status" | "prompt_version" | "model_id" | "extracted_at">>,
  ) {
    const c = db().contracts.find((x) => x.tenant_id === tenantId && x.id === id);
    if (!c) return null;
    Object.assign(c, patch);
    return clone(c);
  }
  async listFindings(tenantId: string, contractId: string) {
    return clone(db().findings.filter((f) => f.tenant_id === tenantId && f.contract_id === contractId));
  }
  async createFindings(tenantId: string, contractId: string, findings: NewFindingInput[]) {
    const created: ContractFinding[] = findings.map((f) => ({
      id: uid(),
      tenant_id: tenantId,
      contract_id: contractId,
      clause_type: f.clause_type,
      extracted_text_summary: f.extracted_text_summary,
      source_quote: f.source_quote,
      source_location: f.source_location,
      risk_flag: f.risk_flag,
      llm_confidence: f.llm_confidence,
      human_status: "PENDING", // drafts until a human accepts
      reviewed_by: null,
      prompt_version: f.prompt_version,
      model_id: f.model_id,
    }));
    db().findings.push(...created);
    return clone(created);
  }
  async getFinding(tenantId: string, id: string) {
    return clone(db().findings.find((f) => f.tenant_id === tenantId && f.id === id) ?? null);
  }
  async updateFinding(
    tenantId: string,
    id: string,
    patch: { human_status?: ContractFinding["human_status"]; reviewed_by?: string | null },
  ) {
    const f = db().findings.find((x) => x.tenant_id === tenantId && x.id === id);
    if (!f) return null;
    if (patch.human_status) f.human_status = patch.human_status;
    if (patch.reviewed_by !== undefined) f.reviewed_by = patch.reviewed_by;
    return clone(f);
  }

  // ── Audit ──
  async appendAudit(tenantId: string, input: AuditInput) {
    const entry: AuditLogEntry = {
      id: uid(),
      tenant_id: tenantId,
      actor: input.actor,
      action: input.action,
      entity: input.entity,
      entity_id: input.entity_id,
      timestamp: now(),
      diff_json: input.diff_json ?? null,
    };
    db().audit.push(entry);
    return clone(entry);
  }
  async listAudit(tenantId: string, filter?: { entity?: string; entity_id?: string; limit?: number }) {
    let rows = db().audit.filter((a) => a.tenant_id === tenantId);
    if (filter?.entity) rows = rows.filter((a) => a.entity === filter.entity);
    if (filter?.entity_id) rows = rows.filter((a) => a.entity_id === filter.entity_id);
    rows = rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (filter?.limit) rows = rows.slice(0, filter.limit);
    return clone(rows);
  }
}
