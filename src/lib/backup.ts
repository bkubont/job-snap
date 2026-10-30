import { format } from "date-fns";
import type { Contact, DayNote, Job, Photo, PhotoCategory, Punch } from "./types";
import { getSettings, saveSettings, sanitizeSettings, type AppSettings } from "./settings";
import {
  buildZipBlob,
  downloadBlob,
} from "./export";
import {
  listAllJobs,
  listAllPhotos,
  listAllPunches,
  listContacts,
  listDayNotes,
  replaceAllData,
} from "./db";

export const BACKUP_FORMAT = "job-snap-backup";
export const BACKUP_VERSION = 1;

export const LS_LAST_BACKUP = "job-snap:lastBackupAt";
export const LS_NUDGE_DISMISSED = "job-snap:backupNudgeDismissed";
export const LS_INSTALL_DISMISSED = "job-snap:installCueDismissed";

export type BackupPhotoMeta = {
  id: string;
  jobId: string;
  caption: string;
  createdAt: string;
  mimeType: string;
  filename: string;
  /** Added later; missing in older backups (restored as Other). */
  category?: PhotoCategory;
};

export type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  contacts: Contact[];
  jobs: Job[];
  punches: Punch[];
  dayNotes: DayNote[];
  photos: BackupPhotoMeta[];
  /** Added later (invoice rounding); missing in older backups. */
  settings?: AppSettings;
};

function extensionForBlob(blob: Blob) {
  const type = blob.type.toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("heic") || type.includes("heif")) return "heic";
  return "jpg";
}

export function markBackupCompleted() {
  try {
    localStorage.setItem(LS_LAST_BACKUP, new Date().toISOString());
    localStorage.removeItem(LS_NUDGE_DISMISSED);
  } catch {
    /* private mode */
  }
}

export function getLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LS_LAST_BACKUP);
  } catch {
    return null;
  }
}

export function isBackupNudgeDismissed(): boolean {
  try {
    return localStorage.getItem(LS_NUDGE_DISMISSED) === "1";
  } catch {
    return false;
  }
}

export function dismissBackupNudge() {
  try {
    localStorage.setItem(LS_NUDGE_DISMISSED, "1");
  } catch {
    /* private mode */
  }
}

export function isInstallCueDismissed(): boolean {
  try {
    return localStorage.getItem(LS_INSTALL_DISMISSED) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallCue() {
  try {
    localStorage.setItem(LS_INSTALL_DISMISSED, "1");
  } catch {
    /* private mode */
  }
}

/** Build a full-device backup ZIP (JSON + photo blobs). Not a timecard export. */
export async function buildFullBackupZip(): Promise<{
  blob: Blob;
  filename: string;
  counts: {
    contacts: number;
    jobs: number;
    punches: number;
    dayNotes: number;
    photos: number;
  };
}> {
  const [contacts, jobs, punches, dayNotes, photos] = await Promise.all([
    listContacts(),
    listAllJobs(),
    listAllPunches(),
    listDayNotes(),
    listAllPhotos(),
  ]);

  const photoMeta: BackupPhotoMeta[] = photos.map((photo) => {
    const ext = extensionForBlob(photo.blob);
    return {
      id: photo.id,
      jobId: photo.jobId,
      caption: photo.caption,
      createdAt: photo.createdAt,
      mimeType: photo.blob.type || "image/jpeg",
      filename: `photos/${photo.id}.${ext}`,
      category: photo.category ?? "other",
    };
  });

  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    contacts,
    jobs,
    punches,
    dayNotes,
    photos: photoMeta,
    settings: getSettings(),
  };

  const files: { name: string; data: Uint8Array | Blob | string }[] = [
    {
      name: "backup.json",
      data: JSON.stringify(payload, null, 2),
    },
  ];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    const meta = photoMeta[i]!;
    files.push({ name: meta.filename, data: photo.blob });
  }

  const blob = await buildZipBlob(files);
  const stamp = format(new Date(), "yyyy-MM-dd");
  return {
    blob,
    filename: `job-snap-backup-${stamp}.zip`,
    counts: {
      contacts: contacts.length,
      jobs: jobs.length,
      punches: punches.length,
      dayNotes: dayNotes.length,
      photos: photos.length,
    },
  };
}

/**
 * Start the backup download. The browser (or the iPhone save sheet) decides
 * whether the file is actually kept, so callers must word this as "started".
 */
export async function downloadFullBackup() {
  const { blob, filename, counts } = await buildFullBackupZip();
  downloadBlob(filename, blob);
  markBackupCompleted();
  return counts;
}

function readU16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

/**
 * Parse a STORE-only ZIP produced by buildZipBlob. Entries are returned as
 * slices of the original file (no copy), keeping memory low for big backups.
 */
export async function parseZipEntries(
  zipBlob: Blob,
): Promise<Map<string, Blob>> {
  const entries = new Map<string, Blob>();
  const decoder = new TextDecoder();
  const total = zipBlob.size;

  // Read only each 30-byte local header and its name; file data stays on disk.
  let offset = 0;
  while (offset + 30 <= total) {
    const header = await zipBlob.slice(offset, offset + 30).arrayBuffer();
    const view = new DataView(header);
    const sig = readU32(view, 0);
    if (sig !== 0x04034b50) break;

    const flags = readU16(view, 6);
    const method = readU16(view, 8);
    const compressedSize = readU32(view, 18);
    const nameLen = readU16(view, 26);
    const extraLen = readU16(view, 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    const name = decoder.decode(
      await zipBlob.slice(nameStart, nameEnd).arrayBuffer(),
    );
    const dataStart = nameEnd + extraLen;

    if (flags & 0x8) {
      throw new Error(
        "Backup ZIP uses unsupported streaming layout. Re-export from Job Snap.",
      );
    }
    if (method !== 0) {
      throw new Error(
        "Backup ZIP is compressed. Job Snap only restores its own STORE archives.",
      );
    }

    const dataEnd = dataStart + compressedSize;
    if (dataEnd > total) {
      throw new Error("Backup ZIP is truncated or corrupt.");
    }
    entries.set(name, zipBlob.slice(dataStart, dataEnd));
    offset = dataEnd;
  }

  if (entries.size === 0) {
    throw new Error("No files found in backup ZIP.");
  }
  return entries;
}

function isContact(value: unknown): value is Contact {
  if (!value || typeof value !== "object") return false;
  const v = value as Contact;
  return typeof v.id === "string" && typeof v.name === "string";
}

function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const v = value as Job;
  return (
    typeof v.id === "string" &&
    typeof v.contactId === "string" &&
    typeof v.title === "string"
  );
}

function isPunch(value: unknown): value is Punch {
  if (!value || typeof value !== "object") return false;
  const v = value as Punch;
  return typeof v.id === "string" && typeof v.jobId === "string";
}

function isDayNote(value: unknown): value is DayNote {
  if (!value || typeof value !== "object") return false;
  const v = value as DayNote;
  return typeof v.id === "string" && typeof v.date === "string";
}

function parseBackupJson(raw: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("backup.json is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid backup file.");
  }
  const data = parsed as Partial<BackupPayload>;
  if (data.format !== BACKUP_FORMAT) {
    throw new Error("This file is not a Job Snap full backup.");
  }
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(data.version)}`);
  }
  if (
    !Array.isArray(data.contacts) ||
    !Array.isArray(data.jobs) ||
    !Array.isArray(data.punches) ||
    !Array.isArray(data.dayNotes) ||
    !Array.isArray(data.photos)
  ) {
    throw new Error("Backup is missing required collections.");
  }
  if (!data.contacts.every(isContact)) {
    throw new Error("Backup contacts are invalid.");
  }
  if (!data.jobs.every(isJob)) {
    throw new Error("Backup jobs are invalid.");
  }
  if (!data.punches.every(isPunch)) {
    throw new Error("Backup punches are invalid.");
  }
  if (!data.dayNotes.every(isDayNote)) {
    throw new Error("Backup day notes are invalid.");
  }
  return data as BackupPayload;
}

/** Restore a full backup ZIP, replacing all IndexedDB contents. */
export async function restoreFullBackup(zipBlob: Blob) {
  const entries = await parseZipEntries(zipBlob);
  const backupBytes = entries.get("backup.json");
  if (!backupBytes) {
    throw new Error('Backup ZIP must contain "backup.json".');
  }
  const payload = parseBackupJson(await backupBytes.text());

  const photos: Photo[] = [];
  for (const meta of payload.photos) {
    const file = entries.get(meta.filename);
    if (!file) {
      throw new Error(`Missing photo file: ${meta.filename}`);
    }
    // Materialize the bytes: a slice of the picked File must not be stored
    // in IndexedDB as a lazy reference to a file that may move.
    const blob = new Blob([await file.arrayBuffer()], {
      type: meta.mimeType || "image/jpeg",
    });
    photos.push({
      id: meta.id,
      jobId: meta.jobId,
      blob,
      caption: meta.caption ?? "",
      createdAt: meta.createdAt,
      ...(meta.category ? { category: meta.category } : {}),
    });
  }

  await replaceAllData({
    contacts: payload.contacts,
    jobs: payload.jobs,
    punches: payload.punches,
    dayNotes: payload.dayNotes,
    photos,
  });

  if (payload.settings) {
    try {
      saveSettings(sanitizeSettings(payload.settings));
    } catch {
      /* settings are a convenience; data restore already succeeded */
    }
  }

  // Deliberately not marking a backup here: the restored data hasn't been
  // backed up from this device yet, so the reminder should stay accurate.

  return {
    contacts: payload.contacts.length,
    jobs: payload.jobs.length,
    punches: payload.punches.length,
    dayNotes: payload.dayNotes.length,
    photos: photos.length,
  };
}
