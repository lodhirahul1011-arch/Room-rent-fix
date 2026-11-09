/** Genuine live UI/API test; creates only disposable test databases and a local private-object-store double. */
const fs = require("node:fs"),
  path = require("node:path"),
  { spawn, execFileSync } = require("node:child_process");
const frontend = path.resolve(__dirname, ".."),
  backend = path.resolve(frontend, "../backend");
const { start } = require(
  path.join(backend, "tests/helpers/meter-harness.cjs"),
);
const { chromium, expect } = require("@playwright/test");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const h = await start();
  let next, browser;
  const artifacts = path.join(frontend, "test-results/meters");
  fs.mkdirSync(artifacts, { recursive: true });
  const log = fs.openSync(path.join(artifacts, "next-live.log"), "w");
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(frontend, "tsconfig.json"), "utf8"),
    );
    cfg.exclude = ["node_modules", ".next", ".next-meter-build"];
    fs.writeFileSync(
      path.join(frontend, ".meter-tsconfig-e2e.json"),
      JSON.stringify(cfg, null, 2),
    );
    next = spawn(
      process.execPath,
      [require.resolve("next/dist/bin/next"), "dev", "-p", "3100"],
      {
        cwd: frontend,
        env: {
          ...process.env,
          NODE_ENV: "development",
          NEXT_PUBLIC_ROOMRENT_API_MODE: "live",
          NEXT_PUBLIC_ROOMRENT_API_URL: h.base,
          NEXT_DIST_DIR: ".next-meter-e2e",
          NEXT_TSCONFIG: ".meter-tsconfig-e2e.json",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", log, log],
        windowsHide: true,
      },
    );
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await fetch("http://localhost:3100/login");
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(1000);
    }
    if (!ready)
      throw Error(
        "Live test frontend did not start. See test-results/meters/next-live.log",
      );
    const generated = await h.call(
      "POST",
      "/api/invoices/generate",
      h.owner.token,
      { month: "2026-10", dueDay: 5 },
    );
    if (generated.status !== 201) throw Error(JSON.stringify(generated.body));
    const oct = generated.body.data[0];
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const session = {
      accessToken: h.owner.token,
      refreshToken: "test-only-unused",
      role: "owner",
      organizationId: String(h.organization.id),
      user: {
        id: h.owner.user.id,
        name: "Meter QA Owner",
        email: h.owner.user.email,
        role: "owner",
      },
    };
    await context.addInitScript(
      (s) => sessionStorage.setItem("roomrent-b8-session", JSON.stringify(s)),
      session,
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "http://localhost:3100/owner/invoices?meterInvoice=" + oct._id,
    );
    const section = page.getByRole("region", {
      name: "Electricity meter reading",
    });
    await expect(
      section.getByLabel("Initial meter baseline", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await section
      .getByLabel("Initial meter baseline", { exact: true })
      .fill("1000");
    await section
      .getByLabel("Baseline date", { exact: true })
      .fill("2026-10-01");
    await section
      .getByLabel("Baseline audit reason", { exact: true })
      .fill("Physically verified opening meter display");
    await section
      .getByRole("button", { name: "Save audited baseline" })
      .click();
    await expect(section.getByLabel("Automatic previous reading")).toHaveValue(
      "1000",
    );
    await expect(
      section.getByLabel("Automatic previous reading"),
    ).toHaveAttribute("readonly", "");
    await section
      .getByLabel("Current meter reading", { exact: true })
      .fill("1250");
    await section
      .getByLabel("Meter reading date", { exact: true })
      .fill("2026-10-31");
    await section
      .getByLabel("Meter reference photo", { exact: true })
      .setInputFiles({
        name: "october.png",
        mimeType: "image/png",
        buffer: h.photo,
      });
    await section
      .getByRole("button", { name: "Save Draft", exact: true })
      .click();
    await expect(
      section
        .getByRole("status")
        .filter({ hasText: "Draft saved by the backend" }),
    ).toContainText("Draft saved by the backend", { timeout: 20000 });
    await section
      .getByRole("button", { name: "Finalize Reading", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm finalization", exact: true })
      .click();
    await expect(section.getByText("Finalized", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    console.log(
      "PASS live UI initial audited baseline, actual photo upload, backend-confirmed draft and finalization",
    );
    const november = await h.call(
      "POST",
      "/api/invoices/generate",
      h.owner.token,
      { month: "2026-11", dueDay: 5 },
    );
    const nov = november.body.data[0];
    await page.goto(
      "http://localhost:3100/owner/invoices?meterInvoice=" + nov._id,
    );
    await expect(section.getByLabel("Automatic previous reading")).toHaveValue(
      "1250",
    );
    await expect(section.getByLabel("Electricity rate per unit")).toHaveValue(
      "10",
    );
    await section
      .getByLabel("Current meter reading", { exact: true })
      .fill("1380");
    await section
      .getByLabel("Meter reading date", { exact: true })
      .fill("2026-11-09");
    await expect(
      section.getByLabel("Consumed units", { exact: true }),
    ).toContainText("130 kWh");
    await expect(
      section.getByLabel("Electricity charge", { exact: true }),
    ).toContainText("1,300");
    await section
      .getByRole("button", { name: "Open previous meter photo" })
      .click();
    await expect(
      section.getByRole("img", { name: "Authorized monthly meter reference" }),
    ).toBeVisible();
    await section
      .getByLabel("Meter reference photo", { exact: true })
      .setInputFiles({
        name: "november.png",
        mimeType: "image/png",
        buffer: h.photo,
      });
    await expect(
      section.getByRole("img", { name: "Selected unsaved meter reference" }),
    ).toBeVisible();
    await section.screenshot({
      path: path.join(artifacts, "owner-meter-desktop.png"),
    });
    await section
      .getByRole("button", { name: "Finalize Reading", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm finalization", exact: true })
      .click();
    await expect(section.getByText("Finalized", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await section
      .getByRole("button", { name: "Edit / Correct Reading" })
      .click();
    await section
      .getByLabel("Current meter reading", { exact: true })
      .fill("1390");
    await section
      .getByLabel("Meter correction reason")
      .fill("Verified the last digit against the meter photograph");
    await section.getByRole("button", { name: "Review correction" }).click();
    await page
      .getByRole("button", { name: "Confirm correction", exact: true })
      .click();
    await expect(
      section.getByText("Corrected · audited", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await section.getByRole("button", { name: "View Monthly History" }).click();
    const history = section.getByRole("region", {
      name: "Monthly electricity history",
    });
    await expect(history.locator("tbody tr")).toHaveCount(2);
    const download = page.waitForEvent("download");
    await history.getByRole("button", { name: "Monthly PDF" }).first().click();
    const file = await download;
    await file.saveAs(path.join(artifacts, "monthly-detailed.pdf"));
    const pdf = fs.readFileSync(path.join(artifacts, "monthly-detailed.pdf"));
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      throw Error("Detailed PDF is invalid");
    await page.reload();
    await expect(
      section.getByLabel("Current meter reading", { exact: true }),
    ).toHaveValue("1390");
    console.log(
      "PASS previous-month carry-forward, INR 1300 preview, authorized comparison photos, audited correction, history and detailed PDF",
    );
    const tenantContext = await browser.newContext();
    await tenantContext.addInitScript(
      (s) => sessionStorage.setItem("roomrent-b8-session", JSON.stringify(s)),
      {
        accessToken: h.tenantActor.token,
        refreshToken: "test-only-unused",
        role: "tenant",
        organizationId: String(h.organization.id),
        user: {
          id: h.tenantActor.user.id,
          name: "Meter tenant",
          email: h.tenantActor.user.email,
          role: "tenant",
        },
      },
    );
    const tenantPage = await tenantContext.newPage();
    await tenantPage.goto("http://localhost:3100/tenant/invoices");
    await expect(
      tenantPage
        .getByRole("region", { name: "Monthly electricity history" })
        .locator("tbody tr"),
    ).toHaveCount(2);
    await tenantPage
      .getByRole("button", { name: "View meter photo" })
      .first()
      .click();
    await expect(
      tenantPage.getByRole("img", {
        name: "Authorized monthly meter reference",
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await section.screenshot({
      path: path.join(artifacts, "owner-meter-mobile.png"),
    });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw Error("Meter UI overflows mobile viewport");
    process.env.PRIVATE_STORAGE_DRIVER = "local";
    await page.reload();
    await expect(
      section.getByText("Permanent private photo storage is not configured.", {
        exact: false,
      }),
    ).toBeVisible();
    process.env.PRIVATE_STORAGE_DRIVER = "s3";
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "PASS tenant authorized photo history, persistence, mobile layout and unconfigured-storage error state",
    );
  } finally {
    if (browser) await browser.close();
    if (next?.pid) {
      try {
        execFileSync("taskkill", ["/PID", String(next.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        next.kill();
      }
    }
    fs.closeSync(log);
    await h.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
