// The hook-up described in offline/README.md: one outbox for the whole app.
import { api } from './api/client'
import { browserStorage, createFetchSender, createOutbox } from './offline/index.ts'
import { reachability } from './reachability'

// Read the signed-in user fresh each time, not once.
const owner = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem('gh_user') ?? 'null')?.username ?? null
  } catch {
    return null
  }
}

export const outbox = createOutbox({
  storage: browserStorage(),
  send: createFetchSender({ getToken: () => api.getToken() }),
  owner,
  onReachability: (ok) => reachability.record(ok),
})

// Retry when the connection returns, and every 15 seconds while something is unsent.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void outbox.flush()
  })
  setInterval(() => {
    if (outbox.unsentCount() > 0) void outbox.flush()
  }, 15_000)
}
