import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  ActivePunchInfo,
  Contact,
  DayNote,
  Job,
  Photo,
  Punch,
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
    dbPromise = openDB<SitefoldDB>(DB_NAME, DB_VERSION, {
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
    });
  }
  return dbPromise;
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function listContacts(): Promise<Contact[]> {
  const db = await getDb();
  const all = await db.getAll("contacts");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getContact(contactId: string) {
  return (await getDb()).get("contacts", contactId);
}

export async function createContact(
  input: Pick<Contact, "name" | "phone" | "email" | "notes">,
) {
  const contact: Contact = {
    id: id(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    notes: input.notes.trim(),
    createdAt: now(),
  };
  await (await getDb()).put("contacts", contact);
  return contact;
}

export async function updateContact(contact: Contact) {
  await (await getDb()).put("contacts", contact);
  return contact;
}

export async function deleteContact(contactId: string) {
  const db = await getDb();
  const jobs = await db.getAllFromIndex("jobs", "by-contact", contactId);
  for (const job of jobs) {
    await deleteJob(job.id);
  }
  await db.delete("contacts", contactId);
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

export async function deleteJob(jobId: string) {
  const db = await getDb();
  const punches = await db.getAllFromIndex("punches", "by-job", jobId);
  for (const punch of punches) {
    await db.delete("punches", punch.id);
  }
  const photos = await db.getAllFromIndex("photos", "by-job", jobId);
  for (const photo of photos) {
    await db.delete("photos", photo.id);
  }
  await db.delete("jobs", jobId);
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

export async function getOpenPunch(): Promise<ActivePunchInfo | null> {
  const punches = await (await getDb()).getAll("punches");
  const open = punches.find((p) => p.punchedOutAt === null);
  if (!open) return null;
  const job = await getJob(open.jobId);
  if (!job) return null;
  const contact = await getContact(job.contactId);
  if (!contact) return null;
  return { punch: open, job, contact };
}

export async function punchIn(jobId: string) {
  const existing = await getOpenPunch();
  if (existing) {
    throw new Error(
      `Already punched in on "${existing.job.title}" for ${existing.contact.name}. Punch out first.`,
    );
  }
  const punch: Punch = {
    id: id(),
    jobId,
    punchedInAt: now(),
    punchedOutAt: null,
  };
  await (await getDb()).put("punches", punch);
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
