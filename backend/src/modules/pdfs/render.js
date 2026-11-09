const PDFDocument = require("pdfkit");
const M = require("../../models"),
  storage = require("../../core/private-storage");
const { fail } = require("../../core/errors");
const cash = (n) => (Number(n || 0) / 100).toFixed(2);
async function buildPdf(invoice, revision, { detailed = false } = {}) {
  const photos = new Map();
  if (detailed)
    for (const meter of revision.meterDetails || []) {
      if (!meter.meterPhotoFileId) continue;
      const asset = await M.FileAsset.findOne({
        _id: meter.meterPhotoFileId,
        organizationId: invoice.organizationId,
        tenantId: invoice.tenantId,
        kind: "meter-photo",
      });
      if (!asset)
        fail(
          409,
          "A photo referenced by this immutable invoice revision is unavailable",
        );
      const bytes = await storage.read(asset.storageKey);
      photos.set(
        String(asset.id),
        await require("sharp")(bytes)
          .resize({
            width: 640,
            height: 480,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer(),
      );
    }
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];
    pdf.on("data", (d) => chunks.push(d));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.fontSize(22).fillColor("#164e43").text("ROOMRENT - INVOICE");
    pdf.moveDown();
    pdf
      .fillColor("#17241f")
      .fontSize(11)
      .text("Invoice: " + String(invoice.id))
      .text("Month: " + invoice.month)
      .text("Due date: " + invoice.dueDate)
      .text("Immutable revision: " + revision.revision);
    pdf.moveDown();
    for (const item of revision.items || [])
      pdf.text(
        String(item.label || item.kind).slice(0, 180) +
          "  INR " +
          cash(item.amountPaise),
      );
    pdf
      .moveDown()
      .fontSize(14)
      .text("Total: INR " + cash(revision.totalPaise));
    for (const meter of revision.meterDetails || []) {
      if (pdf.y > 570) pdf.addPage();
      pdf
        .moveDown()
        .fontSize(12)
        .fillColor("#166534")
        .text("Electricity Details - " + meter.month);
      pdf
        .fillColor("#17241f")
        .fontSize(10)
        .text("Previous meter reading: " + meter.previous)
        .text("Current meter reading: " + meter.current)
        .text("Units consumed: " + meter.consumedUnits)
        .text("Rate per unit: INR " + cash(meter.ratePaise))
        .text("Electricity amount: INR " + cash(meter.amountPaise))
        .text("Reading date: " + meter.readingDate)
        .text(
          "Meter reference photo: " +
            (meter.meterPhotoFileId || "Not available"),
        )
        .text("Meter reading revision: " + meter.revision);
      const photo = photos.get(String(meter.meterPhotoFileId));
      if (photo) {
        if (pdf.y > 570) pdf.addPage();
        pdf.moveDown(0.5);
        const y = pdf.y;
        pdf.image(photo, 48, y, { fit: [220, 150] });
        pdf.y = y + 160;
      }
    }
    pdf
      .moveDown()
      .fontSize(9)
      .fillColor("#52665f")
      .text(
        "This invoice is an accounting snapshot. External payments require owner verification. Corrections create a new revision and never overwrite this document.",
      );
    pdf.end();
  });
}
module.exports = { buildPdf };
