"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status";
import {
  downloadMeterFile,
  meterApi,
  meterBlob,
  type MeterReading,
} from "./api";
const currency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
export function PrivateMeterPhoto({
  readingId,
  fileId,
  label = "View meter photo",
}: {
  readingId: string;
  fileId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      objectUrl = "";
    if (open) {
      setError("");
      meterBlob(
        "/api/meters/readings/" +
          readingId +
          "/photo" +
          (fileId ? "?fileId=" + fileId : ""),
      )
        .then((blob) => {
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setUrl(objectUrl);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, readingId, fileId]);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-sm font-semibold text-teal-700 underline"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide photo" : label}
      </button>
      {open &&
        (error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : url ? (
          <div className="space-y-2">
            <Image
              unoptimized
              width={640}
              height={480}
              src={url}
              alt="Authorized monthly meter reference"
              className="max-h-64 w-auto max-w-full rounded-xl border bg-white object-contain"
            />
            <a
              href={url}
              download={"meter-" + readingId}
              className="text-xs font-semibold text-teal-700 underline"
            >
              Download authorized photo
            </a>
          </div>
        ) : (
          <p role="status" className="text-xs text-slate-500">
            Loading private photo…
          </p>
        ))}
    </div>
  );
}
export function MeterHistory({
  roomId,
  role = "owner",
  onSelect,
  refreshKey = 0,
}: {
  roomId?: string;
  role?: "owner" | "tenant";
  onSelect?: (reading: MeterReading) => void;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<MeterReading[]>([]),
    [property, setProperty] = useState(""),
    [room, setRoom] = useState(roomId || ""),
    [month, setMonth] = useState(""),
    [year, setYear] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams();
    if (room) query.set("roomId", room);
    if (property) query.set("propertyId", property);
    if (month) query.set("month", month);
    if (year) query.set("year", year);
    meterApi
      .history(query.toString())
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [room, property, month, year, refreshKey]);
  const [downloadError, setDownloadError] = useState("");
  const properties = Array.from(
    new Map(
      rows.map((r) => [r.propertyId, r.propertyName || r.propertyId.slice(-6)]),
    ).entries(),
  );
  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
      aria-label="Monthly electricity history"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Monthly electricity history</h3>
          <p className="mt-1 text-xs text-slate-500">
            Room meter history remains available after tenant move-out. Amounts
            preserve their original rates.
          </p>
        </div>
        <StatusBadge status="info" label="Private reference photos" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium">
          Property
          <select
            aria-label="Meter history property"
            className="mt-1 w-full rounded-lg border p-2"
            value={property}
            onChange={(e) => setProperty(e.target.value)}
          >
            <option value="">All properties</option>
            {properties.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Room scope
          <select
            aria-label="Meter history room"
            className="mt-1 w-full rounded-lg border p-2"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          >
            <option value="">All authorized rooms</option>
            {roomId && <option value={roomId}>Selected invoice room</option>}
            {Array.from(
              new Map(
                rows.map((r) => [r.roomId, r.roomNumber || r.roomId.slice(-6)]),
              ).entries(),
            )
              .filter(([id]) => id !== roomId)
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Month
          <input
            aria-label="Meter history month"
            type="month"
            className="mt-1 w-full rounded-lg border p-2"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium">
          Year
          <input
            aria-label="Meter history year"
            type="number"
            min="1900"
            max="9999"
            className="mt-1 w-full rounded-lg border p-2"
            placeholder="All years"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
      </div>
      {(error || downloadError) && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error || downloadError}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-slate-500">
          Loading monthly records…
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead>
              <tr>
                {[
                  "Month",
                  "Property / room",
                  "Tenant",
                  "Previous → current",
                  "Units",
                  "Rate / unit",
                  "Electricity",
                  "Date",
                  "Photo",
                  "Invoice",
                  "Status",
                  "Actions",
                ].map((label) => (
                  <th key={label} className="border-b p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td className="border-b p-2">{row.month}</td>
                  <td className="border-b p-2">
                    {row.propertyName || row.propertyId.slice(-6)} /{" "}
                    {row.roomNumber || row.roomId.slice(-6)}
                  </td>
                  <td className="border-b p-2">
                    {row.tenantName || "Legacy / unallocated"}
                  </td>
                  <td className="border-b p-2 tabular-nums">
                    {row.previous} → {row.current}
                  </td>
                  <td className="border-b p-2">
                    {row.consumedUnits ?? row.current - row.previous}
                  </td>
                  <td className="border-b p-2">{currency(row.ratePaise)}</td>
                  <td className="border-b p-2 font-semibold">
                    {currency(row.amountPaise)}
                  </td>
                  <td className="border-b p-2">
                    {row.readingDate || row.createdAt?.slice(0, 10)}
                  </td>
                  <td className="border-b p-2">
                    {row.meterPhotoFileId ? (
                      <PrivateMeterPhoto
                        readingId={row._id}
                        fileId={row.meterPhotoFileId}
                      />
                    ) : (
                      <span className="text-slate-500">No photo</span>
                    )}
                  </td>
                  <td className="border-b p-2">
                    {row.relatedInvoiceId ? (
                      <Link
                        className="text-teal-700 underline"
                        href={
                          role === "owner"
                            ? "/owner/invoices?meterInvoice=" +
                              row.relatedInvoiceId
                            : "/tenant/invoices"
                        }
                      >
                        View invoice
                      </Link>
                    ) : (
                      "Not linked"
                    )}
                  </td>
                  <td className="border-b p-2">
                    <StatusBadge status={row.status || "legacy"} />
                  </td>
                  <td className="space-y-2 border-b p-2">
                    {onSelect && row.meterId && row.roomId === roomId && (
                      <button
                        type="button"
                        className="block text-teal-700 underline"
                        onClick={() => onSelect(row)}
                      >
                        {row.status === "draft"
                          ? "Edit draft"
                          : "View / correct"}
                      </button>
                    )}
                    {row.relatedInvoiceId && row.invoiceRevision && (
                      <button
                        type="button"
                        className="block text-teal-700 underline"
                        onClick={() => {
                          setDownloadError("");
                          downloadMeterFile(
                            `/api/invoices/${row.relatedInvoiceId}/pdf-preview?revision=${row.invoiceRevision}&detailed=1`,
                            "electricity-" + row.month + ".pdf",
                          ).catch((e) => setDownloadError(e.message));
                        }}
                      >
                        Monthly PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-4 text-sm text-slate-500">
              No meter readings match these filters.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
