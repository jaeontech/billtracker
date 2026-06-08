// Verifies live sync: subscribe to billtracker changes, insert a temp block,
// confirm the realtime event arrives, then clean up.
import { readFileSync } from 'node:fs'
import ws from 'ws'
;(globalThis as any).WebSocket = ws
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const { supabase } = await import('../src/lib/supabase.ts')

let received = false
const ch = supabase
  .channel('smoke-test')
  .on('postgres_changes', { event: '*', schema: 'billtracker', table: 'pay_blocks' }, (payload: any) => {
    received = true
    console.log('✓ realtime event received:', payload.eventType, '→', payload.new?.name ?? payload.old?.id)
  })
  .subscribe(async (status: string) => {
    console.log('subscription status:', status)
    if (status === 'SUBSCRIBED') {
      const { data, error } = await supabase
        .from('pay_blocks')
        .insert({ name: 'ZZRealtime', type: 'adhoc', pay_date: '2026-12-01', income: 0 })
        .select()
        .single()
      if (error) console.log('insert error:', error.message)
      else console.log('inserted temp block', data.id, '— waiting for event…')
    }
  })

setTimeout(async () => {
  await supabase.from('pay_blocks').delete().like('name', 'ZZRealtime')
  await supabase.removeChannel(ch)
  console.log(received ? '\nRESULT: live sync WORKS ✓' : '\nRESULT: no event received ✗')
  process.exit(received ? 0 : 1)
}, 5000)
