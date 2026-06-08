// Smoke test for auto-generation against the real DB. Inserts temp templates,
// runs the actual ensureSchedule(), prints what landed, then cleans up the
// temp templates (leaves the generated scheduled blocks — they're valid).
import { readFileSync } from 'node:fs'
import ws from 'ws'
;(globalThis as any).WebSocket = ws // realtime needs a WS ctor under Node 20
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const { supabase } = await import('../src/lib/supabase.ts')
const db = await import('../src/lib/db.ts')
const { ensureSchedule } = await import('../src/lib/schedule.ts')

const tmpl = [
  { name: 'ZZTest Verizon', amount: 285, method: 'auto' as const, due_day: 20 },
  { name: 'ZZTest Mortgage', amount: 5000, method: 'manual' as const, due_day: 1 },
  { name: 'ZZTest Netflix', amount: 28, method: 'auto' as const, due_day: 25 },
]
for (const t of tmpl) await db.addTemplate(t)

const [st, templates] = [await db.getSettings(), await db.getTemplates()]
const [blocks, bills] = [await db.getBlocks(), await db.getBills()]
const res = await ensureSchedule(st, blocks, bills, templates.filter((t) => t.name.startsWith('ZZTest')))
console.log('generated:', res)

const blocks2 = await db.getBlocks()
const bills2 = await db.getBills()
console.log('\nScheduled blocks:')
for (const b of blocks2.filter((b) => b.type === 'scheduled')) console.log(' ', b.pay_date, b.name)
console.log('\nZZTest bills (name → due → home block):')
for (const bi of bills2.filter((b) => b.name.startsWith('ZZTest'))) {
  const home = blocks2.find((b) => b.id === bi.pay_block_id)
  console.log(' ', bi.name.padEnd(18), bi.due_date, '→', home?.name)
}

// cleanup temp templates + their generated bills
await supabase.from('bills').delete().like('name', 'ZZTest%')
await supabase.from('recurring_templates').delete().like('name', 'ZZTest%')
console.log('\ncleaned up ZZTest templates + bills')
