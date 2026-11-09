import { idOf, json, request, requestBlob, unwrap } from "@/services/live/api";
export type MeterInvoice = {
  _id?: string;
  id?: string;
  roomId?: string;
  tenancyId?: string;
  tenantId: string;
  month: string;
  propertyId?: string;
};
export type Meter = {
  _id: string;
  roomId: string;
  propertyId: string;
  label: string;
  baselineReading: number;
  baselineDate: string;
  roomNumber?: string;
  propertyName?: string;
  floorName?: string;
};
export type MeterReading = {
  _id: string;
  meterId?: string;
  roomId: string;
  propertyId: string;
  floorId?: string;
  tenantId?: string;
  tenancyId?: string;
  month: string;
  previous: number;
  current: number;
  consumedUnits: number;
  ratePaise: number;
  amountPaise: number;
  readingDate: string;
  intervalStart: string;
  status?: "draft" | "finalized" | "correction";
  relatedInvoiceId?: string;
  meterPhotoFileId?: string;
  revision: number;
  draftVersion: number;
  invoiceRevision?: number;
  recordedBy?: string;
  createdAt?: string;
  corrections?: Array<{
    current: number;
    previous: number;
    amountPaise: number;
    meterPhotoFileId?: string;
    correctedAt: string;
    reason: string;
    invoiceRevision?: number;
  }>;
  propertyName?: string;
  roomNumber?: string;
  tenantName?: string;
  photo?: {
    id: string;
    name: string;
    uploadedAt: string;
    uploadedBy: string;
    uploadedByName: string;
  };
};
export type MeterContext = {
  previousReading: number;
  previousReadingDate: string;
  previousReadingId?: string;
  previousPhotoFileId?: string;
  defaultRatePaise: number;
};
export const meterApi = {
  list: (roomId: string) =>
    unwrap(
      request<Meter[]>("/api/meters?roomId=" + encodeURIComponent(roomId)),
    ),
  config: () =>
    unwrap(
      request<{
        durableStorageConfigured: boolean;
        photoMaxBytes: number;
        defaultRatePaise: number;
      }>("/api/meters/config"),
    ),
  history: (query: string) =>
    unwrap(request<MeterReading[]>("/api/meters/readings?" + query)),
  reading: (id: string) =>
    unwrap(
      request<MeterReading>("/api/meters/readings/" + encodeURIComponent(id)),
    ),
  previous: (id: string, month: string, invoiceId: string) =>
    unwrap(
      request<MeterContext>(
        `/api/meters/${id}/previous-reading?month=${month}&invoiceId=${invoiceId}`,
      ),
    ),
  create: (body: unknown) =>
    unwrap(request<Meter>("/api/meters", json("POST", body))),
  draft: (meterId: string, body: unknown, readingId?: string) =>
    unwrap(
      request<MeterReading>(
        readingId
          ? "/api/meters/readings/" + readingId
          : `/api/meters/${meterId}/readings`,
        json(readingId ? "PATCH" : "POST", body),
      ),
    ),
  finalize: (id: string) =>
    unwrap(
      request<{ reading: MeterReading; invoiceRevision: number }>(
        "/api/meters/readings/" + id + "/finalize",
        json("POST", {}),
      ),
    ),
  correct: (id: string, body: unknown) =>
    unwrap(
      request<{ reading: MeterReading }>(
        "/api/meters/readings/" + id,
        json("PATCH", body),
      ),
    ),
  handover: (id: string, body: unknown) =>
    unwrap(
      request<Meter>("/api/meters/" + id + "/handover", json("POST", body)),
    ),
  photo: async (id: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return unwrap(
      request<{ fileId: string; uploadedAt: string; uploadedBy: string }>(
        "/api/meters/readings/" + id + "/photo",
        { method: "POST", body: data },
      ),
    );
  },
  invoiceId: idOf,
};
export const meterBlob = (path: string) => requestBlob(path);
export async function downloadMeterFile(path: string, name: string) {
  const blob = await meterBlob(path),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
