"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Play, Square, Trash2 } from "lucide-react";
import {
  useActivePunch,
  useJob,
  useDayNote,
  refreshSitefold,
} from "@/hooks/use-sitefold";
import {
  deleteJob,
  punchIn,
  punchOut,
  switchPunchToJob,
  reopenAndPunchIn,
  updateJob,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PhotoGallery } from "@/components/photo-gallery";
import {
  formatClock,
  formatDateTime,
  formatDay,
  formatDuration,
  hoursFromMinutes,
  durationMinutes,
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
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
            {job.title}
          </h1>
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
        <h2 className="font-heading text-lg font-semibold">Punch history</h2>
        {punches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No punches yet.</p>
        ) : (
          <ul className="space-y-2">
            {punches.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3.5 py-3 text-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
              >
                <div>
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
