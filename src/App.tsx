import { useEffect, useMemo, useState } from 'react'
import type { Bill, PayBlock as PayBlockT } from './types'
import * as db from './lib/db'
import PayBlock from './components/PayBlock'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function App() {
  const [blocks, setBlocks] = useState<PayBlockT[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [addingBlock, setAddingBlock] = useState(false)

  async function refresh() {
    try {
      const [bl, bi] = await Promise.all([db.getBlocks(), db.getBills()])
      setBlocks(bl)
      setBills(bi)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const billsByBlock = useMemo(() => {
    const map: Record<string, Bill[]> = {}
    for (const b of bills) (map[b.pay_block_id] ??= []).push(b)
    return map
  }, [bills])

  // current = last block whose pay date is on/before today (else the first block)
  const currentIdx = useMemo(() => {
    const t = todayISO()
    let idx = blocks.findIndex((b) => b.pay_date > t)
    if (idx === -1) idx = blocks.length - 1
    else idx = Math.max(0, idx - 1)
    return idx
  }, [blocks])

  const pastBlocks = blocks.slice(0, currentIdx)
  const visibleBlocks = blocks.slice(currentIdx)

  // ─── handlers ──────────────────────────────────────────────────────────────
  const run = (p: Promise<unknown>) => p.then(refresh).catch((e) => setError(String(e)))
  const onCycleStatus = (bill: Bill, next: Bill['status']) => run(db.setBillStatus(bill, next))
  const onSkip = (bill: Bill, na: boolean) => run(db.setBillNa(bill, na))
  const onDelete = (bill: Bill) => run(db.deleteBill(bill))
  const onMove = (bill: Bill, toBlockId: string) => {
    const from = blocks.find((b) => b.id === bill.pay_block_id)
    const to = blocks.find((b) => b.id === toBlockId)
    if (from && to) run(db.moveBill(bill, to, from))
  }
  const onAddBill = (blockId: string, b: { name: string; amount: number; method: 'auto' | 'manual'; due_date: string | null }) =>
    run(db.addBill({ pay_block_id: blockId, ...b }))

  return (
    <div className="min-h-dvh flex justify-center">
      <div className="w-full max-w-[460px] px-3.5 pb-24">
        {/* Header */}
        <header className="pt-12 pb-3 flex justify-between items-end">
          <div>
            <div className="text-[10.5px] tracking-[0.18em] uppercase text-muted font-semibold">
              Household · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight mt-0.5">Bill Tracker</h1>
          </div>
          <button onClick={() => setAddingBlock((v) => !v)}
            className="rounded-full bg-accent text-[#07150e] w-11 h-11 text-2xl font-light flex items-center justify-center">
            {addingBlock ? '×' : '+'}
          </button>
        </header>

        {addingBlock && <AddBlockForm onDone={() => { setAddingBlock(false); refresh() }} defaultDate={todayISO()} />}

        {loading && <div className="text-muted text-sm py-8">Loading…</div>}
        {error && <div className="text-red text-sm py-4 bg-red/10 rounded-xl px-4 my-2">{error}</div>}

        {!loading && blocks.length === 0 && !addingBlock && (
          <div className="text-center py-16">
            <p className="text-muted text-sm">No pay blocks yet.</p>
            <button onClick={() => setAddingBlock(true)} className="mt-3 text-accent font-semibold">+ Add your first pay block</button>
          </div>
        )}

        {/* Past toggle */}
        {pastBlocks.length > 0 && (
          <button onClick={() => setShowPast((v) => !v)}
            className="block w-full text-center py-2.5 text-muted text-[12.5px] font-semibold mb-2">
            {showPast ? 'Hide' : 'Show'} {pastBlocks.length} past pay block{pastBlocks.length > 1 ? 's' : ''}
          </button>
        )}
        {showPast && pastBlocks.map((block) => (
          <PayBlock key={block.id} block={block} bills={billsByBlock[block.id] ?? []} blocks={blocks} dim
            onCycleStatus={onCycleStatus} onMove={onMove} onSkip={onSkip} onDelete={onDelete} onAddBill={onAddBill} />
        ))}

        {/* Current + future */}
        {visibleBlocks.map((block, i) => (
          <PayBlock key={block.id} block={block} bills={billsByBlock[block.id] ?? []} blocks={blocks}
            current={i === 0} dim={i > 0}
            onCycleStatus={onCycleStatus} onMove={onMove} onSkip={onSkip} onDelete={onDelete} onAddBill={onAddBill} />
        ))}
      </div>
    </div>
  )
}

function AddBlockForm({ onDone, defaultDate }: { onDone: () => void; defaultDate: string }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [income, setIncome] = useState('')

  async function submit() {
    if (!name.trim()) return
    await db.addBlock({ name: name.trim(), pay_date: date, income: Number(income) || 0, type: 'adhoc' })
    onDone()
  }

  return (
    <div className="bg-surface rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Pay block name (e.g. June 15 Paycheck)"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[160px]" />
      <input value={date} onChange={(e) => setDate(e.target.value)} type="date"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none text-muted" />
      <input value={income} onChange={(e) => setIncome(e.target.value)} inputMode="decimal" placeholder="Income $"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none w-28 tabular-nums" />
      <button onClick={submit} className="bg-accent text-[#07150e] rounded-lg px-4 py-2 text-sm font-bold">Add block</button>
    </div>
  )
}
