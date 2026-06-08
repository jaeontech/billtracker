// Verify the undo reversal ops: edit→restore, and delete→reinsert.
import { readFileSync } from 'node:fs'
import ws from 'ws'
;(globalThis as any).WebSocket = ws
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const db = await import('../src/lib/db.ts')

const blocks = await db.getBlocks()
const block = blocks[0]
const created = await db.addBill({ pay_block_id: block.id, name: 'ZZUndo', amount: 100, method: 'manual', due_date: '2026-06-15' })
const snap = { ...created }

// edit then restore
await db.setBillStatus(created, 'paid')
await db.setBillAmount(created, 999)
await db.restoreBill(snap)
let after = (await db.getBills()).find((b) => b.id === created.id)
console.log('after edit+restore →', after ? `status=${after.status} amount=${after.amount}` : 'MISSING',
  after && after.status === 'upcoming' && after.amount === 100 ? '✓' : '✗')

// delete then reinsert
await db.deleteBill(created)
await db.reinsertBill(snap)
after = (await db.getBills()).find((b) => b.id === created.id)
console.log('after delete+reinsert →', after ? `name=${after.name} amount=${after.amount}` : 'MISSING',
  after && after.name === 'ZZUndo' && after.amount === 100 ? '✓' : '✗')

// cleanup
await db.deleteBill(snap)
console.log('cleaned up')
