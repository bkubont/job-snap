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

export type ExportFilters = {
  contactId?: string | null;
  jobId?: string | null;
};

export type ExportRow = {
  date: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  job: string;
  jobId: string;
  punchedIn: string;
  punchedOut: string;
  hours: string;
  /** Billed minutes — 0 for open punches (excluded from totals). */
  minutes: number;
  dayNote: string;
  isOpen: boolean;
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

function punchesInRange(
  punches: Punch[],
  from: string,
  to: string,
  filters: ExportFilters = {},
  jobs: Job[] = [],
): Punch[] {
  const fromDate = startOfDay(parseISO(`${from}T12:00:00`));
  const toDate = endOfDay(parseISO(`${to}T12:00:00`));
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  return punches.filter((p) => {
    const d = parseISO(p.punchedInAt);
    if (!isWithinInterval(d, { start: fromDate, end: toDate })) return false;
    if (filters.jobId && p.jobId !== filters.jobId) return false;
    if (filters.contactId) {
      const job = jobMap.get(p.jobId);
      if (!job || job.contactId !== filters.contactId) return false;
    }
    return true;
  });
}

export function jobIdsInPunchRange(
  punches: Punch[],
  from: string,
  to: string,
  filters: ExportFilters = {},
  jobs: Job[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const p of punchesInRange(punches, from, to, filters, jobs)) {
    ids.add(p.jobId);
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
  contactId?: string | null;
  jobId?: string | null;
}): ExportRow[] {
  const filters: ExportFilters = {
    contactId: args.contactId,
    jobId: args.jobId,
  };
  const jobMap = new Map(args.jobs.map((j) => [j.id, j]));
  const contactMap = new Map(args.contacts.map((c) => [c.id, c]));
  const noteMap = new Map(args.dayNotes.map((n) => [n.date, n.body]));

  return punchesInRange(args.punches, args.from, args.to, filters, args.jobs)
    .sort(
      (a, b) =>
        new Date(a.punchedInAt).getTime() - new Date(b.punchedInAt).getTime(),
    )
    .map((p) => {
      const job = jobMap.get(p.jobId);
      const contact = job ? contactMap.get(job.contactId) : undefined;
      const date = format(parseISO(p.punchedInAt), "yyyy-MM-dd");
      const isOpen = p.punchedOutAt === null;
      // Open punches stay listed as "Still open" but do not inflate billed hours.
      const minutes = isOpen
        ? 0
        : durationMinutes(p.punchedInAt, p.punchedOutAt);
      return {
        date,
        contact: contact?.name ?? "Unknown",
        phone: contact?.phone ?? "",
        email: contact?.email ?? "",
        address: contact?.address ?? "",
        job: job?.title ?? "Unknown job",
        jobId: p.jobId,
        punchedIn: formatDateTime(p.punchedInAt),
        punchedOut: isOpen ? "Still open" : formatDateTime(p.punchedOutAt!),
        hours: isOpen ? "—" : hoursFromMinutes(minutes),
        minutes,
        dayNote: noteMap.get(date) ?? "",
        isOpen,
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
  contactId?: string | null;
  jobId?: string | null;
}): JobNoteRow[] {
  const filters: ExportFilters = {
    contactId: args.contactId,
    jobId: args.jobId,
  };
  const jobIds = jobIdsInPunchRange(
    args.punches,
    args.from,
    args.to,
    filters,
    args.jobs,
  );
  const contactMap = new Map(args.contacts.map((c) => [c.id, c]));

  return args.jobs
    .filter((j) => {
      if (!jobIds.has(j.id) || !j.notes.trim()) return false;
      if (filters.jobId && j.id !== filters.jobId) return false;
      if (filters.contactId && j.contactId !== filters.contactId) return false;
      return true;
    })
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
  contactId?: string | null;
  jobId?: string | null;
}): PhotoExportItem[] {
  const filters: ExportFilters = {
    contactId: args.contactId,
    jobId: args.jobId,
  };
  const jobIds = jobIdsInPunchRange(
    args.punches,
    args.from,
    args.to,
    filters,
    args.jobs,
  );
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
    const captionPart = photo.caption.trim()
      ? `_${sanitizeFilenamePart(photo.caption)}`
      : "";
    const filename = `photos/${date}_${sanitizeFilenamePart(contactName)}_${sanitizeFilenamePart(jobTitle)}${captionPart}_${String(n).padStart(2, "0")}.${extensionForBlob(photo.blob)}`;
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
  options?: {
    contact?: Contact | null;
    filterLabel?: string;
  },
) {
  const lines: string[] = [];
  lines.push("Time clock export");
  lines.push(`Range,${from},${to}`);
  if (options?.filterLabel) {
    lines.push(`Filter,${options.filterLabel}`);
  }
  if (options?.contact) {
    const c = options.contact;
    lines.push(`Client,${csvEscape(c.name)}`);
    if (c.phone) lines.push(`Phone,${csvEscape(c.phone)}`);
    if (c.email) lines.push(`Email,${csvEscape(c.email)}`);
    if (c.address) lines.push(`Address,${csvEscape(c.address)}`);
  }
  lines.push("");
  lines.push(
    "Date,Contact,Phone,Email,Address,Job,Punch In,Punch Out,Hours,Day Note",
  );
  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.contact,
        row.phone,
        row.email,
        row.address,
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
  const openCount = rows.filter((r) => r.isOpen).length;
  lines.push("");
  lines.push(`Total hours (closed punches),${hoursFromMinutes(totalMins)}`);
  if (openCount > 0) {
    lines.push(
      `Open punches excluded from total,${openCount}`,
    );
  }
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
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS Safari reads the URL after click() returns (while showing the save
  // sheet); revoking immediately can make the download fail.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
    { minutes: number; note: string; entries: ExportRow[]; openCount: number }
  >();
  for (const row of rows) {
    const existing = map.get(row.date) ?? {
      minutes: 0,
      note: row.dayNote,
      entries: [],
      openCount: 0,
    };
    existing.minutes += row.minutes;
    if (row.isOpen) existing.openCount += 1;
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

/** Our byte arrays always own a plain ArrayBuffer, so they're valid BlobParts. */
function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes as Uint8Array<ArrayBuffer>;
}

async function blobToUint8Array(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Build a ZIP (store-only) containing named files. Works without a server.
 * Photos are read one at a time for their checksum and then referenced as the
 * original Blob, so memory use stays near one photo instead of the whole
 * archive (twice) — important for large backups on iPhone.
 */
export async function buildZipBlob(
  files: { name: string; data: Uint8Array | Blob | string }[],
): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name.replace(/^\/+/, ""));
    let crc: number;
    let size: number;
    let part: BlobPart;
    if (file.data instanceof Blob) {
      crc = crc32(await blobToUint8Array(file.data));
      size = file.data.size;
      part = file.data;
    } else {
      const data =
        typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      crc = crc32(data);
      size = data.length;
      part = toBlobPart(data);
    }
    if (offset + size > 0xffffffff) {
      throw new Error(
        "This archive would be larger than 4 GB, which ZIP files can't hold. Export a shorter date range or fewer photos.",
      );
    }
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(toBlobPart(localHeader), part);

    const centralHeader = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
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
    offset += localHeader.length + size;
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

  return new Blob([...localParts, toBlobPart(centralDir), toBlobPart(end)], {
    type: "application/zip",
  });
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

/** Google Maps directions / search URL for a street address. */
export function mapsDirectionsUrl(address: string) {
  const q = address.trim();
  if (!q) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}
