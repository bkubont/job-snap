"use client";

import { Suspense, use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  MapPin,
  Pencil,
  Phone,
  Play,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import {
  useActivePunch,
  useAutosave,
  useDayNote,
  useJob,
  useTicker,
  useToday,
  refreshSitefold,
} from "@/hooks/use-sitefold";
import {
  addJobLogNote,
  deleteJob,
  deleteJobLogNote,
  deletePunch,
  punchIn,
  punchOut,
  reopenAndPunchIn,
  switchPunchToJob,
  updateJobFields,
  updatePunch,
} from "@/lib/db";
import type { Contact, Job, Photo, Punch } from "@/lib/types";
import { STATUS_LABEL, isDoneStatus } from "@/lib/status";
import { mapsDirectionsUrl } from "@/lib/export";
import { useSettings } from "@/lib/settings";
import { minutesForPunches, todayMinutes, weekMinutes } from "@/lib/totals";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhotoGallery } from "@/components/photo-gallery";
import { LoadError, SaveStatus } from "@/components/load-error";
import { StatusPicker } from "@/components/job-status";
import { ManualEntryDialog } from "@/components/job-dialogs";
import {
  formatClock,
  formatDateTime,
  formatDay,
  formatDuration,
  formatMinutes,
  fromDatetimeLocalValue,
  hoursFromMinutes,
  toDatetimeLocalValue,
} from "@/lib/time";

const TABS = ["overview", "time", "photos", "notes", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  time: "Time",
  photos: "Photos",
  notes: "Notes",
  history: "History",
};

/**
 * Keep the stored timestamp (with its seconds) when the minute-precision
 * input wasn't changed; only an edited field is rewritten.
 */
function editedTimestamp(original: string | null, inputValue: string) {
  if (!inputValue) return null;
  if (original && toDatetimeLocalValue(original) === inputValue) return original;
  return fromDatetimeLocalValue(inputValue);
}

export default function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <JobWorkspace id={id} />
    </Suspense>
  );
}

function JobWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as Tab)
    : "overview";
  const { job, contact, punches, photos, error, retry } = useJob(id);
  const { active } = useActivePunch();
  const today = useToday();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isActiveHere = active?.job.id === id;
  useTicker(isActiveHere, 30_000);

  if (job === undefined) {
    return error ? (
      <LoadError error={error} onRetry={retry} what="this job" />
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }
  if (job === null || !contact) {
    return (
      <div className="space-y-3">
        <p>Job not found. It may have been deleted.</p>
        <Button asChild variant="outline">
          <Link href="/jobs">All jobs</Link>
        </Button>
      </div>
    );
  }

  const someoneElseActive = active && active.job.id !== job.id;
  const isDone = isDoneStatus(job.status);
  const allMinutes = minutesForPunches(punches);
  const todayMins = today ? todayMinutes(punches) : 0;
  const weekMins = today ? weekMinutes(punches, settings.weekStartsOn) : 0;

  function selectTab(next: Tab) {
    router.replace(next === "overview" ? `/jobs/${id}` : `/jobs/${id}?tab=${next}`, {
      scroll: false,
    });
  }

  async function run(action: () => Promise<unknown>, failMsg: string) {
    setBusy(true);
    try {
      await action();
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : failMsg);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (
      !confirm(
        `Delete "${job!.title}" with its ${punches.length} time entr${
          punches.length === 1 ? "y" : "ies"
        } and ${photos.length} photo${photos.length === 1 ? "" : "s"}? This can't be undone.`,
      )
    )
      return;
    try {
      await deleteJob(id);
      refreshSitefold();
      router.push(`/contacts/${job!.contactId}`);
    } catch (e) {
      alert(
        e instanceof Error ? `Nothing was deleted: ${e.message}` : "Nothing was deleted.",
      );
    }
  }

  const clockButtonClass =
    "h-12 w-full bg-[oklch(0.82_0.12_75)] text-base text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-11 w-11 shrink-0">
          <Link href={`/contacts/${job.contactId}`} aria-label={`Back to ${contact.name}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${contact.id}`}
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {contact.name}
          </Link>
          <h1 className="font-heading text-2xl font-semibold leading-tight tracking-tight text-[oklch(0.28_0.04_155)]">
            {job.title}
          </h1>
          <div className="mt-2">
            <StatusPicker jobId={job.id} status={job.status} size="md" />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={() => setDetailsOpen(true)}
          aria-label="Edit job details"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {job.instructions ? (
        <div
          role="note"
          className="flex gap-2 rounded-2xl bg-[oklch(0.94_0.05_75)] px-4 py-3 text-sm text-[oklch(0.3_0.05_65)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="whitespace-pre-wrap">
            <span className="font-semibold">Important: </span>
            {job.instructions}
          </p>
        </div>
      ) : null}

      {/* Clock — always visible */}
      <section className="rounded-[1.5rem] bg-[oklch(0.32_0.05_155)] p-5 text-[oklch(0.97_0.02_95)] shadow-sm">
        {isActiveHere ? (
          <div className="space-y-3">
            <p className="font-heading text-2xl font-semibold">On the clock</p>
            <p className="text-sm opacity-80">
              Since {formatClock(active!.punch.punchedInAt)} ·{" "}
              {formatDuration(active!.punch.punchedInAt, null)} so far
            </p>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => run(() => punchOut(active!.punch.id), "Could not clock out")}
              className={clockButtonClass}
            >
              <Square className="h-4 w-4" />
              Clock out
            </Button>
          </div>
        ) : someoneElseActive ? (
          <div className="space-y-3">
            <p className="font-heading text-2xl font-semibold">Switch here?</p>
            <p className="text-sm opacity-80">
              You&apos;re on {active!.job.title} ({active!.contact.name}). Switching
              clocks you out there and in here.
            </p>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => run(() => switchPunchToJob(id), "Could not switch jobs")}
              className={clockButtonClass}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Switch to this job
            </Button>
          </div>
        ) : isDone ? (
          <div className="space-y-3">
            <p className="font-heading text-2xl font-semibold">
              {STATUS_LABEL[job.status]}
            </p>
            <p className="text-sm opacity-80">
              Clocking in moves it back to In Progress.
            </p>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => run(() => reopenAndPunchIn(id), "Could not clock in")}
              className={clockButtonClass}
            >
              <Play className="h-4 w-4" />
              Reopen &amp; clock in
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-heading text-2xl font-semibold">Ready to start?</p>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => run(() => punchIn(id), "Could not clock in")}
              className={clockButtonClass}
            >
              <Play className="h-4 w-4" />
              Clock in
            </Button>
          </div>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3 text-center tabular-nums">
          {[
            ["Today", todayMins],
            ["This week", weekMins],
            ["All time", allMinutes],
          ].map(([label, mins]) => (
            <div key={label as string}>
              <dt className="text-[11px] opacity-75">{label}</dt>
              <dd className="font-semibold">{hoursFromMinutes(mins as number)} h</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Section tabs */}
      <div
        role="tablist"
        aria-label="Job sections"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 py-1"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => selectTab(t)}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm font-medium transition",
              tab === t
                ? "bg-[oklch(0.32_0.05_155)] text-[oklch(0.97_0.02_95)]"
                : "text-muted-foreground hover:bg-black/5",
            )}
          >
            {TAB_LABEL[t]}
            {t === "photos" && photos.length ? ` (${photos.length})` : ""}
            {t === "time" && punches.length ? ` (${punches.length})` : ""}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TAB_LABEL[tab]}>
        {tab === "overview" ? (
          <OverviewTab job={job} contact={contact} onEdit={() => setDetailsOpen(true)} onDelete={onDelete} />
        ) : tab === "time" ? (
          <TimeTab job={job} contact={contact} punches={punches} />
        ) : tab === "photos" ? (
          <PhotoGallery jobId={job.id} photos={photos} />
        ) : tab === "notes" ? (
          <NotesTab job={job} />
        ) : (
          <HistoryTab job={job} punches={punches} photos={photos} />
        )}
      </div>

      <EditDetailsDialog job={job} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </div>
  );
}

function OverviewTab({
  job,
  contact,
  onEdit,
  onDelete,
}: {
  job: Job;
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const address = job.address || contact.address;
  const directions = mapsDirectionsUrl(address);
  const phoneHref = contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : null;
  const row = "flex min-h-12 items-start gap-3 px-4 py-3";
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-black/5 rounded-2xl bg-white/70 text-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
        <div className={row}>
          <dt className="w-24 shrink-0 text-muted-foreground">Customer</dt>
          <dd className="min-w-0 flex-1 font-medium">
            <Link href={`/contacts/${contact.id}`} className="underline-offset-2 hover:underline">
              {contact.name}
            </Link>
          </dd>
        </div>
        <div className={row}>
          <dt className="w-24 shrink-0 text-muted-foreground">Phone</dt>
          <dd className="min-w-0 flex-1">
            {phoneHref ? (
              <a href={phoneHref} className="inline-flex items-center gap-1.5 font-medium text-[oklch(0.35_0.06_155)]">
                <Phone className="h-3.5 w-3.5" />
                {contact.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className="w-24 shrink-0 text-muted-foreground">Address</dt>
          <dd className="min-w-0 flex-1">
            {address ? (
              <>
                <p className="whitespace-pre-wrap">{address}</p>
                {!job.address ? (
                  <p className="text-xs text-muted-foreground">Customer&apos;s address</p>
                ) : null}
                {directions ? (
                  <a
                    href={directions}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 font-medium text-[oklch(0.35_0.06_155)]"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Get directions
                  </a>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className="w-24 shrink-0 text-muted-foreground">Scheduled</dt>
          <dd className="min-w-0 flex-1">
            {job.scheduledDate ? formatDay(job.scheduledDate) : <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
        <div className={row}>
          <dt className="w-24 shrink-0 text-muted-foreground">Description</dt>
          <dd className="min-w-0 flex-1 whitespace-pre-wrap">
            {job.description || <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
        <div className={row}>
          <dt className="w-24 shrink-0 text-muted-foreground">Created</dt>
          <dd className="min-w-0 flex-1">{formatDay(job.createdAt)}</dd>
        </div>
      </dl>
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 flex-1" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Edit details
        </Button>
        <Button
          variant="ghost"
          className="h-11 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete job
        </Button>
      </div>
    </div>
  );
}

function EditDetailsDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    address: "",
    scheduledDate: "",
    description: "",
    instructions: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openWith(v: boolean) {
    if (saving) return;
    onOpenChange(v);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateJobFields(job.id, {
        title: form.title,
        address: form.address,
        scheduledDate: form.scheduledDate || null,
        description: form.description,
        instructions: form.instructions,
      });
      refreshSitefold();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  // Load current values whenever the dialog is opened from outside.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm({
        title: job.title,
        address: job.address ?? "",
        scheduledDate: job.scheduledDate ?? "",
        description: job.description ?? "",
        instructions: job.instructions ?? "",
      });
      setError(null);
    }
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job details</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="d-title">Title</Label>
            <Input id="d-title" {...field("title")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-scheduled">Scheduled date</Label>
            <Input id="d-scheduled" type="date" {...field("scheduledDate")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-address">Job address</Label>
            <Textarea
              id="d-address"
              rows={2}
              className="min-h-0"
              placeholder="Blank = customer's address"
              {...field("address")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-description">Description</Label>
            <Textarea id="d-description" rows={3} {...field("description")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-instructions">Important instructions</Label>
            <Textarea
              id="d-instructions"
              rows={2}
              placeholder="Gate code, pets, parking, who to ask for…"
              {...field("instructions")}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => openWith(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TimeTab({
  job,
  contact,
  punches,
}: {
  job: Job;
  contact: Contact;
  punches: Punch[];
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<Punch | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const closedTotal = minutesForPunches(punches.filter((p) => p.punchedOutAt));

  function openEdit(punch: Punch) {
    setEditing(punch);
    setEditIn(toDatetimeLocalValue(punch.punchedInAt));
    setEditOut(punch.punchedOutAt ? toDatetimeLocalValue(punch.punchedOutAt) : "");
    setEditNote(punch.note ?? "");
    setEditError(null);
  }

  async function saveEdit() {
    if (!editing || savingEdit) return;
    if (!editIn) {
      setEditError("Start time is required.");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updatePunch(editing.id, {
        punchedInAt: editedTimestamp(editing.punchedInAt, editIn)!,
        punchedOutAt: editedTimestamp(editing.punchedOutAt, editOut),
        note: editNote,
      });
      refreshSitefold();
      setEditing(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not save entry");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDeletePunch(punch: Punch) {
    if (
      !confirm(
        `Delete the ${formatDuration(punch.punchedInAt, punch.punchedOutAt)} entry from ${formatDateTime(
          punch.punchedInAt,
        )}? It will be noted in the job history.`,
      )
    ) {
      return;
    }
    try {
      await deletePunch(punch.id);
      refreshSitefold();
      if (editing?.id === punch.id) setEditing(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete entry");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          Completed entries: {formatMinutes(closedTotal)} ({hoursFromMinutes(closedTotal)} h)
        </p>
        <Button size="sm" variant="outline" className="h-10" onClick={() => setManualOpen(true)}>
          <Plus className="h-4 w-4" />
          Add time
        </Button>
      </div>
      {punches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] px-4 py-8 text-center text-sm text-muted-foreground">
          No time recorded yet. Clock in above, or add time you forgot to record.
        </p>
      ) : (
        <ul className="space-y-2">
          {punches.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-xl bg-white/70 py-2 pr-1 pl-3.5 text-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {formatDay(p.punchedInAt)} · {formatClock(p.punchedInAt)} –{" "}
                  {p.punchedOutAt ? formatClock(p.punchedOutAt) : "now"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.punchedOutAt ? null : "Running · "}
                  {p.source === "manual" ? "Manual entry" : "Clocked"}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular-nums text-[oklch(0.35_0.05_155)]">
                {formatDuration(p.punchedInAt, p.punchedOutAt)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Edit entry"
                onClick={() => openEdit(p)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Delete entry"
                onClick={() => onDeletePunch(p)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        jobs={[job]}
        contacts={[contact]}
        jobId={job.id}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && !savingEdit && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit time entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="punch-in">Start</Label>
              <Input
                id="punch-in"
                type="datetime-local"
                value={editIn}
                onChange={(e) => setEditIn(e.target.value)}
                className="h-11 bg-white/70 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="punch-out">End</Label>
                {editOut ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-[oklch(0.4_0.05_155)] underline-offset-2 hover:underline"
                    onClick={() => setEditOut("")}
                  >
                    Clear (still running)
                  </button>
                ) : null}
              </div>
              <Input
                id="punch-out"
                type="datetime-local"
                value={editOut}
                onChange={(e) => setEditOut(e.target.value)}
                className="h-11 bg-white/70 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="punch-note">Note (optional)</Label>
              <Input
                id="punch-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Why it was changed, what was done…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Changes are recorded in the job history. Entries can&apos;t overlap.
            </p>
            {editError ? (
              <p className="text-sm text-destructive" role="alert">
                {editError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotesTab({ job }: { job: Job }) {
  const today = useToday();
  const { note: dayNote, loading: dayNoteLoading, save: saveDayNote } = useDayNote(today);
  const jobNotes = useAutosave(job.notes, (notes) =>
    updateJobFields(job.id, { notes }).then(refreshSitefold),
  );
  const todayNote = useAutosave(dayNote?.body ?? "", saveDayNote);
  const [logText, setLogText] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  const logNotes = (job.history ?? []).filter((e) => e.type === "note").reverse();

  async function addLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logText.trim() || logBusy) return;
    setLogBusy(true);
    try {
      await addJobLogNote(job.id, logText);
      setLogText("");
      refreshSitefold();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not add note");
    } finally {
      setLogBusy(false);
    }
  }

  async function removeLog(eventId: string) {
    if (!confirm("Delete this dated note? This can't be undone.")) return;
    try {
      await deleteJobLogNote(job.id, eventId);
      refreshSitefold();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete note");
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Job notes</h2>
          <SaveStatus
            status={jobNotes.status}
            dirty={jobNotes.dirty}
            error={jobNotes.error}
            onRetry={() => void jobNotes.flush()}
          />
        </div>
        <Textarea
          value={jobNotes.value}
          onChange={(e) => jobNotes.setValue(e.target.value)}
          onBlur={() => void jobNotes.flush()}
          placeholder="Materials, measurements, what to finish next…"
          rows={5}
          className="bg-white/70 text-base"
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">Dated notes</h2>
        <form onSubmit={addLog} className="flex gap-2">
          <Input
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            placeholder="What happened today on this job…"
            className="h-11 bg-white/70 text-base"
            aria-label="New dated note"
          />
          <Button type="submit" className="h-11" disabled={logBusy || !logText.trim()}>
            Add
          </Button>
        </form>
        {logNotes.length ? (
          <ul className="space-y-2">
            {logNotes.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-2 rounded-xl bg-white/70 py-2.5 pr-1 pl-3.5 text-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.at)}</p>
                  <p className="whitespace-pre-wrap">{e.text}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Delete dated note"
                  onClick={() => void removeLog(e.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Time-stamped entries for this job, newest first.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Today&apos;s note</h2>
          <SaveStatus
            status={todayNote.status}
            dirty={todayNote.dirty}
            error={todayNote.error}
            onRetry={() => void todayNote.flush()}
            idleLabel={today ? formatDay(today) : ""}
          />
        </div>
        <Textarea
          value={todayNote.value}
          onChange={(e) => todayNote.setValue(e.target.value)}
          onBlur={() => void todayNote.flush()}
          placeholder="Quick day note while you're on the job…"
          rows={2}
          className="bg-white/70 text-base"
          disabled={!today || dayNoteLoading}
        />
        <p className="text-xs text-muted-foreground">
          The day&apos;s general note — shared across all jobs and shown on the Notes page.
        </p>
      </section>
    </div>
  );
}

type TimelineItem = { id: string; at: string; title: string; detail?: string };

function HistoryTab({
  job,
  punches,
  photos,
}: {
  job: Job;
  punches: Punch[];
  photos: Photo[];
}) {
  const items = useMemo(() => {
    const list: TimelineItem[] = [
      { id: "created", at: job.createdAt, title: "Job created" },
    ];
    for (const e of job.history ?? []) {
      list.push({
        id: e.id,
        at: e.at,
        title:
          e.type === "note"
            ? "Note"
            : e.type === "status"
              ? "Status changed"
              : e.type === "time"
                ? "Time entry"
                : "Edited",
        detail: e.text,
      });
    }
    for (const p of punches) {
      if (p.source === "manual") continue; // logged when added
      list.push({ id: `in-${p.id}`, at: p.punchedInAt, title: "Clocked in" });
      if (p.punchedOutAt) {
        list.push({
          id: `out-${p.id}`,
          at: p.punchedOutAt,
          title: "Clocked out",
          detail: formatDuration(p.punchedInAt, p.punchedOutAt),
        });
      }
    }
    // Group photos taken the same day into one entry.
    const byDay = new Map<string, Photo[]>();
    for (const ph of photos) {
      const key = ph.createdAt.slice(0, 10);
      byDay.set(key, [...(byDay.get(key) ?? []), ph]);
    }
    for (const [day, group] of byDay) {
      const latest = group.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
      list.push({
        id: `ph-${day}`,
        at: latest.createdAt,
        title: `${group.length} photo${group.length === 1 ? "" : "s"} added`,
      });
    }
    return list.sort((a, b) => parseISO(b.at).getTime() - parseISO(a.at).getTime());
  }, [job, punches, photos]);

  return (
    <ol className="relative space-y-3 border-l border-[oklch(0.35_0.03_155_/0.2)] pl-4">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span className="absolute top-1.5 -left-[1.3rem] h-2.5 w-2.5 rounded-full bg-[oklch(0.45_0.06_155)]" />
          <p className="text-xs text-muted-foreground">{formatDateTime(item.at)}</p>
          <p className="text-sm font-medium">{item.title}</p>
          {item.detail ? (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{item.detail}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
