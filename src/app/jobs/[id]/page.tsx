"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  Pencil,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import {
  useActivePunch,
  useDayNote,
  useJob,
  refreshSitefold,
} from "@/hooks/use-sitefold";
import {
  deleteJob,
  deletePunch,
  punchIn,
  punchOut,
  reopenAndPunchIn,
  switchPunchToJob,
  updateJob,
  updatePunch,
} from "@/lib/db";
import type { Punch } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  durationMinutes,
  formatClock,
  formatDateTime,
  formatDay,
  formatDuration,
  fromDatetimeLocalValue,
  hoursFromMinutes,
  toDatetimeLocalValue,
  todayKey,
} from "@/lib/time";

export default function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { job, contact, punches, photos } = useJob(id);
  const { active } = useActivePunch();
  const today = todayKey();
  const { note: dayNote, loading: dayNoteLoading, save: saveDayNote } =
    useDayNote(today);
  const [busy, setBusy] = useState(false);
  const [jobNotes, setJobNotes] = useState<string | null>(null);
  const [todayBody, setTodayBody] = useState<string | null>(null);
  const [daySavedFlash, setDaySavedFlash] = useState(false);
  const [editing, setEditing] = useState<Punch | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  if (job === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (job === null || !contact) {
    return (
      <div className="space-y-3">
        <p>Job not found.</p>
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
      </div>
    );
  }

  const notesValue = jobNotes ?? job.notes;
  const todayValue = todayBody ?? dayNote?.body ?? "";
  const isActiveHere = active?.job.id === job.id;
  const someoneElseActive = active && active.job.id !== job.id;
  const isClosed = job.status === "closed";
  const totalMinutes = punches.reduce(
    (sum, p) => sum + durationMinutes(p.punchedInAt, p.punchedOutAt),
    0,
  );
  const closedTotalMinutes = punches.reduce(
    (sum, p) =>
      p.punchedOutAt ? sum + durationMinutes(p.punchedInAt, p.punchedOutAt) : sum,
    0,
  );
  const closedTotalLabel =
    closedTotalMinutes < 60
      ? `${closedTotalMinutes}m`
      : `${Math.floor(closedTotalMinutes / 60)}h${
          closedTotalMinutes % 60 ? ` ${closedTotalMinutes % 60}m` : ""
        }`;

  async function onPunchIn() {
    setBusy(true);
    try {
      await punchIn(id);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not punch in");
    } finally {
      setBusy(false);
    }
  }

  async function onSwitch() {
    setBusy(true);
    try {
      await switchPunchToJob(id);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not switch jobs");
    } finally {
      setBusy(false);
    }
  }

  async function onReopenAndPunch() {
    setBusy(true);
    try {
      await reopenAndPunchIn(id);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not reopen and punch in");
    } finally {
      setBusy(false);
    }
  }

  async function onPunchOut() {
    setBusy(true);
    try {
      await punchOut();
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not punch out");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    await updateJob({ ...job!, notes: notesValue });
    setJobNotes(null);
    refreshSitefold();
  }

  async function persistTodayNote() {
    const next = todayBody;
    if (next === null) return;
    if (next === (dayNote?.body ?? "")) {
      setTodayBody(null);
      return;
    }
    await saveDayNote(next);
    setTodayBody(null);
    setDaySavedFlash(true);
    setTimeout(() => setDaySavedFlash(false), 1500);
  }

  async function onDelete() {
    if (!confirm("Delete this job, its punches, and photos?")) return;
    await deleteJob(id);
    refreshSitefold();
    router.push(`/contacts/${job!.contactId}`);
  }

  function openTitleEdit() {
    setTitleDraft(job!.title);
    setTitleError(null);
    setTitleEditing(true);
  }

  async function saveTitle() {
    const next = titleDraft.trim();
    if (!next) {
      setTitleError("Job title is required.");
      return;
    }
    setSavingTitle(true);
    setTitleError(null);
    try {
      await updateJob({ ...job!, title: next });
      refreshSitefold();
      setTitleEditing(false);
    } catch (e) {
      setTitleError(e instanceof Error ? e.message : "Could not save title");
    } finally {
      setSavingTitle(false);
    }
  }

  function openEdit(punch: Punch) {
    setEditing(punch);
    setEditIn(toDatetimeLocalValue(punch.punchedInAt));
    setEditOut(
      punch.punchedOutAt ? toDatetimeLocalValue(punch.punchedOutAt) : "",
    );
    setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editIn) {
      setEditError("Punch in time is required.");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updatePunch(editing.id, {
        punchedInAt: fromDatetimeLocalValue(editIn),
        punchedOutAt: editOut ? fromDatetimeLocalValue(editOut) : null,
      });
      refreshSitefold();
      setEditing(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not save punch");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDeletePunch(punch: Punch) {
    if (
      !confirm(
        punch.punchedOutAt
          ? "Delete this punch from the history?"
          : "Delete this open punch?",
      )
    ) {
      return;
    }
    try {
      await deletePunch(punch.id);
      refreshSitefold();
      if (editing?.id === punch.id) setEditing(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete punch");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="-ml-2 shrink-0">
          <Link href={`/contacts/${job.contactId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {contact.name}
          </p>
          <div className="flex items-start gap-1">
            <h1 className="min-w-0 flex-1 font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
              {job.title}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={openTitleEdit}
              aria-label="Edit job title"
              className="shrink-0"
            >
              <Pencil className="h-4 w-4 text-[oklch(0.4_0.04_155)]" />
            </Button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={job.status === "open" ? "default" : "secondary"}>
              {job.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDay(job.createdAt)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete job"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <Dialog
        open={titleEditing}
        onOpenChange={(open) => {
          if (!open && !savingTitle) setTitleEditing(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit job title</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="job-title">Title</Label>
            <Input
              id="job-title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="bg-white/70"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveTitle();
                }
              }}
            />
            {titleError ? (
              <p className="text-sm text-destructive" role="alert">
                {titleError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={savingTitle}
              onClick={() => setTitleEditing(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveTitle()}
              disabled={savingTitle}
              className="bg-[oklch(0.32_0.05_155)] text-[oklch(0.97_0.02_95)] hover:bg-[oklch(0.28_0.05_155)]"
            >
              {savingTitle ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="rounded-[1.5rem] bg-[oklch(0.32_0.05_155)] p-5 text-[oklch(0.97_0.02_95)] shadow-sm">
        <p className="text-sm text-[oklch(0.9_0.03_95_/0.8)]">Time clock</p>
        {isActiveHere ? (
          <div className="mt-3 space-y-3">
            <p className="font-heading text-2xl font-semibold">You&apos;re on the clock</p>
            <p className="text-sm opacity-80">
              In since {formatClock(active!.punch.punchedInAt)} ·{" "}
              {formatDuration(active!.punch.punchedInAt, null)} so far
            </p>
            <Button
              size="lg"
              disabled={busy}
              onClick={onPunchOut}
              className="w-full bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <Square className="h-4 w-4" />
              Punch out
            </Button>
          </div>
        ) : isClosed ? (
          <div className="mt-3 space-y-3">
            <p className="font-heading text-2xl font-semibold">Job closed</p>
            <p className="text-sm opacity-80">
              Reopen and start the clock in one tap.
            </p>
            <Button
              size="lg"
              disabled={busy}
              onClick={onReopenAndPunch}
              className="w-full bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <Play className="h-4 w-4" />
              Reopen &amp; punch in
            </Button>
          </div>
        ) : someoneElseActive ? (
          <div className="mt-3 space-y-3">
            <p className="font-heading text-2xl font-semibold">Switch jobs</p>
            <p className="text-sm opacity-80">
              You&apos;re on {active!.contact.name} / {active!.job.title}. Switch
              punches you out there and in here.
            </p>
            <Button
              size="lg"
              disabled={busy}
              onClick={onSwitch}
              className="w-full bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Switch to this job
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="font-heading text-2xl font-semibold">Punch in</p>
            <p className="text-sm opacity-80">
              Start tracking time on this job.
            </p>
            <Button
              size="lg"
              disabled={busy}
              onClick={onPunchIn}
              className="w-full bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <Play className="h-4 w-4" />
              Punch in
            </Button>
          </div>
        )}
        <p className="mt-4 border-t border-white/15 pt-3 text-sm tabular-nums text-[oklch(0.9_0.03_95_/0.9)]">
          Total hours{" "}
          <span className="font-semibold text-[oklch(0.97_0.02_95)]">
            {hoursFromMinutes(totalMinutes)}
          </span>
        </p>
      </section>

      <PhotoGallery jobId={job.id} photos={photos} />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Today&apos;s note</h2>
          <span className="text-xs text-muted-foreground">
            {daySavedFlash ? "Saved" : formatDay(today)}
          </span>
        </div>
        <Textarea
          value={todayValue}
          onChange={(e) => setTodayBody(e.target.value)}
          onBlur={() => {
            void persistTodayNote();
          }}
          placeholder="Quick day note while you're on the job…"
          rows={2}
          className="bg-white/70"
          disabled={dayNoteLoading}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">Job notes</h2>
        <Textarea
          value={notesValue}
          onChange={(e) => setJobNotes(e.target.value)}
          onBlur={() => {
            if (jobNotes !== null && jobNotes !== job.notes) saveNotes();
          }}
          placeholder="Materials, access codes, what to finish next…"
          rows={4}
          className="bg-white/70"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">Punch history</h2>
          {punches.length > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Closed total {closedTotalLabel}
            </p>
          )}
        </div>
        {punches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No punches yet.</p>
        ) : (
          <ul className="space-y-2">
            {punches.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3.5 py-3 text-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDateTime(p.punchedInAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.punchedOutAt
                      ? `Out ${formatClock(p.punchedOutAt)}`
                      : "Still open"}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-[oklch(0.35_0.05_155)]">
                  {formatDuration(p.punchedInAt, p.punchedOutAt)}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Edit punch"
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-4 w-4 text-[oklch(0.4_0.04_155)]" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete punch"
                    onClick={() => onDeletePunch(p)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit punch</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="punch-in">In</Label>
              <Input
                id="punch-in"
                type="datetime-local"
                value={editIn}
                onChange={(e) => setEditIn(e.target.value)}
                className="bg-white/70"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="punch-out">Out</Label>
                {editOut && (
                  <button
                    type="button"
                    className="text-xs font-medium text-[oklch(0.4_0.05_155)] underline-offset-2 hover:underline"
                    onClick={() => setEditOut("")}
                  >
                    Clear (leave open)
                  </button>
                )}
              </div>
              <Input
                id="punch-out"
                type="datetime-local"
                value={editOut}
                onChange={(e) => setEditOut(e.target.value)}
                className="bg-white/70"
              />
              <p className="text-xs text-muted-foreground">
                Leave out empty for an open punch. Only one open punch is
                allowed.
              </p>
            </div>
            {editError && (
              <p className="text-sm text-destructive" role="alert">
                {editError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveEdit}
              disabled={savingEdit}
              className="bg-[oklch(0.32_0.05_155)] text-[oklch(0.97_0.02_95)] hover:bg-[oklch(0.28_0.05_155)]"
            >
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
