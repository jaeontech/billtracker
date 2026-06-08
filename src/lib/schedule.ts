// Auto-generation of scheduled pay blocks + their home bills (spec §8).
//
// Schedule = semi-monthly: two paydays a month — the 15th and the last day
// ("EOM"), matching the spreadsheet's "June 15 Paycheck" / "June EOM Paycheck".
//
// A bill's HOME block = the most recent payday on or before its due date (the
// paycheck you'd have in hand when it's due). So:
//   due 15–end  → that month's 15th paycheck
//   due 1–14    → the previous month's EOM paycheck
//
// The board shows the current block + 3 months ahead. Generation is idempotent:
// a bill is keyed by (template, due-month), so moving a bill never duplicates it,
// and next month a fresh occurrence is created back in its home block (snap-back).
import * as db from './db'
import type { Bill, PayBlock, Settings, Template } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`
const lastDayOf = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate()
const monthName = (y: number, m0: number) => new Date(y, m0, 1).toLocaleString('en-US', { month: 'long' })

interface Payday { pay_date: string; name: string }

// The canonical home payday for a due date — independent of which blocks exist:
//   due 15–29 → that month's 15th · due 30/31 → that month's EOM · due 1–14 → previous month's EOM.
// (Matches the spreadsheet: early-month and end-of-month bills ride the EOM check.)
function homePayDate(dueISO: string): string {
  const [y, m] = dueISO.split('-').map(Number)
  const d = Number(dueISO.slice(8, 10))
  const m0 = m - 1
  if (d >= 15 && d <= 29) return iso(y, m0, 15)
  if (d >= 30) return iso(y, m0, lastDayOf(y, m0))
  const prev = new Date(y, m0 - 1, 1) // due 1–14 → previous month's EOM
  return iso(prev.getFullYear(), prev.getMonth(), lastDayOf(prev.getFullYear(), prev.getMonth()))
}

// A bill's home block = the scheduled block whose pay_date is its home payday.
// Returns undefined when that block doesn't exist (e.g. just outside the window),
// so a bill is never dumped into the wrong (nearest) block. Shared by generation
// and by the move logic (to clear the "deferred" tag when a bill lands back home).
export function findHomeBlock(dueISO: string | null, blocks: PayBlock[]): PayBlock | undefined {
  if (!dueISO) return undefined
  const target = homePayDate(dueISO)
  return blocks.find((b) => b.type === 'scheduled' && b.pay_date === target)
}

// The two paydays of a given month.
function paydaysOfMonth(y: number, m0: number): Payday[] {
  const last = lastDayOf(y, m0)
  return [
    { pay_date: iso(y, m0, 15), name: `${monthName(y, m0)} 15 Paycheck` },
    { pay_date: iso(y, m0, last), name: `${monthName(y, m0)} EOM Paycheck` },
  ]
}

// Month range relative to the current month. Previous month is included so the
// current month's early bills (due 1–14, which home to the prior EOM) have a home.
function monthsRange(startOff: number, endOff: number): Array<{ y: number; m0: number }> {
  const now = new Date()
  const out: Array<{ y: number; m0: number }> = []
  for (let off = startOff; off <= endOff; off++) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1)
    out.push({ y: d.getFullYear(), m0: d.getMonth() })
  }
  return out
}

// For a scheduled block's payday, the due date a template with `dueDay` would
// have IF it homes to this block — else null. Inverse of homePayDate:
//   15th block ← due 15–29 (this month)
//   EOM block  ← due 30/31 (this month) or due 1–14 (next month)
function dueForBlock(payDateISO: string, dueDay: number): string | null {
  const [y, m] = payDateISO.split('-').map(Number)
  const m0 = m - 1
  const payDay = Number(payDateISO.slice(8, 10))
  const L = lastDayOf(y, m0)
  const isEom = payDay === L
  if (!isEom) {
    return dueDay >= 15 && dueDay <= 29 ? iso(y, m0, Math.min(dueDay, L)) : null
  }
  if (dueDay >= 30) return iso(y, m0, Math.min(dueDay, L))
  if (dueDay <= 14) {
    const nm = new Date(y, m0 + 1, 1)
    return iso(nm.getFullYear(), nm.getMonth(), Math.min(dueDay, lastDayOf(nm.getFullYear(), nm.getMonth())))
  }
  return null
}

/**
 * Ensure scheduled blocks (current + 3 months) exist, and seed home bills ONLY
 * into blocks that were just created. Existing blocks are owned by the user —
 * deletes and moves stick and are never regenerated on later loads. Snap-back
 * still works because next month's home block is freshly created and seeded.
 */
export async function ensureSchedule(
  settings: Settings,
  blocks: PayBlock[],
  templates: Template[],
): Promise<{ blocksCreated: number; billsCreated: number }> {
  const blockMonths = monthsRange(-1, 3)
  const desired = blockMonths.flatMap((mm) => paydaysOfMonth(mm.y, mm.m0))

  // Create any scheduled blocks that don't exist yet (matched by pay_date).
  const existingScheduled = blocks.filter((b) => b.type === 'scheduled')
  const haveDate = new Set(existingScheduled.map((b) => b.pay_date))
  const blocksToCreate = desired
    .filter((p) => !haveDate.has(p.pay_date))
    .map((p) => ({ name: p.name, type: 'scheduled' as const, pay_date: p.pay_date, income: settings.default_income }))
  const created = await db.insertBlocks(blocksToCreate)

  // Seed each NEW block with the recurring bills whose home it is.
  const billsToCreate: Array<Partial<Bill>> = []
  for (const blk of created) {
    for (const t of templates) {
      if (!t.active) continue
      const dueISO = dueForBlock(blk.pay_date, t.due_day)
      if (!dueISO) continue
      billsToCreate.push({
        pay_block_id: blk.id,
        template_id: t.id,
        name: t.name,
        amount: t.amount,
        method: t.method,
        due_date: dueISO,
        status: 'upcoming',
      })
    }
  }
  await db.insertBills(billsToCreate)

  return { blocksCreated: created.length, billsCreated: billsToCreate.length }
}
