"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { getRepository } from "@/lib/db";
import { getSession, requireRole, loginLocal, logout } from "@/lib/auth/session";
import { classify, CLASSIFIER_VERSION } from "@/lib/classifier/engine";
import { classificationQuestions } from "@/lib/classifier/questions";
import { controlKeysForTier } from "@/lib/controls";
import { extractContractFindings } from "@/lib/contracts/extract";
import { detectDocType, extractText } from "@/lib/contracts/text";
import type {
  ClassificationAnswers,
  ControlStatus,
  DeploymentStatus,
} from "@/lib/domain/types";

// ── Auth ──
export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const user = await loginLocal(email);
  if (!user) redirect("/login?error=1"); // unknown email — surface feedback
  redirect("/dashboard");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ── AI systems ──
export async function createSystemAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const repo = getRepository();
  const sys = await repo.createSystem(tenantId, {
    name: String(formData.get("name") ?? "").trim() || "Untitled system",
    purpose: String(formData.get("purpose") ?? ""),
    owner: String(formData.get("owner") ?? ""),
    status: (String(formData.get("status") ?? "PLANNED") as DeploymentStatus),
    vendor_id: (formData.get("vendor_id") as string) || null,
    data_categories: String(formData.get("data_categories") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "CREATE",
    entity: "ai_system",
    entity_id: sys.id,
    diff_json: { name: sys.name },
  });
  revalidatePath("/dashboard");
  redirect(`/systems/${sys.id}`);
}

export async function updateSystemAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const id = String(formData.get("id"));
  const repo = getRepository();
  const patch = {
    name: String(formData.get("name") ?? ""),
    purpose: String(formData.get("purpose") ?? ""),
    owner: String(formData.get("owner") ?? ""),
    status: String(formData.get("status") ?? "PLANNED") as DeploymentStatus,
    data_categories: String(formData.get("data_categories") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  await repo.updateSystem(tenantId, id, patch);
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "UPDATE",
    entity: "ai_system",
    entity_id: id,
    diff_json: patch,
  });
  revalidatePath(`/systems/${id}`);
}

/**
 * Deterministic classification: read the submitted answers, run the rules
 * engine, persist tier + version + answers, instantiate the required-controls
 * checklist (preserving existing statuses), and audit the decision.
 */
export async function classifySystemAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const id = String(formData.get("id"));
  const repo = getRepository();

  const answers: ClassificationAnswers = {};
  for (const q of classificationQuestions()) {
    const raw = formData.get(q.key);
    if (q.type === "bool") {
      answers[q.key] = raw === "yes" || raw === "true" || raw === "on";
    } else {
      answers[q.key] = raw != null ? String(raw) : null;
    }
  }

  const result = classify(answers);
  await repo.setAnswers(tenantId, id, answers, user.email);
  await repo.updateSystem(tenantId, id, {
    risk_tier: result.tier,
    classified_at: new Date().toISOString(),
    classifier_version: CLASSIFIER_VERSION,
  });
  await repo.replaceControls(tenantId, id, controlKeysForTier(result.tier));
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "CLASSIFY",
    entity: "ai_system",
    entity_id: id,
    diff_json: {
      tier: result.tier,
      deciding_rule_id: result.deciding_rule_id,
      citation: result.citation,
      classifier_version: result.classifier_version,
    },
  });
  revalidatePath(`/systems/${id}`);
}

export async function updateControlAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const systemId = String(formData.get("system_id"));
  const controlKey = String(formData.get("control_key"));
  const status = String(formData.get("status")) as ControlStatus;
  const evidence = String(formData.get("evidence_note") ?? "");
  const repo = getRepository();
  await repo.updateControl(tenantId, systemId, controlKey, {
    status,
    evidence_note: evidence,
  });
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "UPDATE_CONTROL",
    entity: "control",
    entity_id: `${systemId}:${controlKey}`,
    diff_json: { status, evidence_note: evidence },
  });
  revalidatePath(`/systems/${systemId}`);
}

// ── Vendors ──
export async function createVendorAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const repo = getRepository();
  const vendor = await repo.createVendor(tenantId, {
    name: String(formData.get("name") ?? "").trim() || "Untitled vendor",
    website: String(formData.get("website") ?? ""),
  });
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "CREATE",
    entity: "vendor",
    entity_id: vendor.id,
    diff_json: { name: vendor.name },
  });
  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

export async function saveVendorAnswerAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const vendorId = String(formData.get("vendor_id"));
  const questionKey = String(formData.get("question_key"));
  const answer = String(formData.get("answer") ?? "");
  const repo = getRepository();
  await repo.setVendorAnswer(tenantId, vendorId, questionKey, answer, "MANUAL");
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "UPDATE_VENDOR_ANSWER",
    entity: "vendor_questionnaire",
    entity_id: `${vendorId}:${questionKey}`,
    diff_json: { answer },
  });
  revalidatePath(`/vendors/${vendorId}`);
}

/**
 * Upload a contract, extract its text, and run LLM-assisted clause extraction.
 * Findings land as PENDING drafts — nothing enters the register until a human
 * accepts them. prompt_version + model_id are stamped on every finding.
 */
export async function uploadContractAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const vendorId = String(formData.get("vendor_id"));
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const docType = detectDocType(file.name);
  if (!docType) throw new Error("Unsupported file type (pdf, docx, or txt only)");

  const buffer = Buffer.from(await file.arrayBuffer());
  const repo = getRepository();

  // Store original to local object storage (Supabase Storage in production).
  // The on-disk name is derived ONLY from the server-generated fileId plus a
  // validated extension — never from the client-supplied file.name (which is
  // attacker-controlled and could contain path-traversal sequences). The
  // display name is persisted separately on the contract row.
  const fileId = globalThis.crypto.randomUUID();
  const ext = extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const dir = resolve(join(process.cwd(), ".data", "uploads"));
  await mkdir(dir, { recursive: true });
  const target = resolve(join(dir, `${fileId}${ext}`));
  if (target !== dir && !target.startsWith(dir + sep)) {
    throw new Error("Invalid upload path");
  }
  await writeFile(target, buffer);

  const contract = await repo.createContract(tenantId, {
    vendor_id: vendorId,
    file_id: fileId,
    file_name: file.name,
    uploaded_by: user.email,
  });

  const text = await extractText(buffer, docType);
  const extraction = await extractContractFindings(text);
  await repo.createFindings(tenantId, contract.id, extraction.findings);
  await repo.updateContract(tenantId, contract.id, {
    review_status: "IN_REVIEW",
    prompt_version: extraction.prompt_version,
    model_id: extraction.model_id,
    extracted_at: new Date().toISOString(),
  });
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: "UPLOAD_CONTRACT",
    entity: "contract",
    entity_id: contract.id,
    diff_json: {
      file_name: file.name,
      findings: extraction.findings.length,
      prompt_version: extraction.prompt_version,
      model_id: extraction.model_id,
    },
  });
  revalidatePath(`/vendors/${vendorId}`);
}

export async function setFindingStatusAction(formData: FormData) {
  const { tenantId, user } = await requireRole("CONTRIBUTOR");
  const findingId = String(formData.get("finding_id"));
  const vendorId = String(formData.get("vendor_id"));
  const status = String(formData.get("status")) as "ACCEPTED" | "REJECTED";
  const repo = getRepository();
  const finding = await repo.updateFinding(tenantId, findingId, {
    human_status: status,
    reviewed_by: user.email,
  });

  // On acceptance, propagate the finding into the vendor questionnaire as an
  // EXTRACTED answer (only accepted findings become authoritative). We only map
  // to free-TEXT questions: enum/bool questions can't be answered from a prose
  // summary, so a human sets those explicitly rather than us stuffing a sentence
  // into a field whose <select> has no matching option.
  if (finding && status === "ACCEPTED") {
    const clauseToQuestion: Record<string, string> = {
      data_residency: "data_residency_regions",
      sub_processors: "sub_processors_list",
      liability_cap: "liability_cap",
    };
    const qKey = clauseToQuestion[finding.clause_type];
    if (qKey) {
      const contract = await repo.getContract(tenantId, finding.contract_id);
      if (contract) {
        await repo.setVendorAnswer(
          tenantId,
          contract.vendor_id,
          qKey,
          finding.extracted_text_summary,
          "EXTRACTED",
        );
      }
    }
  }
  await repo.appendAudit(tenantId, {
    actor: user.email,
    action: status === "ACCEPTED" ? "ACCEPT_FINDING" : "REJECT_FINDING",
    entity: "contract_finding",
    entity_id: findingId,
    diff_json: { human_status: status },
  });
  revalidatePath(`/vendors/${vendorId}`);
}

// Convenience for pages needing the current session without importing auth.
export async function currentSession() {
  return getSession();
}
