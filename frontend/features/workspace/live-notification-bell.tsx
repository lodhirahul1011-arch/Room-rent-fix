"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { request, unwrap, json } from "@/services/live/api";
type Notice = {
  _id: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  type: string;
  relatedInvoiceId?: string;
  meterReadingId?: string;
};
export function LiveNotificationBell({
  role,
}: {
  role: "owner" | "tenant" | "admin";
}) {
  const [rows, setRows] = useState<Notice[]>([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setRows(await unwrap(request<Notice[]>("/api/notifications")));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notifications");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    window.addEventListener("roomrent:meter-updated", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("roomrent:meter-updated", update);
    };
  }, [refresh]);
  const unread = rows.filter((n) => !n.readAt).length;
  async function read(row: Notice) {
    try {
      await request(
        "/api/notifications/" + row._id + "/read",
        json("PATCH", {}),
      );
      setRows((s) =>
        s.map((n) =>
          n._id === row._id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not mark notification read",
      );
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={"Notifications" + (unread ? ", " + unread + " unread" : "")}
        aria-expanded={open}
        className="relative rounded-xl p-2.5 text-slate-600"
        onClick={() => {
          setOpen(!open);
          if (!open) void refresh();
        }}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <section
          role="dialog"
          aria-label="Workspace notifications"
          className="fixed right-3 top-20 z-50 w-[calc(100vw-24px)] max-w-sm rounded-2xl border bg-white shadow-xl sm:absolute sm:right-0 sm:top-12 sm:w-96"
        >
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="font-semibold">Notifications</h2>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          {error && (
            <p role="alert" className="p-3 text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="max-h-[60vh] overflow-y-auto">
            {rows.length === 0 && !error && (
              <p className="p-4 text-sm text-slate-500">No updates yet.</p>
            )}
            {rows.map((row) => (
              <Link
                key={row._id}
                href={
                  row.type === "electricity" && row.relatedInvoiceId
                    ? role === "owner"
                      ? "/owner/invoices?meterInvoice=" + row.relatedInvoiceId
                      : "/tenant/invoices"
                    : role === "owner"
                      ? "/owner/notifications"
                      : "/tenant/notifications"
                }
                onClick={() => {
                  void read(row);
                  setOpen(false);
                }}
                className={
                  "block space-y-1 border-b p-4 " +
                  (!row.readAt ? "bg-teal-50" : "bg-white")
                }
              >
                <strong className="block text-sm">{row.title}</strong>
                <p className="text-xs leading-5 text-slate-600">{row.body}</p>
                <time className="block text-xs text-slate-400">
                  {new Date(row.createdAt).toLocaleString("en-IN")}
                </time>
                <span className="block text-xs font-semibold text-teal-700">
                  Open section →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
