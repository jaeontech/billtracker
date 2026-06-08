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

// The two paydays of a given month.
function paydaysOfMonth(y: number, m0: number): Payday[] {
  const last = lastDayOf(y, m0)
  return [
    { pay_date: iso(y, m0, 15), name: `${monthName(y, m0)} 15 Paycheck` },
    { pay_date: iso(y, m0, last), name: `${monthName(y, m0)} EOM Paycheck` },
  ]
}

// Window: previous month (so current-month early bills have their home) through +3 months.
function windowMonths(): Array<{ y: number; m0: number }> {
  const now = new Date()
  const out: Array<{ y: number; m0: number }> = []
  for (let off = -1; off <= 3; off++) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1)
    out.push({ y: d.getFullYear(), m0: d.getMonth() })
  }
  return out
}

/**
 * Make sure scheduled blocks (current + 3 months) exist and each recurring bill
 * has its occurrence in its home block. Returns how many of each it created so
 * the caller can refresh only when something changed.
 */
export async function ensureSchedule(
  settings: Settings,
  blocks: PayBlock[],
  bills: Bill[],
  templates: Template[],
): Promise<{ blocksCreated: number; billsCreated: number }> {
  const months = windowMonths()

  // 1) Desired paydays for the window.
  const desired = months.flatMap((mm) => paydaysOfMonth(mm.y, mm.m0))

  // 2) Create any scheduled blocks that don't exist yet (matched by pay_date).
  const existingScheduled = blocks.filter((b) => b.type === 'scheduled')
  const haveDate = new Set(existingScheduled.map((b) => b.pay_date))
  const blocksToCreate = desired
    .filter((p) => !haveDate.has(p.pay_date))
    .map((p) => ({ name: p.name, type: 'scheduled' as const, pay_date: p.pay_date, income: settings.default_income }))
  const created = await db.insertBlocks(blocksToCreate)

  // 3) All scheduled blocks we can use as homes, sorted by pay_date.
  const scheduled = [...existingScheduled, ...created].sort((a, b) => a.pay_date.localeCompare(b.pay_date))
  const homeFor = (dueISO: string): PayBlock | undefined => {
    let home: PayBlock | undefined
    for (const b of scheduled) {
      if (b.pay_date <= dueISO) home = b // scheduled is sorted asc → last match wins
      else break
    }
    return home
  }

  // 4) One occurrence per (template, due-month). Skip if it already exists anywhere
  //    (so a moved bill isn't duplicated).
  const seen = new Set(bills.filter((b) => b.template_id).map((b) => `${b.template_id}|${(b.due_date ?? '').slice(0, 7)}`))
  const billsToCreate: Array<Partial<Bill>> = []
  for (const t of templates) {
    if (!t.active) continue
    for (const mm of months) {
      const day = Math.min(t.due_day, lastDayOf(mm.y, mm.m0))
      const dueISO = iso(mm.y, mm.m0, day)
      const key = `${t.id}|${dueISO.slice(0, 7)}`
      if (seen.has(key)) continue
      const home = homeFor(dueISO)
      if (!home) continue
      seen.add(key)
      billsToCreate.push({
        pay_block_id: home.id,
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
