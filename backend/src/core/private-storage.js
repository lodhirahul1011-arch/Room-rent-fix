const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { config } = require("../config");
const { fail } = require("./errors");
function root() {
  return path.resolve(config().fileRoot);
}
function location(key) {
  if (!/^[a-f0-9]{32}$/.test(key)) throw Error("Invalid storage key");
  return path.join(root(), key);
}
function durableConfigured() {
  return (
    process.env.PRIVATE_STORAGE_DRIVER === "s3" &&
    !!process.env.S3_BUCKET &&
    !!(process.env.S3_REGION || process.env.AWS_REGION)
  );
}
function client() {
  if (!durableConfigured())
    fail(
      503,
      "Permanent private storage is not configured. Set PRIVATE_STORAGE_DRIVER=s3, S3_BUCKET and S3_REGION before uploading meter photos.",
    );
  const { S3Client } = require("@aws-sdk/client-s3");
  const endpoint = process.env.S3_ENDPOINT;
  if (
    endpoint &&
    !endpoint.startsWith("https://") &&
    !(
      process.env.NODE_ENV === "test" &&
      /^http:\/\/(localhost|127\.0\.0\.1):/.test(endpoint)
    )
  )
    fail(503, "Private storage endpoint must use HTTPS");
  return new S3Client({
    region: process.env.S3_REGION || process.env.AWS_REGION,
    ...(endpoint
      ? {
          endpoint,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
        }
      : {}),
    ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
    maxAttempts: 2,
    requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
  });
}
function objectLocation(key) {
  try {
    const parsed = JSON.parse(
      Buffer.from(key.slice(3), "base64url").toString(),
    );
    if (
      typeof parsed.bucket !== "string" ||
      typeof parsed.key !== "string" ||
      !/^roomrent-private\/[a-f0-9]{32}$/.test(parsed.key)
    )
      throw Error();
    return { Bucket: parsed.bucket, Key: parsed.key };
  } catch {
    fail(500, "Invalid private object reference");
  }
}
async function write(buffer, options = {}) {
  if (options.durable && !durableConfigured()) client();
  if (durableConfigured()) {
    const c = client();
    const location = {
      Bucket: process.env.S3_BUCKET,
      Key: "roomrent-private/" + crypto.randomBytes(16).toString("hex"),
    };
    try {
      const { PutObjectCommand } = require("@aws-sdk/client-s3");
      await c.send(
        new PutObjectCommand({
          ...location,
          Body: buffer,
          ContentType: options.mime || "application/octet-stream",
          ...(process.env.S3_SERVER_SIDE_ENCRYPTION
            ? { ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION }
            : {}),
        }),
      );
      return (
        "s3:" +
        Buffer.from(
          JSON.stringify({ bucket: location.Bucket, key: location.Key }),
        ).toString("base64url")
      );
    } catch {
      fail(
        503,
        "Permanent private storage upload failed. No successful photo upload was recorded.",
      );
    } finally {
      c.destroy();
    }
  }
  const key = crypto.randomBytes(16).toString("hex");
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
  await fs.writeFile(location(key), buffer, { flag: "wx", mode: 0o600 });
  return key;
}
async function read(key) {
  if (!key.startsWith("s3:")) return fs.readFile(location(key));
  const c = client();
  try {
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const response = await c.send(new GetObjectCommand(objectLocation(key)));
    return Buffer.from(await response.Body.transformToByteArray());
  } catch {
    fail(503, "Private file is temporarily unavailable");
  } finally {
    c.destroy();
  }
}
async function remove(key) {
  if (!key.startsWith("s3:")) return fs.rm(location(key), { force: true });
  const c = client();
  try {
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    await c.send(new DeleteObjectCommand(objectLocation(key)));
  } finally {
    c.destroy();
  }
}
module.exports = { write, read, remove, durableConfigured };
