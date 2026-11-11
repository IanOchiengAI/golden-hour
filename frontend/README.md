# Golden Hour — Frontend

The web app for emergency blood requests. There is one workspace for each role: clinician, blood bank officer, Ministry of Health (MoH) authorising officer and supplying lab officer.

React 19 + TypeScript + Vite + Tailwind CSS. It has no router or chart library: a small hash router and SVG charts keep the download light on 2G/3G.

Owner: Joronimo Amanya. API: `backend/` (Django + DRF). The API reference is in `backend/README.md` §7.

---

## Run it

You need Node 18+ and the backend running on port 8000 (see `backend/README.md`).

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/auth`, `/requests`, `/dispatches`, `/audit` and `/readiness` to `http://127.0.0.1:8000` (`vite.config.ts`), so there are no CORS settings to make.

| Command | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`), then production build into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run lint` | Oxlint |
| `node --experimental-strip-types --test tests/offline/*.test.ts` | Tests for the offline helpers (Node 22+) |

---

## Signing in

| Page | URL |
|---|---|
| Landing page | `#/` |
| Sign in | `#/login` |
| Workspace | `#/app/<section>` |
| One request | `#/app/requests/<id>` |

- **Sign-in form.** Email and password, sent to `POST /auth/login`. The token goes in `Authorization: Token …` on every call.
- **Sign in as a test user.** One click with the seeded demo accounts (password `demo2026`, all data synthetic). The lab officer has a site picker, because only the lab at the site a dispatch comes from can release it.
- **Switch test user.** When you signed in as a test user, the account menu (top right) can switch role without signing out. The Lab option opens at the site of the latest dispatch.
- **Sign out** forgets the token in this browser. If the server rejects a token (expired after 12 h), the app goes back to sign-in with a message.
- **No signup.** Accounts are issued by the blood service. The backend has no signup or logout endpoint yet.

Test users (created with `python manage.py seed_demo_users`):

| Role | Username |
|---|---|
| Clinician (Eastlands County Hospital, HSP-002) | `clinician@goldenhour.health` |
| Blood bank officer (Nairobi RBTC) | `officer@goldenhour.health` |
| MoH authorising officer | `moh@goldenhour.health` |
| Lab officer at any site | `lab.<facility id>@goldenhour.health`, e.g. `lab.hsp-001@goldenhour.health` |

The backend allows 10 logins a minute. Test-user tokens are reused until they expire, so switching roles quickly during a demo does not hit that limit.

---

## Workspaces

Each role gets a sidebar (a drawer on phones), a notifications bell and an account menu. The bell counts what this person must act on now, and its badge turns red when one of those items is life-threatening.

| Role | Sections | Bell counts |
|---|---|---|
| Clinician | Overview · Request blood · Confirm arrivals · My requests | Blood in transit to confirm |
| Blood bank officer | Overview · Decisions · All requests · Audit trail · Readiness | Requests waiting for a decision |
| MoH | Overview · Approvals · All requests · Audit trail · Readiness | Approvals, and standing-route requests that can still be stopped |
| Lab | Overview · Orders · Order history | Orders to release or hand over |

- **Overview pages:** headline numbers (click one to open its list), a list of what needs action with time left, and charts for requests per day (last 14 days) and requests by stage.
- **Tables:** search, status and urgency filters, and 10 rows per page. Click a row to open the request: details, dispatch, ranked sites, and (officer and MoH only) a timeline from the audit log.
- **Decisions (officer):** the held site as one card showing the arrival-time range, units and expiry. Accept, Change or Reject; Change and Reject need a reason. When the model is offline, an amber line says "AI offline". The countdown uses the backend's `due_at`.
- **Approvals (MoH):** approve or reject per-transfer requests. For standing-authorisation requests: mark reviewed, or stop the transfer before release.
- **Orders (lab):** release with a transport mode, or decline with a reason (the next site is then offered to the officer). Then mark in transit. Patient details are never shown.
- **Confirm arrivals (clinician):** enter the highest cool-box temperature. Above 10 °C the backend's quarantine warning is shown and stays on screen.
- **Readiness:** sample data, labelled "Illustrative, next step". There is no `/readiness` endpoint yet.

Screens poll every 10–15 s while the tab is visible, so the next role sees a new status without reloading.

---

## Code map

```
src/
  App.tsx                  routes: landing, sign-in, /app/<section> per role
  lib/router.tsx           hash router (useRoute, navigate, Link)
  context/AuthContext.tsx  sign in / test users / sign out, token storage
  api/client.ts            every API call; turns DRF errors into one readable line
  api/facilities.ts        facility names from the synthetic starter dataset
  hooks/usePolling.ts      polling, countdown clock, last dispatch site
  hooks/useData.ts         polled requests / dispatches (up to 200, the API maximum)
  layout/AppShell.tsx      sidebar, top bar, notifications, account menu, nav per role
  pages/                   Landing, Login, Overview (all roles), Requests, RequestDetail
  components/ui.tsx        shared look: buttons, chips, cards, table + pagination, dialogs
  components/charts.tsx    ColumnChart and BarList (SVG, hover tooltips)
  components/*View.tsx     work screens: request form, decisions, approvals, orders, audit, readiness
  offline/                 offline outbox helpers (not wired to a screen yet; see its README)
```

**Design rules.** One accent colour (blue) is used for actions. Green, amber and red are only for status, and red only means life-threatening or a blocking problem. Text is set in one type scale, with big numbers for blood group, units, arrival time and time left. Every screen works at 375 px wide.

---

## Known limits and backend asks

- **Stats only cover recent requests.** Stats and tables use the 200 most recent requests the user can see, the most the list endpoint returns. Needs a paged, date-filtered `GET /requests` and a `GET /stats`.
- **Sign-out is local only.** There is no `POST /auth/logout` (to revoke the token) and no `GET /auth/me`.
- **Escalation does nothing yet.** The decision timer reaches "Overdue", but nothing escalates.
- **MoH review list never empties.** Requests have no "reviewed" flag, so reviewed ones stay listed.
- **Readiness is sample data.** It waits for a `/readiness` endpoint.
- **Offline outbox is not connected.** `src/offline/` is built and tested but not used by any screen.
