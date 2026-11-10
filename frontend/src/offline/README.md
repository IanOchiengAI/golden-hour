# Offline helpers

Small, framework-free helpers that stop the screens from claiming something happened when it did not. They are not used by any screen yet. See "Hook-up" below.

## The problem they solve

When a call to the backend fails, parts of the app show a made-up success: a request that was never raised, an approval that was never recorded. In a blood request that is dangerous. A clinician who sees "units are reserved" will not phone the blood bank.

## What is here

| File | Does |
|---|---|
| `outbox.ts` | A queue for "raise a request". Saves it first, sends it, and reports one of four states |
| `fetchSender.ts` | Sends `POST /requests` and reports the HTTP status for every reply |
| `connectivity.ts` | Whether the server answers, judged from real calls (the browser's online flag says nothing about the API) |
| `freshness.ts` | "as of 01:30 (4 min ago)" labels, and a small cache that keeps the last good answer with its time |
| `storage.ts` | `localStorage` with a safe in-memory fallback |

## The four states of a request

| State | Meaning | What the screen should say |
|---|---|---|
| `sending` | An attempt is in flight | "Sending" |
| `queued` | **NOT SENT.** No connection, server error, rate limit or expired login | "NOT SENT. Call the blood bank now." and a Retry button |
| `delivered` | The server accepted it (201, or 200 when it recognised a retry) | "Request #N raised", using the server's reply |
| `rejected` | The server refused it for good (bad input, not allowed, conflict) | "REFUSED" and the server's reason. No retry |

`describeItem(item)` returns the headline, detail and colour for each state.

## Rules that keep it safe

- **Saved before sent.** The request is written to storage before the first attempt, so a closed tab never loses it. After a reload, an attempt that was in flight is shown as NOT SENT.
- **One id per form, reused on every retry.** `submit()` requires an id, sent to the server as `client_request_id`. The backend answers a repeated id with the original request, so a retry can never raise a second one. Tapping Submit twice, or again while NOT SENT, with the same form id returns the same item. A new form, even with identical contents, is a new request, because it may be another patient. (The current `api.createRequest` makes a new id on every call, so a retry there is not safe.)
- **A failure is never shown as success.** There is no simulated request.
- **Items belong to the user who raised them.** `owner` is required. Another user who logs in on the same device does not see, retry or send them, so a request is never raised under the wrong login or hospital. An unsent request stays on the device until its owner logs in again, so warn before logout (see below).
- **No clinical note left behind.** The note is kept only while the request is unsent, because it has to be sent. Once the request is delivered or refused, the note is removed from the device, and settled items are forgotten after an hour. Unsent items are never dropped.
- **A manual Retry and the automatic flush cannot fight.** An item that is already settled is never sent again and never changes state.
- **Only raising a request is queued.** Decisions, authorisations and releases depend on the live state of the request and the held units. Two disconnected screens could otherwise both "hold" the last O- unit. Those calls must reach the server to count, and should show the server's error when they fail.

## Hook-up (not done yet; the screens are Joronimo's)

```tsx
// Once, outside the component
import { browserStorage, createFetchSender, createOutbox, createReachability, defaultNewId, describeItem } from '../offline/index.ts'

export const reachability = createReachability()
export const outbox = createOutbox({
  storage: browserStorage(),
  send: createFetchSender({ getToken: () => api.getToken() }),
  // Required. Read the login fresh each time, not once.
  owner: () => JSON.parse(localStorage.getItem('gh_user') ?? 'null')?.username ?? null,
  onReachability: (ok) => reachability.record(ok),
})

// In ClinicianView: one id per form, renewed after the form is finished with
const [formId, setFormId] = useState(defaultNewId)

// In handleSubmit, replace the try/catch around api.createRequest
const need = { patient_blood_group: bloodGroup, component, units_requested: units, urgency, clinical_note: clinicalNote }
if (outbox.unsentLike(need).filter((i) => i.id !== formId).length > 0 && !window.confirm('You already have an unsent request like this. Is this a second patient?')) return
const item = await outbox.submit(need, { id: formId })
if (item.state === 'rejected') setFormId(defaultNewId())   // the user must fix it and raise it again

// Re-render when the queue changes, and show what it holds
const version = useSyncExternalStore(outbox.subscribe, outbox.version)
const notDelivered = outbox.list().filter((i) => i.state !== 'delivered')   // NOT SENT and REFUSED banners: describeItem(item), with Retry and Dismiss

// A delivered request, announced exactly once: just now, on a background retry, or while this tab was not showing
useEffect(() => {
  for (const item of outbox.takeDelivered()) {
    setLatestRequest(item.response as EmergencyRequest)   // the server's real request, never a made-up one
    if (item.id === formId) setFormId(defaultNewId())      // next form, next id
  }
}, [version])

// Once, in an effect: retry when the connection returns
window.addEventListener('online', () => outbox.flush())
const timer = setInterval(() => outbox.flush(), 15_000)

// Before logging out
if (outbox.unsentCount() > 0) alert(`${outbox.unsentCount()} request(s) are NOT SENT and stay on this device until you log in again. Call the blood bank.`)
```

### Three things the real screens taught us

These were found by running the hook-up in a browser against the real backend. Each one is easy to get wrong.

1. **Put the banner next to the Submit button, and scroll it into view.** On a phone the button is at the bottom of a long form. A banner at the top of the form is off screen, so the clinician sees nothing happen. Render it directly above the button, give it `role="alert"` so screen readers announce it, and run `ref.current?.scrollIntoView({ block: 'nearest' })` on every outbox change (not only when the count changes, because the banner grows when it goes from "Sending" to "NOT SENT").
2. **Feed reachability from every API call, and use it in the header badge.** The browser's online flag stays true when the API is down, so a badge based on it says "Online" next to a NOT SENT banner. In the API client's `request()`, call `reachability.record(false)` when `fetch` throws, and `reachability.record(!GATEWAY_ERRORS.includes(response.status))` otherwise. Keep one shared `reachability` object (a small file that both the client and the outbox import, so they do not import each other), and show "Server unreachable" in the header when `reachability.state() === 'unreachable'`. A 502, 503 or 504 comes from a gateway in front of the server, so it counts as unreachable, not as "the server answered".
3. **Announce a delivered request with `takeDelivered()`.** A retry can deliver a request while the clinician is on another tab. The banner then disappears, and without `takeDelivered()` nothing tells the clinician it went through.

## Not included

- No service worker and no background sync. Retries happen while the page is open.
- One page at a time. The queue is kept in memory and written to storage on every change, so two tabs would overwrite each other.
- The device clock sets the "as of" times. If it is wrong, so are they.
- The screens do not use any of this yet.

## Tests

From the `frontend` folder, with Node 22.6 or newer and no installs:

```
node --experimental-strip-types --test "tests/offline/*.test.ts"
```

The tests live outside `src/` so they cannot affect the app build. `hardening.test.ts` holds the scenarios that were found by attacking the first version.
