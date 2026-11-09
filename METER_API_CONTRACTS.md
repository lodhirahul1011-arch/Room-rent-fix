# RoomRent meter API contracts

Base: existing Express `/api`. Authentication: existing `Authorization: Bearer <access-token>` with active session and organization membership. Object IDs are 24 hexadecimal characters. JSON successes use `{ "data": ... }`; failures use the existing `{ "error": { "code": ..., "message": ... } }` envelope without stack traces.

## Access

| Operation | Owner | Manager | Tenant |
| --- | --- | --- | --- |
| Meter list/config and previous reading | Own organization | Own organization | Not allowed |
| Create opening baseline / handover baseline | Own organization | Not allowed | Not allowed |
| Save/edit draft, upload photo, finalize | Own organization | Own organization | Not allowed |
| Correct a finalized reading | Own organization | Not allowed | Not allowed |
| Reading/photo/PDF history | Own organization | Own organization | Own billed tenant records only, finalized/corrected |

An unscoped admin does not acquire organization access just by being an admin. Cross-organization and cross-tenant file/record requests fail closed. Tenant photo access is preserved for authorized historical records after move-out.

## Configuration and physical meter

`GET /api/meters/config`

```json
{"data":{"durableStorageConfigured":true,"photoMaxBytes":5242880,"defaultRatePaise":1000}}
```

This confirms configuration presence, not an external storage health guarantee. Every upload still awaits provider success.

`GET /api/meters?propertyId=<id>&roomId=<id>` returns organization meters with room/property/floor display labels.

`POST /api/meters` (owner only):

```json
{
  "roomId":"<roomId>",
  "label":"Room 101 electricity meter",
  "baselineReading":1250,
  "baselineDate":"2026-11-01",
  "baselineReason":"Verified physical display at move-in"
}
```

The room must belong to the organization. A room may have only one active meter. This creates an audit record. Opening values cannot rewind existing recorded cumulative values.

`POST /api/meters/:meterId/handover` (owner only):

```json
{
  "tenancyId":"<newTenancyId>",
  "reading":1300,
  "date":"2026-11-05",
  "reason":"Signed physical cumulative reading on tenant move-in"
}
```

The date must match that tenancy's move-in date. It cannot rewind the meter or change the baseline of an already billed tenancy. This establishes an explicit boundary, not an automatic proration rule.

## Automatic previous reading

`GET /api/meters/:meterId/previous-reading?month=2026-11&invoiceId=<invoiceId>`

```json
{
  "data":{
    "previousReading":1250,
    "previousReadingDate":"2026-10-31",
    "previousReadingId":"<octoberReadingId>",
    "previousPhotoFileId":"<octoberPhotoFileId>",
    "baselineUsed":false,
    "defaultRatePaise":1000
  }
}
```

Only prior finalized/corrected records are considered. Otherwise an explicitly audited opening/handover boundary is used. `invoiceId` verifies the room/month/tenancy context; it can be omitted for a read-only chain lookup.

## Draft readings

`POST /api/meters/:meterId/readings`:

```json
{
  "month":"2026-11",
  "current":1380,
  "ratePaise":1000,
  "readingDate":"2026-11-09",
  "relatedInvoiceId":"<invoiceId>"
}
```

`ratePaise` defaults to 1000 when omitted. The invoice must already exist for the same room and month. The backend determines organization/property/floor/tenant/tenancy and the previous value; clients cannot mass-assign them. No financial charge is posted by Save Draft.

`PATCH /api/meters/readings/:readingId` for a draft accepts the same fields plus `expectedVersion` (the draft's `draftVersion`). The meter and month cannot change. When a version is supplied and stale, the request returns 409.

`POST /api/meters/readings` is a compatibility alias that adds `roomId` to the draft payload and resolves that room's active meter. An explicit baseline and linked invoice are now required. If legacy `previous` is supplied it must equal the server-derived value; it is never trusted as a new baseline.

Reading values allow three decimal places; rates/charges are nonnegative safe integer paise. Reading dates must be valid, inside the billing month, not before the preceding boundary and not in the future. Decreasing cumulative readings return a conflict rather than silently resetting.

## Monthly photos

`POST /api/meters/readings/:readingId/photo`: authenticated multipart form with exactly one field `file`. JPEG, PNG or WebP; maximum defaults to 5 MiB. MIME, signature and full pixel decoding are validated.

```json
{
  "data":{
    "fileId":"<privateFileAssetId>",
    "name":"meter-photo.jpg",
    "mime":"image/jpeg",
    "size":102400,
    "uploadedAt":"<timestamp>",
    "uploadedBy":"<actorId>",
    "pendingCorrection":false
  }
}
```

Actual bytes must have been written to permanent private object storage before success is returned. Without configured durable storage the response is 503; oversized uploads return 413, invalid content 400.

- Draft upload attaches the photo and increments the draft version.
- Upload against a finalized record prepares a pending correction photo. It does not overwrite the current evidence or grant tenant access until an authorized correction links it.
- Earlier referenced assets are retained for audit/revision access.

`GET /api/meters/readings/:readingId/photo` streams the authorized current image inline.

Options:

- `fileId=<historicalPhotoId>` selects an authorized preserved photo belonging to that reading.
- `download=1` returns an attachment with a Unicode-safe filename.
- `metadata=1` returns file ID/name/MIME/size/uploader name and ID/upload timestamp instead of bytes.

Photo requests return `private, no-store` cache headers and `nosniff`. URLs never expose a public bucket or object key. The existing `/api/files/:fileId/download` also applies meter-evidence authorization.

## Finalization and idempotency

`POST /api/meters/readings/:readingId/finalize`, JSON `{}`.

The server transaction locks the meter and invoice, recalculates the preceding value, checks tenancy/date allocation and durable photo evidence, changes the reading state, writes the electricity charge, snapshots the invoice revision and creates scoped notifications.

```json
{
  "data":{
    "reading":{"status":"finalized","consumedUnits":130,"amountPaise":130000},
    "invoiceRevision":2,
    "balance":{"totalPaise":630000,"paidPaise":100000,"balancePaise":530000}
  }
}
```

A repeated already-finalized request is a successful idempotent read (`alreadyFinalized: true`) and creates no second charge. Unique period indexes and ledger source IDs protect against duplicates; transactions are mandatory. Backdated finalization is blocked when later finalized values depend on the earlier period.

## Audited correction

`PATCH /api/meters/readings/:readingId` for a finalized/corrected record (owner only):

```json
{
  "current":1390,
  "ratePaise":1000,
  "readingDate":"2026-11-09",
  "reason":"Verified the final digit against the reference photo",
  "expectedRevision":1,
  "meterPhotoFileId":"<optionalNewCorrectionPhotoId>"
}
```

- Requires an audit reason of at least 8 characters and the current reading revision.
- Preserves the former cumulative readings, rate, photo, actor/time and invoice revision in correction history.
- Posts only the difference as an electricity adjustment and creates a new immutable invoice revision.
- Returns 409 for a stale reading revision, a dependency on a later finalized month, a decreasing cumulative counter, or a reduction below already verified allocations.
- Does not invent refunds, cascade historical rebills, or overwrite paid/original invoice snapshots.

## History and details

`GET /api/meters/readings?propertyId=&roomId=&month=YYYY-MM&year=YYYY`

`GET /api/meters/:meterId/readings`

`GET /api/rooms/:roomId/electricity-history`

`GET /api/meters/readings/:readingId`

History returns up to 500 authorized records, newest month first. The filtered main history response includes property/room/tenant display names. Tenant queries automatically restrict to that billed tenant and finalized/corrected states. Move-out does not delete or reassign records.

Stored/canonical fields: `organizationId`, `propertyId`, `floorId`, `roomId`, `meterId`, `tenancyId`, `tenantId`, `month`, `billingMonth`, `billingYear`, `previous`, `current`, `consumedUnits`, `ratePaise`, `amountPaise`, `meterPhotoFileId`, `readingDate`, `intervalStart`, `recordedBy`, timestamps, `status`, `relatedInvoiceId`, `draftVersion`, `revision`, `invoiceRevision`, correction snapshots. Readable API aliases expose the longer reading/rate/amount field names without duplicating stored values.

## Invoice/PDF/notification integration

Existing routes remain authoritative:

- `GET /api/invoices/:invoiceId/balance`
- `GET /api/invoices/:invoiceId/revisions`
- `POST /api/invoices/:invoiceId/pdf?revision=N` archives/reuses that immutable revision.
- `GET /api/invoices/:invoiceId/pdfs`

New authenticated download:

`GET /api/invoices/:invoiceId/pdf-preview?revision=N&detailed=1`

Returns a standard PDF attachment from the selected immutable revision. Electricity breakdowns always come from the revision's stored meter snapshot; detailed mode loads its authorized reference photo. Detailed downloads do not overwrite the existing archived PDF. Omit `revision` to select the latest revision, or omit `detailed=1` for the breakdown without a thumbnail.

`GET /api/notifications` and `PATCH /api/notifications/:id/read` remain the existing notification contracts. Electricity notifications add the linked invoice/reading IDs; the live bell opens the owner's electricity invoice section or the tenant invoice/history section.

## Error summary

| Status | Meaning |
| --- | --- |
| 400 | Invalid ID/body/date/number/MIME/signature/corrupt image |
| 401 | Missing/expired/revoked authentication |
| 403 | Role or organization membership not permitted |
| 404 | Record/file unavailable to this actor, including cross-tenant photos |
| 409 | Stale draft/revision, duplicate/conflicting period, invalid cumulative chain, allocation/refund conflict |
| 413 | Upload exceeds configured photo limit |
| 503 | Durable storage missing or unavailable; no successful upload/finalization is claimed |

No endpoint accepts a browser-only UUID as a MongoDB object ID or silently creates fake success records.
