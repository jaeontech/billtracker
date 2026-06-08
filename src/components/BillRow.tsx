import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Bill, PayBlock } from '../types'
import { daysLate, lateLevel, money } from '../lib/money'

const STATUS_STYLE: Record<Bill['status'], string> = {
  paid: 'text-green',
  sent: 'text-blue',
  upcoming: 'text-muted',
}
const LATE_STYLE = {
  ontime: 'text-muted',
  amber: 'text-amber font-semibold',
  orange: 'text-orange font-semibold',
  red: 'text-red font-semibold',
} as const

// Tap the status to cycle upcoming → sent → paid → upcoming.
const NEXT: Record<Bill['status'], Bill['status']> = {
  upcoming: 'sent',
  sent: 'paid',
  paid: 'upcoming',
}

interface Props {
  bill: Bill
  block: PayBlock
  blocks: PayBlock[]
  onCycleStatus: (bill: Bill, next: Bill['status']) => void
  onMove: (bill: Bill, toBlockId: string) => void
  onSkip: (bill: Bill, na: boolean) => void
  onDelete: (bill: Bill) => void
  onEditAmount: (bill: Bill, amount: number) => void
  onEditName: (bill: Bill, name: string) => void
  onEditDue: (bill: Bill, due: string | null) => void
}

export default function BillRow({ bill, block, blocks, onCycleStatus, onMove, onSkip, onDelete, onEditAmount, onEditName, onEditDue }: Props) {
  // Drag handle only — the rest of the row stays tappable/scrollable.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: bill.id,
    data: { bill },
  })
  // Inline-editable fields (template values are just the default seeds).
  const [editingAmt, setEditingAmt] = useState(false)
  const [amt, setAmt] = useState(String(bill.amount))
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(bill.name)
  const [editingDue, setEditingDue] = useState(false)
  function commitAmt() {
    setEditingAmt(false)
    const n = Number(amt)
    if (!Number.isNaN(n) && n !== bill.amount) onEditAmount(bill, n)
  }
  function commitName() {
    setEditingName(false)
    const v = nameVal.trim()
    if (v && v !== bill.name) onEditName(bill, v)
  }
  const late = daysLate(bill.due_date, block.pay_date)
  const level = lateLevel(late)
  const deferred = !!bill.deferred_from_block_id

  // Due date: compact numeric M/D (e.g. "6/20"). Lateness is shown by color only
  // (LATE_STYLE — amber/orange/red); the deferred ↩ prefix is tight.
  let dueLabel = '—'
  if (bill.due_date) {
    const d = new Date(bill.due_date + 'T00:00')
    dueLabel = `${d.getMonth() + 1}/${d.getDate()}`
  }
  if (deferred) dueLabel = `↩${dueLabel}`

  function onAction(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value
    e.target.value = '' // reset the menu
    if (v === 'skip') onSkip(bill, !bill.na)
    else if (v === 'delete') onDelete(bill)
    else if (v.startsWith('move:')) onMove(bill, v.slice(5))
  }

  return (
    <div ref={setNodeRef} className={`flex items-center gap-2 h-8 ${bill.na ? 'opacity-50' : ''} ${isDragging ? 'opacity-30' : ''}`}>
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        className="touch-none cursor-grab active:cursor-grabbing text-faint text-[13px] leading-none px-0.5 -ml-1 shrink-0 select-none"
        title="Drag to move"
      >
        ⠿
      </button>
      {editingName ? (
        <input
          autoFocus
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') { setNameVal(bill.name); setEditingName(false) }
          }}
          className="bg-surface rounded px-1 text-sm font-semibold flex-1 min-w-0 outline-none ring-1 ring-accent/50"
        />
      ) : (
        <button
          onClick={() => { setNameVal(bill.name); setEditingName(true) }}
          className="text-sm font-semibold truncate flex-1 min-w-0 text-left"
        >
          {bill.name}
        </button>
      )}
      {editingDue ? (
        <input
          type="date"
          autoFocus
          value={bill.due_date ?? ''}
          onChange={(e) => { onEditDue(bill, e.target.value || null); setEditingDue(false) }}
          onBlur={() => setEditingDue(false)}
          className="bg-surface rounded px-1 text-[11px] outline-none ring-1 ring-accent/50 shrink-0 text-muted"
        />
      ) : (
        <button
          onClick={() => setEditingDue(true)}
          className={`text-[11px] font-medium shrink-0 whitespace-nowrap min-w-[44px] text-right ${deferred ? 'text-gold' : LATE_STYLE[level]}`}
        >
          {dueLabel}
        </button>
      )}
      <span
        title={bill.method}
        className={`text-[11px] font-bold shrink-0 w-3.5 text-center ${bill.method === 'auto' ? 'text-blue' : 'text-faint'}`}
      >
        {bill.method === 'auto' ? 'A' : 'M'}
      </span>
      {editingAmt ? (
        <input
          autoFocus
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          onBlur={commitAmt}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditingAmt(false)
          }}
          inputMode="decimal"
          className="bg-surface rounded px-1 w-[60px] text-sm font-bold text-right tabular-nums outline-none ring-1 ring-accent/50 shrink-0"
        />
      ) : (
        <button
          onClick={() => { setAmt(String(bill.amount)); setEditingAmt(true) }}
          className="text-sm font-bold shrink-0 min-w-[54px] text-right tracking-tight tabular-nums"
        >
          {money(bill.amount)}
        </button>
      )}
      {bill.na ? (
        <span className="text-[10.5px] font-bold tracking-wide text-faint uppercase min-w-[40px] text-right">NA</span>
      ) : (
        <button
          onClick={() => onCycleStatus(bill, NEXT[bill.status])}
          className={`text-[10.5px] font-bold tracking-wide uppercase min-w-[40px] text-right ${STATUS_STYLE[bill.status]}`}
        >
          {bill.status === 'upcoming' ? 'Open' : bill.status}
        </button>
      )}
      {/* Actions: move / skip / delete */}
      <select
        onChange={onAction}
        defaultValue=""
        className="bg-transparent text-faint text-base w-5 shrink-0 outline-none cursor-pointer appearance-none"
        title="Actions"
      >
        <option value="" disabled>⋯</option>
        {blocks.filter((b) => b.id !== block.id).map((b) => (
          <option key={b.id} value={`move:${b.id}`}>→ Move to {b.name}</option>
        ))}
        <option value="skip">{bill.na ? 'Un-skip' : 'Skip (NA)'}</option>
        <option value="delete">Delete</option>
      </select>
    </div>
  )
}
