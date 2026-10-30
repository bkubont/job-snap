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
  Photo,
  Punch,
  RecentJobInfo,
} from "./types";

interface SitefoldDB extends DBSchema {
  contacts: {
    key: string;
    value: Contact;
    indexes: { "by-name": string };
  };
  jobs: {
    key: string;
    value: Job;
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
  const jobs = await (await getDb()).getAllFromIndex(
    "jobs",
    "by-contact",
    contactId,
  );
  return jobs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function listAllJobs(): Promise<Job[]> {
  return (await getDb()).getAll("jobs");
}

export async function getJob(jobId: string) {
  return (await getDb()).get("jobs", jobId);
}

export async function createJob(
  contactId: string,
  title: string,
  notes = "",
) {
  const job: Job = {
    id: id(),
    contactId,
    title: title.trim(),
    status: "open",
    notes: notes.trim(),
    createdAt: now(),
  };
  await (await getDb()).put("jobs", job);
  return job;
}

export async function updateJob(job: Job) {
  await (await getDb()).put("jobs", job);
  return job;
}

/**
 * Patch selected fields on the latest stored copy of a job (read + write in one
 * transaction), so an autosaving note can't overwrite a title or status that
 * changed since the screen loaded.
 */
export async function updateJobFields(
  jobId: string,
  patch: Partial<Pick<Job, "title" | "notes" | "status">>,
) {
  const db = await getDb();
  const tx = db.transaction("jobs", "readwrite");
  const current = await tx.store.get(jobId);
  if (!current) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("This job no longer exists.");
  }
  const next: Job = { ...current, ...patch };
  await tx.store.put(next);
  await tx.done;
  return next;
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

/**
 * Check-then-insert inside one readwrite transaction. IndexedDB serializes
 * overlapping readwrite transactions on the same store (also across tabs),
 * so two taps can never both open a timer.
 */
export async function punchIn(jobId: string) {
  const db = await getDb();
  const tx = db.transaction("punches", "readwrite");
  const store = tx.objectStore("punches");
  const all = await store.getAll();
  const open = all.find((p) => p.punchedOutAt === null);
  if (open) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error(
      `Already punched in on ${await describeOpenPunch(open)}. Punch out first.`,
    );
  }
  const punch: Punch = {
    id: id(),
    jobId,
    punchedInAt: now(),
    punchedOutAt: null,
  };
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
    throw new Error("No open punch to clock out.");
  }
  punch.punchedOutAt = now();
  await db.put("punches", punch);
  return punch;
}

export async function updatePunch(
  punchId: string,
  patch: { punchedInAt?: string; punchedOutAt?: string | null },
) {
  // One transaction: the "no other open punch" check and the write can't
  // interleave with a punch-in from another tab. Throwing before put() leaves
  // the transaction with nothing to commit.
  const db = await getDb();
  const tx = db.transaction("punches", "readwrite");
  const punch = await tx.store.get(punchId);
  if (!punch) {
    throw new Error("Punch not found.");
  }

  const next: Punch = {
    ...punch,
    punchedInAt: patch.punchedInAt ?? punch.punchedInAt,
    punchedOutAt:
      patch.punchedOutAt !== undefined ? patch.punchedOutAt : punch.punchedOutAt,
  };

  if (!next.punchedInAt || Number.isNaN(Date.parse(next.punchedInAt))) {
    throw new Error("Punch in time is required.");
  }

  if (next.punchedOutAt !== null) {
    if (Number.isNaN(Date.parse(next.punchedOutAt))) {
      throw new Error("Punch out time is invalid.");
    }
    if (
      new Date(next.punchedOutAt).getTime() <=
      new Date(next.punchedInAt).getTime()
    ) {
      throw new Error("Punch out time must be after punch in time.");
    }
  } else {
    const all = await tx.store.getAll();
    const otherOpen = all.find(
      (p) => p.id !== punchId && p.punchedOutAt === null,
    );
    if (otherOpen) {
      throw new Error(
        "Another punch is already open. Set an out time there (or punch out) before leaving this punch open.",
      );
    }
  }

  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function deletePunch(punchId: string) {
  const db = await getDb();
  const punch = await db.get("punches", punchId);
  if (!punch) {
    throw new Error("Punch not found.");
  }
  await db.delete("punches", punchId);
}

/**
 * Punch out any open punch, then punch in on `jobId` (no-op if already open
 * there). One transaction, so out and in share a timestamp and can't interleave
 * with another tab.
 */
export async function switchPunchToJob(jobId: string) {
  const db = await getDb();
  const tx = db.transaction("punches", "readwrite");
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
  const punch: Punch = { id: id(), jobId, punchedInAt: at, punchedOutAt: null };
  await store.put(punch);
  await tx.done;
  return punch;
}

/** Ensure job is open, then switch/punch in. */
export async function reopenAndPunchIn(jobId: string) {
  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found.");
  if (job.status === "closed") {
    await updateJob({ ...job, status: "open" });
  }
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

export async function addPhoto(jobId: string, blob: Blob, caption = "") {
  const photo: Photo = {
    id: id(),
    jobId,
    blob,
    caption: caption.trim(),
    createdAt: now(),
  };
  await (await getDb()).put("photos", photo);
  return photo;
}

export async function updatePhotoCaption(photoId: string, caption: string) {
  const db = await getDb();
  const photo = await db.get("photos", photoId);
  if (!photo) throw new Error("Photo not found.");
  const next: Photo = { ...photo, caption: caption.trim() };
  await db.put("photos", next);
  return next;
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

export async function countJobsForContact(contactId: string) {
  const jobs = await listJobsForContact(contactId);
  return {
    total: jobs.length,
    open: jobs.filter((j) => j.status === "open").length,
  };
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
  jobs: Job[];
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
  for (const job of data.jobs) {
    await tx.objectStore("jobs").put({
      ...job,
      title: job.title.trim(),
      notes: job.notes ?? "",
      status: job.status === "closed" ? "closed" : "open",
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
