// Validate block totals reflect add/delete (using the same blockMoney as the UI).
import { readFileSync } from 'node:fs'
import ws from 'ws'
;(globalThis as any).WebSocket = ws
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const db = await import('../src/lib/db.ts')
const { blockMoney } = await import('../src/lib/money.ts')

const blocks = await db.getBlocks()
const block = blocks.find((b) => !b.completed && !b.hidden)!
const totalFor = async () => {
  const bills = (await db.getBills()).filter((b) => b.pay_block_id === block.id)
  return blockMoney(block, bills)
}

const before = await totalFor()
console.log('before        →', `bills=${before.billsTotal} remaining=${before.remaining}`)

const tmp = await db.addBill({ pay_block_id: block.id, name: 'ZZTotals', amount: 123, method: 'manual', due_date: '2026-06-15' })
const added = await totalFor()
console.log('after add 123 →', `bills=${added.billsTotal} remaining=${added.remaining}`,
  added.billsTotal === before.billsTotal + 123 ? '✓' : '✗')

await db.deleteBill(tmp)
const afterDel = await totalFor()
console.log('after delete  →', `bills=${afterDel.billsTotal} remaining=${afterDel.remaining}`,
  afterDel.billsTotal === before.billsTotal ? '✓ (totals updated on delete)' : '✗ (NOT updated)')
