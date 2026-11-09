/** Read-only PDF render/text QA for the latest live E2E artifact. */
const fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, ".."),
    dir = path.join(root, "test-results/meters");
  const canvasModule = require("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvasModule.DOMMatrix,
    ImageData: canvasModule.ImageData,
    Path2D: canvasModule.Path2D,
  });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(
      fs.readFileSync(path.join(dir, "monthly-detailed.pdf")),
    ),
    useSystemFonts: true,
  });
  const pdf = await task.promise,
    text = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        viewport = page.getViewport({ scale: 1.5 }),
        canvas = canvasModule.createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
      await page.render({
        canvasContext: canvas.getContext("2d"),
        canvas,
        viewport,
      }).promise;
      fs.writeFileSync(
        path.join(dir, "invoice-page-" + i + ".png"),
        canvas.toBuffer("image/png"),
      );
      text.push(
        (await page.getTextContent()).items.map((x) => x.str || "").join(" "),
      );
    }
    const content = text.join("\n");
    fs.writeFileSync(path.join(dir, "invoice-text.txt"), content);
    for (const expected of [
      "Electricity Details",
      "Previous meter reading: 1250",
      "Current meter reading: 1390",
      "Units consumed: 140",
      "Electricity amount: INR 1400.00",
    ])
      if (!content.includes(expected)) throw Error("PDF missing " + expected);
    console.log(
      "PASS detailed meter PDF render and text checks; pages=" + pdf.numPages,
    );
  } finally {
    await task.destroy();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
