import { useState } from 'react'
import type { Settings, Template } from '../types'
import { money } from '../lib/money'
import { useLocked } from '../lib/lock'

interface Props {
  templates: Template[]
  settings: Settings
  onAdd: (t: { name: string; amount: number; method: 'auto' | 'manual'; due_day: number }) => void
  onUpdate: (t: Template, patch: Partial<Template>) => void
  onDelete: (t: Template) => void
  onSetDefaultIncome: (income: number) => void
}

export default function TemplatesView({ templates, settings, onAdd, onUpdate, onDelete, onSetDefaultIncome }: Props) {
  const [income, setIncome] = useState(String(settings.default_income))
  const total = templates.filter((t) => t.active).reduce((s, t) => s + t.amount, 0)
  const locked = useLocked()

  return (
    <>
      {locked && (
        <div className="text-center text-faint text-[12px] py-2">🔒 Locked — tap the lock in the header to edit</div>
      )}
    <div className={`pt-2 ${locked ? 'pointer-events-none select-none opacity-70' : ''}`}>
      {/* Default paycheck */}
      <div className="bg-surface rounded-2xl p-4 mb-5">
        <div className="text-[9.5px] tracking-wide uppercase text-muted font-semibold">Default paycheck income</div>
        <div className="flex items-center gap-2 mt-2">
          <input value={income} onChange={(e) => setIncome(e.target.value)} inputMode="decimal"
            onBlur={() => onSetDefaultIncome(Number(income) || 0)}
            className="bg-bg rounded-lg px-3 py-2 text-lg font-bold tabular-nums outline-none w-32" />
          <span className="text-muted text-xs">seeds each scheduled block · applies to upcoming blocks</span>
        </div>
      </div>

      <div className="flex items-baseline justify-between px-1 mb-2">
        <h2 className="font-display text-xl font-medium">Recurring bills</h2>
        <span className="text-muted text-xs font-medium">{money(total)} / month·ish</span>
      </div>
      <p className="text-faint text-[12px] px-1 mb-3 leading-relaxed">
        These seed into every pay block automatically. Due day decides which paycheck (15th or end-of-month) is its home.
      </p>

      {templates.map((t) => (
        <TemplateRow key={t.id} t={t} onUpdate={onUpdate} onDelete={onDelete} />
      ))}

      <AddTemplate onAdd={onAdd} />
    </div>
    </>
  )
}

function TemplateRow({ t, onUpdate, onDelete }: { t: Template; onUpdate: Props['onUpdate']; onDelete: Props['onDelete'] }) {
  const [name, setName] = useState(t.name)
  const [amount, setAmount] = useState(String(t.amount))
  const [day, setDay] = useState(String(t.due_day))

  const save = (patch: Partial<Template>) => onUpdate(t, patch)

  return (
    <div className={`flex items-center gap-2 py-2 border-b border-surface ${t.active ? '' : 'opacity-45'}`}>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== t.name && save({ name })}
        className="bg-transparent text-sm font-semibold outline-none flex-1 min-w-0" />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
        onBlur={() => Number(amount) !== t.amount && save({ amount: Number(amount) || 0 })}
        className="bg-transparent text-sm font-bold tabular-nums outline-none w-16 text-right" />
      <button onClick={() => save({ method: t.method === 'manual' ? 'auto' : 'manual' })}
        className="text-[9px] uppercase tracking-wide font-semibold text-faint w-12 text-center">{t.method}</button>
      <div className="flex items-center gap-0.5 text-muted">
        <span className="text-[10px]">due</span>
        <input value={day} onChange={(e) => setDay(e.target.value)} inputMode="numeric"
          onBlur={() => Number(day) !== t.due_day && save({ due_day: Math.min(31, Math.max(1, Number(day) || 1)) })}
          className="bg-transparent text-sm font-medium outline-none w-7 text-center tabular-nums" />
      </div>
      <button onClick={() => save({ active: !t.active })} title={t.active ? 'Active' : 'Paused'}
        className={`w-2.5 h-2.5 rounded-full ${t.active ? 'bg-green' : 'bg-faint'}`} />
      <button onClick={() => onDelete(t)} className="text-faint text-base px-1">×</button>
    </div>
  )
}

function AddTemplate({ onAdd }: { onAdd: Props['onAdd'] }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('')
  const [method, setMethod] = useState<'auto' | 'manual'>('manual')

  function submit() {
    if (!name.trim() || !day) return
    onAdd({ name: name.trim(), amount: Number(amount) || 0, method, due_day: Math.min(31, Math.max(1, Number(day))) })
    setName(''); setAmount(''); setDay(''); setMethod('manual')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 bg-surface rounded-2xl p-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bill name"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[120px]" />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$0"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none w-20 tabular-nums" />
      <input value={day} onChange={(e) => setDay(e.target.value)} inputMode="numeric" placeholder="day"
        className="bg-bg rounded-lg px-3 py-2 text-sm outline-none w-16 text-center" />
      <button onClick={() => setMethod(method === 'manual' ? 'auto' : 'manual')}
        className="bg-bg rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{method}</button>
      <button onClick={submit} className="bg-accent text-[#07150e] rounded-lg px-4 py-2 text-sm font-bold">Add</button>
    </div>
  )
}
