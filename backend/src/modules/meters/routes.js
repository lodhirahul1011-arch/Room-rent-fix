const express = require("express"),
  multer = require("multer"),
  { z } = require("zod"),
  M = require("../../models");
const { auth, roles } = require("../../core/auth");
const { parse } = require("../../core/validation");
const { asyncRoute, fail } = require("../../core/errors");
const service = require("./service"),
  storage = require("../../core/private-storage"),
  R = require("../../core/meter-rules");
const r = express.Router();
const owner = roles("owner", "manager"),
  oid = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID"),
  unit = z.number().finite().nonnegative();
const draftSchema = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    current: unit,
    ratePaise: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger)
      .default(1000),
    readingDate: z.string(),
    relatedInvoiceId: oid,
    expectedVersion: z.number().int().positive().optional(),
    previous: unit.optional(),
  })
  .strict();
r.use(auth);
r.use((req, res, next) => {
  service.org(req.actor);
  next();
});
r.get("/config", owner, (_req, res) =>
  res.json({
    data: {
      durableStorageConfigured: storage.durableConfigured(),
      photoMaxBytes: R.maxPhotoBytes(),
      defaultRatePaise: 1000,
    },
  }),
);
r.get(
  "/",
  owner,
  asyncRoute(async (req, res) => {
    const q = { organizationId: service.org(req.actor) };
    if (req.query.propertyId) q.propertyId = parse(oid, req.query.propertyId);
    if (req.query.roomId) q.roomId = parse(oid, req.query.roomId);
    res.json({
      data: await service.decorateMeters(
        await M.Meter.find(q).sort({ createdAt: -1 }).limit(500),
        req.actor,
      ),
    });
  }),
);
r.post(
  "/",
  roles("owner"),
  asyncRoute(async (req, res) => {
    const b = parse(
      z
        .object({
          roomId: oid,
          label: z.string().trim().min(1).max(120),
          baselineReading: unit,
          baselineDate: z.string(),
          baselineReason: z.string().trim().min(5).max(1000),
        })
        .strict(),
      req.body,
    );
    res.status(201).json({ data: await service.createMeter(req.actor, b) });
  }),
);
r.get(
  "/readings",
  asyncRoute(async (req, res) => {
    const q = { organizationId: service.org(req.actor) };
    for (const k of ["roomId", "propertyId"])
      if (req.query[k]) q[k] = parse(oid, req.query[k]);
    if (req.query.month)
      q.month = parse(
        z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        req.query.month,
      );
    if (req.query.year) {
      const year = parse(
        z.coerce.number().int().min(1900).max(9999),
        req.query.year,
      );
      q.month = {
        ...(typeof q.month === "string" ? { $eq: q.month } : {}),
        $gte: year + "-01",
        $lte: year + "-12",
      };
    }
    if (req.actor.role === "tenant") {
      q.tenantId = req.actor.tenantId;
      q.status = { $in: ["finalized", "correction"] };
    } else if (!["owner", "manager"].includes(req.actor.role))
      fail(403, "Forbidden");
    res.json({
      data: await service.decorateHistory(
        await M.MeterReading.find(q)
          .sort({ month: -1, createdAt: -1 })
          .limit(500),
        req.actor,
      ),
    });
  }),
);
// Compatibility alias: previous is checked against the server value; it is never trusted.
r.post(
  "/readings",
  owner,
  asyncRoute(async (req, res) => {
    const input = { ...req.body };
    const roomId = parse(oid, input.roomId);
    delete input.roomId;
    const meter = await M.Meter.findOne({
      organizationId: service.org(req.actor),
      roomId,
      active: true,
    });
    if (!meter)
      fail(409, "Initialize an audited meter baseline for this room first");
    res
      .status(201)
      .json({
        data: await service.draft(
          req.actor,
          meter.id,
          parse(draftSchema, input),
        ),
      });
  }),
);
r.get(
  "/readings/:id",
  asyncRoute(async (req, res) => {
    const reading = await service.readingFor(
      req.actor,
      parse(oid, req.params.id),
    );
    const asset = reading.meterPhotoFileId
      ? await M.FileAsset.findOne({
          _id: reading.meterPhotoFileId,
          organizationId: service.org(req.actor),
        }).select("originalName mime size createdAt createdBy")
      : null;
    const user = asset?.createdBy
      ? await M.User.findById(asset.createdBy).select("name")
      : null;
    res.json({
      data: {
        ...reading.toObject(),
        photo: asset
          ? {
              id: asset.id,
              name: asset.originalName,
              mime: asset.mime,
              size: asset.size,
              uploadedAt: asset.createdAt,
              uploadedBy: asset.createdBy,
              uploadedByName: user?.name || "User",
            }
          : null,
      },
    });
  }),
);
r.patch(
  "/readings/:id",
  owner,
  asyncRoute(async (req, res) => {
    const id = parse(oid, req.params.id),
      reading = await service.readingFor(req.actor, id);
    if (reading.status === "draft") {
      const b = parse(draftSchema, req.body);
      return res.json({
        data: await service.draft(req.actor, reading.meterId, b, id),
      });
    }
    const b = parse(
      z
        .object({
          current: unit,
          ratePaise: z
            .number()
            .int()
            .nonnegative()
            .refine(Number.isSafeInteger)
            .default(1000),
          readingDate: z.string(),
          reason: z.string().trim().min(8).max(1000),
          expectedRevision: z.number().int().positive(),
          meterPhotoFileId: oid.optional(),
        })
        .strict(),
      req.body,
    );
    res.json({ data: await service.correct(req.actor, id, b) });
  }),
);
r.post(
  "/readings/:id/finalize",
  owner,
  asyncRoute(async (req, res) => {
    res.json({
      data: await service.finalize(req.actor, parse(oid, req.params.id)),
    });
  }),
);
const upload = (req, res, next) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: R.maxPhotoBytes(), files: 1, fields: 0 },
  }).single("file")(req, res, (err) =>
    err
      ? next(
          Object.assign(
            new Error(
              err.code === "LIMIT_FILE_SIZE"
                ? "Meter photo exceeds the configured file size limit"
                : "Upload exactly one meter photo",
            ),
            { status: err.code === "LIMIT_FILE_SIZE" ? 413 : 400 },
          ),
        )
      : next(),
  );
r.post(
  "/readings/:id/photo",
  owner,
  upload,
  asyncRoute(async (req, res) => {
    res
      .status(201)
      .json({
        data: await service.uploadPhoto(
          req.actor,
          parse(oid, req.params.id),
          req.file,
        ),
      });
  }),
);
r.get(
  "/readings/:id/photo",
  asyncRoute(async (req, res) => {
    const { asset } = await service.authorizedPhoto(
      req.actor,
      parse(oid, req.params.id),
      req.query.fileId ? parse(oid, req.query.fileId) : undefined,
    );
    if (req.query.metadata === "1") {
      const user = asset.createdBy
        ? await M.User.findById(asset.createdBy).select("name")
        : null;
      return res.json({
        data: {
          fileId: asset.id,
          name: asset.originalName,
          mime: asset.mime,
          size: asset.size,
          uploadedAt: asset.createdAt,
          uploadedBy: asset.createdBy,
          uploadedByName: user?.name || "User",
        },
      });
    }
    const bytes = await storage.read(asset.storageKey);
    res.set({
      "Content-Type": asset.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": require("../../core/b5-rules").contentDisposition(
        asset.originalName,
        req.query.download !== "1",
      ),
    });
    res.send(bytes);
  }),
);
r.get(
  "/:meterId/previous-reading",
  owner,
  asyncRoute(async (req, res) => {
    const meter = await service.meterFor(
      req.actor,
      parse(oid, req.params.meterId),
    );
    const month = parse(
      z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      req.query.month,
    );
    const c = await service.context(
      req.actor,
      meter,
      month,
      null,
      req.query.invoiceId ? parse(oid, req.query.invoiceId) : undefined,
    );
    delete c.invoice;
    res.json({ data: c });
  }),
);
r.get(
  "/:meterId/readings",
  asyncRoute(async (req, res) => {
    const q = {
      meterId: parse(oid, req.params.meterId),
      organizationId: service.org(req.actor),
    };
    if (req.actor.role === "tenant") {
      q.tenantId = req.actor.tenantId;
      q.status = { $in: ["finalized", "correction"] };
    } else if (!["owner", "manager"].includes(req.actor.role))
      fail(403, "Forbidden");
    res.json({
      data: await M.MeterReading.find(q).sort({ month: -1 }).limit(500),
    });
  }),
);
r.post(
  "/:meterId/readings",
  owner,
  asyncRoute(async (req, res) =>
    res
      .status(201)
      .json({
        data: await service.draft(
          req.actor,
          parse(oid, req.params.meterId),
          parse(draftSchema, req.body),
        ),
      }),
  ),
);
r.post(
  "/:meterId/handover",
  roles("owner"),
  asyncRoute(async (req, res) => {
    const b = parse(
      z
        .object({
          tenancyId: oid,
          reading: unit,
          date: z.string(),
          reason: z.string().trim().min(8).max(1000),
        })
        .strict(),
      req.body,
    );
    res.json({
      data: await service.handover(
        req.actor,
        parse(oid, req.params.meterId),
        b,
      ),
    });
  }),
);
module.exports = r;
