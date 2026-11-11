// Scenarios found by attacking the first version of the outbox. Each one was a real bug.
// Run with:  node --experimental-strip-types --test "tests/offline/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOutbox, describeItem, memoryStorage } from '../../src/offline/index.ts'
import type { KeyValueStorage, OutboxItem, RaiseRequestPayload, Sender } from '../../src/offline/index.ts'

let idCounter = 0
const nextId = () => `test-id-${String(++idCounter).padStart(6, '0')}`
const payload: RaiseRequestPayload = {
  patient_blood_group: 'O+',
  component: 'RBC',
  units_requested: 2,
  urgency: 'life_threatening',
  clinical_note: 'PPH theatre 2, name withheld',
}
const down: Sender = async () => {
  throw new TypeError('Failed to fetch')
}
const ok =
  (reply: unknown = { id: 1 }): Sender =>
  async () => ({ status: 201, body: reply })

function seed(storage: KeyValueStorage, items: Array<Partial<OutboxItem> & { id: string }>) {
  const stamp = new Date().toISOString()
  storage.setItem(
    'gh_outbox_v1',
    JSON.stringify(items.map((i) => ({ payload, state: 'queued', attempts: 1, owner: 'tester', createdAt: stamp, updatedAt: stamp, ...i }))),
  )
}

// A. A manual Retry and an automatic flush must not fight over the same item.
test('flush does not re-send, or change the state of, an item a manual Retry already delivered', async () => {
  const calls: string[] = []
  let releaseX: () => void = () => {}
  let failY = false
  const send: Sender = async (b) => {
    calls.push(b.client_request_id)
    if (calls.length === 1) await new Promise<void>((r) => (releaseX = r)) // X is slow
    if (failY && b.client_request_id === 'Y-1234567') throw new TypeError('down')
    return { status: 201, body: { id: calls.length } }
  }
  const storage = memoryStorage()
  seed(storage, [{ id: 'X-1234567' }, { id: 'Y-1234567', payload: { ...payload, units_requested: 3 } }])
  const outbox = createOutbox({ owner: () => 'tester', storage, send })
  const flushing = outbox.flush()
  await new Promise((r) => setTimeout(r, 5))
  assert.equal((await outbox.retry('Y-1234567')).state, 'delivered')
  failY = true // the connection drops again
  releaseX()
  await flushing
  assert.equal(calls.filter((c) => c === 'Y-1234567').length, 1, 'Y was sent exactly once')
  assert.equal(outbox.list().find((i) => i.id === 'Y-1234567')?.state, 'delivered')
})

test('retry on a delivered item returns it unchanged and sends nothing', async () => {
  let sends = 0
  const send: Sender = async () => (sends++, { status: 201, body: { id: 1 } })
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send })
  const item = await outbox.submit(payload, { id: nextId() })
  const again = await outbox.retry(item.id)
  assert.equal(again.state, 'delivered')
  assert.equal(sends, 1)
})

// B. Items belong to the user who raised them.
test("one user's unsent request is never sent under another user's login", async () => {
  const storage = memoryStorage()
  let user: string | null = 'clinician.a'
  const sentBy: Array<string | null> = []
  const send: Sender = async () => {
    sentBy.push(user)
    if (user === 'clinician.a') throw new TypeError('down')
    return { status: 201, body: { id: 1 } }
  }
  const a = createOutbox({ storage, send, owner: () => user })
  await a.submit(payload, { id: nextId() })
  assert.equal(a.unsentCount(), 1)

  user = 'clinician.b' // A leaves, B logs in on the same device
  const b = createOutbox({ storage, send, owner: () => user })
  assert.equal(b.unsentCount(), 0, 'B does not see A\'s request')
  assert.deepEqual(b.list(), [])
  assert.deepEqual(await b.flush(), [])
  assert.deepEqual(sentBy, ['clinician.a'], 'nothing was sent under B')
  const aId = a.list()[0]?.id
  assert.equal(aId, undefined, 'and A\'s outbox, reading as B, shows nothing either')

  user = 'clinician.a' // A comes back
  const a2 = createOutbox({ storage, send, owner: () => user })
  assert.equal(a2.unsentCount(), 1, "A's request is still there")
})

test('retry and remove refuse another user\'s item', async () => {
  const storage = memoryStorage()
  let user: string | null = 'a'
  const outbox = createOutbox({ storage, send: down, owner: () => user })
  const item = await outbox.submit(payload, { id: nextId() })
  user = 'b'
  await assert.rejects(outbox.retry(item.id), /Unknown outbox item/)
  assert.equal(outbox.remove(item.id), false)
  user = 'a'
  assert.equal(outbox.remove(item.id), true)
})

// C. A second identical request must never be swallowed, and one form must never raise twice.
test('two identical requests while the first is NOT SENT are two items (they could be two patients)', async () => {
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: down })
  await outbox.submit(payload, { id: nextId() })
  assert.equal(outbox.unsentLike(payload).length, 1, 'the screen can warn before the second submit')
  await outbox.submit(payload, { id: nextId() })
  assert.equal(outbox.list().length, 2)
})

test('submitting the same form again (same id) while NOT SENT returns the same item, one record', async () => {
  const sent: string[] = []
  let online = false
  const send: Sender = async (b) => {
    sent.push(b.client_request_id)
    if (!online) throw new TypeError('down')
    return { status: 201, body: { id: 1 } }
  }
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send })
  const formId = 'form-intent-0001'
  const first = await outbox.submit(payload, { id: formId })
  assert.equal(first.state, 'queued')
  const second = await outbox.submit(payload, { id: formId }) // the clinician taps Submit again
  assert.equal(second.id, formId)
  assert.equal(outbox.list().length, 1)
  online = true
  const results = await outbox.flush()
  assert.equal(results.length, 1)
  assert.deepEqual([...new Set(sent)], [formId], 'every attempt carried the same client_request_id')
  const third = await outbox.submit(payload, { id: formId }) // tapping again after success
  assert.equal(third.state, 'delivered')
  assert.equal(sent.length, 3, 'three attempts in total (submit, submit again, flush); tapping after success sent nothing')
})

test('an id that the backend would reject is refused up front', async () => {
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: ok() })
  await assert.rejects(outbox.submit(payload, { id: 'short' }), /8 to 64 characters/)
  await assert.rejects(outbox.submit(payload, { id: 'has spaces in it' }), /8 to 64 characters/)
})

// D. Health data on a shared device.
test('a delivered request keeps no clinical note in storage', async () => {
  const storage = memoryStorage()
  const reply = { id: 1, clinical_note: payload.clinical_note, status: 'AwaitingDecision' }
  const item = await createOutbox({ owner: () => 'tester', storage, send: ok(reply) }).submit(payload, { id: nextId() })
  assert.equal(item.state, 'delivered')
  assert.ok(!(storage.getItem('gh_outbox_v1') ?? '').includes('name withheld'))
  assert.equal(describeItem(item).headline, 'Request #1 raised', 'the screen still has what it needs')
})

test('a refused request also drops its clinical note', async () => {
  const storage = memoryStorage()
  const send: Sender = async () => ({ status: 400, body: { detail: 'bad' } })
  await createOutbox({ owner: () => 'tester', storage, send }).submit(payload, { id: nextId() })
  assert.ok(!(storage.getItem('gh_outbox_v1') ?? '').includes('name withheld'))
})

test('an unsent request keeps its note, because it has to be sent', async () => {
  const storage = memoryStorage()
  await createOutbox({ owner: () => 'tester', storage, send: down }).submit(payload, { id: nextId() })
  assert.ok((storage.getItem('gh_outbox_v1') ?? '').includes('name withheld'))
})

test('settled items are forgotten after the keep window; unsent items never are', async () => {
  let t = Date.UTC(2026, 10, 11)
  const now = () => new Date(t)
  const storage = memoryStorage()
  const first = createOutbox({ owner: () => 'tester', storage, send: ok(), now, keepResolvedMs: 60_000 })
  await first.submit(payload, { id: nextId() })
  const unsent = createOutbox({ owner: () => 'tester', storage, send: down, now, keepResolvedMs: 60_000 })
  await unsent.submit({ ...payload, units_requested: 7 }, { id: nextId() })
  t += 120_000
  const later = createOutbox({ owner: () => 'tester', storage, send: down, now, keepResolvedMs: 60_000 })
  const states = later.list().map((i) => i.state)
  assert.ok(!states.includes('delivered'), 'delivered items are gone')
  assert.ok(states.includes('queued'), 'the unsent one is still there')
})

test('clearResolved forgets settled items now and keeps unsent ones', async () => {
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: ok() })
  await outbox.submit(payload, { id: nextId() })
  const stuck = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: down })
  await stuck.submit(payload, { id: nextId() })
  outbox.clearResolved()
  stuck.clearResolved()
  assert.equal(outbox.list().length, 0)
  assert.equal(stuck.list().length, 1)
})

// E. flush must survive the user changing the queue under it.
test('flush carries on when the user discards a later item mid-way', async () => {
  let release: () => void = () => {}
  let n = 0
  const send: Sender = async () => {
    if (n++ === 0) await new Promise<void>((r) => (release = r))
    return { status: 201, body: { id: n } }
  }
  const storage = memoryStorage()
  seed(storage, [{ id: 'X-1234567' }, { id: 'Y-1234567', payload: { ...payload, units_requested: 1 } }, { id: 'Z-1234567', payload: { ...payload, units_requested: 4 } }])
  const outbox = createOutbox({ owner: () => 'tester', storage, send })
  const flushing = outbox.flush()
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(outbox.remove('Y-1234567'), true)
  release()
  const results = await flushing
  assert.deepEqual(results.map((r) => r.id), ['X-1234567', 'Z-1234567'])
})

// F. A screen has to find out when the queue changes in the background.
test('subscribers hear about every change, including a background retry, and can unsubscribe', async () => {
  let online = false
  const send: Sender = async () => {
    if (!online) throw new TypeError('down')
    return { status: 201, body: { id: 1 } }
  }
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send })
  let heard = 0
  const stop = outbox.subscribe(() => heard++)
  const v0 = outbox.version()
  await outbox.submit(payload, { id: 'form-subscribe-01' })
  assert.ok(heard >= 2, 'created, sending, then NOT SENT')
  assert.ok(outbox.version() > v0)
  const afterSubmit = heard
  online = true
  await outbox.flush()
  assert.ok(heard > afterSubmit, 'the background retry was announced')
  stop()
  const quiet = heard
  outbox.remove('form-subscribe-01')
  assert.equal(heard, quiet, 'no notifications after unsubscribe')
})

test('a listener that throws does not break the queue or the other listeners', async () => {
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: ok() })
  let healthy = 0
  outbox.subscribe(() => {
    throw new Error('boom')
  })
  outbox.subscribe(() => healthy++)
  const item = await outbox.submit(payload, { id: 'form-subscribe-02' })
  assert.equal(item.state, 'delivered')
  assert.ok(healthy > 0)
})

// G. Found in the browser: a gateway error (502 from a proxy) is not "the server answered".
test('a 502, 503 or 504 from a gateway counts as unreachable; a 500 from the server counts as reachable', async () => {
  for (const [status, expected] of [[502, false], [503, false], [504, false], [500, true], [409, true]] as const) {
    const heard: boolean[] = []
    const send: Sender = async () => ({ status, body: null })
    const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send, onReachability: (r) => heard.push(r) })
    await outbox.submit(payload, { id: `form-gateway-${status}` })
    assert.deepEqual(heard, [expected], `status ${status}`)
  }
})

test('a gateway error says the server could not be reached, and stays NOT SENT', async () => {
  const send: Sender = async () => ({ status: 502, body: null })
  const item = await createOutbox({ owner: () => 'tester', storage: memoryStorage(), send }).submit(payload, { id: 'form-gateway-text' })
  assert.equal(item.state, 'queued')
  assert.match(item.lastError ?? '', /could not be reached \(502\)/)
})

// H. Found in the browser: a request delivered while no screen was watching must still be announced, once.
test('takeDelivered hands over each delivered request once, including one delivered in the background', async () => {
  let online = false
  const send: Sender = async () => {
    if (!online) throw new TypeError('down')
    return { status: 201, body: { id: 77, status: 'AwaitingDecision' } }
  }
  const storage = memoryStorage()
  const outbox = createOutbox({ owner: () => 'tester', storage, send })
  await outbox.submit(payload, { id: 'form-take-0001' })
  assert.deepEqual(outbox.takeDelivered(), [], 'nothing delivered yet')
  online = true
  await outbox.flush() // delivered while nobody was watching
  const first = outbox.takeDelivered()
  assert.equal(first.length, 1)
  assert.equal((first[0].response as { id: number }).id, 77)
  assert.deepEqual(outbox.takeDelivered(), [], 'only once')
  const reloaded = createOutbox({ owner: () => 'tester', storage, send })
  assert.deepEqual(reloaded.takeDelivered(), [], 'and still only once after a reload')
})

test('takeDelivered is per user and ignores unsent and refused items', async () => {
  const storage = memoryStorage()
  let user = 'a'
  const outcomes: Array<{ status: number; body: unknown }> = [{ status: 201, body: { id: 1 } }, { status: 400, body: { detail: 'bad' } }]
  const send: Sender = async () => outcomes.shift() ?? { status: 201, body: { id: 9 } }
  const outbox = createOutbox({ owner: () => user, storage, send })
  await outbox.submit(payload, { id: 'form-take-0002' }) // delivered
  await outbox.submit({ ...payload, units_requested: 4 }, { id: 'form-take-0003' }) // refused
  user = 'b'
  assert.deepEqual(outbox.takeDelivered(), [], "b is not told about a's request")
  user = 'a'
  const mine = outbox.takeDelivered()
  assert.deepEqual(mine.map((i) => i.id), ['form-take-0002'])
})
