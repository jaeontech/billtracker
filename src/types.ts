// Mirrors the billtracker schema. Money columns arrive from Supabase as strings
// (numeric preserves precision) — we parse them to numbers in the data layer.

export type BillStatus = 'upcoming' | 'sent' | 'paid'
export type Method = 'auto' | 'manual'
export type BlockType = 'scheduled' | 'adhoc'

export interface PayBlock {
  id: string
  name: string
  type: BlockType
  pay_date: string // ISO date
  period_start: string | null
  period_end: string | null
  income: number
  completed: boolean
  hidden: boolean
  note: string | null
  created_at: string
}

export interface Bill {
  id: string
  pay_block_id: string
  template_id: string | null
  name: string
  amount: number
  method: Method
  due_date: string | null
  status: BillStatus
  na: boolean
  deferred_from_block_id: string | null
  date_sent: string | null
  date_paid: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Template {
  id: string
  name: string
  amount: number
  method: Method
  due_day: number | null // 1–31 for monthly (drives the "home" block); null for weekly
  weekday: number | null // 0–6 (5 = Fri) → weekly, one bill per matching day; null → monthly
  active: boolean
  created_at: string
}

export interface Settings {
  id: number
  default_income: number
  pay_schedule: string
}
