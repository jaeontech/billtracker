# Bill Tracker

A simple, mobile-first shared bill tracker organized around pay events (not calendar months). Replaces a spreadsheet for one household (you + partner).

Scope: **personal**
Stage: **prototype**

Stack: **Vite + React + TypeScript SPA** · Tailwind · Supabase (Realtime + one shared login) · deployed static on Vercel.

Database: shares the existing **`mmweb-db`** Supabase project (MentoMesh's), isolated in its own **`billtracker` schema** (ref `kmyfecloewhnelwahiiz`). **No login in v1** — the schema is open to the `anon`/publishable key; RLS stays enabled with a permissive `to public` policy so adding a login later is a one-line swap (`public` → `authenticated`). No per-user accounts, no attribution. A plain `activity_log` table records *what* changed, not who.

## Guiding constraint — keep it simple

Solo-maintained. Optimize for **simple to troubleshoot over bulletproof**. One runtime (the browser); Supabase is the entire backend. When a choice is between "more robust" and "easier to understand at 11pm," choose easier. No speculative abstractions, no production hardening, no features not already in the spec.

Spec + design prototype live in the vault: `~/JaeVault/Bill Tracker/` (`bill-tracker-product-spec.md`, `bill-tracker-prototype-dark.html`).

## Standards alignment

Apply the vault App Standards tier system per `~/JaeVault/AppStandards/README.md` §Tier System.

- **prototype** → implement [Foundation] items only (TypeScript, UUID PKs, RLS enabled as a logged-in-only guard); default to [Prototype-default] (permissive policy, basic Zod); defer [Production-required] until walking `~/JaeVault/Graduation-Checklist.md`.

User has explicitly said security/authorization is a non-concern here (no real account data — just bill names and amounts). Do not add auth/privacy rigor beyond the logged-in guard unless asked.

## Core model (see spec §8)

- Bills have a **home block** derived from due day; new pay blocks auto-generate (current + next 3 months) pre-filled with their home bills.
- Moving a bill is **per-occurrence** — snaps back to home next month.
- A bill can only be moved, paid, or skipped (NA) — never silently deleted. Per-block math only; no global balance in v1.
