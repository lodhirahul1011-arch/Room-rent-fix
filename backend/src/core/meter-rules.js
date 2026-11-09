const { fail } = require("./errors");
const { validDate } = require("./finance");
const { monthBounds, money } = require("./finance-rules");
const { meterUnits, meterAmount } = require("./finance-rules");
const units = meterUnits;
function calculate(previous, current, ratePaise = 1000) {
  const consumedUnits = (units(current) - units(previous)) / 1000;
  const amountPaise = meterAmount(previous, current, ratePaise);
  return { previous, current, consumedUnits, ratePaise, amountPaise };
}
function readingDate(
  month,
  date,
  today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
) {
  const bounds = monthBounds(month);
  if (
    !validDate(date) ||
    date < bounds.first ||
    date > bounds.last ||
    date > today
  )
    fail(
      400,
      "Reading date must be a valid date in the billing month and cannot be in the future",
    );
  return date;
}
function nextDay(date) {
  if (!validDate(date)) fail(400, "Invalid boundary date");
  return new Date(Date.parse(date + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
}
function assertAllocation(tenancy, roomId, start, end) {
  if (
    !tenancy ||
    String(tenancy.roomId) !== String(roomId) ||
    tenancy.moveIn > nextDay(start) ||
    (tenancy.moveOut && tenancy.moveOut < end)
  )
    fail(
      409,
      "Reading interval crosses a vacancy or tenant change. Record an audited tenant handover baseline before billing; electricity is never prorated automatically.",
    );
  return true;
}
function maxPhotoBytes() {
  const value = Number(process.env.METER_PHOTO_MAX_BYTES || 5 * 1024 * 1024);
  return Number.isSafeInteger(value) && value > 0 && value <= 20 * 1024 * 1024
    ? value
    : 5 * 1024 * 1024;
}
function signature(buffer, mime) {
  if (
    !Buffer.isBuffer(buffer) ||
    !buffer.length ||
    buffer.length > maxPhotoBytes()
  )
    return false;
  if (mime === "image/png")
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mime === "image/webp")
    return (
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP"
    );
  return false;
}
async function validatePhoto(buffer, mime) {
  if (!signature(buffer, mime))
    fail(
      400,
      "Upload a valid JPEG, PNG or WebP meter photo within the configured size limit",
    );
  let metadata;
  try {
    metadata = await require("sharp")(buffer, {
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    fail(400, "Meter photo is corrupt or is not a supported image");
  }
  const expected = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
  };
  if (
    metadata.format !== expected[mime] ||
    !metadata.width ||
    !metadata.height ||
    metadata.pages > 1
  )
    fail(
      400,
      "Image content does not match its MIME type or contains multiple frames",
    );
  try {
    await require("sharp")(buffer, { limitInputPixels: 40_000_000 })
      .raw()
      .toBuffer();
  } catch {
    fail(400, "Meter photo pixel data is corrupt");
  }
  return metadata;
}
module.exports = {
  units,
  calculate,
  readingDate,
  assertAllocation,
  signature,
  validatePhoto,
  maxPhotoBytes,
};
