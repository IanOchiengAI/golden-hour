# Security and data protection

Golden Hour is a hackathon prototype that runs on synthetic data. This page says what the code does today and what a real pilot would need. It makes no compliance claim. The design is KDPA-aware: it limits who sees what, keeps a record of every action, and treats health data with care. The Kenya Data Protection Act is the outline for the pilot list below. The source of the audit, approver and data-protection notes is the Tuesday 15:00 blood-service Q&A.

## What exists today

| Area | What the code does | Limit |
|---|---|---|
| Data | Synthetic starter dataset only. No real donor, patient or facility records. | None needed for the demo. |
| Access | Token login for every user. Deny-by-default roles (clinician, blood bank officer, MoH officer, supplying lab). Clinicians see only their own hospital's requests. A lab sees only dispatches from its own site. | Roles are fixed in code. |
| Supplier privacy | The lab view uses a fixed list of fields. It never includes the patient's blood group or clinical note. A test covers this. | |
| Tokens | A token expires after 12 hours. | No refresh flow. |
| Rate limits | Login: 10 a minute. Raising requests: 10 a minute. Open requests: at most 10 per facility. | |
| Holds | A hold that waits more than 30 minutes for a decision or approval is released and the request goes to phone handling. This stops one account from locking scarce units. | The check runs when the next request, decision or approval arrives, or when `manage.py expire_holds` runs. |
| Idempotency | `POST /requests` accepts a `client_request_id`. A repeat returns the first request. | |
| Validation | Inputs are validated on the endpoints. Wrong-status actions return 409 with a plain message. | |
| Audit | Every step writes an event: who, role, action, before, after, reason, time. Logins, failed logins and refused calls are audited. The log is append-only in the application code. | An administrator with database access could still change it. It is not tamper-proof. |
| Secrets | Secret key, allowed hosts and database paths come from environment variables. The server refuses to start with `DJANGO_DEBUG=0` and no `DJANGO_SECRET_KEY`. | |
| Transport | HTTPS settings turn on when `DJANGO_DEBUG=0`. | No live HTTPS link exists, because nothing is deployed. |
| Scans | Bandit run on 11 Nov on `backend/` and `ml/`: no High issues; none in backend application code (2 Low are test passwords in test files); in `ml/` the model is read with `pickle` from a repository file (1 Medium, 2 Low). | OWASP ZAP has not been run. A pilot would checksum the model file before loading it. |
| Tests | 110 backend tests, including role checks and supplier-safe fields. A 25-check end-to-end script. | |

## What is not built (pilot pathway)

Each item below needs an owner and a date before a real pilot.

1. **Data protection impact assessment.** Health data, an AI model and large scale together make one necessary.
2. **Registration** with the Office of the Data Protection Commissioner.
3. **Processor agreements** with the hosting and SMS providers.
4. **Privacy notice and consent log.**
5. **Incident response plan.** Check the legal reporting windows against the Act and write them in. We give no figures here.
6. **Hosting and cross-border map.** Where each piece of data is stored, and whether any of it leaves the country.
7. **Encryption at rest.**
8. **Rights-request workflow.** A "My data" screen for access and correction requests.
9. **Bias testing.** Check the ranking across blood groups and counties.
10. **PostgreSQL** in place of SQLite.
11. **SMS template approval.** No SMS is sent today. A message would go out only from an approved template.
12. **Tamper-evident audit log.** Hash-chained entries or write-once storage.

## Reporting a problem

This is a prototype. Report issues to the team through the GitHub repository.
