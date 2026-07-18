# Registry — AI Governance & Compliance Platform (MVP)

A multi-tenant B2B SaaS that helps mid-market companies comply with AI
governance obligations (EU AI Act, ISO 42001, DORA, internal AI policy).
Three jobs, one platform: **Discover → Register → Evidence**. This repository
is the **Phase 1 MVP**.

> **This product provides compliance tooling, not legal advice.** Tenant
> documents are treated as confidential; no tenant data is used for model
> training.

---

## What's in the MVP

### 1. AI System Register
- CRUD for AI systems (name, vendor, purpose, owner, data categories, deployment status).
- **Deterministic EU AI Act risk classifier** — a ~12-question guided
  questionnaire drives an ordered **rules engine** (not an LLM) that assigns
  `PROHIBITED / HIGH / LIMITED / MINIMAL`, with the deciding rule, citation,
  rationale, and a full evaluation trace stored for reproducibility.
- Risk tier drives a **required-controls checklist** (e.g. high-risk → human
  oversight, logging, accuracy monitoring), each with an Article citation.

### 2. Vendor AI Due Diligence
- Vendor records + a structured ~25-question DD questionnaire (versioned JSON).
- **LLM-assisted contract review**: upload a contract/DPA (PDF/DOCX/TXT) →
  text is extracted server-side → Claude extracts AI-relevant clauses into
  structured findings. **Human-in-the-loop is mandatory** — every finding
  lands `PENDING` and only becomes authoritative when a user **accepts** it.
  `prompt_version` and `model_id` are stored on every finding.

### 3. Evidence Pack Generator
- **Register export** (`.xlsx`, exceljs).
- **Per-system risk assessment** (PDF via headless Chromium; HTML fallback) —
  includes the reproducible classification reasoning + rule trace + controls.
- **Gap report** (PDF/HTML) — what's missing per system's tier.

### Cross-cutting
- **Multi-tenant** — `tenant_id` on every table; **Postgres Row-Level
  Security** policies in `db/schema.sql`.
- **Audit log everything** — append-only, with `diff_json` per change.
- **Roles enforced** — `ADMIN` / `CONTRIBUTOR` / `VIEWER`.

---

## Architecture & key decisions

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript + Tailwind | Server components + server actions |
| Determinism | Classifier is a **pure rules engine** over versioned JSON | LLM is used only for document extraction, never for tiering |
| Data | **Repository abstraction** (`lib/db/repository.ts`) | In-memory seeded store by default so it runs with zero external services; `db/schema.sql` is the production Postgres/Supabase target with RLS |
| LLM | Anthropic API (Claude Sonnet) via a forced tool call for structured JSON | Deterministic offline **mock** when `ANTHROPIC_API_KEY` is unset — every flow is demonstrable locally |
| Auth | Session cookie; `AUTH_MODE=local` demo picker | `AUTH_MODE=workos` (Entra ID / Google SSO) is the documented production path |
| Exports | exceljs (xlsx) + Chromium HTML→PDF | PDF path degrades to HTML if Chromium is unavailable |

### Versioned, auditable config (`config/`)
- `classification.questions.v1.json` — the ~12 questions.
- `classifier.rules.v1.json` — ordered rules; each carries the tier it assigns
  and a citation (e.g. `Art. 5(1)(c)`, `Annex III(4)`).
- `controls.v1.json` — required controls per tier, with citations.
- `vendor.questionnaire.v1.json` — ~25 DD questions (versioned).
- `prompts/contract-extraction.v1.json` — extraction prompt + clause taxonomy;
  the `prompt_version` is stamped on every finding.

Classification is **reproducible from stored answers + rule-set version alone**.

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables are required — the app self-seeds an in-memory tenant
and uses the offline extraction mock. Sign in with a demo account:

| Email | Role |
|---|---|
| `admin@demo.test` | ADMIN |
| `contrib@demo.test` | CONTRIBUTOR |
| `viewer@demo.test` | VIEWER |

To enable the real LLM extraction, copy `.env.example` → `.env.local` and set
`ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default
`claude-sonnet-5`).

### Scripts
```bash
npm test           # vitest — classifier fixtures, controls/gap, extraction, exports
npm run typecheck  # tsc --noEmit
npm run build      # next build
```

---

## Tests

`npm test` runs the suite (43 tests):
- **`tests/classifier.test.ts`** — ~20 fixture systems covering every tier,
  precedence (`PROHIBITED > HIGH > LIMITED > MINIMAL`), the Art. 6(3)
  derogation, determinism/purity, and questionnaire integrity.
- **`tests/controls-gap.test.ts`** — tier→controls mapping and gap reporting.
- **`tests/extract.test.ts`** — offline extraction determinism + version stamping.
- **`tests/exports.test.ts`** — xlsx magic bytes, assessment/gap HTML, HTML escaping.

---

## Data model

See `db/schema.sql` for the authoritative Postgres schema (enums, foreign keys,
RLS policies, append-only audit log). Core tables: `tenants`, `users`,
`ai_systems`, `classification_answers`, `controls`, `vendors`,
`vendor_questionnaires`, `contracts`, `contract_findings`, `audit_log`.

RLS scopes every row to `current_setting('app.tenant_id')`, set per request
after authentication.

---

## Definition of Done — status

- [x] Tenant sign-in with roles enforced (SSO documented as the production path)
- [x] Add an AI system, complete classification, get tier + required-controls
      checklist with cited reasoning
- [x] Upload a vendor contract, receive extracted findings, accept/reject each
- [x] Export evidence pack (register xlsx + risk-assessment PDF + gap report)
- [x] Full audit log; classifier unit tests pass; prompt/rule versions recorded

---

## Not in scope (Phase 2)
Shadow-AI discovery via SSO/audit logs, policy attestation campaigns, full
ISO 42001 control mapping, DORA register views, integrations marketplace.

---

## Security notes
- Remaining `npm audit` advisories are confined to **dev tooling**
  (vitest/vite/esbuild/postcss) and do not ship in the production runtime.
- Uploaded originals are written to `./.data/uploads` in local mode; in
  production use Supabase Storage (`STORAGE_MODE=supabase`) with encryption at
  rest. EU/UK data-residency is noted on the roadmap.
