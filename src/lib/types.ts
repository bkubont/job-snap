export type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
};

export type JobStatus = "open" | "closed";

export type Job = {
  id: string;
  contactId: string;
  title: string;
  status: JobStatus;
  notes: string;
  createdAt: string;
};

export type Punch = {
  id: string;
  jobId: string;
  punchedInAt: string;
  punchedOutAt: string | null;
};

export type Photo = {
  id: string;
  jobId: string;
  blob: Blob;
  caption: string;
  createdAt: string;
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
