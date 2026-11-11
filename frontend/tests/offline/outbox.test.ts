// Run with:  node --experimental-strip-types --test tests/offline/
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify, createOutbox, defaultNewId, describeItem, memoryStorage } from '../../src/offline/index.ts'
import type { KeyValueStorage, OutboxItem, RaiseRequestPayload, Sender } from '../../src/offline/index.ts'

let idCounter = 0
const nextId = () => `test-id-${String(++idCounter).padStart(6, '0')}`
const payload: RaiseRequestPayload = {
  patient_blood_group: 'O+',
  component: 'RBC',
  units_requested: 2,
  urgency: 'life_threatening',
}

type Step = { status: number; body?: unknown } | 'network-down'

/** A sender that plays back scripted replies and records every call. */
function scripted(steps: Step[]) {
  const calls: Array<RaiseRequestPayload & { client_request_id: string }> = []
  let i = 0
  const send: Sender = async (body) => {
    calls.push(body)
    const step = steps[Math.min(i++, steps.length - 1)]
    if (step === 'network-down') throw new TypeError('Failed to fetch')
    return { status: step.status, body: step.body ?? null }
  }
  return { send, calls }
}

function clock(start = Date.UTC(2026, 10, 11, 0, 0, 0)) {
  let t = start
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) }
}

test('a 201 reply is delivered, sent once, with its own id as client_request_id', async () => {
  const s = scripted([{ status: 201, body: { id: 7, status: 'AwaitingDecision' } }])
  const storage = memoryStorage()
  const outbox = createOutbox({ owner: () => 'tester', storage, send: s.send })
  const item = await outbox.submit(payload, { id: nextId() })
  assert.equal(item.state, 'delivered')
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0].client_request_id, item.id)
  assert.deepEqual(item.response, { id: 7, status: 'AwaitingDecision' })
  assert.equal(outbox.unsentCount(), 0)
  assert.ok(storage.getItem('gh_outbox_v1')?.includes(item.id), 'item is persisted')
})

test('no connection: NOT SENT, then a retry reuses the SAME client_request_id', async () => {
  const s = scripted(['network-down', { status: 201, body: { id: 9, status: 'AwaitingDecision' } }])
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send })
  const first = await outbox.submit(payload, { id: nextId() })
  assert.equal(first.state, 'queued')
  assert.equal(describeItem(first).headline, 'NOT SENT')
  assert.equal(describeItem(first).canRetry, true)
  assert.equal(outbox.unsentCount(), 1)
  const second = await outbox.retry(first.id)
  assert.equal(second.state, 'delivered')
  assert.equal(second.attempts, 2)
  assert.equal(s.calls[0].client_request_id, s.calls[1].client_request_id)
  assert.equal(describeItem(second).headline, 'Request #9 raised')
})

test('a 200 reply (the server recognised a retry) counts as delivered', async () => {
  const s = scripted([{ status: 200, body: { id: 3, status: 'AwaitingDecision' } }])
  const item = await createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send }).submit(payload, { id: nextId() })
  assert.equal(item.state, 'delivered')
})

test('replies that may succeed later stay queued; replies that never will are refused', () => {
  for (const status of [401, 429, 500, 502, 503, 504]) assert.equal(classify(status, null).state, 'queued', String(status))
  for (const status of [400, 403, 404, 409, 422]) assert.equal(classify(status, null).state, 'rejected', String(status))
  assert.match(classify(400, { units_requested: ['This field is required.'] }).error ?? '', /units_requested: This field is required\./)
  assert.equal(classify(409, { detail: 'already used' }).error, 'already used')
})

test('a refused request is not retried by retry() or flush()', async () => {
  const s = scripted([{ status: 400, body: { detail: 'bad input' } }])
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send })
  const item = await outbox.submit(payload, { id: nextId() })
  assert.equal(item.state, 'rejected')
  assert.equal(describeItem(item).headline, 'REFUSED')
  assert.equal(describeItem(item).canRetry, false)
  await outbox.retry(item.id)
  await outbox.flush()
  assert.equal(s.calls.length, 1)
})

test('the request is written to storage BEFORE the first attempt', async () => {
  const storage = memoryStorage()
  let seenWhileSending: OutboxItem[] = []
  const send: Sender = async () => {
    seenWhileSending = JSON.parse(storage.getItem('gh_outbox_v1') ?? '[]')
    return { status: 201, body: { id: 1 } }
  }
  await createOutbox({ owner: () => 'tester', storage, send }).submit(payload, { id: nextId() })
  assert.equal(seenWhileSending.length, 1)
  assert.equal(seenWhileSending[0].state, 'sending')
})

test('after a reload, an attempt that was in flight is treated as NOT SENT', () => {
  const storage = memoryStorage()
  const stale: OutboxItem = {
    id: 'abc-12345', payload, state: 'sending', attempts: 1, owner: 'tester',
    createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z',
  }
  storage.setItem('gh_outbox_v1', JSON.stringify([stale]))
  const outbox = createOutbox({ owner: () => 'tester', storage, send: scripted([{ status: 201 }]).send })
  assert.equal(outbox.list()[0].state, 'queued')
  assert.equal(outbox.unsentCount(), 1)
})

test('flush sends queued items oldest first and reports each result', async () => {
  const c = clock()
  const s = scripted(['network-down', 'network-down', { status: 201, body: { id: 1 } }, { status: 201, body: { id: 2 } }])
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send, now: c.now })
  const a = await outbox.submit({ ...payload, units_requested: 1 }, { id: nextId() })
  c.advance(1000)
  const b = await outbox.submit({ ...payload, units_requested: 3 }, { id: nextId() })
  assert.deepEqual([a.state, b.state], ['queued', 'queued'])
  const results = await outbox.flush()
  assert.deepEqual(results.map((r) => r.state), ['delivered', 'delivered'])
  assert.deepEqual([s.calls[2].client_request_id, s.calls[3].client_request_id], [a.id, b.id])
  assert.equal(outbox.unsentCount(), 0)
})

test('a double tap while the first attempt is in flight sends once', async () => {
  const s = scripted([{ status: 201, body: { id: 5 } }])
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send })
  const formId = nextId()
  const [x, y] = await Promise.all([outbox.submit(payload, { id: formId }), outbox.submit(payload, { id: formId })])
  assert.equal(x.id, y.id)
  assert.equal(s.calls.length, 1)
})

test('an identical request after the first one settled is a new request', async () => {
  const s = scripted([{ status: 201, body: { id: 1 } }, { status: 201, body: { id: 2 } }])
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send })
  const first = await outbox.submit(payload, { id: nextId() })
  const second = await outbox.submit(payload, { id: nextId() })
  assert.notEqual(first.id, second.id)
  assert.equal(s.calls.length, 2)
})

test('remove drops a queued item but not one that is being sent', async () => {
  let release: (() => void) | undefined
  const send: Sender = () => new Promise((resolve) => { release = () => resolve({ status: 201, body: { id: 1 } }) })
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send })
  const inFlight = outbox.submit(payload, { id: nextId() })
  const id = outbox.list()[0].id
  assert.equal(outbox.remove(id), false)
  release?.()
  await inFlight
  assert.equal(outbox.remove(id), true)
  assert.equal(outbox.list().length, 0)
})

test('ids pass the backend check for client_request_id', () => {
  for (let i = 0; i < 20; i++) assert.match(defaultNewId(), /^[A-Za-z0-9._:-]{8,64}$/)
})

test('corrupt stored data gives an empty queue, not a crash', () => {
  const storage = memoryStorage()
  storage.setItem('gh_outbox_v1', '{not json')
  assert.equal(createOutbox({ owner: () => 'tester', storage, send: scripted([{ status: 201 }]).send }).list().length, 0)
  storage.setItem('gh_outbox_v1', '{"a":1}')
  assert.equal(createOutbox({ owner: () => 'tester', storage, send: scripted([{ status: 201 }]).send }).list().length, 0)
})

test('if storage refuses writes, submit still works for this session', async () => {
  const broken: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} }
  const item = await createOutbox({ owner: () => 'tester', storage: broken, send: scripted([{ status: 201, body: { id: 4 } }]).send }).submit(payload, { id: nextId() })
  assert.equal(item.state, 'delivered')
})

test('describeItem: a delivered request with no stock says to use the phone', async () => {
  const s = scripted([{ status: 201, body: { id: 12, status: 'HandledManually' } }])
  const item = await createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send }).submit(payload, { id: nextId() })
  const d = describeItem(item)
  assert.equal(d.tone, 'warn')
  assert.match(d.headline, /no stock was found/)
  assert.match(d.detail, /phone/)
})

test('onReachability hears true when the server answers, even with an error, and false when nothing comes back', async () => {
  const heard: boolean[] = []
  const s = scripted([{ status: 500 }, 'network-down'])
  const outbox = createOutbox({ owner: () => 'tester', storage: memoryStorage(), send: s.send, onReachability: (r) => heard.push(r) })
  const item = await outbox.submit(payload, { id: nextId() })
  await outbox.retry(item.id)
  assert.deepEqual(heard, [true, false])
})
