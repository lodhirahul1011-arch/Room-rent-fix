const test = require("node:test"),
  assert = require("node:assert/strict");
const { start } = require("./helpers/meter-harness.cjs");
test(
  "Meter billing: real replica-set transactions, private photo bytes and immutable revisions",
  { timeout: 180000 },
  async (t) => {
    const h = await start(),
      {
        M,
        call,
        owner,
        otherOwner,
        tenantActor,
        otherTenantActor,
        manager,
        room,
        tenancy,
        organization,
        tenant,
        photo,
      } = h;
    let meter, oct, nov, octReading, novReading, oldPhoto, newPhoto;
    const ok = (r, status = 200) => {
      assert.equal(r.status, status, JSON.stringify(r.body));
      return r.body.data;
    };
    const generate = async (month) =>
      ok(
        await call("POST", "/api/invoices/generate", owner.token, {
          month,
          dueDay: 5,
        }),
        201,
      )[0];
    try {
      await t.test(
        "requires authentication and creates an audited first baseline",
        async () => {
          assert.equal((await call("GET", "/api/meters")).status, 401);
          meter = ok(
            await call("POST", "/api/meters", owner.token, {
              roomId: room.id,
              label: "Room 101 main meter",
              baselineReading: 1000,
              baselineDate: "2026-10-01",
              baselineReason: "Verified opening cumulative meter reading",
            }),
            201,
          );
          assert.equal(
            await M.AuditLog.countDocuments({
              event: "meter.baseline.created",
            }),
            1,
          );
          assert.equal(
            (
              await call("POST", "/api/meters", manager.token, {
                roomId: room.id,
                label: "Denied",
                baselineReading: 0,
                baselineDate: "2026-10-01",
                baselineReason: "Manager not allowed",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                "GET",
                `/api/meters/${meter._id}/previous-reading?month=2026-10`,
                otherOwner.token,
              )
            ).status,
            404,
          );
        },
      );
      await t.test(
        "saves a draft without charging and rejects overridden previous values",
        async () => {
          oct = await generate("2026-10");
          const body = {
            month: "2026-10",
            current: 1250,
            ratePaise: 1000,
            readingDate: "2026-10-31",
            relatedInvoiceId: oct._id,
          };
          assert.equal(
            (
              await call(
                "POST",
                `/api/meters/${meter._id}/readings`,
                owner.token,
                { ...body, previous: 0 },
              )
            ).status,
            409,
          );
          octReading = ok(
            await call(
              "POST",
              `/api/meters/${meter._id}/readings`,
              owner.token,
              body,
            ),
            201,
          );
          assert.equal(octReading.previous, 1000);
          assert.equal(octReading.amountPaise, 250000);
          assert.equal(
            await M.LedgerEntry.countDocuments({ sourceType: "charge" }),
            0,
          );
          assert.equal(
            (
              await call(
                "POST",
                `/api/meters/${meter._id}/readings`,
                owner.token,
                { ...body, current: 999 },
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        "rejects spoofed/oversized images and refuses fake success without permanent storage",
        async () => {
          assert.equal(
            (
              await h.upload(
                octReading._id,
                owner.token,
                Buffer.from("not an image"),
                "image/png",
              )
            ).status,
            400,
          );
          const before = process.env.METER_PHOTO_MAX_BYTES;
          process.env.METER_PHOTO_MAX_BYTES = "32";
          try {
            assert.equal((await h.upload(octReading._id)).status, 413);
          } finally {
            if (before === undefined) delete process.env.METER_PHOTO_MAX_BYTES;
            else process.env.METER_PHOTO_MAX_BYTES = before;
          }
          process.env.PRIVATE_STORAGE_DRIVER = "local";
          try {
            assert.equal((await h.upload(octReading._id)).status, 503);
          } finally {
            process.env.PRIVATE_STORAGE_DRIVER = "s3";
          }
          assert.equal(
            await M.FileAsset.countDocuments({ kind: "meter-photo" }),
            0,
          );
        },
      );
      await t.test(
        "stores actual private photo bytes; tenant cannot access a draft photo",
        async () => {
          oldPhoto = ok(await h.upload(octReading._id), 201);
          const downloaded = await call(
            "GET",
            `/api/meters/readings/${octReading._id}/photo`,
            owner.token,
          );
          assert.equal(downloaded.status, 200);
          assert.deepEqual(downloaded.body, photo);
          assert.equal(
            (
              await call(
                "GET",
                `/api/meters/readings/${octReading._id}/photo`,
                tenantActor.token,
              )
            ).status,
            404,
          );
          assert.ok(h.objects.size > 0);
        },
      );
      await t.test(
        "two simultaneous finalizations produce one charge and preserve original rent snapshot",
        async () => {
          const responses = await Promise.all([
            call(
              "POST",
              `/api/meters/readings/${octReading._id}/finalize`,
              owner.token,
              {},
            ),
            call(
              "POST",
              `/api/meters/readings/${octReading._id}/finalize`,
              owner.token,
              {},
            ),
          ]);
          for (const response of responses) ok(response);
          assert.equal(
            await M.LedgerEntry.countDocuments({
              invoiceId: oct._id,
              sourceType: "charge",
            }),
            1,
          );
          const balance = ok(
            await call("GET", `/api/invoices/${oct._id}/balance`, owner.token),
          );
          assert.equal(balance.totalPaise, 750000);
          const inv = await M.Invoice.findById(oct._id);
          assert.equal(inv.originalItems.length, 1);
          assert.equal(inv.originalItems[0].amountPaise, 500000);
          const revisions = ok(
            await call(
              "GET",
              `/api/invoices/${oct._id}/revisions`,
              owner.token,
            ),
          );
          assert.equal(revisions[0].totalPaise, 500000);
          assert.equal(revisions.at(-1).totalPaise, 750000);
        },
      );
      await t.test(
        "October 1250 is the November previous reading and 1380 produces 130 units / INR 1300",
        async () => {
          nov = await generate("2026-11");
          const c = ok(
            await call(
              "GET",
              `/api/meters/${meter._id}/previous-reading?month=2026-11&invoiceId=${nov._id}`,
              owner.token,
            ),
          );
          assert.equal(c.previousReading, 1250);
          novReading = ok(
            await call(
              "POST",
              `/api/meters/${meter._id}/readings`,
              owner.token,
              {
                month: "2026-11",
                current: 1380,
                ratePaise: 1000,
                readingDate: "2026-11-09",
                relatedInvoiceId: nov._id,
              },
            ),
            201,
          );
          assert.equal(novReading.consumedUnits, 130);
          assert.equal(novReading.amountPaise, 130000);
        },
      );
      await t.test(
        "partial rent payment remains reconciled when electricity is finalized",
        async () => {
          const payment = ok(
            await call("POST", "/api/payments", owner.token, {
              invoiceId: nov._id,
              amountPaise: 100000,
              method: "cash",
              reference: "METER-TEST-PARTIAL",
            }),
            201,
          );
          ok(
            await call(
              "POST",
              `/api/payments/${payment._id}/verify`,
              owner.token,
              {},
            ),
          );
          oldPhoto = ok(await h.upload(novReading._id), 201);
          ok(
            await call(
              "POST",
              `/api/meters/readings/${novReading._id}/finalize`,
              owner.token,
              {},
            ),
          );
          const b = ok(
            await call("GET", `/api/invoices/${nov._id}/balance`, owner.token),
          );
          assert.equal(b.totalPaise, 630000);
          assert.equal(b.paidPaise, 100000);
          assert.equal(b.balancePaise, 530000);
          const next = ok(
            await call(
              "GET",
              `/api/meters/${meter._id}/previous-reading?month=2026-12`,
              owner.token,
            ),
          );
          assert.equal(next.previousReading, 1380);
        },
      );
      await t.test(
        "owners and tenants cannot access another organization/tenant photo or record",
        async () => {
          for (const token of [otherOwner.token, otherTenantActor.token]) {
            assert.equal(
              (
                await call(
                  "GET",
                  `/api/meters/readings/${novReading._id}/photo`,
                  token,
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await call(
                  "GET",
                  `/api/files/${oldPhoto.fileId}/download`,
                  token,
                )
              ).status,
              404,
            );
          }
          const response = await call(
            "GET",
            `/api/meters/readings/${novReading._id}/photo`,
            tenantActor.token,
          );
          assert.equal(response.status, 200);
          assert.deepEqual(response.body, photo);
          const mine = ok(
            await call("GET", "/api/meters/readings", otherTenantActor.token),
          );
          assert.equal(mine.length, 0);
        },
      );
      await t.test(
        "archives a frozen PDF before an authorized electricity correction",
        async () => {
          const archive = ok(
            await call(
              "POST",
              `/api/invoices/${nov._id}/pdf?revision=2`,
              owner.token,
              {},
            ),
            201,
          );
          const data = await call(
            "GET",
            `/api/files/${archive.fileAssetId}/download`,
            owner.token,
          );
          assert.equal(data.body.subarray(0, 5).toString(), "%PDF-");
          const frozen = ok(
            await call(
              "GET",
              `/api/invoices/${nov._id}/revisions`,
              owner.token,
            ),
          );
          assert.equal(frozen[1].meterDetails[0].current, 1380);
          newPhoto = ok(await h.upload(novReading._id), 201);
          assert.equal(newPhoto.pendingCorrection, true);
          assert.equal(
            (
              await call(
                "GET",
                `/api/meters/readings/${novReading._id}/photo?fileId=${newPhoto.fileId}`,
                tenantActor.token,
              )
            ).status,
            404,
          );
        },
      );
      await t.test(
        "correction preserves photo/audit history, rates, revisions and original invoice",
        async () => {
          const body = {
            current: 1390,
            ratePaise: 1000,
            readingDate: "2026-11-09",
            reason:
              "Verified corrected cumulative display against reference photo",
            expectedRevision: 1,
            meterPhotoFileId: newPhoto.fileId,
          };
          assert.equal(
            (
              await call(
                "PATCH",
                `/api/meters/readings/${novReading._id}`,
                manager.token,
                body,
              )
            ).status,
            403,
          );
          const result = ok(
            await call(
              "PATCH",
              `/api/meters/readings/${novReading._id}`,
              owner.token,
              body,
            ),
          );
          assert.equal(result.reading.status, "correction");
          assert.equal(result.reading.amountPaise, 140000);
          assert.equal(result.balance.balancePaise, 540000);
          assert.equal(result.reading.corrections[0].current, 1380);
          assert.equal(
            result.reading.corrections[0].meterPhotoFileId,
            oldPhoto.fileId,
          );
          assert.equal(
            (
              await call(
                "PATCH",
                `/api/meters/readings/${novReading._id}`,
                owner.token,
                body,
              )
            ).status,
            409,
          );
          const revisions = ok(
            await call(
              "GET",
              `/api/invoices/${nov._id}/revisions`,
              owner.token,
            ),
          );
          assert.equal(revisions[1].meterDetails[0].current, 1380);
          assert.equal(revisions[2].meterDetails[0].current, 1390);
          assert.equal(revisions[0].totalPaise, 500000);
          assert.equal(
            (
              await call(
                "GET",
                `/api/meters/readings/${novReading._id}/photo?fileId=${oldPhoto.fileId}`,
                tenantActor.token,
              )
            ).status,
            200,
          );
          assert.equal(
            await M.AuditLog.countDocuments({
              event: "meter.reading.corrected",
            }),
            1,
          );
        },
      );
      await t.test(
        "detailed monthly PDF includes an authorized photo without changing the archived revision",
        async () => {
          const standard = await call(
              "GET",
              `/api/invoices/${nov._id}/pdf-preview?revision=2`,
              tenantActor.token,
            ),
            detailed = await call(
              "GET",
              `/api/invoices/${nov._id}/pdf-preview?revision=2&detailed=1`,
              tenantActor.token,
            );
          assert.equal(detailed.status, 200);
          assert.equal(detailed.body.subarray(0, 5).toString(), "%PDF-");
          assert.ok(detailed.body.length > standard.body.length);
          assert.equal(
            (
              await call(
                "GET",
                `/api/invoices/${nov._id}/pdf-preview?detailed=1`,
                otherTenantActor.token,
              )
            ).status,
            404,
          );
          const archived = await call(
            "POST",
            `/api/invoices/${nov._id}/pdf?revision=2`,
            owner.token,
            {},
          );
          assert.equal(archived.status, 200);
          assert.equal(archived.body.existing, true);
        },
      );
      await t.test(
        "blocks backwards chain corrections, duplicate charges and invalid billing dates",
        async () => {
          assert.equal(
            (
              await call(
                "PATCH",
                `/api/meters/readings/${octReading._id}`,
                owner.token,
                {
                  current: 1260,
                  ratePaise: 1000,
                  readingDate: "2026-10-31",
                  reason: "Cannot invalidate the later finalized month",
                  expectedRevision: 1,
                },
              )
            ).status,
            409,
          );
          const before = await M.LedgerEntry.countDocuments({
            sourceType: "charge",
          });
          ok(
            await call(
              "POST",
              `/api/meters/readings/${novReading._id}/finalize`,
              owner.token,
              {},
            ),
          );
          assert.equal(
            await M.LedgerEntry.countDocuments({ sourceType: "charge" }),
            before,
          );
          assert.equal(
            (
              await call(
                "POST",
                `/api/meters/${meter._id}/readings`,
                owner.token,
                {
                  month: "2026-12",
                  current: 1400,
                  ratePaise: 1000,
                  readingDate: "2026-12-32",
                  relatedInvoiceId: nov._id,
                },
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        "tenant turnover requires an audited handover and never charges prior-tenant electricity to the new tenant",
        async () => {
          const room2 = await M.Room.create({
            organizationId: organization.id,
            propertyId: h.property.id,
            floorId: h.floor.id,
            number: "102",
            rentPaise: 500000,
          });
          const priorTenant = await M.Tenant.create({
              organizationId: organization.id,
              name: "Prior tenant",
            }),
            newTenant = await M.Tenant.create({
              organizationId: organization.id,
              name: "New tenant",
            });
          await M.Tenancy.create({
            organizationId: organization.id,
            roomId: room2.id,
            tenantId: priorTenant.id,
            moveIn: "2026-08-01",
            moveOut: "2026-09-15",
            status: "ended",
          });
          const newLease = await M.Tenancy.create({
            organizationId: organization.id,
            roomId: room2.id,
            tenantId: newTenant.id,
            moveIn: "2026-09-20",
            status: "active",
          });
          const m = ok(
            await call("POST", "/api/meters", owner.token, {
              roomId: room2.id,
              label: "Handover test",
              baselineReading: 1000,
              baselineDate: "2026-09-01",
              baselineReason: "Known initial reading before tenant turnover",
            }),
            201,
          );
          const generated = ok(
            await call("POST", "/api/invoices/generate", owner.token, {
              month: "2026-09",
              dueDay: 5,
            }),
            201,
          );
          const inv = generated.find(
            (i) => String(i.tenancyId) === newLease.id,
          );
          const body = {
            month: "2026-09",
            current: 1130,
            ratePaise: 1000,
            readingDate: "2026-09-30",
            relatedInvoiceId: inv._id,
          };
          assert.equal(
            (
              await call(
                "POST",
                `/api/meters/${m._id}/readings`,
                owner.token,
                body,
              )
            ).status,
            409,
          );
          ok(
            await call("POST", `/api/meters/${m._id}/handover`, owner.token, {
              tenancyId: newLease.id,
              reading: 1100,
              date: "2026-09-20",
              reason: "Signed cumulative meter handover on move-in",
            }),
          );
          const draft = ok(
            await call(
              "POST",
              `/api/meters/${m._id}/readings`,
              owner.token,
              body,
            ),
            201,
          );
          assert.equal(draft.previous, 1100);
          assert.equal(draft.amountPaise, 30000);
          assert.equal(String(draft.tenantId), newTenant.id);
        },
      );
      await t.test(
        "room and photo history survive move-out and notification delivery is scoped",
        async () => {
          await M.Tenancy.updateOne(
            { _id: tenancy.id },
            { $set: { status: "ended", moveOut: "2026-11-09" } },
          );
          const history = ok(
            await call(
              "GET",
              `/api/rooms/${room.id}/electricity-history`,
              tenantActor.token,
            ),
          );
          assert.equal(history.length, 2);
          assert.equal(
            (
              await call(
                "GET",
                `/api/meters/readings/${octReading._id}/photo`,
                tenantActor.token,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await call(
                "GET",
                `/api/meters/readings?roomId=${room.id}&year=2026`,
                owner.token,
              )
            ).body.data.length,
            2,
          );
          const notifications = ok(
            await call("GET", "/api/notifications", tenantActor.token),
          );
          assert.ok(notifications.some((n) => n.type === "electricity"));
          assert.equal(
            ok(await call("GET", "/api/notifications", otherTenantActor.token))
              .length,
            0,
          );
        },
      );
      await t.test(
        "scheduled billing reuses rent/revision rules and never charges an unfinalized meter draft",
        async () => {
          const room3 = await M.Room.create({
            organizationId: organization.id,
            propertyId: h.property.id,
            floorId: h.floor.id,
            number: "103",
            rentPaise: 500000,
          });
          const person = await M.Tenant.create({
            organizationId: organization.id,
            name: "Worker tenant",
          });
          const lease = await M.Tenancy.create({
            organizationId: organization.id,
            roomId: room3.id,
            tenantId: person.id,
            moveIn: "2026-08-01",
            status: "active",
          });
          await M.MeterReading.create({
            organizationId: organization.id,
            roomId: room3.id,
            propertyId: h.property.id,
            meterId: new h.mongoose.Types.ObjectId(),
            month: "2026-08",
            previous: 0,
            current: 100,
            ratePaise: 1000,
            amountPaise: 100000,
            status: "draft",
          });
          const worker = require("../src/modules/jobs/service");
          await worker.billingForOrganization(organization.id, "2026-08", 5);
          const generated = await M.Invoice.findOne({
            tenancyId: lease.id,
            month: "2026-08",
          });
          assert.equal(generated.originalItems.length, 1);
          assert.equal(generated.originalItems[0].amountPaise, 500000);
          const revision = await M.InvoiceRevision.findOne({
            invoiceId: generated.id,
          });
          assert.equal(revision.totalPaise, 500000);
          assert.equal(revision.meterDetails.length, 0);
          const rerun = await worker.billingForOrganization(
            organization.id,
            "2026-08",
            5,
          );
          assert.equal(rerun.created, 0);
        },
      );
    } finally {
      await h.stop();
    }
  },
);
