import { createClient } from '@supabase/supabase-js'

// Public anon key — safe to ship to the browser. All data protection lives in
// Supabase Row-Level Security (policies scoped by household). See CLAUDE.md.
// Reads Vite env in the browser; falls back to process.env so the same modules
// can run under Node (used for the generation smoke-test).
const env = (import.meta as any).env ?? {}
const url = env.VITE_SUPABASE_URL ?? (globalThis as any).process?.env?.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? (globalThis as any).process?.env?.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loud and obvious — simplest thing to troubleshoot.
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

// All queries default to the `billtracker` schema (isolated from MentoMesh's
// `public`). Tables are reached as supabase.from('bills'), etc.
export const supabase = createClient(url, anonKey, {
  db: { schema: 'billtracker' },
})
