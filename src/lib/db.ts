// Thin data layer over Supabase. Every query targets the billtracker schema
// (set as the client default). Money columns come back as strings → coerce to
// numbers here so the rest of the app only ever sees numbers.
import { supabase } from './supabase'
import type { Bill, PayBlock, Settings } from '../types'

function numBlock(r: any): PayBlock {
  return { ...r, income: Number(r.income) }
}
function numBill(r: any): Bill {
  return { ...r, amount: Number(r.amount) }
}

// ─── Reads ───────────────────────────────────────────────────────────────────
export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()
  if (error) throw error
  return { ...data, default_income: Number(data.default_income) }
}

export async function getBlocks(): Promise<PayBlock[]> {
  const { data, error } = await supabase.from('pay_blocks').select('*').order('pay_date')
  if (error) throw error
  return data.map(numBlock)
}

export async function getBills(): Promise<Bill[]> {
  const { data, error } = await supabase.from('bills').select('*').order('due_date')
  if (error) throw error
  return data.map(numBill)
}

// ─── Activity log (what changed, not who) ────────────────────────────────────
export async function logActivity(
  entity_type: string,
  entity_id: string | null,
  action: string,
  description: string,
): Promise<void> {
  // Fire-and-forget; a failed log should never block the actual change.
  await supabase.from('activity_log').insert({ entity_type, entity_id, action, description })
}

// ─── Pay blocks ──────────────────────────────────────────────────────────────
export async function addBlock(input: {
  name: string
  pay_date: string
  income: number
  type?: 'scheduled' | 'adhoc'
}): Promise<PayBlock> {
  const { data, error } = await supabase
    .from('pay_blocks')
    .insert({ ...input, type: input.type ?? 'adhoc' })
    .select()
    .single()
  if (error) throw error
  await logActivity('pay_block', data.id, 'created', `Added pay block "${input.name}"`)
  return numBlock(data)
}

export async function updateBlockIncome(block: PayBlock, income: number): Promise<void> {
  const { error } = await supabase.from('pay_blocks').update({ income }).eq('id', block.id)
  if (error) throw error
  await logActivity('pay_block', block.id, 'updated', `Set ${block.name} income to $${income}`)
}

// ─── Bills ───────────────────────────────────────────────────────────────────
export async function addBill(input: {
  pay_block_id: string
  name: string
  amount: number
  method: 'auto' | 'manual'
  due_date: string | null
}): Promise<Bill> {
  const { data, error } = await supabase.from('bills').insert(input).select().single()
  if (error) throw error
  await logActivity('bill', data.id, 'created', `Added bill "${input.name}" ($${input.amount})`)
  return numBill(data)
}

export async function setBillStatus(bill: Bill, status: Bill['status']): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'sent') patch.date_sent = new Date().toISOString().slice(0, 10)
  if (status === 'paid') patch.date_paid = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('bills').update(patch).eq('id', bill.id)
  if (error) throw error
  await logActivity('bill', bill.id, status, `${bill.name} marked ${status}`)
}

export async function setBillNa(bill: Bill, na: boolean): Promise<void> {
  const { error } = await supabase.from('bills').update({ na }).eq('id', bill.id)
  if (error) throw error
  await logActivity('bill', bill.id, na ? 'skipped' : 'updated', `${bill.name} ${na ? 'skipped (NA)' : 'un-skipped'}`)
}

// Move a bill to another block (defer/catch-up). Tags it as deferred-from the source.
export async function moveBill(bill: Bill, toBlock: PayBlock, fromBlock: PayBlock): Promise<void> {
  const { error } = await supabase
    .from('bills')
    .update({ pay_block_id: toBlock.id, deferred_from_block_id: fromBlock.id })
    .eq('id', bill.id)
  if (error) throw error
  await logActivity('bill', bill.id, 'moved', `Moved ${bill.name} → ${toBlock.name}`)
}

export async function deleteBill(bill: Bill): Promise<void> {
  const { error } = await supabase.from('bills').delete().eq('id', bill.id)
  if (error) throw error
  await logActivity('bill', bill.id, 'deleted', `Deleted bill "${bill.name}"`)
}
