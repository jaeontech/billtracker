import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import type { Bill, PayBlock as PayBlockT, Settings, Template } from './types'
import * as db from './lib/db'
import { supabase } from './lib/supabase'
import { ensureSchedule, findHomeBlock } from './lib/schedule'
import { daysLate, money } from './lib/money'
import { LockContext } from './lib/lock'
import PayBlock from './components/PayBlock'
import TemplatesView from './components/TemplatesView'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function App() {
  const [blocks, setBlocks] = useState<PayBlockT[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [addingBlock, setAddingBlock] = useState(false)
  const [view, setView] = useState<'board' | 'templates'>('board')
  // Page-wide read-only lock — defaults to locked so you can't fat-finger an edit
  // while just looking. Persisted per-device.
  const [locked, setLocked] = useState(() => {
    try { return localStorage.getItem('bt:locked') !== '0' } catch { return true }
  })
  const toggleLocked = () => setLocked((v) => {
    const nv = !v
    try { localStorage.setItem('bt:locked', nv ? '1' : '0') } catch { /* ignore */ }
    return nv
  })
  // 30-day guardrail: holds a pending move that would push a bill 30+ days late.
  const [guard, setGuard] = useState<{ bill: Bill; from: PayBlockT; to: PayBlockT; days: number } | null>(null)
  // Drag-and-drop: the bill currently being dragged (for the floating overlay).
  const [activeBill, setActiveBill] = useState<Bill | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const loadAll = useCallback(async () => {
    try {
      const [st, tpl] = await Promise.all([db.getSettings(), db.getTemplates()])
      let [bl, bi] = await Promise.all([db.getBlocks(), db.getBills()])
      // Auto-generate scheduled blocks (current + 3 months) and home bills.
      const res = await ensureSchedule(st, bl, tpl)
      if (res.blocksCreated || res.billsCreated) {
        ;[bl, bi] = await Promise.all([db.getBlocks(), db.getBills()])
      }
      setSettings(st); setTemplates(tpl); setBlocks(bl); setBills(bi); setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Live sync: refetch (debounced) whenever the other device changes anything.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => loadAll(), 250) }
    const ch = supabase
      .channel('billtracker-board')
      .on('postgres_changes', { event: '*', schema: 'billtracker', table: 'pay_blocks' }, bump)
      .on('postgres_changes', { event: '*', schema: 'billtracker', table: 'bills' }, bump)
      .on('postgres_changes', { event: '*', schema: 'billtracker', table: 'recurring_templates' }, bump)
      .on('postgres_changes', { event: '*', schema: 'billtracker', table: 'settings' }, bump)
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(ch) }
  }, [loadAll])

  const billsByBlock = useMemo(() => {
    const map: Record<string, Bill[]> = {}
    for (const b of bills) (map[b.pay_block_id] ??= []).push(b)
    return map
  }, [bills])

  // Hidden blocks are pulled out of the board entirely (restorable via a toggle).
  const boardBlocks = useMemo(() => blocks.filter((b) => !b.hidden), [blocks])
  const hiddenBlocks = useMemo(() => blocks.filter((b) => b.hidden), [blocks])
  // Move targets exclude hidden and completed (collapsed) blocks.
  const moveTargets = useMemo(() => boardBlocks.filter((b) => !b.completed), [boardBlocks])

  const currentIdx = useMemo(() => {
    const t = todayISO()
    let idx = boardBlocks.findIndex((b) => b.pay_date > t)
    if (idx === -1) idx = boardBlocks.length - 1
    else idx = Math.max(0, idx - 1)
    return idx
  }, [boardBlocks])

  const pastBlocks = boardBlocks.slice(0, currentIdx)
  const visibleBlocks = boardBlocks.slice(currentIdx)

  const run = (p: Promise<unknown>) => p.then(loadAll).catch((e) => setError(String(e)))

  // ─── Session undo stack (in-memory; clears on refresh) ─────────────────────
  const undoStack = useRef<Array<() => Promise<void>>>([])
  const [undoCount, setUndoCount] = useState(0)
  const pushUndo = (fn: () => Promise<void>) => { undoStack.current.push(fn); setUndoCount(undoStack.current.length) }
  // Run an edit, then record how to reverse it (restore the pre-edit snapshot).
  const editBill = (bill: Bill, op: Promise<unknown>) => {
    const snap = { ...bill }
    op.then(() => { pushUndo(() => db.restoreBill(snap)); return loadAll() }).catch((e) => setError(String(e)))
  }
  const editBlock = (block: PayBlockT, op: Promise<unknown>) => {
    const snap = { ...block }
    op.then(() => { pushUndo(() => db.restoreBlock(snap)); return loadAll() }).catch((e) => setError(String(e)))
  }
  const undoLast = () => {
    const fn = undoStack.current.pop()
    setUndoCount(undoStack.current.length)
    if (fn) Promise.resolve(fn()).then(loadAll).catch((e) => setError(String(e)))
  }
  const revertAll = () => {
    const fns = undoStack.current.splice(0).reverse() // newest first → ends at original state
    setUndoCount(0)
    ;(async () => {
      for (const fn of fns) { try { await fn() } catch (e) { setError(String(e)) } }
      await loadAll()
    })()
  }

  const onCycleStatus = (bill: Bill, next: Bill['status']) => editBill(bill, db.setBillStatus(bill, next))
  const onSkip = (bill: Bill, na: boolean) => editBill(bill, db.setBillNa(bill, na))
  const onEditAmount = (bill: Bill, amount: number) => editBill(bill, db.setBillAmount(bill, amount))
  const onEditName = (bill: Bill, name: string) => editBill(bill, db.setBillName(bill, name))
  const onEditDue = (bill: Bill, due: string | null) => editBill(bill, db.setBillDue(bill, due))
  const onDelete = (bill: Bill) => {
    const snap = { ...bill }
    db.deleteBill(bill).then(() => { pushUndo(() => db.reinsertBill(snap)); return loadAll() }).catch((e) => setError(String(e)))
  }
  const onAddBill = (blockId: string, b: { name: string; amount: number; method: 'auto' | 'manual'; due_date: string | null }) => {
    db.addBill({ pay_block_id: blockId, ...b })
      .then((created) => { pushUndo(() => db.deleteBill(created)); return loadAll() })
      .catch((e) => setError(String(e)))
  }
  const performMove = (bill: Bill, to: PayBlockT) => {
    const home = findHomeBlock(bill.due_date, blocks)
    // Clear the deferred tag when it lands back in its home block; otherwise mark
    // it deferred from home (the ↩ means "not where it naturally belongs").
    const deferredFrom = home && home.id === to.id ? null : home?.id ?? bill.pay_block_id
    editBill(bill, db.moveBill(bill, to, deferredFrom))
  }
  const onMove = (bill: Bill, toBlockId: string) => {
    const to = blocks.find((b) => b.id === toBlockId)
    if (!to || to.id === bill.pay_block_id) return
    // Guardrail: warn before a move that lands the bill 30+ days past due.
    const days = daysLate(bill.due_date, to.pay_date)
    if (days !== null && days >= 30) {
      const from = blocks.find((b) => b.id === bill.pay_block_id)!
      setGuard({ bill, from, to, days })
    } else performMove(bill, to)
  }
  const confirmMove = () => {
    if (guard) performMove(guard.bill, guard.to)
    setGuard(null)
  }
  const onToggleComplete = (block: PayBlockT, completed: boolean) => editBlock(block, db.setBlockCompleted(block, completed))
  const onHide = (block: PayBlockT) => editBlock(block, db.setBlockHidden(block, true))
  const onUnhide = (block: PayBlockT) => editBlock(block, db.setBlockHidden(block, false))
  const onEditIncome = (block: PayBlockT, income: number) => editBlock(block, db.updateBlockIncome(block, income))

  // Drag handlers reuse onMove → the 30-day guardrail applies to drag too.
  const onDragStart = (e: DragStartEvent) => { if (!locked) setActiveBill((e.active.data.current?.bill as Bill) ?? null) }
  const onDragEnd = (e: DragEndEvent) => {
    setActiveBill(null)
    if (locked) return
    const bill = e.active.data.current?.bill as Bill | undefined
    const overId = e.over?.id as string | undefined
    if (bill && overId && overId !== bill.pay_block_id) onMove(bill, overId)
  }

  return (
    <LockContext.Provider value={locked}>
    <div className="min-h-dvh flex justify-center">
      <div className="w-full max-w-[460px] px-3.5 pb-28">
        <header className="pt-12 pb-3 flex justify-between items-end">
          <div>
            <div className="text-[10.5px] tracking-[0.18em] uppercase text-muted font-semibold">
              Household · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight mt-0.5">Bill Tracker</h1>
          </div>
          <div className="flex items-center gap-2">
            {!locked && view === 'board' && (
              <button onClick={() => setAddingBlock((v) => !v)}
                className="rounded-full bg-accent text-[#07150e] w-11 h-11 text-2xl font-light flex items-center justify-center">
                {addingBlock ? '×' : '+'}
              </button>
            )}
            <button onClick={toggleLocked}
              className={`rounded-full h-9 px-3 text-[12px] font-semibold flex items-center gap-1.5 ${locked ? 'bg-surface text-muted' : 'bg-accent/20 text-accent'}`}>
              {locked ? '🔒 Locked' : '🔓 Editing'}
            </button>
          </div>
        </header>

        {!locked && undoCount > 0 && (
          <div className="flex items-center justify-between bg-surface rounded-xl px-3.5 py-2 mb-3">
            <span className="text-muted text-[12px]">{undoCount} change{undoCount > 1 ? 's' : ''} this session</span>
            <div className="flex gap-4 text-[12.5px] font-semibold">
              <button onClick={undoLast} className="text-accent">↶ Undo</button>
              <button onClick={revertAll} className="text-red">Revert all</button>
            </div>
          </div>
        )}

        {loading && <div className="text-muted text-sm py-8">Loading…</div>}
        {error && <div className="text-red text-sm py-4 bg-red/10 rounded-xl px-4 my-2">{error}</div>}

        {!loading && view === 'templates' && settings && (
          <TemplatesView
            templates={templates}
            settings={settings}
            onAdd={(t) => run(db.addTemplate(t))}
            onUpdate={(t, patch) => run(db.updateTemplate(t, patch))}
            onDelete={(t) => run(db.deleteTemplate(t))}
            onSetDefaultIncome={(n) => run(db.setDefaultIncome(n))}
          />
        )}

        {!loading && view === 'board' && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {!locked && addingBlock && <AddBlockForm onDone={() => { setAddingBlock(false); loadAll() }} defaultDate={todayISO()} />}

            {blocks.length === 0 && !addingBlock && (
              <div className="text-center py-16">
                <p className="text-muted text-sm">No pay blocks yet — add recurring bills in Templates and they'll generate automatically.</p>
              </div>
            )}

            {pastBlocks.length > 0 && (
              <button onClick={() => setShowPast((v) => !v)}
                className="block w-full text-center py-2.5 text-muted text-[12.5px] font-semibold mb-2">
                {showPast ? 'Hide' : 'Show'} {pastBlocks.length} past pay block{pastBlocks.length > 1 ? 's' : ''}
              </button>
            )}
            {showPast && pastBlocks.map((block) => (
              <PayBlock key={block.id} block={block} bills={billsByBlock[block.id] ?? []} blocks={moveTargets}
                onCycleStatus={onCycleStatus} onMove={onMove} onSkip={onSkip} onDelete={onDelete} onEditAmount={onEditAmount} onEditName={onEditName} onEditDue={onEditDue} onToggleComplete={onToggleComplete} onHide={onHide} onAddBill={onAddBill} onEditIncome={onEditIncome} />
            ))}

            {hiddenBlocks.length > 0 && (
              <button onClick={() => setShowHidden((v) => !v)}
                className="block w-full text-center py-2.5 text-faint text-[12.5px] font-semibold mb-2">
                {showHidden ? 'Hide' : 'Show'} {hiddenBlocks.length} hidden pay block{hiddenBlocks.length > 1 ? 's' : ''}
              </button>
            )}
            {showHidden && hiddenBlocks.map((block) => (
              <div key={block.id} className="flex items-center gap-2 py-2 px-1 mb-2 border-b border-surface text-sm opacity-60">
                <span className="text-faint text-[13px] shrink-0">⦸</span>
                <span className="font-display font-medium truncate">{block.name}</span>
                <span className="flex-1 min-w-2" />
                <button onClick={() => onUnhide(block)} className="text-muted text-[11px] font-semibold shrink-0">Unhide</button>
              </div>
            ))}

            {visibleBlocks.map((block) => (
              <PayBlock key={block.id} block={block} bills={billsByBlock[block.id] ?? []} blocks={moveTargets}
                onCycleStatus={onCycleStatus} onMove={onMove} onSkip={onSkip} onDelete={onDelete} onEditAmount={onEditAmount} onEditName={onEditName} onEditDue={onEditDue} onToggleComplete={onToggleComplete} onHide={onHide} onAddBill={onAddBill} onEditIncome={onEditIncome} />
            ))}

            <DragOverlay>
              {activeBill ? (
                <div className="bg-surface ring-1 ring-accent/60 rounded-lg px-3 py-2 flex items-center gap-3 shadow-2xl text-sm font-semibold">
                  <span className="truncate max-w-[180px]">{activeBill.name}</span>
                  <span className="ml-auto font-bold tabular-nums">{money(activeBill.amount)}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 h-[68px] bg-gradient-to-b from-transparent to-bg flex items-end justify-center gap-12 pb-4 pointer-events-none">
        <Tab label="Board" on={view === 'board'} onClick={() => setView('board')} />
        <Tab label="Templates" on={view === 'templates'} onClick={() => setView('templates')} />
      </nav>

      {/* 30-day guardrail confirm */}
      {guard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 px-4"
          onClick={() => setGuard(null)}>
          <div className="w-full max-w-[400px] mb-6 sm:mb-0 rounded-2xl p-5 bg-surface ring-1 ring-red/40"
            onClick={(e) => e.stopPropagation()}>
            <div className="font-bold text-red text-[13px] tracking-wide">30-day guardrail</div>
            <div className="text-[13px] text-[#d8a99f] mt-2 leading-relaxed">
              Moving <b className="text-ink">{guard.bill.name}</b> to <b className="text-ink">{guard.to.name}</b> makes
              it <b className="text-ink">{guard.days} days late</b> — past the line where it can hit your credit.
            </div>
            <div className="flex gap-7 mt-5 justify-end">
              <button onClick={() => setGuard(null)} className="text-muted font-bold text-[13px]">Keep it here</button>
              <button onClick={confirmMove} className="text-red font-bold text-[13px]">Move anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </LockContext.Provider>
  )
}

function Tab({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`pointer-events-auto text-[12px] font-semibold ${on ? 'text-ink' : 'text-faint'}`}>
      {label}
    </button>
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
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad-hoc block (e.g. June Stock)"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[160px]" />
      <input value={date} onChange={(e) => setDate(e.target.value)} type="date"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none text-muted" />
      <input value={income} onChange={(e) => setIncome(e.target.value)} inputMode="decimal" placeholder="Income $"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none w-28 tabular-nums" />
      <button onClick={submit} className="bg-accent text-[#07150e] rounded-lg px-4 py-2 text-sm font-bold">Add block</button>
    </div>
  )
}
