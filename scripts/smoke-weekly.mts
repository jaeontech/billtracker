// Smoke test for weekly templates (no DB writes): runs billsForBlock() against
// fake blocks and checks each Friday lands in the right pay block — including
// the 3-Friday and February edge cases. Exits non-zero on any failure.
import { readFileSync } from 'node:fs'
import ws from 'ws'
import type { PayBlock, Template } from '../src/types.ts'
;(globalThis as any).WebSocket = ws // realtime needs a WS ctor under Node 20
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const { billsForBlock } = await import('../src/lib/schedule.ts')

const block = (pay_date: string) => ({ id: pay_date, name: pay_date, type: 'scheduled', pay_date }) as PayBlock
const tpl = (p: Partial<Template>) =>
  ({ id: 't', name: 'Household', amount: 600, method: 'manual', active: true, due_day: null, weekday: null, created_at: '', ...p }) as Template
const fri = { weekday: 5 }

const cases: Array<[string, Partial<Template>, string[]]> = [
  ['2026-09-15', fri, ['2026-09-18', '2026-09-25']],
  ['2026-10-31', fri, ['2026-10-30', '2026-11-06', '2026-11-13']], // 3 Fridays
  ['2026-12-31', fri, ['2027-01-01', '2027-01-08']], // crosses the year
  ['2027-01-15', fri, ['2027-01-15', '2027-01-22', '2027-01-29']], // payday is a Friday
  ['2027-02-15', fri, ['2027-02-19', '2027-02-26']],
  ['2027-02-28', fri, ['2027-03-05', '2027-03-12']], // Feb EOM covers only Mar 1–14
  ['2026-09-15', { due_day: 20 }, ['2026-09-20']], // monthly still one bill
  ['2026-09-15', { ...fri, active: false }, []], // paused → nothing
]

let fail = 0
for (const [pay, t, want] of cases) {
  const got = billsForBlock(block(pay), tpl(t)).map((b) => b.due_date)
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(ok ? 'PASS' : 'FAIL', pay, JSON.stringify(t), '→', got.join(', ') || '(none)', ok ? '' : `  want ${want.join(', ')}`)
}

const name = billsForBlock(block('2026-09-15'), tpl(fri))[0]?.name
const nameOk = name === 'Household 09/18'
if (!nameOk) fail++
console.log(nameOk ? 'PASS' : 'FAIL', 'name →', name)

console.log(fail ? `\n${fail} failure(s)` : '\nall passed')
process.exit(fail ? 1 : 0)
