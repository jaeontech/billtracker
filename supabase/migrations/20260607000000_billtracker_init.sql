-- Bill Tracker — initial schema
-- Lives in its OWN schema `billtracker` inside the shared mmweb-db project, so it
-- is fully isolated from MentoMesh (which lives in `public`). The separate schema
-- is what prevents any collision — dropping the whole experiment later is just:
--   drop schema billtracker cascade;
--
-- Auth model: ONE shared login for the household (you + partner use the same
-- account). No per-user accounts, no households table, no attribution. The only
-- access guard is "must be logged in to touch the data" — so the tables aren't
-- sitting on the public anon endpoint where an anonymous request could wipe them.
-- This is a guard, not real security (by design — no sensitive account data here).

create schema if not exists billtracker;

-- ─── App settings (single row) ───────────────────────────────────────────────
-- Holds the global config that used to justify a households table: the default
-- paycheck amount and the pay schedule. Exactly one row (id is pinned to 1).
create table billtracker.settings (
  id              smallint primary key default 1 check (id = 1),
  default_income  numeric(12,2) not null default 0,   -- seeded into scheduled blocks
  pay_schedule    text not null default 'semimonthly',
  updated_at      timestamptz not null default now()
);

-- ─── Recurring templates (the "standard bills") ──────────────────────────────
create table billtracker.recurring_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  amount      numeric(12,2) not null default 0,
  method      text not null default 'manual' check (method in ('auto','manual')),
  due_day     int  not null check (due_day between 1 and 31),  -- drives the "home" block
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── Pay blocks ──────────────────────────────────────────────────────────────
create table billtracker.pay_blocks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                              -- e.g. "June 15 Paycheck"
  type          text not null default 'scheduled' check (type in ('scheduled','adhoc')),
  pay_date      date not null,                              -- money lands; lateness measured against this
  period_start  date,
  period_end    date,
  income        numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);

-- ─── Bills (the movable objects) ─────────────────────────────────────────────
create table billtracker.bills (
  id                     uuid primary key default gen_random_uuid(),
  pay_block_id           uuid not null references billtracker.pay_blocks(id) on delete cascade,
  template_id            uuid references billtracker.recurring_templates(id) on delete set null, -- null = ad-hoc/one-off
  name                   text not null,
  amount                 numeric(12,2) not null default 0,
  method                 text not null default 'manual' check (method in ('auto','manual')),
  due_date               date,
  status                 text not null default 'upcoming' check (status in ('upcoming','sent','paid')),
  na                     boolean not null default false,    -- skip / not owed this block (excluded from totals)
  deferred_from_block_id uuid references billtracker.pay_blocks(id) on delete set null,
  date_sent              date,
  date_paid              date,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ─── Activity log (what changed — not who) ───────────────────────────────────
-- A plain, human-readable history. The app writes one row per meaningful change
-- (move, mark paid, defer, add, edit income, …) through a single helper, so it's
-- easy to follow in code — no hidden triggers.
create table billtracker.activity_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  entity_type  text not null,                               -- 'bill' | 'pay_block' | 'template' | 'settings'
  entity_id    uuid,
  action       text not null,                               -- 'created' | 'updated' | 'moved' | 'paid' | 'sent' | 'deferred' | 'skipped' | 'deleted'
  description  text not null                                -- e.g. "Moved Verizon → June 23 Paycheck"
);

create index on billtracker.pay_blocks (pay_date);
create index on billtracker.bills (pay_block_id);
create index on billtracker.activity_log (at desc);

-- ─── Access guard: logged-in only ────────────────────────────────────────────
-- Enable RLS and grant to `authenticated` only. Not granting to `anon` means the
-- public anon key can't read or write until you've logged in with the shared account.
alter table billtracker.settings            enable row level security;
alter table billtracker.recurring_templates enable row level security;
alter table billtracker.pay_blocks          enable row level security;
alter table billtracker.bills               enable row level security;
alter table billtracker.activity_log        enable row level security;

create policy authed_all on billtracker.settings            for all to authenticated using (true) with check (true);
create policy authed_all on billtracker.recurring_templates for all to authenticated using (true) with check (true);
create policy authed_all on billtracker.pay_blocks          for all to authenticated using (true) with check (true);
create policy authed_all on billtracker.bills               for all to authenticated using (true) with check (true);
create policy authed_all on billtracker.activity_log        for all to authenticated using (true) with check (true);

-- ─── Grants + expose to the API ──────────────────────────────────────────────
grant usage on schema billtracker to authenticated, service_role;
grant all on all tables in schema billtracker to authenticated, service_role;
alter default privileges in schema billtracker grant all on tables to authenticated, service_role;

-- Seed the single settings row.
insert into billtracker.settings (id) values (1) on conflict (id) do nothing;

-- NOTE: add `billtracker` to PostgREST's exposed schemas
-- (Dashboard → Settings → API → Exposed schemas: add `billtracker`), otherwise the
-- JS client can't reach it. The client targets it via supabase.schema('billtracker').
