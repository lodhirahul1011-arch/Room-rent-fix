# Meter billing QA report

Date: 9 November 2026 (Asia/Kolkata). Current app mode retained: **mock**.

## Verification summary

| Check | Result |
| --- | --- |
| Backend full suite with genuine disposable replica-set integration | **102 passed, 0 failed, 0 skipped** |
| Frontend Vitest regression suite, including exact meter preview rounding | **78 passed** |
| TypeScript | Passed with no errors |
| ESLint over app/components/features/services | Passed with no warnings or errors |
| Full Next.js production build | Passed; all 44 static pages generated, no type/lint error suppression |
| Live Playwright browser workflow | Passed against the real test Express API and MongoDB transactions |
| Detailed PDF render/text/visual review | Passed; one-page test invoice with meter details and authorized reference thumbnail |
| Disposable live backend startup | Passed with real MongoDB replica set |
| Normal frontend health | HTTP 200; mock mode retained |
| Normal backend restart | Blocked: the existing `backend/.env` is empty; startup correctly reports `MONGODB_URI required` |

The full backend suite includes the previously opt-in B7 real HTTP/Socket.IO/Mongo isolation test, B8 enrollment/payment/ledger journey and master financial-concurrency journey. Those tests were pointed at dedicated disposable databases, not the configured application database.

## Test environment and boundaries

- Windows host, Node 24; project remains compatible with the existing Node-based test tools.
- MongoDB 7.0.24 disposable single-node replica set via `mongodb-memory-server`, with actual transactions and unique indexes.
- Actual HTTP requests through the existing Express auth/session/membership middleware.
- Private-object-store test double accepted real S3 SDK Put/Get/Delete requests and retained actual uploaded buffers. Production code disallows non-HTTPS custom endpoints outside explicitly local test mode.
- Isolated Next live server on port 3100 with separate `.next-meter-e2e` output and a separate temporary TS configuration; the user-facing server's mock setting was not changed.
- Production build used an isolated `.next-meter-build` directory so the active development output was not overwritten. The ordinary default `next build` contract remains supported.
- PDF.js + native canvas rendered the generated PDF because Python and Poppler were unavailable. The resulting PNG was visually inspected for clipping, overlap, legibility, arithmetic and photo placement.
- No real rent payment, support email, WhatsApp message or real tenant identity document was sent by this QA run.

## Required scenario coverage

| Requirement | Evidence |
| --- | --- |
| Explicit initial baseline and audit | Integration creates baseline 1000, verifies audit log and owner-only permission; live UI creates it through the form. |
| Prior finalized reading auto-loads | October 1250 becomes November previous value in API and read-only UI; December context becomes November final 1380 before correction. |
| Correct consumption / default rate | 1380 - 1250 = 130; at 1000 paise/unit the charge is 130000 paise. |
| Fractional meter / exact paise rounding | Milliunit arithmetic tests; frontend regression for 1.035 units at INR 1 gives 104 paise instead of a floating-point undercharge. |
| Decreasing/negative/nonfinite/unsafe readings | Unit and API conflict tests; no automatic reset. |
| Dates | Invalid calendar dates, wrong month and future reading dates rejected. |
| Duplicate period / duplicate charge | Unique indexes and repeat finalization checked; original items unchanged. |
| Concurrent finalization | Two concurrent finalize requests produce one charge and one financial amendment. |
| Drafts do not post charges | API assertions before finalization; billing worker regression also ignores an unfinalized draft. |
| Actual photo bytes | Real PNG buffer written through S3 SDK and downloaded byte-for-byte; draft photo access denied to tenant. |
| Supported formats / filename handling | JPEG/WebP full decode; spoofed content and oversized data rejected; Unicode filename download paths exercised. |
| Missing permanent storage | Upload returns 503, creates no successful photo asset; UI shows the configuration error and blocks finalization. |
| Organization/tenant isolation | Different organization owner and different tenant cannot read the record/photo or generic file download. |
| Historical photo retention | Original photo still accessible after a correction and after move-out. |
| Invoice / ledger linkage | Final electricity charge updates invoice balance, ledger and revision; partial allocation remains unchanged. |
| Immutable original/revised snapshots | Original rent snapshot remains 500000 paise; previous meter snapshot remains 1380 after correction to 1390. |
| Correction authorization and idempotency | Manager cannot correct; stale expected revision fails; one adjustment/audit entry created. |
| Historical dependency guard | Earlier-period correction blocked when later finalized readings depend on it. |
| New tenant allocation | A turnover interval is blocked until an audited move-in handover reading; only post-handover units are charged to the new tenant. |
| Refresh persistence | Draft/final/corrected records and photo downloads remain available after page refresh. |
| Detailed PDF | Valid PDF header, immutable revision selection, electricity text fields, authorized photo rendering, existing archive reuse. |
| Live UI | Baseline → current reading/photo → Save Draft → accessible finalize confirmation → history → owner correction → tenant history. |
| Notifications | Scoped database notifications created transactionally; live bell uses invoice references. |
| Responsive layout | Owner meter UI inspected on desktop and a 390px viewport; no document horizontal overflow. |

## Commands

From `backend`:

```text
npm run test:meters
npm run test:all:disposable
node --check src/modules/meters/service.js
node --check src/modules/meters/routes.js
node --check src/modules/jobs/service.js
```

From `frontend`:

```text
npm test -- --pool=forks --maxWorkers=1 --minWorkers=1
npm run lint:all
npx tsc --noEmit --incremental false
npm run test:meters:e2e
npm run test:meters:pdf
npm run build
```

QA screenshots/PDF/text output are under `frontend/test-results/meters/` and are test artifacts rather than real tenant records. `tests/meter-live-e2e.cjs`, `tests/render-meter-pdf.cjs` and `backend/tests/run-all-disposable.cjs` reproduce the workflow.

## Deployment/configuration work deliberately not claimed as completed

1. A real permanent private S3-compatible bucket and its IAM/runtime credentials still need to be configured for a real deployment. No bucket, object ACL or backup policy was provisioned. Unconfigured meter uploads/finalization fail closed.
2. The user's website remains in mock mode by explicit request. The secure live module does not claim MongoDB persistence for browser-only invoice IDs. Real operation requires live owner/tenant login and real invoice IDs.
3. Automatic proration, meter rollover/replacement, cascading rebills of dependent finalized months, and refunds below already verified allocations are not invented. Conflicting operations are blocked with an actionable error; audited handover boundaries are supported.
4. Existing framework/dependency security advisories were not silently “fixed” through unrelated breaking upgrades. A production deployment still needs its normal dependency/environment review.

There are no skipped meter tests concealed as passing integration coverage, and build/lint failures were not suppressed.

## Local startup configuration finding

On the final normal-server restart, the existing backend .env file was empty. The backend therefore stops with MONGODB_URI required; its real MongoDB/JWT/support settings were not replaced with test credentials or placeholders. Restore those settings in the file to resume the normal API. The user was asked to restore them directly without posting secrets in chat. This does not affect the passing isolated live tests or the browser-mode frontend, but normal backend operation is not claimed to be running while that configuration is missing.
