const test = require("node:test"),
  assert = require("node:assert/strict");
const R = require("../src/core/meter-rules");
test("1380 minus 1250 at INR 10 yields 130 units and INR 1300", () =>
  assert.deepEqual(R.calculate(1250, 1380, 1000), {
    previous: 1250,
    current: 1380,
    consumedUnits: 130,
    ratePaise: 1000,
    amountPaise: 130000,
  }));
test("fractional readings use milliunits with one explicit paise rounding", () =>
  assert.equal(R.calculate(10.125, 11.375, 1000).amountPaise, 1250));
test("zero consumption and zero rate remain valid", () => {
  assert.equal(R.calculate(1250, 1250, 1000).amountPaise, 0);
  assert.equal(R.calculate(1250, 1380, 0).amountPaise, 0);
});
test("rejects decreasing, non-finite, negative and unsafe meter values", () => {
  for (const args of [
    [5, 4, 1000],
    [-1, 5, 1000],
    [NaN, 5, 1000],
    [1, Infinity, 1000],
    [0, 1, -1],
    [0, 1, 1.2],
    [0, 1.0001, 1000],
    [0, Number.MAX_SAFE_INTEGER, 1000],
  ])
    assert.throws(() => R.calculate(...args));
});
test("rejects invalid or wrong-month dates and future readings", () => {
  for (const date of ["2026-02-30", "2026-03-01", "2026-02-28"])
    assert.throws(() => R.readingDate("2026-02", date, "2026-02-20"));
  assert.equal(
    R.readingDate("2026-02", "2026-02-15", "2026-02-20"),
    "2026-02-15",
  );
});
test("does not prorate consumption across a tenant move-in or move-out", () => {
  assert.throws(() =>
    R.assertAllocation(
      { roomId: "r", moveIn: "2026-11-10" },
      "r",
      "2026-10-31",
      "2026-11-30",
    ),
  );
  assert.throws(() =>
    R.assertAllocation(
      { roomId: "r", moveIn: "2026-01-01", moveOut: "2026-11-15" },
      "r",
      "2026-10-31",
      "2026-11-30",
    ),
  );
  assert.equal(
    R.assertAllocation(
      { roomId: "r", moveIn: "2026-11-01" },
      "r",
      "2026-10-31",
      "2026-11-30",
    ),
    true,
  );
});
test("rejects public masquerading images by their signature", () => {
  assert.equal(R.signature(Buffer.from("not png"), "image/png"), false);
  assert.equal(R.signature(Buffer.from("RIFF1234WEBP"), "image/webp"), true);
});

test("fully decodes JPEG and WebP images and emits safe Unicode download headers", async () => {
  const sharp = require("sharp");
  for (const [format, mime] of [
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ]) {
    const data = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 50, g: 100, b: 150 },
      },
    })
      [format]()
      .toBuffer();
    assert.equal((await R.validatePhoto(data, mime)).format, format);
  }
  const disposition = require("../src/core/b5-rules").contentDisposition(
    "????.png",
  );
  assert.ok(disposition.includes("filename*=UTF-8''"));
  assert.ok(/^[\x20-\x7e]+$/.test(disposition));
});
