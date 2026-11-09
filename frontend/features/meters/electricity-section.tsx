"use client";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { StatusBadge } from "@/components/ui/status";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { LIVE_MODE, currentSession } from "@/services/live/api";
import {
  meterApi,
  type Meter,
  type MeterReading,
  type MeterContext,
  type MeterInvoice,
} from "./api";
import { previewMeterCharge } from "./preview";
import { MeterHistory, PrivateMeterPhoto } from "./history";
const schema = z.object({
  current: z
    .number({ invalid_type_error: "Enter the current reading" })
    .finite()
    .nonnegative()
    .multipleOf(0.001),
  rate: z
    .number({ invalid_type_error: "Enter a valid rate" })
    .finite()
    .nonnegative()
    .multipleOf(0.01),
  readingDate: z.string().min(10, "Select the reading date"),
  reason: z.string().optional(),
});
const baselineSchema = z.object({
  label: z.string().trim().min(1),
  baselineReading: z
    .number({ invalid_type_error: "Enter the initial baseline" })
    .finite()
    .nonnegative()
    .multipleOf(0.001),
  baselineDate: z.string().min(10),
  baselineReason: z
    .string()
    .trim()
    .min(5, "Explain how the initial baseline was verified"),
});
type Values = z.infer<typeof schema>;
type Baseline = z.infer<typeof baselineSchema>;
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
const input =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 read-only:bg-slate-100";
const button =
  "rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
export function ElectricityMeterSection({
  invoice,
  onInvoiceChanged,
  mockFallback,
}: {
  invoice: MeterInvoice;
  onInvoiceChanged?: () => void | Promise<void>;
  mockFallback?: ReactNode;
}) {
  if (!LIVE_MODE)
    return (
      <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <h3 className="text-lg font-semibold">
          Monthly electricity meter billing
        </h3>
        <p className="text-sm leading-6 text-amber-900">
          Secure monthly readings, private photos and invoice revisions require
          a live MongoDB invoice and authenticated owner session. This workspace
          is currently in browser mode; it cannot upload permanent meter photos
          or finalize server-side electricity bills.
        </p>
        {mockFallback && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-teal-800">
              Existing browser-only electricity calculator
            </summary>
            <div className="mt-4">{mockFallback}</div>
          </details>
        )}
      </section>
    );
  return (
    <LiveElectricitySection
      key={meterApi.invoiceId(invoice)}
      invoice={invoice}
      onInvoiceChanged={onInvoiceChanged}
    />
  );
}
function LiveElectricitySection({
  invoice,
  onInvoiceChanged,
}: {
  invoice: MeterInvoice;
  onInvoiceChanged?: () => void | Promise<void>;
}) {
  const [meter, setMeter] = useState<Meter | null>(null),
    [record, setRecord] = useState<MeterReading | null>(null),
    [previous, setPrevious] = useState<MeterContext | null>(null),
    [config, setConfig] = useState<{
      durableStorageConfigured: boolean;
      photoMaxBytes: number;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [history, setHistory] = useState(false),
    [historyVersion, setHistoryVersion] = useState(0),
    [correcting, setCorrecting] = useState(false),
    [confirm, setConfirm] = useState(false),
    [handover, setHandover] = useState({ reading: "", date: "", reason: "" });
  const sequence = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      current: undefined,
      rate: 10,
      readingDate: invoice.month + "-01",
      reason: "",
    },
  });
  const baseline = useForm<Baseline>({
    resolver: zodResolver(baselineSchema),
    defaultValues: {
      label: "Room electricity meter",
      baselineReading: undefined,
      baselineDate: invoice.month + "-01",
      baselineReason: "",
    },
  });
  const resetForm = form.reset;
  const reload = useCallback(
    async (preferredId?: string) => {
      const seq = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        if (!invoice.roomId) throw Error("Invoice is not linked to a room");
        const [meters, cfg, rows] = await Promise.all([
          meterApi.list(invoice.roomId),
          meterApi.config(),
          meterApi.history("roomId=" + invoice.roomId),
        ]);
        if (seq !== sequence.current) return;
        const selected = preferredId
          ? rows.find((r) => r._id === preferredId)
          : rows.find(
              (r) =>
                r.month === invoice.month &&
                r.relatedInvoiceId === meterApi.invoiceId(invoice),
            );
        const active =
          meters.find((m) => m._id === selected?.meterId) || meters[0] || null;
        let context: MeterContext | null = null,
          details: MeterReading | null = null;
        if (active)
          context = await meterApi.previous(
            active._id,
            selected?.month || invoice.month,
            selected && selected.status !== "draft"
              ? ""
              : selected?.relatedInvoiceId || meterApi.invoiceId(invoice),
          );
        if (selected) details = await meterApi.reading(selected._id);
        if (seq !== sequence.current) return;
        setMeter(active);
        setConfig(cfg);
        setPrevious(context);
        setRecord(details);
        setCorrecting(false);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        resetForm({
          current: details?.current,
          rate: (details?.ratePaise ?? 1000) / 100,
          readingDate:
            details?.readingDate ||
            (new Date()
              .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
              .startsWith(invoice.month)
              ? new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Kolkata",
                })
              : invoice.month + "-01"),
          reason: "",
        });
      } catch (e) {
        if (seq === sequence.current)
          setError(
            e instanceof Error ? e.message : "Could not load meter data",
          );
      } finally {
        if (seq === sequence.current) setLoading(false);
      }
    },
    [invoice, resetForm],
  );
  useEffect(() => {
    void reload();
    return () => {
      sequence.current += 1;
    };
  }, [reload]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const values = form.watch(),
    locked = !!record && record.status !== "draft",
    readOnly = locked && !correcting;
  const prior = locked ? record.previous : previous?.previousReading;
  const previewCharge = previewMeterCharge(prior, values.current, values.rate);
  const consumed = previewCharge.units,
    amount = previewCharge.amountPaise;
  const month = record?.month || invoice.month;
  async function save(kind: "draft" | "finalize") {
    if (busy || !meter || prior === undefined) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const valid = schema.parse(form.getValues());
      if (valid.current < prior)
        throw Error(
          "Current reading cannot be less than the previous cumulative reading.",
        );
      if (file && !config?.durableStorageConfigured)
        throw Error(
          "Permanent private storage is not configured. The selected photo has not been uploaded.",
        );
      if (kind === "finalize" && !file && !record?.meterPhotoFileId)
        throw Error(
          "Select and upload a meter reference photo before finalizing.",
        );
      let saved: MeterReading;
      if (correcting && record) {
        if ((valid.reason || "").trim().length < 8)
          throw Error("Provide an audit reason of at least 8 characters");
        const photo = file ? await meterApi.photo(record._id, file) : null;
        const result = await meterApi.correct(record._id, {
          current: valid.current,
          ratePaise: Math.round(valid.rate * 100),
          readingDate: valid.readingDate,
          reason: valid.reason,
          expectedRevision: record.revision,
          ...(photo ? { meterPhotoFileId: photo.fileId } : {}),
        });
        saved = result.reading;
        setNotice(
          "Correction confirmed by the backend. A new invoice revision and ledger adjustment were created.",
        );
      } else {
        saved = await meterApi.draft(
          meter._id,
          {
            month,
            current: valid.current,
            ratePaise: Math.round(valid.rate * 100),
            readingDate: valid.readingDate,
            relatedInvoiceId:
              record?.relatedInvoiceId || meterApi.invoiceId(invoice),
            ...(record ? { expectedVersion: record.draftVersion } : {}),
          },
          record?._id,
        );
        if (file) await meterApi.photo(saved._id, file);
        if (kind === "finalize") {
          const result = await meterApi.finalize(saved._id);
          saved = result.reading;
          setNotice(
            "Reading finalized by the backend. Electricity was added once to the linked invoice and digital ledger.",
          );
        } else
          setNotice(
            "Draft saved by the backend. No electricity charge has been posted yet.",
          );
      }
      window.dispatchEvent(new Event("roomrent:meter-updated"));
      setConfirm(false);
      setHistoryVersion((v) => v + 1);
      await reload(saved._id);
      await onInvoiceChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save meter reading");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-5 rounded-2xl border border-teal-200 bg-white p-5 sm:p-6"
      aria-label="Electricity meter reading"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal-700">
            Room utilities / Monthly electricity
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">
            Electricity meter reading
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {meter?.label ||
              "Room " + (invoice.roomId?.slice(-6) || "unavailable")}{" "}
            · Billing month {month}
            {meter?.roomNumber && (
              <>
                {" "}
                · {meter.propertyName} / Room {meter.roomNumber}
                {meter.floorName ? " / " + meter.floorName : ""}
              </>
            )}
          </p>
        </div>
        <StatusBadge
          status={record?.status || "new"}
          label={
            record?.status
              ? record.status === "correction"
                ? "Corrected · audited"
                : record.status === "finalized"
                  ? "Finalized"
                  : "Draft"
              : "Not recorded"
          }
        />
      </header>
      {loading ? (
        <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">
          Loading the latest preceding meter reading…
        </p>
      ) : (
        <>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {notice}
            </p>
          )}
          {!config?.durableStorageConfigured && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Permanent private photo storage is not configured. Drafts without
              photos can be saved; photo upload and finalization require the
              S3-compatible storage settings.
            </p>
          )}
          {!meter ? (
            <form
              className="space-y-4 rounded-xl bg-slate-50 p-4"
              onSubmit={baseline.handleSubmit(async (values) => {
                setBusy(true);
                setError("");
                try {
                  await meterApi.create({ roomId: invoice.roomId, ...values });
                  setNotice(
                    "Initial cumulative baseline saved with an audit record.",
                  );
                  await reload();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not initialize meter",
                  );
                } finally {
                  setBusy(false);
                }
              })}
            >
              <h4 className="font-semibold">
                Record the initial meter baseline
              </h4>
              <p className="text-xs leading-5 text-slate-500">
                The first cumulative reading must be explicitly verified. It is
                never assumed to be zero.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Meter label
                  <input
                    aria-label="Meter label"
                    className={input}
                    {...baseline.register("label")}
                  />
                </label>
                <label className="text-sm">
                  Initial cumulative reading
                  <input
                    aria-label="Initial meter baseline"
                    type="number"
                    min="0"
                    step="0.001"
                    className={input}
                    {...baseline.register("baselineReading", {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="text-sm">
                  Baseline date
                  <input
                    aria-label="Baseline date"
                    type="date"
                    className={input}
                    {...baseline.register("baselineDate")}
                  />
                </label>
                <label className="text-sm">
                  Verification / audit reason
                  <input
                    aria-label="Baseline audit reason"
                    className={input}
                    {...baseline.register("baselineReason")}
                  />
                </label>
              </div>
              {Object.values(baseline.formState.errors).map((e, i) => (
                <p className="text-xs text-red-700" key={i}>
                  {e.message}
                </p>
              ))}
              <button
                disabled={busy || currentSession()?.role !== "owner"}
                className={button}
                data-action-tone="success"
              >
                {busy ? "Saving baseline…" : "Save audited baseline"}
              </button>
            </form>
          ) : (
            <>
              <form
                className="space-y-5"
                onSubmit={form.handleSubmit(() => save("draft"))}
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm font-medium">
                    Previous reading
                    <input
                      aria-label="Automatic previous reading"
                      className={input}
                      readOnly
                      value={prior ?? ""}
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {record?.intervalStart ||
                        previous?.previousReadingDate ||
                        "Loading baseline"}{" "}
                      · server calculated
                    </span>
                  </label>
                  <label className="text-sm font-medium">
                    Current reading
                    <input
                      aria-label="Current meter reading"
                      type="number"
                      min={prior ?? 0}
                      step="0.001"
                      readOnly={readOnly}
                      className={input}
                      {...form.register("current", { valueAsNumber: true })}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Rate per unit (₹)
                    <input
                      aria-label="Electricity rate per unit"
                      type="number"
                      min="0"
                      step="0.01"
                      readOnly={readOnly}
                      className={input}
                      {...form.register("rate", { valueAsNumber: true })}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Reading date
                    <input
                      aria-label="Meter reading date"
                      type="date"
                      readOnly={readOnly}
                      className={input}
                      {...form.register("readingDate")}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Consumed units</p>
                    <output
                      aria-label="Consumed units"
                      className="mt-2 block text-2xl font-semibold tabular-nums"
                    >
                      {consumed === null
                        ? "—"
                        : consumed < 0
                          ? "Invalid reading"
                          : consumed + " kWh"}
                    </output>
                  </div>
                  <div className="rounded-xl border border-teal-100 bg-teal-50 p-4">
                    <p className="text-xs text-teal-800">
                      Electricity charge preview
                    </p>
                    <output
                      aria-label="Electricity charge"
                      className="mt-2 block text-2xl font-semibold tabular-nums text-teal-950"
                    >
                      {amount === null ? "—" : money(amount)}
                    </output>
                    <p className="mt-1 text-xs text-teal-700">
                      Current − previous, multiplied by the saved rate. Amounts
                      are stored in integer paise.
                    </p>
                  </div>
                </div>
                {!readOnly && (
                  <label className="block text-sm font-medium">
                    Meter Reference Photo
                    <input
                      ref={fileInput}
                      aria-label="Meter reference photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className={input}
                      onChange={(e) => {
                        setError("");
                        const selected = e.target.files?.[0] || null;
                        if (
                          selected &&
                          (!["image/jpeg", "image/png", "image/webp"].includes(
                            selected.type,
                          ) ||
                            selected.size > (config?.photoMaxBytes || 5242880))
                        ) {
                          setError(
                            "Select a JPEG, PNG or WebP photo up to the configured size limit",
                          );
                          e.target.value = "";
                          setFile(null);
                          return;
                        }
                        setFile(selected);
                      }}
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Actual photo bytes are uploaded privately · max{" "}
                      {Math.round((config?.photoMaxBytes || 5242880) / 1048576)}{" "}
                      MB · replace selection before saving
                    </span>
                  </label>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {preview && (
                    <figure>
                      <Image
                        unoptimized
                        width={640}
                        height={480}
                        src={preview}
                        alt="Selected unsaved meter reference"
                        className="max-h-64 w-auto max-w-full rounded-xl border object-contain"
                      />
                      <figcaption className="mt-2 text-xs text-slate-500">
                        Unsaved selection: {file?.name}
                      </figcaption>
                    </figure>
                  )}
                  {record?.meterPhotoFileId && (
                    <div className="space-y-2">
                      <PrivateMeterPhoto
                        readingId={record._id}
                        fileId={record.meterPhotoFileId}
                        label="Open saved current meter photo"
                      />
                      {record.photo && (
                        <p className="text-xs text-slate-500">
                          Uploaded{" "}
                          {new Date(record.photo.uploadedAt).toLocaleString(
                            "en-IN",
                          )}{" "}
                          by {record.photo.uploadedByName}
                        </p>
                      )}
                    </div>
                  )}
                  {previous?.previousPhotoFileId &&
                    previous.previousReadingId && (
                      <PrivateMeterPhoto
                        readingId={previous.previousReadingId}
                        fileId={previous.previousPhotoFileId}
                        label="Open previous meter photo"
                      />
                    )}
                </div>
                {correcting && (
                  <label className="block text-sm font-medium">
                    Correction reason
                    <textarea
                      aria-label="Meter correction reason"
                      className={input}
                      {...form.register("reason")}
                      placeholder="Explain the correction; existing readings, photos and invoice revisions remain in the audit history."
                    />
                  </label>
                )}
                {Object.values(form.formState.errors).map((e, i) => (
                  <p className="text-xs text-red-700" key={i}>
                    {e.message}
                  </p>
                ))}
                {consumed !== null && consumed < 0 && (
                  <p role="alert" className="text-sm text-red-700">
                    The cumulative reading decreased. Use an explicit meter
                    replacement/rollover workflow instead of resetting it.
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {!readOnly && !correcting && (
                    <button
                      disabled={busy}
                      className={button}
                      type="submit"
                      data-action-tone="info"
                    >
                      {busy ? "Saving…" : "Save Draft"}
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      disabled={
                        busy ||
                        consumed === null ||
                        consumed < 0 ||
                        !config?.durableStorageConfigured
                      }
                      type="button"
                      className={button}
                      data-action-tone="success"
                      onClick={() =>
                        void form.handleSubmit(() => setConfirm(true))()
                      }
                    >
                      {correcting ? "Review correction" : "Finalize Reading"}
                    </button>
                  )}
                  {readOnly && currentSession()?.role === "owner" && (
                    <button
                      type="button"
                      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900"
                      onClick={() => setCorrecting(true)}
                    >
                      Edit / Correct Reading
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-teal-800"
                    onClick={() => setHistory(!history)}
                  >
                    {history ? "Hide monthly history" : "View Monthly History"}
                  </button>
                </div>
              </form>
              {currentSession()?.role === "owner" && invoice.tenancyId && (
                <details className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Record a tenant handover baseline
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Use only a physically verified cumulative reading on the
                    selected tenancy move-in date. Earlier tenant/vacancy usage
                    is excluded explicitly, never prorated.
                  </p>
                  <form
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      setError("");
                      try {
                        await meterApi.handover(meter._id, {
                          tenancyId: invoice.tenancyId,
                          reading: Number(handover.reading),
                          date: handover.date,
                          reason: handover.reason,
                        });
                        await reload();
                        setNotice(
                          "Handover baseline confirmed and audited by the backend.",
                        );
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not save handover",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label className="text-xs">
                      Cumulative handover reading
                      <input
                        required
                        type="number"
                        step=".001"
                        min="0"
                        className={input}
                        value={handover.reading}
                        onChange={(e) =>
                          setHandover((s) => ({
                            ...s,
                            reading: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Move-in / handover date
                      <input
                        required
                        type="date"
                        className={input}
                        value={handover.date}
                        onChange={(e) =>
                          setHandover((s) => ({ ...s, date: e.target.value }))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Audit reason
                      <input
                        required
                        minLength={8}
                        className={input}
                        value={handover.reason}
                        onChange={(e) =>
                          setHandover((s) => ({ ...s, reason: e.target.value }))
                        }
                      />
                    </label>
                    <button disabled={busy} className={button}>
                      Save handover baseline
                    </button>
                  </form>
                </details>
              )}
              {record?.corrections?.length ? (
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Correction audit trail ({record.corrections.length})
                  </summary>
                  {record.corrections.map((c, i) => (
                    <article
                      key={i}
                      className="space-y-2 border-t py-3 text-xs"
                    >
                      <p>
                        {c.previous} → {c.current} · {money(c.amountPaise)} ·
                        invoice revision {c.invoiceRevision}
                      </p>
                      <p>
                        {c.reason} ·{" "}
                        {new Date(c.correctedAt).toLocaleString("en-IN")}
                      </p>
                      {c.meterPhotoFileId && (
                        <PrivateMeterPhoto
                          readingId={record._id}
                          fileId={c.meterPhotoFileId}
                          label="View preserved historical photo"
                        />
                      )}
                    </article>
                  ))}
                </details>
              ) : null}
            </>
          )}
          {history && (
            <MeterHistory
              roomId={invoice.roomId}
              refreshKey={historyVersion}
              onSelect={(r) => void reload(r._id)}
            />
          )}
        </>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {correcting
                ? "Confirm audited electricity correction"
                : "Finalize monthly electricity charge?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {correcting
                ? "A new ledger adjustment and immutable invoice revision will be created. Original snapshots and photos remain unchanged."
                : "This will post " +
                  (amount === null ? "the electricity amount" : money(amount)) +
                  " once to the linked rent invoice and digital ledger. Finalized readings can only be changed through an audited owner correction."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void save("finalize");
              }}
            >
              {busy
                ? "Confirming with backend…"
                : correcting
                  ? "Confirm correction"
                  : "Confirm finalization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
