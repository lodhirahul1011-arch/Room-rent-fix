const http = require("node:http");
async function start() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "meter-tests-only-secret-at-least-32-characters";
  process.env.CORS_ORIGINS = "http://localhost:3000,http://localhost:3100";
  const { MongoMemoryReplSet } = require("mongodb-memory-server");
  const repl = await MongoMemoryReplSet.create({
    binary: { version: "7.0.24" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const objects = new Map();
  const objectServer = http.createServer(async (req, res) => {
    const key = new URL(req.url, "http://localhost").pathname;
    if (req.method === "PUT") {
      const chunks = [];
      for await (const part of req) chunks.push(part);
      objects.set(key, {
        bytes: Buffer.concat(chunks),
        mime: req.headers["content-type"],
      });
      res.writeHead(200, { ETag: '"meter-test-object"' });
      res.end();
    } else if (req.method === "GET") {
      const o = objects.get(key);
      if (!o) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        "Content-Type": o.mime,
        "Content-Length": o.bytes.length,
      });
      res.end(o.bytes);
    } else if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(405);
      res.end();
    }
  });
  await new Promise((resolve) => objectServer.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, {
    MONGODB_URI: repl.getUri("roomrent_meter_test"),
    PRIVATE_STORAGE_DRIVER: "s3",
    S3_BUCKET: "private-meter-tests",
    S3_REGION: "us-east-1",
    S3_ENDPOINT: "http://127.0.0.1:" + objectServer.address().port,
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
    S3_SERVER_SIDE_ENCRYPTION: "AES256",
  });
  const mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGODB_URI);
  const M = require("../../src/models");
  for (const model of Object.values(M)) await model.init();
  const app = require("../../src/app");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  async function call(method, path, token, body) {
    const form = body instanceof FormData;
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body !== undefined && !form
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    const contentType = response.headers.get("content-type") || "";
    return {
      status: response.status,
      headers: response.headers,
      body: contentType.includes("json")
        ? await response.json()
        : Buffer.from(await response.arrayBuffer()),
    };
  }
  const jwt = require("jsonwebtoken");
  async function actor(role, organizationId, tenantId, email) {
    const user = await M.User.create({
      name: role + " user",
      email:
        email || role + "-" + new mongoose.Types.ObjectId() + "@example.test",
      passwordHash: "unused-test-only-hash",
      role: role === "manager" ? "owner" : role,
      organizationId,
      active: true,
    });
    if (organizationId)
      await M.Membership.create({
        userId: user.id,
        organizationId,
        role,
        tenantId,
        active: true,
      });
    const session = await M.AuthSession.create({
      userId: user.id,
      organizationId,
      role,
      refreshHash: "test-only",
      expiresAt: new Date(Date.now() + 3600000),
    });
    const token = jwt.sign(
      {
        sub: user.id,
        sid: session.id,
        role,
        organizationId: organizationId ? String(organizationId) : null,
      },
      process.env.JWT_SECRET,
      { issuer: "roomrent-api", audience: "roomrent-web", expiresIn: "1h" },
    );
    return { token, user, organizationId, tenantId };
  }
  const organization = await M.Organization.create({ name: "Meter test org" }),
    otherOrg = await M.Organization.create({ name: "Other org" });
  const owner = await actor("owner", organization.id),
    otherOwner = await actor("owner", otherOrg.id);
  const property = await M.Property.create({
    organizationId: organization.id,
    name: "Meter test property",
    location: "Test district",
    address: "Test address",
  });
  const floor = await M.Floor.create({
    organizationId: organization.id,
    propertyId: property.id,
    name: "Ground",
    order: 0,
  });
  const room = await M.Room.create({
    organizationId: organization.id,
    propertyId: property.id,
    floorId: floor.id,
    number: "101",
    rentPaise: 500000,
  });
  const tenant = await M.Tenant.create({
      organizationId: organization.id,
      name: "Meter test tenant",
      phone: "9999999999",
    }),
    otherTenant = await M.Tenant.create({
      organizationId: organization.id,
      name: "Other tenant",
      phone: "8888888888",
    });
  const tenantActor = await actor("tenant", organization.id, tenant.id),
    otherTenantActor = await actor("tenant", organization.id, otherTenant.id),
    manager = await actor("manager", organization.id);
  const tenancy = await M.Tenancy.create({
    organizationId: organization.id,
    tenantId: tenant.id,
    roomId: room.id,
    moveIn: "2026-01-01",
    status: "active",
  });
  const photo = await require("sharp")({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 120, g: 150, b: 120 },
    },
  })
    .png()
    .toBuffer();
  async function upload(
    id,
    token = owner.token,
    bytes = photo,
    mime = "image/png",
  ) {
    const data = new FormData();
    data.append("file", new Blob([bytes], { type: mime }), "मीटर.png");
    return call("POST", "/api/meters/readings/" + id + "/photo", token, data);
  }
  async function stop() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    objectServer.closeAllConnections();
    await new Promise((resolve) => objectServer.close(resolve));
    await mongoose.disconnect();
    await repl.stop();
  }
  return {
    M,
    mongoose,
    base,
    call,
    actor,
    owner,
    otherOwner,
    tenantActor,
    otherTenantActor,
    manager,
    organization,
    property,
    floor,
    room,
    tenant,
    otherTenant,
    tenancy,
    photo,
    upload,
    objects,
    stop,
  };
}
module.exports = { start };
if (require.main === module)
  start()
    .then(async (h) => {
      console.log("Disposable meter test replica set ready");
      await h.stop();
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
