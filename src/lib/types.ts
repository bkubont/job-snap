export type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  /** Hourly billing rate; null/undefined = no rate (hours-only invoices). */
  hourlyRate?: number | null;
  createdAt: string;
};

export const JOB_STATUSES = [
  "scheduled",
  "in_progress",
  "on_hold",
  "completed",
  "paid",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * What may be stored. Jobs saved before the five statuses existed hold
 * "open"/"closed"; they are read as In Progress/Completed and only rewritten
 * when the user changes the status.
 */
export type StoredJobStatus = JobStatus | "open" | "closed";

export type JobEventType =
  | "created"
  | "status"
  | "title"
  | "details"
  | "note"
  | "time";

/** One entry in a job's history (status changes, edits, dated log notes). */
export type JobEvent = {
  id: string;
  at: string;
  type: JobEventType;
  /** Human-readable summary, e.g. "Status: Scheduled → In Progress". */
  text: string;
};

export type Job = {
  id: string;
  contactId: string;
  title: string;
  status: JobStatus;
  /** General job notes. */
  notes: string;
  createdAt: string;
  /** Job site address; empty = use the customer's address. */
  address?: string;
  /** Scheduled start date (YYYY-MM-DD) or null. */
  scheduledDate?: string | null;
  /** Short description of the work. */
  description?: string;
  /** Important instructions (gate codes, pets, access) shown prominently. */
  instructions?: string;
  /** Status changes, edits and dated log notes — newest last. */
  history?: JobEvent[];
};

export type Punch = {
  id: string;
  jobId: string;
  punchedInAt: string;
  punchedOutAt: string | null;
  /** "manual" = entered after the fact; absent/"clock" = punched live. */
  source?: "clock" | "manual";
  /** Optional reason or note, e.g. "Forgot to punch in". */
  note?: string;
};

export const PHOTO_CATEGORIES = ["before", "during", "after", "other"] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export type Photo = {
  id: string;
  jobId: string;
  blob: Blob;
  caption: string;
  createdAt: string;
  /** Absent on photos saved before categories existed — shown as Other. */
  category?: PhotoCategory;
};

export type DayNote = {
  id: string;
  date: string; // YYYY-MM-DD
  body: string;
  updatedAt: string;
};

export type ActivePunchInfo = {
  punch: Punch;
  job: Job;
  contact: Contact;
};

export type RecentJobInfo = {
  job: Job;
  contact: Contact;
  lastPunchedInAt: string;
};
