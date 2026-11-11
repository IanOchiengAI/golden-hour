// Run with:  node --experimental-strip-types --test tests/offline/
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFetchSender, createReachability, freshness, memoryStorage, readCache, writeCache } from '../../src/offline/index.ts'

// freshness: local time on both sides, so these hold in any time zone.
test('freshness says when the data is from and how old it is', () => {
  const at = new Date(2026, 10, 11, 1, 30)
  assert.equal(freshness(at, new Date(2026, 10, 11, 1, 34)).label, 'as of 01:30 (4 min ago)')
  assert.equal(freshness(at, new Date(2026, 10, 11, 1, 30)).label, 'as of 01:30 (just now)')
})

test('freshness marks data stale after the threshold', () => {
  const at = new Date(2026, 10, 11, 1, 30)
  assert.equal(freshness(at, new Date(2026, 10, 11, 1, 34)).stale, false)
  assert.equal(freshness(at, new Date(2026, 10, 11, 1, 35)).stale, true)
  assert.equal(freshness(at, new Date(2026, 10, 11, 1, 40), 15).stale, false)
})

test('freshness does not go negative or crash on a bad date', () => {
  assert.equal(freshness(new Date(2026, 10, 11, 2, 0), new Date(2026, 10, 11, 1, 0)).ageMinutes, 0)
  const bad = freshness('not a date')
  assert.equal(bad.stale, true)
  assert.match(bad.label, /unknown/)
})

test('the cache keeps the last good value with the time it was fetched', () => {
  const storage = memoryStorage()
  assert.equal(readCache(storage, 'k'), null)
  const when = new Date(2026, 10, 11, 1, 30)
  writeCache(storage, 'k', { stock: 7 }, when)
  const back = readCache<{ stock: number }>(storage, 'k')
  assert.deepEqual(back?.value, { stock: 7 })
  assert.equal(back?.fetchedAt, when.toISOString())
  storage.setItem('bad', 'oops')
  assert.equal(readCache(storage, 'bad'), null)
})

// reachability
test('reachability follows real calls, and a failure after a success means unreachable', () => {
  let t = 0
  const r = createReachability(() => new Date((t += 1000)))
  assert.equal(r.state(), 'unknown')
  r.record(true)
  assert.equal(r.state(), 'reachable')
  r.record(false)
  assert.equal(r.state(), 'unreachable')
  r.record(true)
  assert.equal(r.state(), 'reachable')
  assert.ok(r.lastReachableAt() instanceof Date)
})

// fetch sender
const body = { patient_blood_group: 'O+', component: 'RBC', units_requested: 1, urgency: 'urgent', client_request_id: 'abc-12345' }

test('the sender posts JSON with the token and returns the status and body of any reply', async () => {
  let seen: { url: string; init: RequestInit } | undefined
  const send = createFetchSender({
    getToken: () => 'tok123',
    baseUrl: 'http://x',
    fetchFn: async (url, init) => {
      seen = { url, init }
      return new Response(JSON.stringify({ detail: 'nope' }), { status: 409 })
    },
  })
  const result = await send(body)
  assert.deepEqual(result, { status: 409, body: { detail: 'nope' } })
  assert.ok(seen, 'fetch was called')
  const call = seen as { url: string; init: RequestInit }
  assert.equal(call.url, 'http://x/requests')
  assert.equal(call.init.method, 'POST')
  assert.equal((call.init.headers as Record<string, string>).Authorization, 'Token tok123')
  assert.equal(JSON.parse(String(call.init.body)).client_request_id, 'abc-12345')
})

test('the sender sends no Authorization header when logged out, and survives a non-JSON reply', async () => {
  let headers: Record<string, string> = {}
  const send = createFetchSender({
    getToken: () => null,
    fetchFn: async (_url, init) => {
      headers = init.headers as Record<string, string>
      return new Response('<html>Bad Gateway</html>', { status: 502 })
    },
  })
  assert.deepEqual(await send(body), { status: 502, body: null })
  assert.equal(headers.Authorization, undefined)
})

test('the sender throws when nothing comes back, and gives up after the timeout', async () => {
  const down = createFetchSender({ getToken: () => null, fetchFn: async () => { throw new TypeError('Failed to fetch') } })
  await assert.rejects(down(body), /Failed to fetch/)
  const hangs = createFetchSender({
    getToken: () => null,
    timeoutMs: 20,
    fetchFn: (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
  })
  await assert.rejects(hangs(body), /aborted/)
})

test('reachability tells subscribers only when the state really changes, and a bad listener does no harm', () => {
  const r = createReachability()
  let heard = 0
  r.subscribe(() => {
    throw new Error('boom')
  })
  const stop = r.subscribe(() => heard++)
  const v0 = r.version()
  r.record(true)
  assert.equal(heard, 1)
  r.record(true) // still reachable: not news
  assert.equal(heard, 1)
  r.record(false)
  assert.equal(heard, 2)
  assert.ok(r.version() > v0)
  stop()
  r.record(true)
  assert.equal(heard, 2, 'nothing after unsubscribe')
})
