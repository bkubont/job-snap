import {
  format,
  parseISO,
  isWithinInterval,
  startOfDay,
  endOfDay,
  subDays,
} from "date-fns";
import type { Contact, DayNote, Job, Photo, Punch } from "./types";
import { durationMinutes, formatDateTime, hoursFromMinutes, todayKey } from "./time";

export type ExportRow = {
  date: string;
  contact: string;
  job: string;
  jobId: string;
  punchedIn: string;
  punchedOut: string;
  hours: string;
  minutes: number;
  dayNote: string;
};

export type JobNoteRow = {
  jobId: string;
  contact: string;
  job: string;
  notes: string;
};

export type PhotoExportItem = {
  photo: Photo;
  jobId: string;
  contact: string;
  job: string;
  date: string;
  caption: string;
  /** Relative path inside the ZIP package */
  filename: string;
};

function sanitizeFilenamePart(value: string) {
  return (
    value
      .trim()
      .replace(/[^\w\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "untitled"
  );
}

function extensionForBlob(blob: Blob) {
  const type = blob.type.toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("heic") || type.includes("heif")) return "heic";
  return "jpg";
}

export function jobIdsInPunchRange(
  punches: Punch[],
  from: string,
  to: string,
): Set<string> {
  const fromDate = startOfDay(parseISO(`${from}T12:00:00`));
  const toDate = endOfDay(parseISO(`${to}T12:00:00`));
  const ids = new Set<string>();
  for (const p of punches) {
    const d = parseISO(p.punchedInAt);
    if (isWithinInterval(d, { start: fromDate, end: toDate })) {
      ids.add(p.jobId);
    }
  }
  return ids;
}

export function buildExportRows(args: {
  punches: Punch[];
  jobs: Job[];
  contacts: Contact[];
  dayNotes: DayNote[];
  from: string;
  to: string;
}): ExportRow[] {
  const fromDate = startOfDay(parseISO(`${args.from}T12:00:00`));
  const toDate = endOfDay(parseISO(`${args.to}T12:00:00`));
  const jobMap = new Map(args.jobs.map((j) => [j.id, j]));
  const contactMap = new Map(args.contacts.map((c) => [c.id, c]));
  const noteMap = new Map(args.dayNotes.map((n) => [n.date, n.body]));

  return args.punches
    .filter((p) => {
      const d = parseISO(p.punchedInAt);
      return isWithinInterval(d, { start: fromDate, end: toDate });
    })
    .sort(
      (a, b) =>
        new Date(a.punchedInAt).getTime() - new Date(b.punchedInAt).getTime(),
    )
    .map((p) => {
      const job = jobMap.get(p.jobId);
      const contact = job ? contactMap.get(job.contactId) : undefined;
      const date = format(parseISO(p.punchedInAt), "yyyy-MM-dd");
      const minutes = durationMinutes(p.punchedInAt, p.punchedOutAt);
      return {
        date,
        contact: contact?.name ?? "Unknown",
        job: job?.title ?? "Unknown job",
        jobId: p.jobId,
        punchedIn: formatDateTime(p.punchedInAt),
        punchedOut: p.punchedOutAt
          ? formatDateTime(p.punchedOutAt)
          : "Still open",
        hours: hoursFromMinutes(minutes),
        minutes,
        dayNote: noteMap.get(date) ?? "",
      };
    });
}

/** Job notes for jobs that appear in the punch range (non-empty notes only). */
export function buildJobNoteRows(args: {
  punches: Punch[];
  jobs: Job[];
  contacts: Contact[];
  from: string;
  to: string;
}): JobNoteRow[] {
  const jobIds = jobIdsInPunchRange(args.punches, args.from, args.to);
  const contactMap = new Map(args.contacts.map((c) => [c.id, c]));

  return args.jobs
    .filter((j) => jobIds.has(j.id) && j.notes.trim())
    .map((job) => {
      const contact = contactMap.get(job.contactId);
      return {
        jobId: job.id,
        contact: contact?.name ?? "Unknown",
        job: job.title,
        notes: job.notes.trim(),
      };
    })
    .sort((a, b) =>
      `${a.contact} ${a.job}`.localeCompare(`${b.contact} ${b.job}`),
    );
}

/**
 * Photos for jobs punched in the range. Prefer photos taken in-range;
 * still include out-of-range photos for those jobs so site evidence travels
 * with the timecard.
 */
export function buildPhotoExportItems(args: {
  punches: Punch[];
  jobs: Job[];
  contacts: Contact[];
  photos: Photo[];
  from: string;
  to: string;
}): PhotoExportItem[] {
  const jobIds = jobIdsInPunchRange(args.punches, args.from, args.to);
  const jobMap = new Map(args.jobs.map((j) => [j.id, j]));
  const contactMap = new Map(args.contacts.map((c) => [c.id, c]));

  const candidates = args.photos
    .filter((p) => jobIds.has(p.jobId))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  const counters = new Map<string, number>();
  return candidates.map((photo) => {
    const job = jobMap.get(photo.jobId);
    const contact = job ? contactMap.get(job.contactId) : undefined;
    const contactName = contact?.name ?? "Unknown";
    const jobTitle = job?.title ?? "Unknown job";
    const date = format(parseISO(photo.createdAt), "yyyy-MM-dd");
    const key = `${photo.jobId}:${date}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const filename = `photos/${date}_${sanitizeFilenamePart(contactName)}_${sanitizeFilenamePart(jobTitle)}_${String(n).padStart(2, "0")}.${extensionForBlob(photo.blob)}`;
    return {
      photo,
      jobId: photo.jobId,
      contact: contactName,
      job: jobTitle,
      date,
      caption: photo.caption.trim(),
      filename,
    };
  });
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(
  rows: ExportRow[],
  dayNotes: DayNote[],
  from: string,
  to: string,
  jobNotes: JobNoteRow[] = [],
  photos: PhotoExportItem[] = [],
) {
  const lines: string[] = [];
  lines.push("Time clock export");
  lines.push(`Range,${from},${to}`);
  lines.push("");
  lines.push("Date,Contact,Job,Punch In,Punch Out,Hours,Day Note");
  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.contact,
        row.job,
        row.punchedIn,
        row.punchedOut,
        row.hours,
        row.dayNote,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  lines.push("");
  lines.push("Daily notes");
  lines.push("Date,Note");
  const inRange = dayNotes
    .filter((n) => n.date >= from && n.date <= to && n.body.trim())
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const note of inRange) {
    lines.push([note.date, note.body].map(csvEscape).join(","));
  }

  lines.push("");
  lines.push("Job notes");
  lines.push("Contact,Job,Notes");
  for (const note of jobNotes) {
    lines.push(
      [note.contact, note.job, note.notes].map(csvEscape).join(","),
    );
  }

  lines.push("");
  lines.push("Photos");
  lines.push("Date,Contact,Job,Caption,Filename");
  for (const item of photos) {
    lines.push(
      [
        item.date,
        item.contact,
        item.job,
        item.caption,
        item.filename,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const totalMins = rows.reduce((sum, r) => sum + r.minutes, 0);
  lines.push("");
  lines.push(`Total hours,${hoursFromMinutes(totalMins)}`);
  lines.push(`Photo count,${photos.length}`);
  return lines.join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime: string,
) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Last 7 days (same range as Export “Last 7 days”), then trigger CSV download. */
export async function downloadThisWeekCsv(load: {
  punches: Punch[];
  jobs: Job[];
  contacts: Contact[];
  dayNotes: DayNote[];
  photos?: Photo[];
}) {
  const to = todayKey();
  const from = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const photos = load.photos ?? [];
  const rows = buildExportRows({ ...load, from, to });
  const jobNotes = buildJobNoteRows({ ...load, from, to });
  const photoItems = buildPhotoExportItems({ ...load, photos, from, to });
  const csv = rowsToCsv(rows, load.dayNotes, from, to, jobNotes, photoItems);
  downloadTextFile(
    `job-snap-timecard-${from}-to-${to}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
  return { from, to, rowCount: rows.length };
}

export function summarizeByDay(rows: ExportRow[]) {
  const map = new Map<
    string,
    { minutes: number; note: string; entries: ExportRow[] }
  >();
  for (const row of rows) {
    const existing = map.get(row.date) ?? {
      minutes: 0,
      note: row.dayNote,
      entries: [],
    };
    existing.minutes += row.minutes;
    existing.note = existing.note || row.dayNote;
    existing.entries.push(row);
    map.set(row.date, existing);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, ...value }));
}

export function photosByJob(items: PhotoExportItem[]) {
  const map = new Map<
    string,
    { contact: string; job: string; photos: PhotoExportItem[] }
  >();
  for (const item of items) {
    const existing = map.get(item.jobId) ?? {
      contact: item.contact,
      job: item.job,
      photos: [],
    };
    existing.photos.push(item);
    map.set(item.jobId, existing);
  }
  return [...map.entries()]
    .map(([jobId, value]) => ({ jobId, ...value }))
    .sort((a, b) =>
      `${a.contact} ${a.job}`.localeCompare(`${b.contact} ${b.job}`),
    );
}

/* ── Minimal uncompressed ZIP (STORE) for mobile Chrome/Safari ── */

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function blobToUint8Array(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Build a ZIP (store-only) containing named files. Works without a server. */
export async function buildZipBlob(
  files: { name: string; data: Uint8Array | Blob | string }[],
): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name.replace(/^\/+/, ""));
    let data: Uint8Array;
    if (typeof file.data === "string") {
      data = encoder.encode(file.data);
    } else if (file.data instanceof Blob) {
      data = await blobToUint8Array(file.data);
    } else {
      data = file.data;
    }
    const crc = crc32(data);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDir = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  const bytes = concatBytes([...localParts, centralDir, end]);
  // Copy into a fresh ArrayBuffer so BlobPart typing stays happy across TS DOM libs.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/zip" });
}

export async function buildExportPackageZip(args: {
  csv: string;
  csvFilename: string;
  photos: PhotoExportItem[];
}): Promise<Blob> {
  const files: { name: string; data: Uint8Array | Blob | string }[] = [
    { name: args.csvFilename, data: args.csv },
  ];
  for (const item of args.photos) {
    files.push({ name: item.filename, data: item.photo.blob });
  }
  return buildZipBlob(files);
}
