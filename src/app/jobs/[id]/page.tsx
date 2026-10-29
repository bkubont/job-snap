"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Square, Trash2 } from "lucide-react";
import {
  useActivePunch,
  useJob,
  refreshSitefold,
} from "@/hooks/use-sitefold";
import { deleteJob, punchIn, punchOut, updateJob } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PhotoGallery } from "@/components/photo-gallery";
import {
  formatClock,
  formatDateTime,
  formatDay,
  formatDuration,
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
  const [busy, setBusy] = useState(false);
  const [jobNotes, setJobNotes] = useState<string | null>(null);

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
  const isActiveHere = active?.job.id === job.id;
  const someoneElseActive = active && active.job.id !== job.id;

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
        ) : (
          <div className="mt-3 space-y-3">
            <p className="font-heading text-2xl font-semibold">Punch in</p>
            {someoneElseActive ? (
              <p className="text-sm opacity-80">
                You&apos;re already clocked on {active!.contact.name} /{" "}
                {active!.job.title}. Punch out there first.
              </p>
            ) : (
              <p className="text-sm opacity-80">
                Start tracking time on this job.
              </p>
            )}
            <Button
              size="lg"
              disabled={busy || !!someoneElseActive || job.status === "closed"}
              onClick={onPunchIn}
              className="w-full bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <Play className="h-4 w-4" />
              Punch in
            </Button>
          </div>
        )}
      </section>

      <PhotoGallery jobId={job.id} photos={photos} />

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
