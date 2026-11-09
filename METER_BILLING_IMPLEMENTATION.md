# RoomRent monthly electricity billing implementation

Date: 9 November 2026 (Asia/Kolkata).

## Result and current operating mode

The existing meter/invoice implementation has been extended, not replaced with another application or a second production billing engine. The normal website remains in **mock/browser mode**, as requested. `frontend/.env.local` was not switched to live mode.

The secure meter section is integrated into the existing live owner invoice screen. In browser mode it explains that MongoDB billing and permanent photo uploads require a live invoice, and preserves the former browser-only calculator inside an explicitly labeled disclosure. Browser invoice IDs are never passed off as real MongoDB records.

The live feature was exercised separately against a disposable MongoDB replica set, an S3-compatible local test double that stored actual bytes, and an isolated live frontend on port 3100. The configured RoomRent database was not used for destructive tests. No real S3 bucket credentials were provisioned.

## Audit of the existing implementation

| Concern | Existing source | Audit finding / reuse |
| --- | --- | --- |
| Owner electricity form | `frontend/features/finance/ui.tsx` | Manual previous/current/rate inputs, one browser meter charge per invoice. Preserved as the labeled browser calculator; the secure live section is new UI within the existing invoice workspace. |
| Live invoice UI | `frontend/features/live/live-workspace.tsx` | Existing invoice list, generation, balance and PDF actions retained; added an electricity selector and inline meter section. |
| Meter model/routes | `backend/src/models/index.js`, `backend/src/modules/finance/routes.js` | Existing `MeterReading` used room/month/current/previous/rate/amount with a room/month unique index. Extended that collection and moved its routes into the scoped meter router. |
| Monthly billing | `backend/src/modules/finance/routes.js`, `backend/src/modules/jobs/service.js` | Both API and worker generation now use shared original-invoice item rules. Unfinalized readings cannot be pulled into original invoices. |
| Invoice revisions | `InvoiceRevision`, existing financial routes | Reused immutable revision rows; added meter detail snapshots and electricity amendments. |
| Ledger / verified collections | `LedgerEntry`, `PaymentAllocation`, `backend/src/core/finance-rules.js` | Reused existing charge/adjustment/allocation accounting, financial locks, amount rules and invoice balances. |
| Tenant allocation | `Tenancy`, `Tenant`, organization memberships | Readings retain historical tenant/tenancy IDs and require a valid billing interval; no invented proration. |
| Private files | `FileAsset`, `backend/src/core/private-storage.js`, file download router | Existing files stored actual bytes locally. Added S3-compatible storage to the same abstraction. Meter uploads require the durable path and never fall back to local disk. |
| PDFs | `InvoicePdf`, `backend/src/modules/pdfs/routes.js` | Existing archived revision downloads retained; meter breakdown and an authorized detailed-photo download added. |
| Auth | `backend/src/core/auth.js`, `Membership`, `AuthSession` | Existing bearer/session/membership checks reused. Frontend binary downloads reuse access-token refresh. |
| Notifications | `Notification`, existing notifications API | Electricity updates are written transactionally for staff and the linked tenant; the live bell reads them and opens the invoice. Browser notifications remain separate. |

## Data model and lifecycle

`MeterReading` is still the monthly reading collection. `Meter` is the only new domain collection: it represents a physical room meter and its explicitly audited opening/handover baselines, not another billing engine.

- `Meter`: organization, property, floor, room, label, opening cumulative value/date/reason/actor, active flag, transaction serialization counter and audited handover boundaries.
- `MeterReading`: original fields retained; added meter, floor, tenant, tenancy, month/year, consumed units, reading date, interval start, durable photo ID, invoice link, status, draft version, reading revision, invoice revision, finalization actors and correction snapshots.
- Canonical stored values remain `previous`, `current`, `ratePaise`, `amountPaise`; API aliases expose `previousReading`, `currentReading`, `ratePerUnitPaise`, `electricityAmountPaise` without duplicate monetary state.
- One active meter per organization/room; unique organization/room/month plus organization/meter/month indexes prevent multiple monthly records. Repeated draft saves edit the existing draft. Finalization is naturally idempotent by reading ID.
- `InvoiceRevision.meterDetails` captures the reading and photo reference as it existed at that invoice revision. Current corrections cannot rewrite those snapshots.

States:

1. Owner explicitly records an opening baseline and a verification reason. An audit log is created; zero is never silently assumed.
2. Save Draft persists the monthly inputs and optional uploaded photo, but posts no financial charge.
3. Finalize recalculates the authoritative preceding reading, verifies allocation/evidence, adds one electricity ledger charge and creates a new immutable invoice revision.
4. Owner correction preserves the former reading/photo/rate snapshot, posts only the amount delta, and creates another immutable invoice revision. Managers can record/finalize drafts, but cannot correct finalized financial records.

## Calculation and previous-reading behavior

- The server selects the latest preceding **finalized or corrected** month for the same meter. Drafts are excluded.
- If none exists, the verified initial baseline is used. A later audited move-in handover baseline can establish a new tenant's consumption boundary.
- Previous reading is read-only in the live UI, recalculated again on finalization, and cannot be overridden through the compatibility endpoint.
- Default rate: 1000 paise / unit, i.e. INR 10.
- Readings support up to three decimal places (integer milliunits internally). Rates and charges are integer paise. Multiplication uses integer arithmetic, with half-paise rounded once to the nearest paise, half-up. The display-only frontend preview uses the same rounding contract.
- `1380 - 1250 = 130 units`; `130 × 1000 = 130000 paise = INR 1300`.
- Finalized November current reading becomes the December preceding value automatically.
- Negative/non-finite inputs, decreasing counters, invalid dates, dates outside the billing month and future reading dates are rejected. Money totals are checked for safe integers.

## Financial integration and concurrency

`backend/src/core/invoice-accounting.js` extracts the existing transaction, invoice lock, balance and revision helpers for reuse by normal finance routes, the meter module and scheduled invoice generation. `finance-rules.js` remains the authoritative meter amount calculator.

Finalization runs in a MongoDB transaction on a replica set. The meter serialization counter and invoice financial-version write serialize competing requests. A unique ledger source (`meter:<readingId>:v<revision>`) and reading-period indexes provide additional duplicate protection. Concurrent finalization was tested: two successful/idempotent responses created exactly one electricity charge.

Original invoice items are not overwritten, including when a payment has already been verified. Electricity is an itemized ledger amendment included in current balances, reconciliation and invoice revision snapshots. Corrections create debit/credit deltas rather than replacing prior financial entries. The worker also ignores drafts and uses the same original-item/revision rules.

## Tenant turnover and intentionally undefined rules

Electricity history belongs to the room/meter and retains the billed tenant/tenancy after move-out. A single reading interval must belong to the selected invoice tenancy. An opening/previous reading is the boundary at the beginning of the consumption interval; an immediately following move-in day is accepted, while gaps or mid-interval tenant changes are rejected.

No rent/electricity proration formula was added. The existing rent engine still bills according to its existing monthly overlap rules. For a tenant change, the owner can record an audited cumulative **handover reading on the tenancy's move-in date**. Earlier usage is excluded from the new tenant's bill explicitly. Without that evidence, the system blocks billing rather than charging a new tenant for prior usage.

Safety boundaries:

- Rollover/reset/replacement of a decreasing meter is not automatically supported; it is rejected instead of silently reset.
- A correction to an earlier period is blocked if later finalized readings depend on it. Automatic cascading rebills are not introduced.
- A reduction that would put an invoice below already verified allocations is blocked. An approved refund/credit process is required; this change does not invent one.
- The schema retains one monthly record per room/meter. Multiple intra-month allocations are not silently synthesized.

## Durable photo handling

- Accepted: JPEG, PNG, WebP; default maximum 5 MiB, configurable with `METER_PHOTO_MAX_BYTES` (up to 20 MiB).
- Backend checks MIME, magic bytes and actual image decoding; corrupt, oversized and multi-frame images are rejected. Pixel count is bounded.
- Actual bytes are uploaded to a random private S3 object key via the existing storage abstraction. Public folders, public URLs, base64 in MongoDB and Render's ephemeral disk are not used for meter photos.
- `FileAsset` retains filename, MIME, size, SHA-256, uploader, timestamp and reading linkage. The UI can replace an unsaved selection, preview it, view current/previous/historical authorized photos and download them.
- Draft/pending-correction assets are not exposed to tenants. Finalized photo access requires the same organization and the billed tenant, including preserved historical references.
- A failed upload/configuration returns an error, not a success message or local-storage fallback. A failed database attachment attempts object cleanup.
- Existing legacy local file keys remain readable. When S3 is configured, other private-file writes can use the same provider.

Required deployment configuration (see `backend/.env.example`):

```dotenv
PRIVATE_STORAGE_DRIVER=s3
S3_BUCKET=<private-bucket>
S3_REGION=<region>
S3_ENDPOINT=<optional HTTPS S3-compatible endpoint>
S3_ACCESS_KEY_ID=<optional if using IAM/runtime credentials>
S3_SECRET_ACCESS_KEY=<optional if using IAM/runtime credentials>
S3_FORCE_PATH_STYLE=true
S3_SERVER_SIDE_ENCRYPTION=AES256
METER_PHOTO_MAX_BYTES=5242880
```

Use a private bucket policy, durable provider, backups/retention appropriate to historical invoices, and least-privilege object credentials. These infrastructure settings are not provisioned by the code change. The local S3 test double verifies application behavior; it is not evidence that a real deployment bucket has been configured.

## UI and PDF changes

- Only the electricity area was upgraded within the existing invoice workspace; sidebar and existing invoice/payment/deposit features remain.
- Meter/room information, billing month, automatic previous value/date, current value, default rate and exact live preview.
- React Hook Form + Zod validation; backend-confirmed draft/finalize/correction messages; accessible Radix confirmation dialog.
- Private photo comparison, uploader/time, history filters (property/room/month/year), invoice links, preserved correction trail and detailed monthly PDF download.
- Tenants can view their own finalized electricity history from live invoices. Owners can open the meter area from live invoice actions and live notifications.
- Standard archived PDFs remain one file per immutable revision. A separate authenticated detailed PDF download includes the reference thumbnail from that selected revision, without replacing an archive.

The S3 adapter follows [AWS SDK v3 object operations](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html). PDF visual QA uses [PDF.js rendering](https://mozilla.github.io/pdf.js/examples/) because Python/Poppler were unavailable on this Windows host.

## Operation and migration notes

- MongoDB replica-set transactions are required for finalization/corrections. The application does not silently fall back to nontransactional financial writes.
- New indexes are additive; no live database/collection was dropped or reset.
- Old readings lacking a meter ID remain owner-visible as legacy records. They are not silently assigned a tenant or promoted to finalized evidence.
- Existing unallocated legacy readings are included in original invoice generation only when one tenancy covers that billing month's room allocation; ambiguous turnover is blocked for explicit review.
- History endpoints return up to 500 records; property, room, month and year filters narrow the query. Historical records are not deleted by move-out.
- No email, WhatsApp message, real payment or real tenant document was sent during QA. Downloaded PDFs remain standard PDF attachments for existing sharing workflows.
- Existing dependency advisories were not addressed through unrelated framework upgrades or `npm audit fix --force`.

## Changed areas and reproducible checks

New backend files: meter service/router, room-history router, meter rules, shared invoice accounting, PDF renderer and disposable integration harness.

New frontend files: `features/meters/{api,preview,history,electricity-section}`, live notification bell and reproducible meter E2E/PDF QA scripts.

Run:

```text
backend:  npm run test:meters
backend:  npm run test:all:disposable
frontend: npm test -- --pool=forks --maxWorkers=1 --minWorkers=1
frontend: npm run lint:all
frontend: npm run typecheck
frontend: npm run test:meters:e2e
frontend: npm run test:meters:pdf
frontend: npm run build
```

`test:all:disposable` always starts a disposable local MongoDB replica set and dedicated test databases. Initial execution may download a MongoDB binary; an installed/cached binary can be supplied through the MongoMemoryServer environment configuration. The E2E script launches and cleans up only its own live test frontend; the normal mock server is not switched.
