import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Bill, PayBlock as PayBlockT } from '../types'
import { blockMoney, money, moneySigned } from '../lib/money'
import BillRow from './BillRow'

interface Props {
  block: PayBlockT
  bills: Bill[]
  blocks: PayBlockT[]
  current?: boolean
  onCycleStatus: (bill: Bill, next: Bill['status']) => void
  onMove: (bill: Bill, toBlockId: string) => void
  onSkip: (bill: Bill, na: boolean) => void
  onDelete: (bill: Bill) => void
  onEditAmount: (bill: Bill, amount: number) => void
  onEditName: (bill: Bill, name: string) => void
  onEditDue: (bill: Bill, due: string | null) => void
  onToggleComplete: (block: PayBlockT, completed: boolean) => void
  onHide: (block: PayBlockT) => void
  onAddBill: (blockId: string, b: { name: string; amount: number; method: 'auto' | 'manual'; due_date: string | null }) => void
}

export default function PayBlock({ block, bills, blocks, current, onCycleStatus, onMove, onSkip, onDelete, onEditAmount, onEditName, onEditDue, onToggleComplete, onHide, onAddBill }: Props) {
  const m = blockMoney(block, bills)
  const { setNodeRef, isOver } = useDroppable({ id: block.id })
  const [adding, setAdding] = useState(false)
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
        <button onClick={() => onToggleComplete(block, false)} className="text-muted text-[11px] font-semibold shrink-0">Reopen</button>
        <button onClick={() => onHide(block)} className="text-faint text-[11px] font-semibold shrink-0">Hide</button>
      </div>
    )
  }

  return (
    <section ref={setNodeRef} className="mb-14">
      {/* Header */}
      <div className={`px-6 py-3 -mx-3.5 transition-colors ${isOver ? 'bg-accent/20' : 'bg-surface-2'}`}>
        <div className="flex justify-between items-center gap-2">
          <div className="font-display text-xl font-medium tracking-tight flex items-center gap-2 min-w-0">
            {current && <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" title="current" />}
            <span className="truncate">{block.name}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-[9px] tracking-[0.16em] uppercase font-bold ${block.type === 'adhoc' ? 'text-accent' : 'text-faint'}`}>
              {block.type === 'adhoc' ? 'Ad-hoc' : 'Scheduled'}
            </span>
            <button onClick={() => onToggleComplete(block, true)} className="flex items-center gap-1 text-[10px] font-semibold text-muted">
              <span className="w-3.5 h-3.5 rounded-full border border-muted flex items-center justify-center text-[8px] leading-none">✓</span>
              Done
            </button>
          </div>
        </div>

        {/* Money — single inline row */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 mt-1.5">
          <Fig label="Available" value={money(m.available)} />
          <Fig label="Bills" value={money(m.billsTotal)} />
          <Fig label="Remaining" value={moneySigned(m.remaining)} tone={m.remaining >= 0 ? 'text-green' : 'text-red'} />
        </div>
        <div className="mt-1 text-[11px] text-muted font-medium">
          <b className="text-ink font-semibold">{money(m.paid)}</b> paid
          <span className="text-faint mx-1.5">·</span>
          <b className="text-ink font-semibold">{money(m.sent)}</b> sent
          <span className="text-faint mx-1.5">·</span>
          <b className="text-ink font-semibold">{money(m.open)}</b> open
        </div>
      </div>

      {/* Bills */}
      <div className="mt-3 px-4">
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
      {adding ? (
        <div className="px-4 mt-2 flex flex-wrap items-center gap-2">
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
        <button onClick={() => setAdding(true)} className="px-4 pt-3 text-muted text-[12.5px] font-semibold">
          + Add bill
        </button>
      )}
    </section>
  )
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[9.5px] tracking-wide uppercase text-muted font-semibold">{label}</span>
      <span className={`text-[15px] font-bold tracking-tight tabular-nums ${tone ?? ''}`}>{value}</span>
    </span>
  )
}
