"use client";

import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Play, Search } from "lucide-react";
import type { Contact, Job } from "@/lib/types";
import { isDoneStatus } from "@/lib/status";
import {
  addManualPunch,
  createContact,
  createJob,
  switchPunchToJob,
} from "@/lib/db";
import { refreshSitefold, useToday } from "@/hooks/use-sitefold";
import { formatMinutes } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/job-status";

const selectClass =
  "flex h-11 w-full rounded-lg border border-input bg-white/70 px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const NEW_CONTACT = "__new__";

/** Create a job — for an existing customer or a new one — optionally clocking in. */
export function AddJobDialog({
  open,
  onOpenChange,
  contacts,
  contactId: fixedContactId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  /** Lock the customer (when opened from a contact folder). */
  contactId?: string;
  onCreated?: (job: Job) => void;
}) {
  const [contactId, setContactId] = useState(fixedContactId ?? "");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...contacts].sort((a, b) => a.name.localeCompare(b.name)),
    [contacts],
  );
  const effectiveContact = fixedContactId ?? contactId;

  function reset() {
    setContactId(fixedContactId ?? "");
    setNewName("");
    setNewPhone("");
    setTitle("");
    setScheduledDate("");
    setAddress("");
    setDescription("");
    setMore(false);
    setError(null);
  }

  async function submit(punch: boolean) {
    if (busy) return;
    setError(null);
    if (!title.trim()) return setError("Job title is required.");
    if (!effectiveContact) return setError("Choose a customer.");
    if (effectiveContact === NEW_CONTACT && !newName.trim()) {
      return setError("Enter the new customer's name.");
    }
    setBusy(true);
    try {
      let cid = effectiveContact;
      if (cid === NEW_CONTACT) {
        const c = await createContact({
          name: newName,
          phone: newPhone,
          email: "",
          notes: "",
        });
        cid = c.id;
      }
      const job = await createJob(cid, title, {
        scheduledDate: scheduledDate || null,
        address,
        description,
        status: punch ? "in_progress" : undefined,
      });
      if (punch) await switchPunchToJob(job.id);
      refreshSitefold();
      reset();
      onOpenChange(false);
      onCreated?.(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(true);
          }}
        >
          {!fixedContactId ? (
            <div className="space-y-1.5">
              <Label htmlFor="job-contact">Customer</Label>
              <select
                id="job-contact"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose a customer…</option>
                <option value={NEW_CONTACT}>+ New customer</option>
                {sorted.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {effectiveContact === NEW_CONTACT ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="job-new-name">Name</Label>
                <Input
                  id="job-new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-new-phone">Phone</Label>
                <Input
                  id="job-new-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="job-title-new">Job title</Label>
            <Input
              id="job-title-new"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kitchen remodel, Service call…"
              autoFocus={!!fixedContactId}
            />
          </div>
          {more ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="job-scheduled">Scheduled date (optional)</Label>
                <Input
                  id="job-scheduled"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-address">Job address (optional)</Label>
                <Textarea
                  id="job-address"
                  rows={2}
                  className="min-h-0"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Leave blank to use the customer's address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-description">Description (optional)</Label>
                <Textarea
                  id="job-description"
                  rows={2}
                  className="min-h-0"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMore(true)}
              className="text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              Add schedule, address, description
            </button>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            <Play className="h-4 w-4" />
            {busy ? "Saving…" : "Create & clock in"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => void submit(false)}
          >
            {scheduledDate ? "Create as scheduled" : "Create without clocking in"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pick a job (search by job or customer). Finished jobs are listed last. */
export function JobPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  jobs,
  contacts,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  jobs: Job[];
  contacts: Contact[];
  onPick: (job: Job) => void;
}) {
  const [query, setQuery] = useState("");
  const contactMap = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts],
  );
  const q = query.trim().toLowerCase();
  const list = jobs
    .filter((j) => {
      if (!q) return true;
      const name = contactMap.get(j.contactId)?.name ?? "";
      return `${j.title} ${name}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const da = isDoneStatus(a.status) ? 1 : 0;
      const db = isDoneStatus(b.status) ? 1 : 0;
      if (da !== db) return da - db;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setQuery("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[85dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs or customers"
            className="h-11 pl-9 text-base"
            aria-label="Search jobs"
          />
        </div>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {jobs.length === 0 ? "No jobs yet — create one first." : "No matching jobs."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    onPick(j);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-white/70 px-3 py-2.5 text-left ring-1 ring-black/5 transition hover:bg-white"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{j.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {contactMap.get(j.contactId)?.name ?? "Unknown customer"}
                    </span>
                  </span>
                  <StatusBadge status={j.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Combine a YYYY-MM-DD date and HH:mm time (local) into an ISO timestamp. */
function localIso(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString();
}

/**
 * Add a completed time entry after the fact (missed punch, work done without
 * the phone). End before start means it ran past midnight.
 */
export function ManualEntryDialog({
  open,
  onOpenChange,
  jobs,
  contacts,
  jobId: fixedJobId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: Job[];
  contacts: Contact[];
  /** Lock the job (when opened from a job page). */
  jobId?: string;
}) {
  const [jobId, setJobId] = useState(fixedJobId ?? "");
  // Never read the clock during render (it aborts the server prerender).
  const today = useToday();
  const [pickedDate, setDate] = useState<string | null>(null);
  const date = pickedDate ?? today ?? "";
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactMap = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts],
  );
  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const ca = contactMap.get(a.contactId)?.name ?? "";
        const cb = contactMap.get(b.contactId)?.name ?? "";
        return `${ca} ${a.title}`.localeCompare(`${cb} ${b.title}`);
      }),
    [jobs, contactMap],
  );

  const effectiveJob = fixedJobId ?? jobId;
  const nextDay = !!start && !!end && end <= start;
  const preview = useMemo(() => {
    if (!date || !start || !end) return null;
    const inIso = localIso(date, start);
    const endDate = nextDay
      ? format(addDays(parseISO(`${date}T12:00:00`), 1), "yyyy-MM-dd")
      : date;
    const outIso = localIso(endDate, end);
    const minutes = (Date.parse(outIso) - Date.parse(inIso)) / 60000;
    return { inIso, outIso, minutes };
  }, [date, start, end, nextDay]);

  function reset() {
    setJobId(fixedJobId ?? "");
    setDate(null);
    setStart("08:00");
    setEnd("16:00");
    setNote("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!effectiveJob) return setError("Choose a job.");
    if (!preview || !(preview.minutes > 0)) return setError("Enter a start and end time.");
    setBusy(true);
    try {
      await addManualPunch(effectiveJob, preview.inIso, preview.outIso, note);
      refreshSitefold();
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add time manually</DialogTitle>
          <DialogDescription>
            For a missed punch or work done away from your phone. Marked as a
            manual entry in history and exports.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {!fixedJobId ? (
            <div className="space-y-1.5">
              <Label htmlFor="manual-job">Job</Label>
              <select
                id="manual-job"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose a job…</option>
                {sortedJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {contactMap.get(j.contactId)?.name ?? "Unknown"} — {j.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="manual-date">Date</Label>
            <Input
              id="manual-date"
              type="date"
              value={date}
              max={today ?? undefined}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-start">Start</Label>
              <Input
                id="manual-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-11 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-end">End</Label>
              <Input
                id="manual-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="h-11 text-base"
              />
            </div>
          </div>
          {preview && preview.minutes > 0 ? (
            <p className="text-sm text-muted-foreground">
              Duration{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatMinutes(preview.minutes)}
              </span>
              {nextDay ? " · ends the next day" : ""}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="manual-note">Reason (optional)</Label>
            <Input
              id="manual-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Forgot to clock in, phone died…"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Add entry"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
