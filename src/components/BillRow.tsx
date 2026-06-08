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
}

export default function BillRow({ bill, block, blocks, onCycleStatus, onMove, onSkip, onDelete }: Props) {
  const late = daysLate(bill.due_date, block.pay_date)
  const level = lateLevel(late)
  const deferred = !!bill.deferred_from_block_id

  // Due / lateness label
  let dueLabel = bill.due_date ? new Date(bill.due_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
  if (deferred) dueLabel = `↩ ${dueLabel}`
  else if (late && late > 0) dueLabel = `${dueLabel} · ${late}d`

  function onAction(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value
    e.target.value = '' // reset the menu
    if (v === 'skip') onSkip(bill, !bill.na)
    else if (v === 'delete') onDelete(bill)
    else if (v.startsWith('move:')) onMove(bill, v.slice(5))
  }

  return (
    <div className={`flex items-center gap-2 h-8 ${bill.na ? 'opacity-50' : ''}`}>
      <span className="text-sm font-semibold truncate flex-1 min-w-0">{bill.name}</span>
      <span className={`text-[11px] font-medium shrink-0 whitespace-nowrap min-w-[64px] text-right ${deferred ? 'text-gold' : LATE_STYLE[level]}`}>
        {dueLabel}
      </span>
      <span className={`text-[9px] tracking-wide font-semibold uppercase shrink-0 min-w-[40px] text-right ${bill.method === 'auto' ? 'text-blue' : 'text-faint'}`}>
        {bill.method}
      </span>
      <span className="text-sm font-bold shrink-0 min-w-[54px] text-right tracking-tight">{money(bill.amount)}</span>
      {bill.na ? (
        <span className="text-[10.5px] font-bold tracking-wide text-faint uppercase min-w-[58px] text-right">NA</span>
      ) : (
        <button
          onClick={() => onCycleStatus(bill, NEXT[bill.status])}
          className={`text-[10.5px] font-bold tracking-wide uppercase min-w-[58px] text-right ${STATUS_STYLE[bill.status]}`}
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
