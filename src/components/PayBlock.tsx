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
  dim?: boolean
  onCycleStatus: (bill: Bill, next: Bill['status']) => void
  onMove: (bill: Bill, toBlockId: string) => void
  onSkip: (bill: Bill, na: boolean) => void
  onDelete: (bill: Bill) => void
  onEditAmount: (bill: Bill, amount: number) => void
  onAddBill: (blockId: string, b: { name: string; amount: number; method: 'auto' | 'manual'; due_date: string | null }) => void
}

export default function PayBlock({ block, bills, blocks, current, dim, onCycleStatus, onMove, onSkip, onDelete, onEditAmount, onAddBill }: Props) {
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

  return (
    <section ref={setNodeRef} className={`mb-14 ${dim ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className={`px-6 py-4 -mx-3.5 transition-colors ${isOver ? 'bg-accent/20' : 'bg-surface-2'}`}>
        <div className="flex justify-between items-baseline">
          <div>
            <div className="font-display text-xl font-medium tracking-tight">{block.name}</div>
            <div className="text-[11.5px] text-muted mt-0.5 font-medium">
              {dateLabel}{current ? ' · current' : ''}
            </div>
          </div>
          <span className={`text-[9px] tracking-[0.16em] uppercase font-bold ${block.type === 'adhoc' ? 'text-accent' : 'text-faint'}`}>
            {block.type === 'adhoc' ? 'Ad-hoc' : 'Scheduled'}
          </span>
        </div>

        {/* Money */}
        <div className="flex gap-6 mt-4">
          <Figure label="Available" value={money(m.available)} />
          <Figure label="Bills" value={money(m.billsTotal)} />
          <Figure
            label="Remaining"
            value={moneySigned(m.remaining)}
            tone={m.remaining >= 0 ? 'text-green' : 'text-red'}
          />
        </div>
        <div className="mt-2.5 text-[11px] text-muted font-medium">
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

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[9.5px] tracking-wide uppercase text-muted font-semibold">{label}</div>
      <div className={`text-xl font-bold mt-0.5 tracking-tight tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  )
}
