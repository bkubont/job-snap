import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from "idb";
import type {
  ActivePunchInfo,
  Contact,
  DayNote,
  Job,
  JobEvent,
  JobEventType,
  JobStatus,
  Photo,
  PhotoCategory,
  Punch,
  RecentJobInfo,
  StoredJobStatus,
} from "./types";
import { JOB_STATUSES, PHOTO_CATEGORIES } from "./types";
import { STATUS_LABEL, normalizeStatus } from "./status";
import { formatDateTime } from "./time";

/** A job as stored: may still carry the legacy "open"/"closed" status. */
type StoredJob = Omit<Job, "status"> & { status: StoredJobStatus };

interface SitefoldDB extends DBSchema {
  contacts: {
    key: string;
    value: Contact;
    indexes: { "by-name": string };
  };
  jobs: {
    key: string;
    value: StoredJob;
    indexes: { "by-contact": string };
  };
  punches: {
    key: string;
    value: Punch;
    indexes: { "by-job": string; "by-in": string };
  };
  photos: {
    key: string;
    value: Photo;
    indexes: { "by-job": string };
  };
  dayNotes: {
    key: string;
    value: DayNote;
    indexes: { "by-date": string };
  };
}

const DB_NAME = "sitefold";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SitefoldDB>> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    const opening = openDB<SitefoldDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const contacts = db.createObjectStore("contacts", { keyPath: "id" });
        contacts.createIndex("by-name", "name");

        const jobs = db.createObjectStore("jobs", { keyPath: "id" });
        jobs.createIndex("by-contact", "contactId");

        const punches = db.createObjectStore("punches", { keyPath: "id" });
        punches.createIndex("by-job", "jobId");
        punches.createIndex("by-in", "punchedInAt");

        const photos = db.createObjectStore("photos", { keyPath: "id" });
        photos.createIndex("by-job", "jobId");

        const dayNotes = db.createObjectStore("dayNotes", { keyPath: "id" });
        dayNotes.createIndex("by-date", "date", { unique: true });
      },
      terminated() {
        // Browser closed the connection (e.g. storage cleared); reopen next time.
        dbPromise = null;
      },
    });
    // Don't cache a failed open, so Retry can try again without a reload.
    opening.catch(() => {
      if (dbPromise === opening) dbPromise = null;
    });
    dbPromise = opening;
  }
  return dbPromise;
}

/**
 * Ask the browser not to evict Job Snap's data under storage pressure
 * (Safari otherwise may clear it after a period of inactivity).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageStatus(): Promise<{
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}> {
  try {
    const persisted = navigator.storage?.persisted
      ? await navigator.storage.persisted()
      : null;
    const estimate = navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : null;
    return {
      persisted,
      usage: estimate?.usage ?? null,
      quota: estimate?.quota ?? null,
    };
  } catch {
    return { persisted: null, usage: null, quota: null };
  }
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function normalizeHourlyRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Normalize legacy IndexedDB rows that predate optional fields. */
function normalizeContact(raw: Contact | undefined): Contact | undefined {
  if (!raw) return undefined;
  return {
    ...raw,
    phone: raw.phone ?? "",
    email: raw.email ?? "",
    address: raw.address ?? "",
    notes: raw.notes ?? "",
    hourlyRate: normalizeHourlyRate(raw.hourlyRate),
  };
}

export async function listContacts(): Promise<Contact[]> {
  const db = await getDb();
  const all = await db.getAll("contacts");
  return all
    .map((c) => normalizeContact(c)!)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getContact(contactId: string) {
  return normalizeContact(await (await getDb()).get("contacts", contactId));
}

export async function createContact(
  input: Pick<Contact, "name" | "phone" | "email" | "notes"> & {
    address?: string;
    hourlyRate?: number | null;
  },
) {
  const contact: Contact = {
    id: id(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    address: (input.address ?? "").trim(),
    notes: input.notes.trim(),
    hourlyRate: normalizeHourlyRate(input.hourlyRate),
    createdAt: now(),
  };
  await (await getDb()).put("contacts", contact);
  return contact;
}

export async function updateContact(contact: Contact) {
  const normalized: Contact = {
    ...contact,
    name: contact.name.trim(),
    phone: contact.phone.trim(),
    email: contact.email.trim(),
    address: (contact.address ?? "").trim(),
    notes: contact.notes.trim(),
    hourlyRate: normalizeHourlyRate(contact.hourlyRate),
  };
  await (await getDb()).put("contacts", normalized);
  return normalized;
}

/** Delete a contact with all its jobs, punches, and photos — all or nothing. */
export async function deleteContact(contactId: string) {
  const db = await getDb();
  const tx = db.transaction(["contacts", "jobs", "punches", "photos"], "readwrite");
  const jobs = await tx.objectStore("jobs").index("by-contact").getAllKeys(contactId);
  for (const jobId of jobs) {
    await deleteJobInTx(tx, jobId);
  }
  await tx.objectStore("contacts").delete(contactId);
  await tx.done;
}

export async function listJobsForContact(contactId: string): Promise<Job[]> {
  const jobs = (
    await (await getDb()).getAllFromIndex("jobs", "by-contact", contactId)
  ).map((j) => normalizeJob(j));
  return jobs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Read a stored job with defaults for fields added later. Legacy statuses are
 * translated for display only; the stored record is not rewritten.
 */
export function normalizeJob(raw: StoredJob): Job;
export function normalizeJob(raw: StoredJob | undefined): Job | undefined;
export function normalizeJob(raw: StoredJob | undefined): Job | undefined {
  if (!raw) return undefined;
  return {
    ...raw,
    status: normalizeStatus(raw.status),
    notes: raw.notes ?? "",
    address: raw.address ?? "",
    scheduledDate: raw.scheduledDate || null,
    description: raw.description ?? "",
    instructions: raw.instructions ?? "",
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

export async function listAllJobs(): Promise<Job[]> {
  return (await (await getDb()).getAll("jobs")).map((j) => normalizeJob(j));
}

export async function getJob(jobId: string) {
  return normalizeJob(await (await getDb()).get("jobs", jobId));
}

function makeEvent(type: JobEventType, text: string, at = now()): JobEvent {
  return { id: id(), at, type, text };
}

function withEvents(job: StoredJob, events: JobEvent[]): StoredJob {
  if (!events.length) return job;
  return { ...job, history: [...(job.history ?? []), ...events] };
}

export async function createJob(
  contactId: string,
  title: string,
  details: {
    notes?: string;
    status?: JobStatus;
    address?: string;
    scheduledDate?: string | null;
    description?: string;
  } = {},
) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Job title is required.");
  const status = details.status ?? (details.scheduledDate ? "scheduled" : "in_progress");
  const job: Job = {
    id: id(),
    contactId,
    title: trimmed,
    status,
    notes: (details.notes ?? "").trim(),
    createdAt: now(),
    address: (details.address ?? "").trim(),
    scheduledDate: details.scheduledDate || null,
    description: (details.description ?? "").trim(),
    instructions: "",
    history: [],
  };
  await (await getDb()).put("jobs", job);
  return job;
}

export type JobPatch = Partial<
  Pick<
    Job,
    | "title"
    | "notes"
    | "status"
    | "address"
    | "scheduledDate"
    | "description"
    | "instructions"
  >
>;

const DETAIL_LABELS: Record<string, string> = {
  address: "job address",
  scheduledDate: "scheduled date",
  description: "description",
  instructions: "important instructions",
};

/** History entries describing what a patch changes (notes are not logged). */
function eventsForPatch(current: Job, patch: JobPatch, at: string, reason?: string) {
  const events: JobEvent[] = [];
  if (patch.status && patch.status !== current.status) {
    events.push(
      makeEvent(
        "status",
        `Status: ${STATUS_LABEL[current.status]} → ${STATUS_LABEL[patch.status]}${
          reason ? ` (${reason})` : ""
        }`,
        at,
      ),
    );
  }
  if (patch.title !== undefined && patch.title.trim() !== current.title) {
    events.push(
      makeEvent("title", `Renamed from "${current.title}" to "${patch.title.trim()}"`, at),
    );
  }
  const changed = Object.keys(DETAIL_LABELS).filter((key) => {
    const k = key as keyof JobPatch;
    if (patch[k] === undefined) return false;
    return (patch[k] || "") !== (current[k as keyof Job] || "");
  });
  if (changed.length) {
    events.push(
      makeEvent(
        "details",
        `Updated ${changed.map((k) => DETAIL_LABELS[k]).join(", ")}`,
        at,
      ),
    );
  }
  return events;
}

/**
 * Patch selected fields on the latest stored copy of a job (read + write in one
 * transaction), so an autosaving note can't overwrite a title or status that
 * changed since the screen loaded. Status, title and detail changes are added
 * to the job's history. Fields not in the patch — including a legacy stored
 * status — are left exactly as stored.
 */
export async function updateJobFields(
  jobId: string,
  patch: JobPatch,
  options: { reason?: string } = {},
) {
  const db = await getDb();
  const tx = db.transaction("jobs", "readwrite");
  const current = await tx.store.get(jobId);
  if (!current) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("This job no longer exists.");
  }
  const clean: JobPatch = { ...patch };
  if (clean.title !== undefined) {
    clean.title = clean.title.trim();
    if (!clean.title) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error("Job title is required.");
    }
  }
  for (const key of ["address", "description", "instructions"] as const) {
    if (clean[key] !== undefined) clean[key] = (clean[key] ?? "").trim();
  }
  if (clean.scheduledDate !== undefined) clean.scheduledDate = clean.scheduledDate || null;
  const events = eventsForPatch(normalizeJob(current), clean, now(), options.reason);
  const next = withEvents({ ...current, ...clean }, events);
  await tx.store.put(next);
  await tx.done;
  return normalizeJob(next);
}

/** Add a dated activity note to a job's history. */
export async function addJobLogNote(jobId: string, text: string) {
  const body = text.trim();
  if (!body) throw new Error("Write something first.");
  const db = await getDb();
  const tx = db.transaction("jobs", "readwrite");
  const current = await tx.store.get(jobId);
  if (!current) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("This job no longer exists.");
  }
  await tx.store.put(withEvents(current, [makeEvent("note", body)]));
  await tx.done;
}

/** Delete one dated activity note (status/time history can't be deleted). */
export async function deleteJobLogNote(jobId: string, eventId: string) {
  const db = await getDb();
  const tx = db.transaction("jobs", "readwrite");
  const current = await tx.store.get(jobId);
  if (!current) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("This job no longer exists.");
  }
  const history = (current.history ?? []).filter(
    (e) => !(e.id === eventId && e.type === "note"),
  );
  await tx.store.put({ ...current, history });
  await tx.done;
}

type JobCascadeTx = IDBPTransaction<
  SitefoldDB,
  ("jobs" | "punches" | "photos" | "contacts")[],
  "readwrite"
>;

async function deleteJobInTx(tx: JobCascadeTx, jobId: string) {
  const punchKeys = await tx.objectStore("punches").index("by-job").getAllKeys(jobId);
  for (const key of punchKeys) {
    await tx.objectStore("punches").delete(key);
  }
  const photoKeys = await tx.objectStore("photos").index("by-job").getAllKeys(jobId);
  for (const key of photoKeys) {
    await tx.objectStore("photos").delete(key);
  }
  await tx.objectStore("jobs").delete(jobId);
}

/** Delete a job with its punches and photos — all or nothing. */
export async function deleteJob(jobId: string) {
  const db = await getDb();
  const tx = db.transaction(["contacts", "jobs", "punches", "photos"], "readwrite");
  await deleteJobInTx(tx, jobId);
  await tx.done;
}

export async function listPunchesForJob(jobId: string): Promise<Punch[]> {
  const punches = await (await getDb()).getAllFromIndex(
    "punches",
    "by-job",
    jobId,
  );
  return punches.sort(
    (a, b) =>
      new Date(b.punchedInAt).getTime() - new Date(a.punchedInAt).getTime(),
  );
}

export async function listAllPunches(): Promise<Punch[]> {
  const punches = await (await getDb()).getAll("punches");
  return punches.sort(
    (a, b) =>
      new Date(b.punchedInAt).getTime() - new Date(a.punchedInAt).getTime(),
  );
}

/**
 * Every open punch with its job and contact, oldest first. Normally zero or
 * one; more means two tabs raced (before punch-in was transactional) and the
 * UI should ask the user to close the extras.
 */
export async function listOpenPunches(): Promise<ActivePunchInfo[]> {
  const punches = await (await getDb()).getAll("punches");
  const open = punches
    .filter((p) => p.punchedOutAt === null)
    .sort(
      (a, b) =>
        new Date(a.punchedInAt).getTime() - new Date(b.punchedInAt).getTime(),
    );
  const results: ActivePunchInfo[] = [];
  for (const punch of open) {
    const job = await getJob(punch.jobId);
    if (!job) continue;
    const contact = await getContact(job.contactId);
    if (!contact) continue;
    results.push({ punch, job, contact });
  }
  return results;
}

export async function getOpenPunch(): Promise<ActivePunchInfo | null> {
  const open = await listOpenPunches();
  // Most recent open punch is the "active" one.
  return open[open.length - 1] ?? null;
}

async function describeOpenPunch(punch: Punch) {
  const job = await getJob(punch.jobId);
  const contact = job ? await getContact(job.contactId) : undefined;
  return job && contact
    ? `"${job.title}" for ${contact.name}`
    : "another job";
}

type PunchJobTx = IDBPTransaction<SitefoldDB, ("punches" | "jobs")[], "readwrite">;

/** Clocking in means work is happening: move the job to In Progress (logged). */
async function markInProgressInTx(tx: PunchJobTx, jobId: string, at: string) {
  const jobs = tx.objectStore("jobs");
  const current = await jobs.get(jobId);
  if (!current) throw new Error("This job no longer exists.");
  const status = normalizeStatus(current.status);
  if (status === "in_progress") return;
  await jobs.put(
    withEvents({ ...current, status: "in_progress" }, [
      makeEvent(
        "status",
        `Status: ${STATUS_LABEL[status]} → ${STATUS_LABEL.in_progress} (clocked in)`,
        at,
      ),
    ]),
  );
}

/**
 * Check-then-insert inside one readwrite transaction. IndexedDB serializes
 * overlapping readwrite transactions on the same store (also across tabs),
 * so two taps can never both open a timer.
 */
export async function punchIn(jobId: string) {
  const db = await getDb();
  const tx = db.transaction(["punches", "jobs"], "readwrite");
  const store = tx.objectStore("punches");
  const all = await store.getAll();
  const open = all.find((p) => p.punchedOutAt === null);
  if (open) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error(
      `Already clocked in on ${await describeOpenPunch(open)}. Clock out first.`,
    );
  }
  const at = now();
  const punch: Punch = {
    id: id(),
    jobId,
    punchedInAt: at,
    punchedOutAt: null,
    source: "clock",
  };
  await markInProgressInTx(tx, jobId, at);
  await store.put(punch);
  await tx.done;
  return punch;
}

export async function punchOut(punchId?: string) {
  const db = await getDb();
  let punch: Punch | undefined;
  if (punchId) {
    punch = await db.get("punches", punchId);
  } else {
    const open = await getOpenPunch();
    punch = open?.punch;
  }
  if (!punch || punch.punchedOutAt) {
    throw new Error("You're not clocked in.");
  }
  punch.punchedOutAt = now();
  await db.put("punches", punch);
  return punch;
}

function describeEntry(p: Pick<Punch, "punchedInAt" | "punchedOutAt">) {
  return `${formatDateTime(p.punchedInAt)} – ${
    p.punchedOutAt ? formatDateTime(p.punchedOutAt) : "open"
  }`;
}

function overlaps(
  aIn: string,
  aOut: string | null,
  bIn: string,
  bOut: string | null,
) {
  const far = Number.POSITIVE_INFINITY;
  const a0 = Date.parse(aIn);
  const a1 = aOut ? Date.parse(aOut) : far;
  const b0 = Date.parse(bIn);
  const b1 = bOut ? Date.parse(bOut) : Date.now();
  return a0 < b1 && b0 < a1;
}

/**
 * Validate a time entry. Entries may not overlap another entry (on any job):
 * one person can't be on two clocks, and overlaps would double-count hours.
 */
function validateEntry(
  entry: Pick<Punch, "id" | "punchedInAt" | "punchedOutAt">,
  all: Punch[],
  jobTitles: Map<string, string>,
) {
  if (!entry.punchedInAt || Number.isNaN(Date.parse(entry.punchedInAt))) {
    throw new Error("Start time is required.");
  }
  if (entry.punchedOutAt !== null) {
    if (Number.isNaN(Date.parse(entry.punchedOutAt))) {
      throw new Error("End time is invalid.");
    }
    if (Date.parse(entry.punchedOutAt) <= Date.parse(entry.punchedInAt)) {
      throw new Error("End time must be after start time.");
    }
    if (Date.parse(entry.punchedOutAt) > Date.now() + 60_000) {
      throw new Error("End time can't be in the future.");
    }
  } else {
    const otherOpen = all.find(
      (p) => p.id !== entry.id && p.punchedOutAt === null,
    );
    if (otherOpen) {
      throw new Error(
        "Another timer is already running. Clock out (or set an end time) there before leaving this entry running.",
      );
    }
  }
  const clash = all.find(
    (p) =>
      p.id !== entry.id &&
      overlaps(entry.punchedInAt, entry.punchedOutAt, p.punchedInAt, p.punchedOutAt),
  );
  if (clash) {
    const where = jobTitles.get(clash.jobId);
    throw new Error(
      `Overlaps another entry${where ? ` on "${where}"` : ""}: ${describeEntry(clash)}. Adjust the times so they don't overlap.`,
    );
  }
}

async function jobTitlesInTx(tx: PunchJobTx) {
  const jobs = await tx.objectStore("jobs").getAll();
  return new Map(jobs.map((j) => [j.id, j.title]));
}

async function logTimeEventInTx(tx: PunchJobTx, jobId: string, text: string) {
  const jobs = tx.objectStore("jobs");
  const current = await jobs.get(jobId);
  if (current) await jobs.put(withEvents(current, [makeEvent("time", text)]));
}

/**
 * Add a completed time entry after the fact (missed punch or work done away
 * from the phone). Stored with source "manual" and logged in the job history.
 */
export async function addManualPunch(
  jobId: string,
  punchedInAt: string,
  punchedOutAt: string,
  note = "",
) {
  const db = await getDb();
  const tx = db.transaction(["punches", "jobs"], "readwrite");
  const store = tx.objectStore("punches");
  const entry: Punch = {
    id: id(),
    jobId,
    punchedInAt,
    punchedOutAt,
    source: "manual",
    note: note.trim(),
  };
  try {
    if (!(await tx.objectStore("jobs").get(jobId))) {
      throw new Error("This job no longer exists.");
    }
    validateEntry(entry, await store.getAll(), await jobTitlesInTx(tx));
  } catch (e) {
    tx.abort();
    await tx.done.catch(() => {});
    throw e;
  }
  await store.put(entry);
  await logTimeEventInTx(
    tx,
    jobId,
    `Manual entry added: ${describeEntry(entry)}${entry.note ? ` — ${entry.note}` : ""}`,
  );
  await tx.done;
  return entry;
}

export async function updatePunch(
  punchId: string,
  patch: { punchedInAt?: string; punchedOutAt?: string | null; note?: string },
) {
  // One transaction: validation (open-punch and overlap checks) and the write
  // can't interleave with a punch-in from another tab.
  const db = await getDb();
  const tx = db.transaction(["punches", "jobs"], "readwrite");
  const store = tx.objectStore("punches");
  const punch = await store.get(punchId);
  if (!punch) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Time entry not found.");
  }

  const next: Punch = {
    ...punch,
    punchedInAt: patch.punchedInAt ?? punch.punchedInAt,
    punchedOutAt:
      patch.punchedOutAt !== undefined ? patch.punchedOutAt : punch.punchedOutAt,
    ...(patch.note !== undefined ? { note: patch.note.trim() } : {}),
  };
  const timesChanged =
    next.punchedInAt !== punch.punchedInAt ||
    next.punchedOutAt !== punch.punchedOutAt;

  if (timesChanged) {
    try {
      validateEntry(next, await store.getAll(), await jobTitlesInTx(tx));
    } catch (e) {
      tx.abort();
      await tx.done.catch(() => {});
      throw e;
    }
  }

  await store.put(next);
  if (timesChanged) {
    await logTimeEventInTx(
      tx,
      punch.jobId,
      `Time entry changed: ${describeEntry(punch)} → ${describeEntry(next)}`,
    );
  }
  await tx.done;
  return next;
}

export async function deletePunch(punchId: string) {
  const db = await getDb();
  const tx = db.transaction(["punches", "jobs"], "readwrite");
  const punch = await tx.objectStore("punches").get(punchId);
  if (!punch) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Time entry not found.");
  }
  await tx.objectStore("punches").delete(punchId);
  await logTimeEventInTx(tx, punch.jobId, `Time entry deleted: ${describeEntry(punch)}`);
  await tx.done;
}

/**
 * Punch out any open punch, then punch in on `jobId` (no-op if already open
 * there). One transaction, so out and in share a timestamp and can't interleave
 * with another tab.
 */
export async function switchPunchToJob(jobId: string) {
  const db = await getDb();
  const tx = db.transaction(["punches", "jobs"], "readwrite");
  const store = tx.objectStore("punches");
  const all = await store.getAll();
  const open = all.filter((p) => p.punchedOutAt === null);
  const alreadyHere = open.find((p) => p.jobId === jobId);
  if (alreadyHere && open.length === 1) {
    await tx.done;
    return alreadyHere;
  }
  const at = now();
  for (const p of open) {
    if (p.id === alreadyHere?.id) continue;
    await store.put({ ...p, punchedOutAt: at });
  }
  if (alreadyHere) {
    await tx.done;
    return alreadyHere;
  }
  const punch: Punch = {
    id: id(),
    jobId,
    punchedInAt: at,
    punchedOutAt: null,
    source: "clock",
  };
  await markInProgressInTx(tx, jobId, at);
  await store.put(punch);
  await tx.done;
  return punch;
}

/** Reopen a finished job (logged as a status change) and punch in. */
export async function reopenAndPunchIn(jobId: string) {
  return switchPunchToJob(jobId);
}

/** Most recent jobs by last punch-in time (unique jobs). */
export async function listRecentJobs(limit = 5): Promise<RecentJobInfo[]> {
  const db = await getDb();
  const punches = await db.getAllFromIndex("punches", "by-in");
  punches.sort(
    (a, b) =>
      new Date(b.punchedInAt).getTime() - new Date(a.punchedInAt).getTime(),
  );

  const seen = new Set<string>();
  const results: RecentJobInfo[] = [];

  for (const punch of punches) {
    if (seen.has(punch.jobId)) continue;
    seen.add(punch.jobId);
    const job = await getJob(punch.jobId);
    if (!job) continue;
    const contact = await getContact(job.contactId);
    if (!contact) continue;
    results.push({ job, contact, lastPunchedInAt: punch.punchedInAt });
    if (results.length >= limit) break;
  }

  return results;
}

export async function listPhotosForJob(jobId: string): Promise<Photo[]> {
  const photos = await (await getDb()).getAllFromIndex(
    "photos",
    "by-job",
    jobId,
  );
  return photos.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function listAllPhotos(): Promise<Photo[]> {
  const photos = await (await getDb()).getAll("photos");
  return photos.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function normalizeCategory(value: unknown): PhotoCategory {
  return (PHOTO_CATEGORIES as readonly unknown[]).includes(value)
    ? (value as PhotoCategory)
    : "other";
}

/** Stores the original file as-is (no resizing or recompression). */
export async function addPhoto(
  jobId: string,
  blob: Blob,
  caption = "",
  category: PhotoCategory = "other",
) {
  const photo: Photo = {
    id: id(),
    jobId,
    blob,
    caption: caption.trim(),
    createdAt: now(),
    category: normalizeCategory(category),
  };
  await (await getDb()).put("photos", photo);
  return photo;
}

export async function updatePhoto(
  photoId: string,
  patch: { caption?: string; category?: PhotoCategory },
) {
  const db = await getDb();
  const tx = db.transaction("photos", "readwrite");
  const photo = await tx.store.get(photoId);
  if (!photo) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Photo not found.");
  }
  const next: Photo = {
    ...photo,
    ...(patch.caption !== undefined ? { caption: patch.caption.trim() } : {}),
    ...(patch.category !== undefined
      ? { category: normalizeCategory(patch.category) }
      : {}),
  };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function updatePhotoCaption(photoId: string, caption: string) {
  return updatePhoto(photoId, { caption });
}

export async function deletePhoto(photoId: string) {
  await (await getDb()).delete("photos", photoId);
}

export async function getDayNote(date: string) {
  const notes = await (await getDb()).getAllFromIndex(
    "dayNotes",
    "by-date",
    date,
  );
  return notes[0] ?? null;
}

export async function listDayNotes(): Promise<DayNote[]> {
  const notes = await (await getDb()).getAll("dayNotes");
  return notes.sort((a, b) => b.date.localeCompare(a.date));
}

export async function upsertDayNote(date: string, body: string) {
  const db = await getDb();
  const existing = await getDayNote(date);
  const note: DayNote = existing
    ? { ...existing, body, updatedAt: now() }
    : { id: id(), date, body, updatedAt: now() };
  await db.put("dayNotes", note);
  return note;
}

/** `open` counts jobs that aren't finished (not Completed or Paid). */
export async function countJobsForContact(contactId: string) {
  const jobs = await listJobsForContact(contactId);
  return {
    total: jobs.length,
    open: jobs.filter((j) => j.status !== "completed" && j.status !== "paid")
      .length,
  };
}

export type JobOverview = {
  job: Job;
  contact: Contact | null;
  /** Exact closed-entry minutes plus the running entry so far. */
  totalMinutes: number;
  photoCount: number;
  isActive: boolean;
  /** Latest of: created, any entry start/end, any history event. */
  lastActivityAt: string;
};

/** Every job with its customer, totals and last activity (for lists). */
export async function listJobOverviews(): Promise<JobOverview[]> {
  const db = await getDb();
  const [jobs, contacts, punches] = await Promise.all([
    listAllJobs(),
    listContacts(),
    db.getAll("punches"),
  ]);
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const photoCounts = await Promise.all(
    jobs.map((j) => db.countFromIndex("photos", "by-job", j.id)),
  );
  const byJob = new Map<string, Punch[]>();
  for (const p of punches) {
    const list = byJob.get(p.jobId) ?? [];
    list.push(p);
    byJob.set(p.jobId, list);
  }
  const nowMs = Date.now();
  return jobs.map((job, i) => {
    const list = byJob.get(job.id) ?? [];
    let totalMs = 0;
    let last = Date.parse(job.createdAt);
    for (const p of list) {
      const start = Date.parse(p.punchedInAt);
      const end = p.punchedOutAt ? Date.parse(p.punchedOutAt) : nowMs;
      totalMs += Math.max(0, end - start);
      last = Math.max(last, start, p.punchedOutAt ? end : start);
    }
    for (const e of job.history ?? []) last = Math.max(last, Date.parse(e.at));
    return {
      job,
      contact: contactMap.get(job.contactId) ?? null,
      totalMinutes: totalMs / 60000,
      photoCount: photoCounts[i] ?? 0,
      isActive: list.some((p) => p.punchedOutAt === null),
      lastActivityAt: new Date(last).toISOString(),
    };
  });
}

export async function photoCountForJob(jobId: string) {
  return (await listPhotosForJob(jobId)).length;
}

/** Snapshot every store for full-device backup (not a timecard export). */
export async function readAllData() {
  const [contacts, jobs, punches, dayNotes, photos] = await Promise.all([
    listContacts(),
    listAllJobs(),
    listAllPunches(),
    listDayNotes(),
    listAllPhotos(),
  ]);
  return { contacts, jobs, punches, dayNotes, photos };
}

/**
 * Wipe IndexedDB stores and replace with a full backup payload.
 * Photos must already include Blob values.
 */
export async function replaceAllData(data: {
  contacts: Contact[];
  jobs: (Job | StoredJob)[];
  punches: Punch[];
  dayNotes: DayNote[];
  photos: Photo[];
}) {
  const db = await getDb();
  const tx = db.transaction(
    ["contacts", "jobs", "punches", "photos", "dayNotes"],
    "readwrite",
  );

  await Promise.all([
    tx.objectStore("contacts").clear(),
    tx.objectStore("jobs").clear(),
    tx.objectStore("punches").clear(),
    tx.objectStore("photos").clear(),
    tx.objectStore("dayNotes").clear(),
  ]);

  for (const contact of data.contacts) {
    await tx.objectStore("contacts").put(normalizeContact(contact)!);
  }
  const knownStatuses: string[] = ["open", "closed", ...JOB_STATUSES];
  for (const job of data.jobs as StoredJob[]) {
    await tx.objectStore("jobs").put({
      ...job,
      title: job.title.trim(),
      notes: job.notes ?? "",
      // Keep the stored value (legacy or new); only repair unknown values.
      status: knownStatuses.includes(job.status) ? job.status : "in_progress",
    });
  }
  for (const punch of data.punches) {
    await tx.objectStore("punches").put({
      ...punch,
      punchedOutAt: punch.punchedOutAt ?? null,
    });
  }
  for (const note of data.dayNotes) {
    await tx.objectStore("dayNotes").put({
      ...note,
      body: note.body ?? "",
    });
  }
  for (const photo of data.photos) {
    await tx.objectStore("photos").put({
      ...photo,
      caption: photo.caption ?? "",
    });
  }

  await tx.done;
}
