const M = require("../../models");
const { fail } = require("../../core/errors");
const R = require("../../core/meter-rules");
const F = require("../../core/finance-rules");
const {
  runTx,
  balanceFor,
  lockInvoice,
  recordRevision,
  meterSnapshot,
} = require("../../core/invoice-accounting");
const storage = require("../../core/private-storage");
const fileRules = require("../../core/b5-rules");
const finalized = { $in: ["finalized", "correction"] };
function org(actor) {
  if (!actor.organizationId)
    fail(403, "Active organization membership required");
  return actor.organizationId;
}
async function audit(actor, event, id, details, session) {
  await M.AuditLog.create(
    [
      {
        organizationId: org(actor),
        actorId: actor.id,
        event,
        entityType: [
          "meter.baseline.created",
          "meter.handover.baseline",
        ].includes(event)
          ? "Meter"
          : "MeterReading",
        entityId: String(id),
        details,
      },
    ],
    { session },
  );
}
async function meterFor(actor, id, session) {
  const meter = await M.Meter.findOne({
    _id: id,
    organizationId: org(actor),
    active: true,
  }).session(session || null);
  if (!meter) fail(404, "Meter not found");
  return meter;
}
async function readingFor(actor, id, session) {
  const reading = await M.MeterReading.findOne({
    _id: id,
    organizationId: org(actor),
  }).session(session || null);
  if (!reading) fail(404, "Reading not found");
  if (
    actor.role === "tenant" &&
    (String(reading.tenantId) !== String(actor.tenantId) ||
      !["finalized", "correction"].includes(reading.status))
  )
    fail(404, "Reading not found");
  return reading;
}
async function lockMeter(meter, session) {
  await M.Meter.updateOne(
    { _id: meter.id, organizationId: meter.organizationId },
    { $inc: { sequenceVersion: 1 } },
    { session },
  );
}
async function context(actor, meter, month, session, invoiceId) {
  const { last } = F.monthBounds(month);
  if (meter.baselineDate > last)
    fail(409, "Billing period precedes the initial meter baseline");
  const previous = await M.MeterReading.findOne({
    organizationId: org(actor),
    meterId: meter.id,
    month: { $lt: month },
    status: finalized,
  })
    .sort({ month: -1 })
    .session(session || null);
  let value = previous?.current ?? meter.baselineReading,
    date = previous?.readingDate ?? meter.baselineDate;
  const boundary = (meter.handoverBaselines || [])
    .filter((b) => b.date <= last && b.date >= date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (boundary) {
    value = boundary.reading;
    date = boundary.date;
  }
  let invoice = null;
  if (invoiceId) {
    invoice = await M.Invoice.findOne({
      _id: invoiceId,
      organizationId: org(actor),
      roomId: meter.roomId,
      month,
    }).session(session || null);
    if (!invoice)
      fail(409, "Select an invoice for the same room and billing month");
    if (boundary && String(boundary.tenancyId) !== String(invoice.tenancyId))
      fail(409, "Latest handover baseline belongs to a different tenancy");
  }
  return {
    previousReading: value,
    previousReadingDate: date,
    previousPhotoFileId: previous?.meterPhotoFileId || null,
    previousReadingId: previous?.id || null,
    baselineUsed: !previous || !!boundary,
    defaultRatePaise: 1000,
    invoice,
  };
}
async function createMeter(actor, b) {
  return runTx(async (session) => {
    const room = await M.Room.findOne({
      _id: b.roomId,
      organizationId: org(actor),
    }).session(session);
    if (!room) fail(404, "Room not found");
    R.units(b.baselineReading);
    F.ensureDate(b.baselineDate);
    if (
      b.baselineDate >
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    )
      fail(400, "Baseline date cannot be in the future");
    if (
      await M.Meter.exists({
        organizationId: org(actor),
        roomId: room.id,
        active: true,
      }).session(session)
    )
      fail(409, "This room already has an active meter");
    const latest = await M.MeterReading.findOne({
      organizationId: org(actor),
      roomId: room.id,
    })
      .sort({ month: -1 })
      .session(session);
    if (latest && b.baselineReading < latest.current)
      fail(
        409,
        "Initial baseline cannot be below the last historical cumulative reading",
      );
    const [meter] = await M.Meter.create(
      [
        {
          organizationId: org(actor),
          propertyId: room.propertyId,
          floorId: room.floorId,
          roomId: room.id,
          label: b.label,
          baselineReading: b.baselineReading,
          baselineDate: b.baselineDate,
          baselineReason: b.baselineReason,
          baselineBy: actor.id,
          active: true,
        },
      ],
      { session },
    );
    await audit(
      actor,
      "meter.baseline.created",
      meter.id,
      {
        baselineReading: b.baselineReading,
        baselineDate: b.baselineDate,
        reason: b.baselineReason,
      },
      session,
    );
    return meter;
  });
}
async function handover(actor, id, b) {
  return runTx(async (session) => {
    const meter = await meterFor(actor, id, session);
    await lockMeter(meter, session);
    const tenancy = await M.Tenancy.findOne({
      _id: b.tenancyId,
      organizationId: org(actor),
      roomId: meter.roomId,
    }).session(session);
    if (!tenancy) fail(404, "Tenancy not found");
    F.ensureDate(b.date);
    R.units(b.reading);
    if (b.date !== tenancy.moveIn)
      fail(409, "Handover baseline date must equal this tenancy move-in date");
    if (
      b.date >
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    )
      fail(400, "Handover date cannot be in the future");
    const latest = await M.MeterReading.findOne({
      organizationId: org(actor),
      meterId: meter.id,
      status: finalized,
    })
      .sort({ readingDate: -1 })
      .session(session);
    const lastBoundary = (meter.handoverBaselines || []).at(-1);
    if (
      b.date < (latest?.readingDate || meter.baselineDate) ||
      b.reading < (latest?.current ?? meter.baselineReading) ||
      (lastBoundary &&
        (b.date < lastBoundary.date || b.reading < lastBoundary.reading))
    )
      fail(409, "Handover baseline cannot rewind a cumulative meter");
    if (
      await M.MeterReading.exists({
        organizationId: org(actor),
        meterId: meter.id,
        tenancyId: tenancy.id,
        status: finalized,
      }).session(session)
    )
      fail(409, "Cannot replace the baseline of an already billed tenancy");
    meter.handoverBaselines.push({
      ...b,
      recordedBy: actor.id,
      at: new Date(),
    });
    await meter.save({ session });
    await audit(actor, "meter.handover.baseline", meter.id, b, session);
    return meter;
  });
}
async function resolveInvoice(actor, meter, b, session) {
  if (!b.relatedInvoiceId)
    fail(409, "Generate/select the rent invoice before saving a meter reading");
  const invoice = await M.Invoice.findOne({
    _id: b.relatedInvoiceId,
    organizationId: org(actor),
    roomId: meter.roomId,
    month: b.month,
  }).session(session);
  if (!invoice) fail(409, "Invoice does not match the room and month");
  return invoice;
}
async function draft(actor, meterId, b, readingId) {
  return runTx(async (session) => {
    const meter = await meterFor(actor, meterId, session);
    await lockMeter(meter, session);
    const invoice = await resolveInvoice(actor, meter, b, session);
    const c = await context(actor, meter, b.month, session, invoice.id);
    R.readingDate(b.month, b.readingDate);
    if (b.readingDate < c.previousReadingDate)
      fail(409, "Reading date cannot precede the previous cumulative reading");
    const amount = R.calculate(c.previousReading, b.current, b.ratePaise);
    if (b.previous !== undefined && b.previous !== amount.previous)
      fail(
        409,
        "Previous reading is server calculated and cannot be overridden",
      );
    const tenancy = await M.Tenancy.findOne({
      _id: invoice.tenancyId,
      organizationId: org(actor),
    }).session(session);
    R.assertAllocation(
      tenancy,
      meter.roomId,
      c.previousReadingDate,
      b.readingDate,
    );
    let reading = readingId
      ? await readingFor(actor, readingId, session)
      : await M.MeterReading.findOne({
          organizationId: org(actor),
          meterId: meter.id,
          month: b.month,
        }).session(session);
    if (reading && reading.status !== "draft")
      fail(409, "Reading already finalized. Use the audited correction action");
    if (
      reading &&
      (String(reading.meterId) !== String(meter.id) ||
        reading.month !== b.month)
    )
      fail(409, "Meter and month cannot be changed");
    if (
      reading &&
      b.expectedVersion !== undefined &&
      reading.draftVersion !== b.expectedVersion
    )
      fail(409, "Draft changed in another session. Reload before saving");
    const fields = {
      organizationId: org(actor),
      meterId: meter.id,
      propertyId: meter.propertyId,
      floorId: meter.floorId,
      roomId: meter.roomId,
      tenancyId: invoice.tenancyId,
      tenantId: invoice.tenantId,
      month: b.month,
      billingMonth: Number(b.month.slice(5)),
      billingYear: Number(b.month.slice(0, 4)),
      ...amount,
      readingDate: b.readingDate,
      intervalStart: c.previousReadingDate,
      relatedInvoiceId: invoice.id,
      status: "draft",
      recordedBy: actor.id,
    };
    if (reading) {
      Object.assign(reading, fields);
      reading.draftVersion += 1;
      await reading.save({ session });
    } else {
      [reading] = await M.MeterReading.create(
        [{ ...fields, draftVersion: 1, revision: 1 }],
        { session },
      );
    }
    await audit(
      actor,
      "meter.reading.draft.saved",
      reading.id,
      { month: b.month, current: b.current },
      session,
    );
    return reading;
  });
}
async function photoAsset(actor, reading, fileId, session) {
  if (!storage.durableConfigured())
    fail(
      503,
      "Permanent private storage must be configured before finalizing photographic evidence",
    );
  const asset = await M.FileAsset.findOne({
    _id: fileId,
    organizationId: org(actor),
    relatedType: "meter-reading",
    relatedId: String(reading.id),
    kind: "meter-photo",
  }).session(session || null);
  if (!asset || !asset.storageKey.startsWith("s3:"))
    fail(
      409,
      "A successfully stored permanent meter reference photo is required",
    );
  return asset;
}
async function notify(actor, reading, title, session) {
  const memberships = await M.Membership.find({
    organizationId: org(actor),
    active: true,
    $or: [
      { role: { $in: ["owner", "manager"] } },
      { role: "tenant", tenantId: reading.tenantId },
    ],
  }).session(session);
  const docs = memberships.map((m) => ({
    organizationId: org(actor),
    userId: m.userId,
    type: "electricity",
    title,
    relatedInvoiceId: reading.relatedInvoiceId,
    meterReadingId: reading.id,
    body: `${reading.month}: ${reading.consumedUnits} units, INR ${(reading.amountPaise / 100).toFixed(2)}. Invoice ${reading.relatedInvoiceId}`,
  }));
  if (docs.length)
    await M.Notification.create(docs, { session, ordered: true });
}
async function finalize(actor, id) {
  return runTx(async (session) => {
    const reading = await readingFor(actor, id, session);
    const meter = await meterFor(actor, reading.meterId, session);
    await lockMeter(meter, session);
    if (["finalized", "correction"].includes(reading.status))
      return { reading, alreadyFinalized: true };
    if (
      await M.MeterReading.exists({
        organizationId: org(actor),
        meterId: meter.id,
        month: { $gt: reading.month },
        status: finalized,
      }).session(session)
    )
      fail(
        409,
        "A later finalized reading exists; backdated finalization would invalidate its baseline",
      );
    if (reading.status !== "draft")
      fail(
        409,
        "Legacy reading must be migrated with an audited meter baseline",
      );
    const invoice = await resolveInvoice(
      actor,
      meter,
      { relatedInvoiceId: reading.relatedInvoiceId, month: reading.month },
      session,
    );
    await lockInvoice(invoice, session);
    const c = await context(actor, meter, reading.month, session, invoice.id);
    const amount = R.calculate(
      c.previousReading,
      reading.current,
      reading.ratePaise,
    );
    R.readingDate(reading.month, reading.readingDate);
    const tenancy = await M.Tenancy.findOne({
      _id: invoice.tenancyId,
      organizationId: org(actor),
    }).session(session);
    R.assertAllocation(
      tenancy,
      meter.roomId,
      c.previousReadingDate,
      reading.readingDate,
    );
    const asset = await photoAsset(
      actor,
      reading,
      reading.meterPhotoFileId,
      session,
    );
    Object.assign(reading, amount, {
      intervalStart: c.previousReadingDate,
      status: "finalized",
      finalizedAt: new Date(),
      finalizedBy: actor.id,
    });
    await reading.save({ session });
    await M.FileAsset.updateOne(
      { _id: asset.id },
      { $set: { tenantId: reading.tenantId } },
      { session },
    );
    const sourceId = `meter:${reading.id}:v1`;
    await M.LedgerEntry.create(
      [
        {
          organizationId: org(actor),
          invoiceId: invoice.id,
          tenantId: invoice.tenantId,
          sourceType: "charge",
          chargeKind: "electricity",
          sourceId,
          debitPaise: reading.amountPaise,
          creditPaise: 0,
          description: `Electricity: ${reading.month}, ${reading.consumedUnits} units`,
        },
      ],
      { session },
    );
    const revision = await recordRevision(
      invoice,
      "electricity",
      "Finalized electricity meter reading",
      session,
      actor.id,
    );
    reading.invoiceRevision = revision.revision;
    await reading.save({ session });
    await audit(
      actor,
      "meter.reading.finalized",
      reading.id,
      { ...meterSnapshot(reading), invoiceRevision: revision.revision },
      session,
    );
    await notify(actor, reading, "Electricity invoice updated", session);
    return {
      reading,
      invoiceRevision: revision.revision,
      balance: await balanceFor(invoice, session),
    };
  });
}
async function correct(actor, id, b) {
  if (actor.role !== "owner")
    fail(
      403,
      "Only the property owner can correct finalized financial records",
    );
  return runTx(async (session) => {
    const reading = await readingFor(actor, id, session);
    if (!["finalized", "correction"].includes(reading.status))
      fail(409, "Use Save Draft to edit an unfinalized reading");
    if (b.expectedRevision !== reading.revision)
      fail(409, "Reading has changed. Reload before correcting");
    const meter = await meterFor(actor, reading.meterId, session);
    await lockMeter(meter, session);
    if (
      await M.MeterReading.exists({
        organizationId: org(actor),
        meterId: meter.id,
        month: { $gt: reading.month },
        status: finalized,
      }).session(session)
    )
      fail(
        409,
        "A later finalized reading depends on this reading. Correct the most recent billing period first",
      );
    const invoice = await M.Invoice.findOne({
      _id: reading.relatedInvoiceId,
      organizationId: org(actor),
    }).session(session);
    if (!invoice) fail(409, "Linked invoice is missing");
    await lockInvoice(invoice, session);
    R.readingDate(reading.month, b.readingDate);
    const tenancy = await M.Tenancy.findOne({
      _id: reading.tenancyId,
      organizationId: org(actor),
    }).session(session);
    R.assertAllocation(
      tenancy,
      reading.roomId,
      reading.intervalStart,
      b.readingDate,
    );
    const amount = R.calculate(reading.previous, b.current, b.ratePaise),
      delta = amount.amountPaise - reading.amountPaise;
    const balance = await balanceFor(invoice, session);
    if (balance.balancePaise + delta < 0)
      fail(
        409,
        "Correction would credit a verified payment. Complete the approved refund/credit process before reducing this charge",
      );
    const fileId = b.meterPhotoFileId || reading.meterPhotoFileId;
    const asset = await photoAsset(actor, reading, fileId, session);
    reading.corrections.push({
      ...meterSnapshot(reading),
      invoiceRevision: reading.invoiceRevision,
      reason: b.reason,
      correctedBy: actor.id,
      correctedAt: new Date(),
    });
    reading.revision += 1;
    Object.assign(reading, amount, {
      readingDate: b.readingDate,
      meterPhotoFileId: fileId,
      status: "correction",
      lastCorrectedBy: actor.id,
    });
    await reading.save({ session });
    await M.FileAsset.updateOne(
      { _id: asset.id },
      { $set: { tenantId: reading.tenantId } },
      { session },
    );
    await M.LedgerEntry.create(
      [
        {
          organizationId: org(actor),
          invoiceId: invoice.id,
          tenantId: invoice.tenantId,
          sourceType: "adjustment",
          chargeKind: "electricity",
          sourceId: `meter:${reading.id}:v${reading.revision}`,
          debitPaise: Math.max(delta, 0),
          creditPaise: Math.max(-delta, 0),
          description: `Electricity correction: ${reading.month}. ${b.reason}`,
        },
      ],
      { session },
    );
    const revision = await recordRevision(
      invoice,
      "electricity-correction",
      b.reason,
      session,
      actor.id,
    );
    reading.invoiceRevision = revision.revision;
    await reading.save({ session });
    await audit(
      actor,
      "meter.reading.corrected",
      reading.id,
      {
        reason: b.reason,
        deltaPaise: delta,
        revision: reading.revision,
        invoiceRevision: revision.revision,
      },
      session,
    );
    await notify(actor, reading, "Electricity reading corrected", session);
    return {
      reading,
      invoiceRevision: revision.revision,
      balance: await balanceFor(invoice, session),
    };
  });
}
async function uploadPhoto(actor, id, file) {
  if (!file) fail(400, "Select a meter photo");
  await R.validatePhoto(file.buffer, file.mimetype);
  if (!storage.durableConfigured())
    fail(
      503,
      "Permanent private object storage is not configured. Photo was not saved.",
    );
  const initial = await readingFor(actor, id);
  const key = await storage.write(file.buffer, {
    durable: true,
    mime: file.mimetype,
  });
  try {
    return await runTx(async (session) => {
      const reading = await readingFor(actor, id, session);
      const meter = await meterFor(actor, reading.meterId, session);
      await lockMeter(meter, session);
      const [asset] = await M.FileAsset.create(
        [
          {
            organizationId: org(actor),
            ownerUserId: actor.id,
            relatedType: "meter-reading",
            relatedId: String(reading.id),
            kind: "meter-photo",
            originalName: fileRules.safeFilename(file.originalname),
            mime: file.mimetype,
            size: file.buffer.length,
            sha256: fileRules.hash(file.buffer),
            storageKey: key,
            createdBy: actor.id,
          },
        ],
        { session },
      );
      if (reading.status === "draft") {
        reading.meterPhotoFileId = asset.id;
        reading.draftVersion += 1;
        await reading.save({ session });
      }
      await audit(
        actor,
        "meter.photo.uploaded",
        reading.id,
        {
          fileId: String(asset.id),
          sha256: asset.sha256,
          forCorrection: reading.status !== "draft",
        },
        session,
      );
      return {
        fileId: asset.id,
        name: asset.originalName,
        mime: asset.mime,
        size: asset.size,
        uploadedAt: asset.createdAt,
        uploadedBy: actor.id,
        pendingCorrection: reading.status !== "draft",
      };
    });
  } catch (err) {
    await storage.remove(key).catch(() => {});
    throw err;
  }
}
async function authorizedPhoto(actor, readingId, fileId) {
  const reading = await readingFor(actor, readingId);
  const id = fileId || reading.meterPhotoFileId;
  if (!id) fail(404, "Meter photo not found");
  if (
    actor.role === "tenant" &&
    ![
      reading.meterPhotoFileId,
      ...reading.corrections.map((c) => c.meterPhotoFileId),
    ].some((x) => String(x) === String(id))
  )
    fail(404, "Meter photo not found");
  const asset = await M.FileAsset.findOne({
    _id: id,
    organizationId: org(actor),
    relatedType: "meter-reading",
    relatedId: String(reading.id),
    kind: "meter-photo",
  });
  if (!asset) fail(404, "Meter photo not found");
  return { reading, asset };
}
async function decorateHistory(rows, actor) {
  const values = rows.map((r) => (r.toObject ? r.toObject() : r)),
    organizationId = org(actor);
  const [rooms, properties, tenants] = await Promise.all([
    M.Room.find({
      organizationId,
      _id: { $in: values.map((r) => r.roomId) },
    }).select("number"),
    M.Property.find({
      organizationId,
      _id: { $in: values.map((r) => r.propertyId) },
    }).select("name"),
    M.Tenant.find({
      organizationId,
      _id: { $in: values.map((r) => r.tenantId).filter(Boolean) },
    }).select("name"),
  ]);
  return values.map((row) => ({
    ...row,
    roomNumber: rooms.find((r) => String(r.id) === String(row.roomId))?.number,
    propertyName: properties.find(
      (p) => String(p.id) === String(row.propertyId),
    )?.name,
    tenantName: tenants.find((t) => String(t.id) === String(row.tenantId))
      ?.name,
  }));
}
async function decorateMeters(rows, actor) {
  const organizationId = org(actor);
  const [rooms, properties, floors] = await Promise.all([
    M.Room.find({
      organizationId,
      _id: { $in: rows.map((r) => r.roomId) },
    }).select("number"),
    M.Property.find({
      organizationId,
      _id: { $in: rows.map((r) => r.propertyId) },
    }).select("name"),
    M.Floor.find({
      organizationId,
      _id: { $in: rows.map((r) => r.floorId).filter(Boolean) },
    }).select("name"),
  ]);
  return rows.map((m) => ({
    ...m.toObject(),
    roomNumber: rooms.find((r) => String(r.id) === String(m.roomId))?.number,
    propertyName: properties.find((p) => String(p.id) === String(m.propertyId))
      ?.name,
    floorName: floors.find((f) => String(f.id) === String(m.floorId))?.name,
  }));
}
module.exports = {
  decorateMeters,
  decorateHistory,
  org,
  meterFor,
  readingFor,
  context,
  createMeter,
  handover,
  draft,
  finalize,
  correct,
  uploadPhoto,
  authorizedPhoto,
};
