// Per-block money math. No global balance — each block stands alone (spec §7).
import type { Bill, PayBlock } from '../types'

export interface BlockMoney {
  available: number
  billsTotal: number
  remaining: number
  paid: number
  sent: number
  open: number
}

// NA bills are excluded from every total.
export function blockMoney(block: PayBlock, bills: Bill[]): BlockMoney {
  const active = bills.filter((b) => !b.na)
  const sum = (list: Bill[]) => list.reduce((t, b) => t + b.amount, 0)

  const billsTotal = sum(active)
  return {
    available: block.income,
    billsTotal,
    remaining: block.income - billsTotal,
    paid: sum(active.filter((b) => b.status === 'paid')),
    sent: sum(active.filter((b) => b.status === 'sent')),
    open: sum(active.filter((b) => b.status === 'upcoming')),
  }
}

// Lateness = days the bill will actually be paid (its block's pay date) minus due date.
// Returns null when there's no due date. Negative/zero = on time.
export function daysLate(dueDate: string | null, payDate: string): number | null {
  if (!dueDate) return null
  const due = Date.parse(dueDate)
  const pay = Date.parse(payDate)
  if (Number.isNaN(due) || Number.isNaN(pay)) return null
  return Math.round((pay - due) / 86_400_000)
}

// Graduated indicator buckets (spec §12).
export type LateLevel = 'ontime' | 'amber' | 'orange' | 'red'
export function lateLevel(days: number | null): LateLevel {
  if (days === null || days <= 0) return 'ontime'
  if (days < 25) return 'amber'
  if (days < 30) return 'orange'
  return 'red'
}

export function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function moneySigned(n: number): string {
  const sign = n < 0 ? '−' : '+' // − / +
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
