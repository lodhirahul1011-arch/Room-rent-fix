const mongoose = require("mongoose");
const M = require("../models");
const F = require("./finance-rules");
const { fail } = require("./errors");
const runTx = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let value;
    await session.withTransaction(
      async () => {
        value = await fn(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
    return value;
  } finally {
    await session.endSession();
  }
};
async function balanceFor(invoice, session) {
  const [penalties, adjustments, allocations] = await Promise.all([
    M.Penalty.find({
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
    }).session(session || null),
    M.LedgerEntry.find({
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      sourceType: { $in: ["adjustment", "charge"] },
    }).session(session || null),
    M.PaymentAllocation.find({
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
    }).session(session || null),
  ]);
  const base = F.sum(invoice.originalItems),
    penalty = penalties.reduce((x, p) => x + p.amountPaise, 0),
    adjustment = adjustments.reduce(
      (x, e) => x + e.debitPaise - e.creditPaise,
      0,
    ),
    paid = allocations.reduce((x, a) => x + a.amountPaise, 0),
    total = base + penalty + adjustment;
  F.money(total);
  F.money(paid);
  return {
    originalPaise: base,
    penaltyPaise: penalty,
    adjustmentPaise: adjustment,
    totalPaise: total,
    paidPaise: paid,
    balancePaise: total - paid,
  };
}
async function lockInvoice(invoice, session) {
  const result = await M.Invoice.updateOne(
    { _id: invoice.id, organizationId: invoice.organizationId },
    { $inc: { financialVersion: 1 } },
    { session },
  );
  if (result.matchedCount !== 1) fail(409, "Invoice unavailable");
}
function meterSnapshot(reading) {
  return {
    readingId: String(reading.id || reading._id),
    meterId: String(reading.meterId || ""),
    month: reading.month,
    previous: reading.previous,
    current: reading.current,
    consumedUnits: reading.consumedUnits,
    ratePaise: reading.ratePaise,
    amountPaise: reading.amountPaise,
    readingDate: reading.readingDate,
    meterPhotoFileId: reading.meterPhotoFileId
      ? String(reading.meterPhotoFileId)
      : null,
    revision: reading.revision || 1,
    status: reading.status,
  };
}
async function recordRevision(invoice, kind, description, session, actorId) {
  const balance = await balanceFor(invoice, session);
  const last = await M.InvoiceRevision.findOne({
    invoiceId: invoice.id,
    organizationId: invoice.organizationId,
  })
    .sort({ revision: -1 })
    .session(session);
  const rev = (last?.revision || 0) + 1;
  const additions = await M.LedgerEntry.find({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    sourceType: { $in: ["charge", "adjustment", "penalty"] },
  })
    .sort({ occurredAt: 1, _id: 1 })
    .session(session);
  const snapshot = [
    ...invoice.originalItems.map((i) => ({
      kind: i.kind,
      label: i.label,
      amountPaise: i.amountPaise,
    })),
    ...additions.map((e) => ({
      kind:
        e.chargeKind ||
        (/^electricity:/i.test(e.description || "")
          ? "electricity"
          : e.sourceType),
      label: e.description,
      amountPaise: e.debitPaise - e.creditPaise,
    })),
  ];
  const readings = await M.MeterReading.find({
    organizationId: invoice.organizationId,
    relatedInvoiceId: invoice.id,
    status: { $in: ["finalized", "correction"] },
  }).session(session);
  const [result] = await M.InvoiceRevision.create(
    [
      {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        revision: rev,
        kind,
        description,
        totalPaise: balance.totalPaise,
        createdBy: actorId,
        items: snapshot,
        meterDetails: readings.map(meterSnapshot),
      },
    ],
    { session },
  );
  return result;
}
async function initialInvoiceItems(
  organizationId,
  room,
  tenancy,
  month,
  session,
) {
  const { first, last } = F.monthBounds(month);
  const readings = await M.MeterReading.find({
    organizationId,
    roomId: room.id,
    month,
    meterId: { $exists: false },
  }).session(session);
  if (readings.length) {
    const allocations = await M.Tenancy.countDocuments({
      organizationId,
      roomId: room.id,
      moveIn: { $lte: last },
      $or: [{ moveOut: null }, { moveOut: { $gte: first } }],
    }).session(session);
    if (allocations !== 1)
      fail(
        409,
        "Legacy electricity reading spans multiple tenants; explicit allocation is required",
      );
  }
  return [
    { kind: "rent", label: "Monthly room rent", amountPaise: room.rentPaise },
    ...readings.map((r) => ({
      kind: "electricity",
      label: "Electricity meter " + month,
      amountPaise: r.amountPaise,
    })),
  ];
}
module.exports = {
  initialInvoiceItems,
  runTx,
  balanceFor,
  lockInvoice,
  recordRevision,
  meterSnapshot,
};
