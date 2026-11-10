# Golden Hour — Backend Spec: What's Left

Owner: Roland Sankara · Branch: `ft/backend` · Last updated: Tue 10 Nov 2026, ~20:30 EAT

This document lists every backend piece still to build, in build order, from
now until submission. Each piece says what it does, who calls it, the request
and response, the status changes, what gets audited, the error cases, the
tests, and when it counts as done.

For what is already built and how to run it, see [`backend/README.md`](../backend/README.md).

---

## Contents

- [Where we are](#where-we-are)
- [Timeline and cut rules](#timeline-and-cut-rules)
- [Shared changes (do first)](#shared-changes-do-first)
- **Core flow — needed for the Tue 22:00 gate**
  - [Piece 0 — Merge the PR](#piece-0--merge-the-pr)
  - [Piece 1 — List and detail endpoints](#piece-1--list-and-detail-endpoints)
  - [Piece 2 — Officer decision](#piece-2--officer-decision)
  - [Piece 3 — MoH authorisation](#piece-3--moh-authorisation)
  - [Piece 4 — Dispatch and lab release](#piece-4--dispatch-and-lab-release)
  - [Piece 5 — Dispatch status](#piece-5--dispatch-status)
  - [Piece 6 — Audit endpoint](#piece-6--audit-endpoint)
- **Add-ons — only after the gate passes**
  - [Piece 7 — Escalation timers](#piece-7--escalation-timers)
  - [Piece 8 — SMS (Africa's Talking)](#piece-8--sms-africas-talking)
  - [Piece 9 — Readiness](#piece-9--readiness)
  - [Piece 10 — Voice request (optional)](#piece-10--voice-request-optional)
  - [Piece 11 — FHIR export (optional)](#piece-11--fhir-export-optional)
- **Ship it**
  - [Piece 12 — Security hardening](#piece-12--security-hardening)
  - [Piece 13 — Deployment](#piece-13--deployment)
  - [Piece 14 — Demo support](#piece-14--demo-support)
- [Final API table](#final-api-table)
- [Final status lifecycle](#final-status-lifecycle)
- [Open questions](#open-questions)

---

## Where we are

**Built and tested (35 tests):** token login with roles, append-only audit log,
rules engine, `POST /requests` (matching + ML ranking + auto-hold), read-only
`GET /requests/{id}/options`, view-only Django admin, `config/kenya.yaml`.

**A request today stops at `AwaitingDecision`.** Everything below moves it on to
`Received`.

---

## Timeline and cut rules

From the team plan (`.agents/KNOWLEDGE.md` §11).

| By (EAT) | Must be done | If not |
|---|---|---|
| **Tue 22:00** | Pieces 0–6: dispatch flow end to end | Stop all add-ons; everyone helps the flow |
| **Wed 04:00** | Pieces 7–8: escalation and SMS | Keep auto-hold only; mention the rest in slides |
| **Wed 06:00** | Piece 9: readiness | Drop it; show as next step in the architecture diagram |
| **Wed 08:00** | Pieces 12–13: hardening and live deployment | Demo from a local run; say so in the README |
| **Wed 10:00** | Piece 14: demo data ready for the video | — |
| **Wed 12:00** | Submission | — |

| Piece | Estimate |
|---|---|
| Shared changes | 15 min |
| 0 Merge | 5 min |
| 1 Lists | 20 min |
| 2 Decision | 40 min |
| 3 Authorisation | 25 min |
| 4 Dispatch + release | 45 min |
| 5 Status | 15 min |
| 6 Audit | 10 min |
| **Gate total** | **~3 h** |
| 7 Escalation | 30 min |
| 8 SMS | 1 h 30 min |
| 9 Readiness | 1 h |
| 10 Voice | 2 h (optional) |
| 11 FHIR | 30 min (optional) |
| 12 Hardening | 45 min |
| 13 Deployment | 1 h |
| 14 Demo support | 30 min |

If the gate is at risk, the minimum is **pieces 2, 3, 4 and 5**. The admin
already shows each request's audit trail, so piece 6 can slip a little.

---

## Shared changes (do first)

Small changes several pieces depend on. One migration.

### Model changes

`EmergencyRequest` — add:

| Field | Type | Why |
|---|---|---|
| `status_changed_at` | DateTime | Escalation timers measure time in the current status |
| `authorisation_route` | `standing` \| `per_transfer` \| blank | Which tier applied; set when the officer accepts |
| `escalated_at` | DateTime, null | When the decision or authorisation timer fired |

`transition()` in `emergency/services.py` sets `status_changed_at = now()` on every move.

`UnitHold` — add:

| Field | Type | Why |
|---|---|---|
| `consumed_at` | DateTime, null | Set when the units are dispatched |

> **Why `consumed_at` matters:** the starter database is read-only, so a
> dispatched unit still shows `status = in_stock` there. A consumed hold is
> **never released**, so the unit stays excluded from matching for good. Only
> holds that are not consumed can be released.

### Helper

`release_holds(req, reason, actor)` in `services.py`: sets `released_at` and
`release_reason` on the request's active, unconsumed holds, and writes one
`holds_released` audit event listing the unit ids.

### Errors

Add one error for a wrong-state call: `409 Conflict`,
`{"detail": "Request 12 is InTransit; this action needs AwaitingDecision."}`.
Map `InvalidTransition` to it in one place (a DRF exception handler).

### Roles

No new roles. All four exist: `clinician`, `blood_bank_officer`, `moh_officer`,
`lab_officer`.

---

## Piece 0 — Merge the PR

Merge `ft/backend` into `main` so Amanya can connect the frontend to the real
API. Each teammate runs `python backend/scripts/build_starter_db.py` once.

**Done when:** `main` has the backend and the frontend can call `POST /requests`.

---

## Piece 1 — List and detail endpoints

The agreed contract has no way for a screen to **find** its work. These are
read-only additions; tell Amanya.

### `GET /requests`

| Caller | Sees |
|---|---|
| `clinician` | Requests from their own facility only |
| `blood_bank_officer` | All requests |
| `moh_officer` | All requests |
| `lab_officer` | **Refused (403)** — labs use `GET /dispatches` |

Query parameters: `status` (repeatable, e.g. `?status=AwaitingDecision&status=Escalated`),
`urgency`, `limit` (default 50, max 200). Newest first.

Response `200`: `{"results": [ <request summary>, … ]}` — the same object
`POST /requests` returns, plus `top_option` (`facility_name`, `eta`) and
`decision_due_at` (`status_changed_at + decision_escalation_min`, only while
`AwaitingDecision`).

### `GET /requests/{id}`

Same roles and facility rule as above. Returns the request, its options, the
active hold, and its dispatch (if any) — one call for the status-tracking screen.

### `GET /dispatches` and `GET /dispatches/{id}`

| Caller | Sees |
|---|---|
| `lab_officer` | Dispatches **from** their own facility |
| `clinician` | Dispatches **to** their own facility |
| others | 403 |

Query parameter: `status`. Response uses the **supplier-safe** serializer
(piece 4): no patient fields.

### Tests

- Clinician at HSP-002 does not see a request from another facility (list and detail → 404, not 403, so ids are not leaked).
- Lab officer gets 403 on `/requests`.
- Status filter works with several values.
- Dispatch list for a lab officer shows only their facility's dispatches.

**Done when:** each screen can load its own work queue.

---

## Piece 2 — Officer decision

### `POST /requests/{id}/decision`

**Role:** `blood_bank_officer` (either the main or the backup officer).
**Allowed from:** `AwaitingDecision` or `Escalated`. Otherwise `409`.

Request:

| Field | Required | Notes |
|---|---|---|
| `action` | yes | `accept`, `change`, `reject` |
| `option_id` | for `change` | Must belong to this request and differ from the held option |
| `reason` | for `change` and `reject` | 3–500 characters |

```json
{"action": "change", "option_id": 2, "reason": "Rank 1 vehicle is out on another run"}
```

### Behaviour

**accept**
1. Check an active hold exists (if the request was escalated and nothing is held, `409`).
2. Audit `decision_accepted` with the option.
3. Apply the authorisation tier (below).

**change**
1. In one transaction: release the current hold (`reason = "Changed by officer: …"`),
   then hold the chosen option's units with `hold_option()`.
2. If any of those units is now held by another request, the database refuses
   it (`IntegrityError`). Roll back — the old hold stays — and return `409`:
   `"Units at <site> were just reserved for another request. Choose another option."`
3. Audit `decision_changed` with before (old option) and after (new option) and the reason.
4. Apply the authorisation tier.

**reject**
1. Release the hold (`reason = "Rejected by officer: …"`).
2. Transition to `HandledManually` with the reason.
3. Audit `decision_rejected`.

**Authorisation tier** (after accept or change), from `emergency_authorisation` in `config/kenya.yaml`:

| Urgency | Setting | Next status | Also |
|---|---|---|---|
| `life_threatening` | `standing` | `SentToSupplier` | Create the dispatch (piece 4). Audit `moh_notified` (MoH can stop it — piece 3). Set `authorisation_route = standing`. |
| `life_threatening` | `per_transfer` | `AwaitingAuthorisation` | `authorisation_route = per_transfer` |
| `urgent`, `routine` | either | `AwaitingAuthorisation` | `authorisation_route = per_transfer` |

> **Note on ordering:** the dispatch is created in piece 4. While piece 4 is not
> built, the standing route only changes the status. Build piece 4 straight after.

### Response

`200` with the request detail (same shape as `GET /requests/{id}`).

### Errors

| Code | When |
|---|---|
| 400 | Missing `reason` for change/reject; missing or invalid `option_id`; `option_id` is the held option for `change` |
| 403 | Not a blood bank officer |
| 404 | Request or option not found |
| 409 | Wrong status; or units for `change` were just taken |

### Tests

- Accept on a life-threatening request with `standing` → `SentToSupplier`, `moh_notified` audited.
- Accept on an urgent request → `AwaitingAuthorisation`.
- Override the config to `per_transfer`: life-threatening → `AwaitingAuthorisation`.
- Change → old units released, new units held, audit has before and after.
- Change to an option whose units another request holds → `409`, old hold still active.
- Reject → holds released, `HandledManually`, reason saved.
- Reject without a reason → `400`.
- Decision on a request already `SentToSupplier` → `409`.
- Clinician calling it → `403`.

**Done when:** the officer screen's Accept, Change and Reject buttons all work.

---

## Piece 3 — MoH authorisation

### `POST /requests/{id}/authorise`

**Role:** `moh_officer`.

| `action` | Allowed from | Result |
|---|---|---|
| `approve` | `AwaitingAuthorisation` | → `SentToSupplier`; create the dispatch |
| `reject` | `AwaitingAuthorisation` | Release holds → `HandledManually` |
| `stop` | `SentToSupplier` with `authorisation_route = standing`, dispatch not yet released | Cancel the dispatch, release holds → `HandledManually` |
| `review` | Any status, `authorisation_route = standing` | No status change; records the after-the-fact review |

`reason` is required for `reject` and `stop`; optional for `approve` and `review`.

```json
{"action": "approve", "reason": "Within regional emergency protocol"}
```

### Audit

`authorisation_approved`, `authorisation_rejected`, `authorisation_stopped`,
`authorisation_reviewed` — each with the reason.

### Errors

`400` missing reason · `403` not MoH · `404` · `409` wrong status (e.g. `stop`
after the lab released the units, `approve` on a standing-route request).

### Tests

- Approve → `SentToSupplier` and a dispatch exists.
- Reject → holds released, `HandledManually`.
- Stop on a standing-route request before release → dispatch cancelled, holds released.
- Stop after release → `409`.
- Review on a standing-route request → audit only, status unchanged.
- Approve on a request in `AwaitingDecision` → `409`.

**Done when:** the MoH screen can approve, reject, stop and review.

---

## Piece 4 — Dispatch and lab release

### New model: `Dispatch`

| Field | Type | Notes |
|---|---|---|
| `request` | FK EmergencyRequest | |
| `option` | FK RankedOption | Which ranked site this is |
| `from_facility_id` | str | Supplying site |
| `to_facility_id` | str | Requesting hospital |
| `unit_ids` | JSON list | Copied from the option |
| `status` | choice | `AwaitingRelease`, `Released`, `Declined`, `Cancelled`, `InTransit`, `Received` |
| `transport_mode` | choice, blank | `vehicle`, `motorbike`, `public_service_vehicle` |
| `released_by`, `released_at` | FK user, DateTime | Lab officer who confirmed |
| `decline_reason` | text | |
| `in_transit_at`, `received_at` | DateTime | |
| `received_by` | FK user | Clinician who confirmed arrival |
| `coolbox_max_temp_c` | float, null | Entered on arrival |
| `created_at` | DateTime | |

At most one dispatch per request may be in `AwaitingRelease`, `Released` or
`InTransit` at a time (database constraint, like the hold constraint).

`create_dispatch(req, option)` in `services.py` is called by piece 2 (standing
route) and piece 3 (approve). Audit `dispatch_created`.

### Supplier-safe serializer

**Rule from CLAUDE.md: supplying facilities never see patient details.** The
dispatch serializer sent to lab officers contains only:

`id, status, from_facility_id, to_facility_id, to_facility_name, component,
units_requested, unit_ids, blood_groups (of the units), urgency, created_at,
released_at, in_transit_at, received_at`

It must **not** contain `patient_blood_group`, `clinical_note`, the request's
`warnings`, or any field added to the request later. Write a test that fails if
any of those keys appear.

### `POST /dispatches/{id}/release`

**Role:** `lab_officer` whose `facility_id` equals the dispatch's
`from_facility_id`. Any other lab officer → `403`.
**Allowed from:** dispatch `AwaitingRelease`.

| `action` | Required | Result |
|---|---|---|
| `confirm` | `transport_mode` optional | Dispatch → `Released`; request → `Dispatched`; holds get `consumed_at` |
| `decline` | `reason` | See below |

**decline**
1. Dispatch → `Declined`, save the reason. Release this site's holds.
2. Find the next option by rank (after the declined one) whose units are all
   free. Hold it with `hold_option()`.
3. If found: request → `UnitsHeld` → `AwaitingDecision`. **The officer must
   decide again** — every move of blood needs a human Accept. Audit
   `release_declined` and `units_held`.
4. If none left: request → `HandledManually`, reason
   `"All ranked sites declined or unavailable"`.

### Tests

- Confirm by the right lab → request `Dispatched`, holds consumed.
- Consumed units are excluded from a new request's matching.
- Lab officer from another facility → `403`.
- Decline → next-ranked site held, request back to `AwaitingDecision`.
- Decline on the last option → `HandledManually`.
- Supplier serializer has no patient fields.

**Done when:** the supplying lab screen can confirm or decline, and a decline
offers the next site.

---

## Piece 5 — Dispatch status

### `POST /dispatches/{id}/status`

| `status` | Caller | Allowed from | Result |
|---|---|---|---|
| `in_transit` | `lab_officer` at `from_facility_id` | `Released` | Dispatch `InTransit`; request `InTransit` |
| `received` | `clinician` at `to_facility_id` | `InTransit` | Dispatch `Received`; request `Received` |

`received` takes an optional `coolbox_max_temp_c`. If it is above **10 °C** (the
cool box limit in the data dictionary), the response includes a warning:
`"Cool box reached 11.2 °C — quarantine these units and do not transfuse until checked."`
Audit `cold_chain_excursion_on_arrival`. Status still becomes `Received`
(the blood has arrived); the warning is for the receiving lab.

Audit `status_changed` as usual, with the dispatch id.

### Tests

- Full path: Dispatched → InTransit → Received.
- `received` before `in_transit` → `409`.
- Wrong facility → `403`.
- `coolbox_max_temp_c = 11` → warning and audit event.

**Done when:** one request can be driven from raised to received through the API.
**This is the 22:00 gate.**

### End-to-end test to add

One test that drives a full request: clinician raises → officer accepts →
(MoH approves, for urgent) → lab confirms → lab marks in transit → clinician
marks received. Then checks the audit trail has every step in order.

---

## Piece 6 — Audit endpoint

### `GET /audit?request_id=`

**Roles:** `blood_bank_officer`, `moh_officer`. Lab officers are refused,
because audit events contain patient fields.

`request_id` is required. Returns events oldest first:

```json
{"request_id": 12, "events": [
  {"time": "2026-11-10T21:04:11+03:00", "actor": "officer@goldenhour.health",
   "role": "blood_bank_officer", "action": "decision_changed",
   "object": "option:37", "before": {...}, "after": {...}, "reason": "..."}
]}
```

### Tests

- Returns events in order for a full flow.
- Lab officer → `403`. Missing `request_id` → `400`.

**Done when:** the judges' timeline view can load.

---

## Piece 7 — Escalation timers

*Add-on. Start only after the 22:00 gate passes.*

No job queue. A management command checks every 30 seconds:

```bash
python manage.py run_escalations --loop
```

| Check | Condition | Action |
|---|---|---|
| Decision | `AwaitingDecision` and `status_changed_at` older than `decision_escalation_min` (5) | → `Escalated`; set `escalated_at`; audit `escalated_to_backup` listing the backup officers; SMS (piece 8) |
| Authorisation | `AwaitingAuthorisation`, older than `authorisation_escalation_min` (10), `escalated_at` empty | Status unchanged; set `escalated_at`; audit `authorisation_escalated`; SMS |

Each check runs in a transaction and re-reads the status, so it never acts on a
request that just moved. Running the command twice at once must be safe.

A `--once` flag runs one pass (used by tests and by a cron on the host if a
second process is not available).

### Tests

- A request 6 minutes in `AwaitingDecision` → `Escalated`; one at 4 minutes → unchanged.
- Officer can still decide after escalation.
- Running twice does not double-escalate.

---

## Piece 8 — SMS (Africa's Talking)

*Add-on. Cut rule at Wed 04:00: if not working, keep auto-hold only.*

### Rules

- **No SMS is sent unless its template was approved.** (CLAUDE.md)
- SMS text never contains patient details — only request number, component,
  units, site names, ETA and status.
- A failed SMS never blocks the workflow; it is logged and the flow continues.

### Models

`SmsTemplate`: `code` (unique), `body` (with `{placeholders}`), `approved`
(bool), `approved_by`, `approved_at`. Editable in admin; approving is a separate
admin action that records who approved.

`SmsMessage` (log): `to`, `template`, `body`, `request`, `status`
(`sent`, `failed`, `blocked_unapproved`), `provider_message_id`, `error`, `created_at`.

### Templates to seed (unapproved until someone approves them)

| Code | To | Example |
|---|---|---|
| `decision_needed` | Blood bank officer | `GH-12: 2 RBC needed at HSP-002. Top site HSP-001, ETA 45-53 min. Reply 1 to accept.` |
| `escalated` | Backup officer | `GH-12 not answered in 5 min. Please decide now.` |
| `moh_notified` | MoH officer | `GH-12 proceeding under standing authorisation from HSP-001. Reply STOP 12 to stop.` |
| `authorisation_needed` | MoH officer | `GH-12 needs your approval before dispatch.` |
| `release_needed` | Supplying lab officer | `GH-12: release 2 RBC to HSP-002.` |
| `dispatched` | Requesting clinician | `GH-12: blood left HSP-001, ETA 45-53 min.` |
| `received` | Officer | `GH-12 received at HSP-002.` |

### Sending

`notify(code, request, recipients)` in `emergency/sms.py`. Hooked into the
transitions in pieces 2–7. Uses the `africastalking` Python package (pin the
version) with a 5-second timeout.

Environment: `AT_USERNAME` (`sandbox`), `AT_API_KEY`, `AT_SENDER_ID`,
`SMS_ENABLED` (default `0` — locally, messages are only logged).

Phone numbers come from `StaffProfile.phone`. Demo users get synthetic sandbox numbers.

### "Reply 1 to accept" (stretch)

`POST /sms/inbound/<secret>` — Africa's Talking callback. The secret in the path
comes from `AT_INBOUND_SECRET`; a wrong secret → `404`. Match the sender's phone
to a blood bank officer, find their oldest request in `AwaitingDecision`, and
call the same accept logic as piece 2, with `actor` = that officer and audit
`via = sms`. Anything else replies with a help text.

Rate-limit both SMS endpoints (CLAUDE.md security list), e.g. `30/min`.

### Tests

- Unapproved template → nothing sent, `blocked_unapproved` logged.
- Approved template → provider called once (mocked), `sent` logged.
- Provider error → `failed` logged, workflow continues.
- No patient field appears in any rendered template.
- Inbound "1" from the officer's phone accepts their pending request; from an unknown phone does nothing.

---

## Piece 9 — Readiness

*Add-on. Cut rule at Wed 06:00.*

### `GET /readiness`

**Roles:** `blood_bank_officer`, `moh_officer`.

Grid of **hospital × blood group** for red cells. Each cell is the fastest
predicted arrival of a safe, compatible unit from another site, compared with the
`life_threatening` target (60 min):

| Colour | Rule |
|---|---|
| green | fastest arrival ≤ target |
| amber | ≤ 2 × target |
| red | > 2 × target, or no safe compatible stock |

Thresholds go in `config/kenya.yaml` (`readiness_amber_factor: 2`).

```json
{"data_as_of": "2026-10-31", "target_min": 60, "method": "model",
 "cells": [{"facility_id": "HSP-002", "blood_group": "O-", "colour": "amber",
            "fastest_eta_mid_min": 95.0, "from_facility_id": "HSP-001"}]}
```

### Speed

47 sites × 46 routes × ~30 ms per prediction is ~65 s, too slow per call. Cache it:

- `python manage.py build_readiness` computes an ETA matrix for every route
  (model, or route table if offline) and stores it in a `RouteEta` table.
- `GET /readiness` combines that matrix with current safe stock (minus active
  holds) — a fast query.
- Re-run the command when the model changes.

### Tests

- A hospital with a safe unit 30 min away is green for that group.
- Units held for other requests are not counted.
- Works from the route table when the model is offline.

---

## Piece 10 — Voice request (optional)

*Pitch-only if time is short. Live call bridging is pitch-only regardless.*

1. `POST /requests/draft-from-call` (clinician or officer): upload a recording of a **synthetic** call.
2. Transcribe it (provider chosen at build time; fallback: officer types the transcript).
3. Extract fields with fixed rules (blood group, component, units, urgency words). Each field keeps the **source words** it came from.
4. Save the request as `DraftFromCall`. **No matching yet.**
5. `POST /requests/{id}/confirm-draft`: the officer confirms or corrects every field → `Raised` → matching and auto-hold as in `POST /requests`.

Needs `create_request()` split into "create" and "match and hold", so both entry points share the matching code.

---

## Piece 11 — FHIR export (optional)

`GET /fhir/ServiceRequest/{id}` — the request as an HL7 FHIR R4 `ServiceRequest`
JSON (status, intent `order`, priority from urgency, code for the component,
quantity, requester facility). No patient identifiers. No FHIR server. Daniel's
FHIR mapping in `docs/` is the source for field names.

---

## Piece 12 — Security hardening

From the CLAUDE.md security list. Already done: token login per user, role check
on every endpoint, input validation, login rate limit, secrets in environment
variables, audit of logins and failed access.

Still to do:

| Item | How |
|---|---|
| CORS for the deployed frontend | `django-cors-headers`; allowed origins from `CORS_ALLOWED_ORIGINS` env |
| Rate limit SMS endpoints | DRF scoped throttle (piece 8) |
| HTTPS on the live link | Host provides TLS; `DJANGO_DEBUG=0` turns on redirect, HSTS, secure cookies (already in settings) |
| Deploy checks | `python manage.py check --deploy` passes with no warnings |
| Token expiry | Optional: expire tokens after 12 h |
| Bandit findings | Daniel runs Bandit Wed morning; fix anything high or medium |
| OWASP ZAP findings | Daniel runs ZAP against the live link; fix anything high or medium |
| No secrets in git | Search the repo for keys before the final push |

---

## Piece 13 — Deployment

*Cut rule at Wed 08:00: if not live, demo from a local run and say so in the README.*

Host: Render or Railway (free tier). Daniel owns deployment; backend provides:

- `gunicorn` and `whitenoise` added to `requirements.txt` (admin static files).
- A start command: `gunicorn goldenhour.wsgi --workers 1 --timeout 60`.
  **One worker**: each worker loads the ETA model into memory.
- A build step:
  ```bash
  pip install -r backend/requirements.txt
  python backend/scripts/build_starter_db.py
  python backend/manage.py collectstatic --noinput
  python backend/manage.py migrate
  python backend/manage.py seed_demo_users
  ```
- Environment: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, `DJANGO_ALLOWED_HOSTS`,
  `CORS_ALLOWED_ORIGINS`, and the SMS variables if used.
- Escalation (piece 7): a second process running `run_escalations --loop`, or
  a cron calling `run_escalations --once` every minute.

**Risks to check early:**
- **Memory.** Free tiers often give 512 MB. Measure the backend's memory with the
  model loaded before relying on the free tier. If it does not fit, run with
  `WARM_ML_MODEL=0` and show the fallback (route table) — the workflow still works.
- **SQLite on the host is reset on redeploy** unless a persistent disk is attached.
  Fine for the demo; PostgreSQL stays the production target in the architecture diagram.

---

## Piece 14 — Demo support

For the 3-minute video and the judges.

- `python manage.py seed_demo_scenario`: creates a few requests at different
  stages (one awaiting decision, one awaiting MoH, one in transit, one received
  with a full audit trail, one unknown-group O− case) so every screen has data.
- `python manage.py reset_demo`: deletes app data (requests, holds, dispatches,
  SMS log, audit events) and re-seeds. Runs only when `DJANGO_DEBUG=1` or with
  `--yes-really`.
- Update `backend/README.md` with every new endpoint.
- Update `.agents/state.md` at the end of each session.
- List AI tools used in the main README (CLAUDE.md working rule).

---

## Final API table

| Method | Endpoint | Caller | Piece | Status |
|---|---|---|---|---|
| POST | `/auth/login` | anyone | — | ✅ built |
| POST | `/requests` | clinician | — | ✅ built |
| GET | `/requests/{id}/options` | blood bank officer | — | ✅ built |
| GET | `/requests` | clinician (own), officer, MoH | 1 | new |
| GET | `/requests/{id}` | clinician (own), officer, MoH | 1 | new |
| GET | `/dispatches`, `/dispatches/{id}` | lab (from own), clinician (to own) | 1 | new |
| POST | `/requests/{id}/decision` | blood bank officer | 2 | to build |
| POST | `/requests/{id}/authorise` | MoH officer | 3 | to build |
| POST | `/dispatches/{id}/release` | lab officer (supplying site) | 4 | to build |
| POST | `/dispatches/{id}/status` | lab (in transit), clinician (received) | 5 | to build |
| GET | `/audit?request_id=` | officer, MoH | 6 | to build |
| POST | `/sms/inbound/<secret>` | Africa's Talking | 8 | add-on |
| GET | `/readiness` | officer, MoH | 9 | add-on |
| POST | `/requests/draft-from-call`, `/requests/{id}/confirm-draft` | clinician, officer | 10 | optional |
| GET | `/fhir/ServiceRequest/{id}` | officer, MoH | 11 | optional |

---

## Final status lifecycle

```
DraftFromCall ──confirm──▶ Raised ──▶ Matching ──▶ UnitsHeld ──▶ AwaitingDecision
                                         │                          │   │
                                         │ no stock                 │   └─5 min──▶ Escalated ─┐
                                         ▼                          │                         │
                                   HandledManually ◀──reject────────┤◀────────────────────────┘
                                         ▲                          │ accept / change
                                         │                          ▼
                                         │      standing + life-threatening?
                                         │          yes │              │ no
                                         │              │              ▼
                                         │◀─reject──────┼──── AwaitingAuthorisation
                                         │              │              │ approve
                                         │              ▼              ▼
                                         │◀─MoH stop── SentToSupplier ◀┘
                                         │              │      │
                                         │  last site   │      └─lab declines─▶ UnitsHeld (next site)
                                         │◀─declined────┘                        ──▶ AwaitingDecision
                                                        │ lab confirms
                                                        ▼
                                                   Dispatched ──▶ InTransit ──▶ Received
```

`ALLOWED_TRANSITIONS` in `emergency/services.py` already contains every arrow
above. Every move writes an audit event.

---

## Open questions

Decide these with the team; the spec above uses the answer in **bold**.

1. Can any blood bank officer decide any request, or only officers at the region's centre? **Any officer** (simpler for the demo).
2. Who marks `in_transit` — the supplying lab or the driver? **Supplying lab officer** (no driver role).
3. After a lab declines, does the next site need MoH approval again? **Yes — the officer decides again, then the tier applies again.**
4. Should a cool box above 10 °C on arrival block `Received`? **No — record it, warn, and tell the lab to quarantine.**
5. Does the MoH officer need a phone number in the demo data for SMS? **Yes**, synthetic sandbox numbers for all demo users.
