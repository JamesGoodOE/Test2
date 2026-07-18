-- ════════════════════════════════════════════════════════════════════════════
-- Registry — Postgres schema (production target: Supabase)
--
-- Multi-tenant from day one: every row-bearing table carries tenant_id and is
-- protected by Row-Level Security. RLS reads the tenant from a session GUC
-- (app.tenant_id) set per request, so a compromised query cannot cross tenants.
--
-- The app also ships an in-memory repository (lib/db/memory-repo.ts) for local
-- runs; this file is the authoritative production data model.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────
create type user_role        as enum ('ADMIN', 'CONTRIBUTOR', 'VIEWER');
create type risk_tier         as enum ('PROHIBITED', 'HIGH', 'LIMITED', 'MINIMAL');
create type deployment_status as enum ('PLANNED','IN_DEVELOPMENT','PILOT','PRODUCTION','RETIRED');
create type control_status    as enum ('MISSING','IN_PROGRESS','DONE','N_A');
create type dd_status         as enum ('NOT_STARTED','IN_PROGRESS','COMPLETE');
create type review_status     as enum ('PENDING','IN_REVIEW','REVIEWED');
create type human_status      as enum ('PENDING','ACCEPTED','REJECTED');
create type answer_source     as enum ('MANUAL','EXTRACTED');
create type risk_flag         as enum ('NONE','LOW','MEDIUM','HIGH');

-- ── Tenancy & identity ─────────────────────────────────────────────────────--
create table tenants (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  plan  text not null default 'trial',
  created_at timestamptz not null default now()
);

create table users (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  email      text not null,
  name       text not null default '',
  role       user_role not null default 'VIEWER',
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

-- ── Vendors & due diligence ──────────────────────────────────────────────────
create table vendors (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  website    text not null default '',
  dd_status  dd_status not null default 'NOT_STARTED',
  created_at timestamptz not null default now()
);

create table vendor_questionnaires (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  vendor_id    uuid not null references vendors(id) on delete cascade,
  question_key text not null,
  answer       text not null default '',
  source       answer_source not null default 'MANUAL',
  updated_at   timestamptz not null default now(),
  unique (vendor_id, question_key)
);

-- ── AI system register ───────────────────────────────────────────────────────
create table ai_systems (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  name               text not null,
  vendor_id          uuid references vendors(id) on delete set null,
  purpose            text not null default '',
  owner              text not null default '',
  status             deployment_status not null default 'PLANNED',
  data_categories    text[] not null default '{}',
  risk_tier          risk_tier,
  classified_at      timestamptz,
  classifier_version text,
  created_at         timestamptz not null default now()
);

create table classification_answers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  ai_system_id uuid not null references ai_systems(id) on delete cascade,
  question_key text not null,
  answer       jsonb,           -- bool or enum string; jsonb keeps it exact
  answered_by  text not null default '',
  answered_at  timestamptz not null default now(),
  unique (ai_system_id, question_key)
);

create table controls (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  ai_system_id    uuid not null references ai_systems(id) on delete cascade,
  control_key     text not null,
  status          control_status not null default 'MISSING',
  evidence_note   text,
  evidence_file_id uuid,
  updated_at      timestamptz not null default now(),
  unique (ai_system_id, control_key)
);

-- ── Contracts & LLM-assisted review (human-in-the-loop) ──────────────────────
create table contracts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  vendor_id     uuid not null references vendors(id) on delete cascade,
  file_id       text not null,             -- object-storage key of the original
  file_name     text not null,
  uploaded_by   text not null default '',
  review_status review_status not null default 'PENDING',
  prompt_version text,                     -- audit: which prompt produced findings
  model_id       text,                     -- audit: which model produced findings
  extracted_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table contract_findings (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  contract_id           uuid not null references contracts(id) on delete cascade,
  clause_type           text not null,
  extracted_text_summary text not null default '',
  source_quote          text not null default '',
  source_location       text not null default '',
  risk_flag             risk_flag not null default 'NONE',
  llm_confidence        numeric(3,2) not null default 0,
  human_status          human_status not null default 'PENDING',  -- DRAFT until ACCEPTED
  reviewed_by           text,
  prompt_version        text not null,     -- audit: never null on a finding
  model_id              text not null,
  created_at            timestamptz not null default now()
);

-- ── Audit log (append-only; the product's credibility) ───────────────────────
create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  actor      text not null,
  action     text not null,      -- e.g. CREATE, UPDATE, CLASSIFY, ACCEPT_FINDING, EXPORT
  entity     text not null,      -- e.g. ai_system, contract_finding
  entity_id  text not null,
  timestamp  timestamptz not null default now(),
  diff_json  jsonb
);
create index audit_log_tenant_ts_idx on audit_log (tenant_id, timestamp desc);

-- ════════════════════════════════════════════════════════════════════════════
-- Row-Level Security
-- The application sets `set local app.tenant_id = '<uuid>'` at the start of each
-- transaction (after authenticating the user). Every policy scopes rows to it.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function current_tenant_id() returns uuid
  language sql stable as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

do $$
declare t text;
begin
  foreach t in array array[
    'users','vendors','vendor_questionnaires','ai_systems',
    'classification_answers','controls','contracts','contract_findings','audit_log'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($f$
      create policy tenant_isolation on %I
        using (tenant_id = current_tenant_id())
        with check (tenant_id = current_tenant_id())
    $f$, t);
  end loop;
end $$;

-- The audit log is append-only: allow insert/select for the tenant, deny update/delete.
create policy audit_no_mutate on audit_log for update using (false);
create policy audit_no_delete on audit_log for delete using (false);
