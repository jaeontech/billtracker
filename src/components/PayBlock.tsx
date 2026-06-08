import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Bill, PayBlock as PayBlockT } from '../types'
import { blockMoney, money, moneySigned } from '../lib/money'
import { useLocked } from '../lib/lock'
import BillRow from './BillRow'

interface Props {
  block: PayBlockT
  bills: Bill[]
  blocks: PayBlockT[]
  onCycleStatus: (bill: Bill, next: Bill['status']) => void
  onMove: (bill: Bill, toBlockId: string) => void
  onSkip: (bill: Bill, na: boolean) => void
  onDelete: (bill: Bill) => void
  onEditAmount: (bill: Bill, amount: number) => void
  onEditName: (bill: Bill, name: string) => void
  onEditDue: (bill: Bill, due: string | null) => void
  onToggleComplete: (block: PayBlockT, completed: boolean) => void
  onHide: (block: PayBlockT) => void
  onEditIncome: (block: PayBlockT, income: number) => void
  onAddBill: (blockId: string, b: { name: string; amount: number; method: 'auto' | 'manual'; due_date: string | null }) => void
}

export default function PayBlock({ block, bills, blocks, onCycleStatus, onMove, onSkip, onDelete, onEditAmount, onEditName, onEditDue, onToggleComplete, onHide, onEditIncome, onAddBill }: Props) {
  const m = blockMoney(block, bills)
  const { setNodeRef, isOver } = useDroppable({ id: block.id })
  const locked = useLocked()
  // Collapse the bill list — a per-device view preference, persisted in localStorage.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(`bt:collapsed:${block.id}`) === '1' } catch { return false }
  })
  function toggleCollapsed() {
    setCollapsed((v) => {
      const nv = !v
      try { localStorage.setItem(`bt:collapsed:${block.id}`, nv ? '1' : '0') } catch { /* ignore */ }
      return nv
    })
  }
  const [adding, setAdding] = useState(false)
  const [editingIncome, setEditingIncome] = useState(false)
  const [incomeVal, setIncomeVal] = useState(String(block.income))
  function commitIncome() {
    setEditingIncome(false)
    const n = Number(incomeVal)
    if (!Number.isNaN(n) && n !== block.income) onEditIncome(block, n)
  }
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'auto' | 'manual'>('manual')
  const [due, setDue] = useState('')

  const dateLabel = new Date(block.pay_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  function submit() {
    if (!name.trim()) return
    onAddBill(block.id, {
      name: name.trim(),
      amount: Number(amount) || 0,
      method,
      due_date: due || null,
    })
    setName(''); setAmount(''); setDue(''); setMethod('manual'); setAdding(false)
  }

  // Completed → collapse to a one-line summary with Reopen / Hide.
  if (block.completed) {
    return (
      <div className="flex items-center gap-2 py-2 px-1 mb-3 border-b border-surface text-sm opacity-45">
        <span className="text-faint text-[13px] shrink-0">✓</span>
        <span className="font-display font-medium truncate text-muted">{block.name}</span>
        <span className="text-faint text-[11px] shrink-0">{dateLabel}</span>
        <span className="flex-1 min-w-2" />
        <span className="font-bold tabular-nums shrink-0 text-muted">{moneySigned(m.remaining)}</span>
        {!locked && (
          <>
            <button onClick={() => onToggleComplete(block, false)} className="text-muted text-[11px] font-semibold shrink-0">Reopen</button>
            <button onClick={() => onHide(block)} className="text-faint text-[11px] font-semibold shrink-0">Hide</button>
          </>
        )}
      </div>
    )
  }

  return (
    <section ref={setNodeRef} className="mb-14">
      {/* Header */}
      <div className={`px-6 py-3 -mx-3.5 transition-colors ${isOver ? 'bg-accent/20' : 'bg-surface-2'}`}>
        <div className="flex items-start">
          {/* chevron gutter — fixed 20px wide, h-7 box matches the title line so it top-aligns */}
          <button onClick={toggleCollapsed} aria-label="Toggle bills"
            className={`w-5 h-7 flex items-center justify-center text-faint text-[10px] shrink-0 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}>
            ▶
          </button>
          {/* content column — name, money, status all align here */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center gap-2">
              <button onClick={toggleCollapsed} className="flex items-baseline gap-2 min-w-0 text-left">
                <span className="font-display text-xl font-medium tracking-tight truncate">{block.name}</span>
                {collapsed && bills.length > 0 && (
                  <span className="text-faint text-[11px] font-medium shrink-0">· {bills.length}</span>
                )}
              </button>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[9px] tracking-[0.16em] uppercase font-bold ${block.type === 'adhoc' ? 'text-accent' : 'text-faint'}`}>
                  {block.type === 'adhoc' ? 'Ad-hoc' : 'Scheduled'}
                </span>
                {!locked && (
                  <button onClick={() => onToggleComplete(block, true)} className="flex items-center gap-1 text-[10px] font-semibold text-muted">
                    <span className="w-3.5 h-3.5 rounded-full border border-muted flex items-center justify-center text-[8px] leading-none">✓</span>
                    Done
                  </button>
                )}
              </div>
            </div>

            {/* Money — big Remaining headline anchors the row; Avail/Bills support it */}
            <div className="flex items-baseline justify-between gap-3 mt-2">
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className={`text-[23px] font-bold tabular-nums tracking-tight leading-none ${m.remaining >= 0 ? 'text-green' : 'text-red'}`}>
                  {moneySigned(m.remaining)}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-muted font-semibold">left</span>
              </div>
              <div className="flex items-baseline gap-3.5 text-[11px]">
                {editingIncome ? (
                  <span className="flex items-baseline gap-1">
                    <span className="text-[9px] uppercase tracking-wide text-muted font-semibold">Avail</span>
                    <input autoFocus value={incomeVal} onChange={(e) => setIncomeVal(e.target.value)} onBlur={commitIncome}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingIncome(false) }}
                      inputMode="decimal"
                      className="bg-bg rounded px-1 w-16 text-ink font-semibold tabular-nums outline-none ring-1 ring-accent/50" />
                  </span>
                ) : (
                  <button disabled={locked} onClick={() => { setIncomeVal(String(block.income)); setEditingIncome(true) }}
                    className="flex items-baseline gap-1">
                    <span className="text-[9px] uppercase tracking-wide text-muted font-semibold">Avail</span>
                    <span className="text-ink font-semibold tabular-nums">{money(m.available)}</span>
                  </button>
                )}
                <SupFig label="Bills" value={money(m.billsTotal)} />
              </div>
            </div>
            {/* Status breakdown — zoned off below a hairline */}
            <div className="flex gap-4 mt-2 pt-2 border-t border-white/10 text-[10.5px] font-medium">
              <StatusBit label="Paid" value={money(m.paid)} tone="text-green" />
              <StatusBit label="Sent" value={money(m.sent)} tone="text-blue" />
              <StatusBit label="Open" value={money(m.open)} tone="text-muted" />
            </div>
          </div>
        </div>
      </div>

      {!collapsed && (
      <>
      {/* Bills — left-padded to line up under the title (header offset + chevron gutter) */}
      <div className="mt-3 pl-[30px] pr-4">
        {bills.length === 0 && !adding && (
          <div className="text-[13px] text-faint py-2">No bills in this block yet.</div>
        )}
        {bills.map((bill) => (
          <BillRow
            key={bill.id}
            bill={bill}
            block={block}
            blocks={blocks}
            onCycleStatus={onCycleStatus}
            onMove={onMove}
            onSkip={onSkip}
            onDelete={onDelete}
            onEditAmount={onEditAmount}
            onEditName={onEditName}
            onEditDue={onEditDue}
          />
        ))}
      </div>

      {/* Add bill */}
      {!locked && (adding ? (
        <div className="pl-[30px] pr-4 mt-2 flex flex-wrap items-center gap-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Bill name"
            className="bg-surface rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[120px]" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$0"
            className="bg-surface rounded-lg px-3 py-2 text-sm outline-none w-20 tabular-nums" />
          <input value={due} onChange={(e) => setDue(e.target.value)} type="date"
            className="bg-surface rounded-lg px-3 py-2 text-sm outline-none text-muted" />
          <button onClick={() => setMethod(method === 'manual' ? 'auto' : 'manual')}
            className="bg-surface rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {method}
          </button>
          <button onClick={submit} className="bg-accent text-[#07150e] rounded-lg px-4 py-2 text-sm font-bold">Add</button>
          <button onClick={() => setAdding(false)} className="text-muted text-sm px-2">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="pl-[30px] pt-3 text-muted text-[12.5px] font-semibold">
          + Add bill
        </button>
      ))}
      </>
      )}
    </section>
  )
}

// Small supporting figure (Avail / Bills) — label + value inline.
function SupFig({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[9px] uppercase tracking-wide text-muted font-semibold">{label}</span>
      <span className="text-ink font-semibold tabular-nums">{value}</span>
    </span>
  )
}

// One labeled chip in the Paid · Sent · Open breakdown row.
function StatusBit({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-wide text-muted font-semibold">{label}</span>
      <span className={`font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  )
}
