import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db";
import { requireSession, hasRole } from "@/lib/auth/session";
import {
  saveVendorAnswerAction,
  uploadContractAction,
  setFindingStatusAction,
} from "@/lib/actions";
import { vendorSections } from "@/lib/vendor/questionnaire";

const FLAG_TONE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-sky-100 text-sky-700",
  NONE: "bg-slate-100 text-slate-600",
};
const HUMAN_TONE: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  ACCEPTED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, user } = await requireSession();
  const repo = getRepository();
  const vendor = await repo.getVendor(tenantId, id);
  if (!vendor) notFound();

  const canEdit = hasRole(user.role, "CONTRIBUTOR");
  const [answerRows, contracts] = await Promise.all([
    repo.getVendorAnswers(tenantId, id),
    repo.listContracts(tenantId, id),
  ]);
  const answers = new Map(answerRows.map((a) => [a.question_key, a]));

  // Findings per contract
  const findingsByContract = new Map(
    await Promise.all(
      contracts.map(
        async (c) => [c.id, await repo.listFindings(tenantId, c.id)] as const,
      ),
    ),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{vendor.name}</h1>
        <p className="text-sm text-slate-500">
          {vendor.website || "no website"} · DD status: {vendor.dd_status}
        </p>
      </div>

      {/* Contract upload + LLM extraction */}
      <div className="card">
        <h2 className="text-lg font-semibold">Contract review (LLM-assisted)</h2>
        <p className="mb-4 text-xs text-slate-500">
          Upload a contract or DPA (PDF, DOCX or TXT). Claude extracts AI-relevant clauses into
          findings. Findings are drafts — a human must accept each before it enters the register.
        </p>
        {canEdit && (
          <form action={uploadContractAction} className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="vendor_id" value={vendor.id} />
            <input
              type="file"
              name="file"
              accept=".pdf,.docx,.txt,.md"
              required
              className="text-sm"
            />
            <button className="btn" type="submit">
              Upload &amp; extract
            </button>
          </form>
        )}

        {contracts.length === 0 ? (
          <p className="text-sm text-slate-500">No contracts uploaded yet.</p>
        ) : (
          <div className="space-y-6">
            {contracts.map((c) => {
              const findings = findingsByContract.get(c.id) ?? [];
              return (
                <div key={c.id} className="rounded border border-slate-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{c.file_name}</div>
                    <div className="text-xs text-slate-500">
                      {c.model_id ? `model: ${c.model_id} · ` : ""}
                      {c.prompt_version ? `prompt: ${c.prompt_version}` : ""}
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                        <th className="py-2 pr-3">Clause</th>
                        <th className="py-2 pr-3">Summary</th>
                        <th className="py-2 pr-3">Flag</th>
                        <th className="py-2 pr-3">Conf.</th>
                        <th className="py-2 pr-3">Status</th>
                        {canEdit && <th className="py-2">Review</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f) => (
                        <tr key={f.id} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-3 font-mono text-xs">{f.clause_type}</td>
                          <td className="py-2 pr-3">
                            {f.extracted_text_summary}
                            {f.source_quote && (
                              <div className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-400">
                                “{f.source_quote}”
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${FLAG_TONE[f.risk_flag]}`}>
                              {f.risk_flag}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-xs">{Math.round(f.llm_confidence * 100)}%</td>
                          <td className="py-2 pr-3">
                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${HUMAN_TONE[f.human_status]}`}>
                              {f.human_status}
                            </span>
                          </td>
                          {canEdit && (
                            <td className="py-2">
                              <div className="flex gap-1">
                                <FindingButton findingId={f.id} vendorId={vendor.id} status="ACCEPTED" label="Accept" />
                                <FindingButton findingId={f.id} vendorId={vendor.id} status="REJECTED" label="Reject" />
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DD questionnaire */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Due-diligence questionnaire</h2>
        <div className="space-y-6">
          {vendorSections().map((section) => (
            <div key={section.key}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {section.title}
              </h3>
              <div className="space-y-3">
                {section.questions.map((q) => {
                  const a = answers.get(q.key);
                  return (
                    <div key={q.key} className="border-b border-slate-100 pb-2">
                      <div className="text-sm font-medium">
                        {q.prompt}
                        {a?.source === "EXTRACTED" && (
                          <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
                            from contract
                          </span>
                        )}
                      </div>
                      {canEdit ? (
                        <form action={saveVendorAnswerAction} className="mt-1 flex items-center gap-2">
                          <input type="hidden" name="vendor_id" value={vendor.id} />
                          <input type="hidden" name="question_key" value={q.key} />
                          {q.type === "enum" ? (
                            <select name="answer" defaultValue={a?.answer ?? ""} className="select max-w-xs">
                              <option value="">—</option>
                              {(q.options ?? []).map((o) => (
                                <option key={o}>{o}</option>
                              ))}
                            </select>
                          ) : q.type === "bool" ? (
                            <select name="answer" defaultValue={a?.answer ?? ""} className="select max-w-xs">
                              <option value="">—</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          ) : (
                            <input name="answer" defaultValue={a?.answer ?? ""} className="input" />
                          )}
                          <button className="btn-secondary" type="submit">
                            Save
                          </button>
                        </form>
                      ) : (
                        <div className="mt-1 text-sm text-slate-600">{a?.answer || "—"}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FindingButton({
  findingId,
  vendorId,
  status,
  label,
}: {
  findingId: string;
  vendorId: string;
  status: "ACCEPTED" | "REJECTED";
  label: string;
}) {
  return (
    <form action={setFindingStatusAction}>
      <input type="hidden" name="finding_id" value={findingId} />
      <input type="hidden" name="vendor_id" value={vendorId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`rounded px-2 py-1 text-xs font-semibold ${
          status === "ACCEPTED"
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-white text-red-600 border border-red-200 hover:bg-red-50"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
