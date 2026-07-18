import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db";
import { requireSession, hasRole } from "@/lib/auth/session";
import {
  classifySystemAction,
  updateControlAction,
  updateSystemAction,
} from "@/lib/actions";
import { classify } from "@/lib/classifier/engine";
import { classificationQuestions } from "@/lib/classifier/questions";
import { decorateControls, CONTROL_STATUSES } from "@/lib/controls";
import { buildSystemGapReport } from "@/lib/gap";
import { TierBadge } from "@/components/tier";

export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, user } = await requireSession();
  const repo = getRepository();
  const system = await repo.getSystem(tenantId, id);
  if (!system) notFound();

  const canEdit = hasRole(user.role, "CONTRIBUTOR");
  const [answers, controlRows, vendors] = await Promise.all([
    repo.getAnswers(tenantId, id),
    repo.listControls(tenantId, id),
    repo.listVendors(tenantId),
  ]);
  const questions = classificationQuestions();
  const controls = decorateControls(controlRows);
  const isClassified = Boolean(system.risk_tier && system.classified_at);
  const result = isClassified ? classify(answers) : null;
  const gap = buildSystemGapReport(system, controlRows);
  const vendorName = system.vendor_id
    ? vendors.find((v) => v.id === system.vendor_id)?.name
    : undefined;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{system.name}</h1>
          <p className="text-sm text-slate-500">
            {vendorName ? `${vendorName} · ` : ""}
            {system.owner || "no owner"} · {system.status}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TierBadge tier={system.risk_tier} />
          {isClassified && (
            <a className="btn-secondary" href={`/api/exports/assessment/${system.id}`} target="_blank">
              Risk assessment (PDF)
            </a>
          )}
        </div>
      </div>

      {/* Classification result */}
      {result && (
        <div className="card">
          <h2 className="mb-3 text-lg font-semibold">Classification</h2>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <Field label="Risk tier"><TierBadge tier={result.tier} /></Field>
            <Field label="Deciding rule">{result.deciding_rule_id ?? "default (minimal)"}</Field>
            <Field label="Primary citation">
              <code className="text-brand-700">{result.citation}</code>
            </Field>
            <Field label="Classifier version">{result.classifier_version}</Field>
          </div>
          <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700">{result.rationale}</p>
          {result.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <details className="mt-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold">Rule evaluation trace</summary>
            <table className="mt-2 w-full">
              <tbody>
                {result.trace.map((t) => (
                  <tr key={t.rule_id} className="border-b border-slate-100">
                    <td className="py-1 pr-3">{t.order}</td>
                    <td className="py-1 pr-3 font-mono">{t.rule_id}</td>
                    <td className="py-1 pr-3">{t.matched ? "✓ matched" : "—"}</td>
                    <td className="py-1 pr-3">{t.tier}</td>
                    <td className="py-1 font-mono text-brand-700">{t.citation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {/* Controls checklist */}
      {isClassified && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Required controls</h2>
            <span className="text-sm text-slate-500">
              {gap.satisfied_count}/{gap.required_count} satisfied
            </span>
          </div>
          {controls.length === 0 ? (
            <p className="text-sm text-slate-500">No controls required for this tier.</p>
          ) : (
            <div className="space-y-3">
              {controls.map((c) => (
                <div key={c.control_key} className="rounded border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">
                        {c.title} <code className="ml-1 text-xs text-brand-700">{c.citation}</code>
                      </div>
                      <p className="text-xs text-slate-500">{c.description}</p>
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                  {canEdit && (
                    <form action={updateControlAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="system_id" value={system.id} />
                      <input type="hidden" name="control_key" value={c.control_key} />
                      <div>
                        <label className="label">Status</label>
                        <select name="status" defaultValue={c.status} className="select">
                          {CONTROL_STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="label">Evidence note</label>
                        <input
                          name="evidence_note"
                          defaultValue={c.evidence_note ?? ""}
                          className="input"
                          placeholder="Link or note"
                        />
                      </div>
                      <button className="btn-secondary" type="submit">
                        Save
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Classification questionnaire */}
      <div className="card">
        <h2 className="mb-1 text-lg font-semibold">
          EU AI Act classification questionnaire
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Deterministic rules engine — the tier is fully reproducible from these answers and the
          rule-set version. No model is used for tiering.
        </p>
        {!canEdit && (
          <p className="mb-4 rounded bg-amber-50 p-2 text-xs text-amber-700">
            You have VIEWER access — classification is read-only.
          </p>
        )}
        <form action={classifySystemAction} className="space-y-4">
          <input type="hidden" name="id" value={system.id} />
          {questions.map((q) => {
            const stored = answers[q.key];
            return (
              <div key={q.key} className="border-b border-slate-100 pb-3">
                <div className="text-sm font-medium">
                  {q.prompt} <code className="ml-1 text-xs text-brand-700">{q.citation}</code>
                </div>
                {q.help && <p className="text-xs text-slate-500">{q.help}</p>}
                <div className="mt-2">
                  {q.type === "bool" ? (
                    <select name={q.key} defaultValue={stored === true ? "yes" : "no"} className="select max-w-xs" disabled={!canEdit}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  ) : (
                    <select
                      name={q.key}
                      defaultValue={typeof stored === "string" ? stored : q.options?.[0]?.value}
                      className="select max-w-md"
                      disabled={!canEdit}
                    >
                      {(q.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
          {canEdit && (
            <button className="btn" type="submit">
              {isClassified ? "Re-classify" : "Classify"}
            </button>
          )}
        </form>
      </div>

      {/* Edit system */}
      {canEdit && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Edit details</h2>
          <form action={updateSystemAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={system.id} />
            <div>
              <label className="label">Name</label>
              <input name="name" defaultValue={system.name} className="input" />
            </div>
            <div>
              <label className="label">Business owner</label>
              <input name="owner" defaultValue={system.owner} className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Purpose</label>
              <input name="purpose" defaultValue={system.purpose} className="input" />
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" defaultValue={system.status} className="select">
                {["PLANNED", "IN_DEVELOPMENT", "PILOT", "PRODUCTION", "RETIRED"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Data categories (comma-separated)</label>
              <input
                name="data_categories"
                defaultValue={(system.data_categories ?? []).join(", ")}
                className="input"
              />
            </div>
            <div className="md:col-span-2">
              <button className="btn-secondary" type="submit">
                Save details
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    DONE: "bg-green-100 text-green-700",
    MISSING: "bg-red-100 text-red-700",
    IN_PROGRESS: "bg-amber-100 text-amber-700",
    N_A: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone[status] ?? ""}`}>
      {status}
    </span>
  );
}
