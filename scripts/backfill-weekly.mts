// One-time: seed weekly-template bills (e.g. "Household 09/18") into scheduled
// blocks that already existed before weekly templates shipped — the generator
// only seeds newly-created blocks. Fridays from today on; skips completed and
// hidden blocks. Idempotent on (template_id, due_date) across ALL bills, so a
// Friday bill that was moved to another block is never re-added.
//   npx tsx scripts/backfill-weekly.mts          # dry run (preview)
//   npx tsx scripts/backfill-weekly.mts --apply  # insert
import { readFileSync } from 'node:fs'
import ws from 'ws'
;(globalThis as any).WebSocket = ws // realtime needs a WS ctor under Node 20
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const db = await import('../src/lib/db.ts')
const { billsForBlock } = await import('../src/lib/schedule.ts')

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` // local date

const [templates, blocks, bills] = await Promise.all([db.getTemplates(), db.getBlocks(), db.getBills()])
const weekly = templates.filter((t) => t.active && t.weekday !== null)
const have = new Set(bills.map((b) => `${b.template_id}|${b.due_date}`))
const rows = blocks
  .filter((b) => b.type === 'scheduled' && !b.completed && !b.hidden)
  .flatMap((blk) => weekly.flatMap((t) => billsForBlock(blk, t)))
  .filter((r) => `${r.due_date}` >= today && !have.has(`${r.template_id}|${r.due_date}`))

console.log(`weekly templates: ${weekly.map((t) => `${t.name} ($${t.amount})`).join(', ') || '(none)'}\n`)
for (const r of rows) {
  const blk = blocks.find((b) => b.id === r.pay_block_id)
  console.log(' ', `${blk?.name}`.padEnd(24), `${r.name}`.padEnd(18), r.due_date)
}
console.log(`\n${rows.length} weekly bill(s) to add`)

if (!process.argv.includes('--apply')) {
  console.log('dry run — rerun with --apply to insert')
  process.exit(0)
}
await db.insertBills(rows)
await db.logActivity('template', null, 'created', `Backfilled ${rows.length} weekly bills`)
console.log('inserted')
process.exit(0)
