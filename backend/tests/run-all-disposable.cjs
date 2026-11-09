const { start } = require("./helpers/meter-harness.cjs");
const { spawn } = require("node:child_process");
const fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const h = await start();
  try {
    const base = process.env.MONGODB_URI;
    const env = {
      ...process.env,
      B7_TEST_MONGO_URI: base.replace(
        "roomrent_meter_test",
        "roomrent_b7_test",
      ),
      B8_TEST_MONGO_URI: base.replace(
        "roomrent_meter_test",
        "roomrent_b8_test",
      ),
    };
    const files = fs
      .readdirSync(__dirname)
      .filter((name) => name.endsWith(".test.js"))
      .map((name) => path.join(__dirname, name));
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--test", "--test-concurrency=1", ...files],
        { env, stdio: "inherit", windowsHide: true },
      );
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(Error("Backend suite exited " + code)),
      );
    });
  } finally {
    await h.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
