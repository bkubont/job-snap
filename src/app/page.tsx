"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowRightLeft,
  Briefcase,
  Camera,
  ChevronRight,
  NotebookPen,
  Play,
  Square,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  refreshSitefold,
  useActivePunch,
  useContacts,
  useJobOverviews,
  useTicker,
  useTimeData,
  useToday,
} from "@/hooks/use-sitefold";
import { punchOut, switchPunchToJob } from "@/lib/db";
import { JOB_STATUSES, type Job } from "@/lib/types";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/status";
import { formatClock, formatDuration, formatMinutes, hoursFromMinutes } from "@/lib/time";
import { todayMinutes, weekMinutes } from "@/lib/totals";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/load-error";
import { StatusBadge } from "@/components/job-status";
import { AddJobDialog, JobPickerDialog } from "@/components/job-dialogs";

export default function DashboardPage() {
  const router = useRouter();
  const today = useToday();
  const settings = useSettings();
  const { contacts, loading: contactsLoading, error, retry } = useContacts();
  const { overviews, loading: jobsLoading } = useJobOverviews();
  const { active } = useActivePunch();
  const { punches } = useTimeData();
  const [busy, setBusy] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "clock" | "photo">(null);
  const [addJobOpen, setAddJobOpen] = useState(false);
  useTicker(!!active, 1000);

  const jobs = useMemo(() => overviews.map((o) => o.job), [overviews]);
  const recent = useMemo(
    () =>
      [...overviews]
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
        .slice(0, 5),
    [overviews],
  );
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<
      (typeof JOB_STATUSES)[number],
      number
    >;
    for (const o of overviews) counts[o.job.status] += 1;
    return counts;
  }, [overviews]);

  // `today` is null during the server prerender; totals need the clock.
  const todayMins = today ? todayMinutes(punches) : 0;
  const weekMins = today ? weekMinutes(punches, settings.weekStartsOn) : 0;

  const loading = contactsLoading || jobsLoading;
  const isEmpty = !loading && !error && contacts.length === 0 && jobs.length === 0;

  async function onPunchOut() {
    if (!active) return;
    setBusy(true);
    try {
      await punchOut(active.punch.id);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not clock out");
    } finally {
      setBusy(false);
    }
  }

  async function clockInto(job: Job) {
    setBusyJobId(job.id);
    try {
      await switchPunchToJob(job.id);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not clock in");
    } finally {
      setBusyJobId(null);
    }
  }

  if (error && !contacts.length) {
    return <LoadError error={error} onRetry={retry} what="your data" />;
  }

  return (
    <div className="space-y-6">
      {/* Today's work */}
      <section
        aria-label="Today's work"
        className="rounded-[1.5rem] bg-[oklch(0.32_0.05_155)] p-5 text-[oklch(0.97_0.02_95)] shadow-sm"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-[oklch(0.9_0.03_95_/0.8)]">Today</p>
          <p className="text-xs text-[oklch(0.9_0.03_95_/0.7)] tabular-nums">
            This week {hoursFromMinutes(weekMins)} h
          </p>
        </div>
        <p className="mt-1 font-heading text-4xl font-semibold tabular-nums">
          {formatMinutes(todayMins)}
        </p>
        {active ? (
          <div className="mt-4 space-y-3">
            <Link
              href={`/jobs/${active.job.id}`}
              className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.82_0.14_75)] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[oklch(0.82_0.14_75)]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  On the clock · {formatDuration(active.punch.punchedInAt, null)}
                </span>
                <span className="block truncate text-xs opacity-80">
                  {active.job.title} · {active.contact.name} · since{" "}
                  {formatClock(active.punch.punchedInAt)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 opacity-70" />
            </Link>
            <Button
              size="lg"
              disabled={busy}
              onClick={onPunchOut}
              className="h-12 w-full bg-[oklch(0.82_0.12_75)] text-base text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <Square className="h-4 w-4" />
              Clock out
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-sm opacity-80">Not clocked in.</p>
            <Button
              size="lg"
              disabled={loading}
              onClick={() => (jobs.length ? setPicker("clock") : setAddJobOpen(true))}
              className="h-12 w-full bg-[oklch(0.82_0.12_75)] text-base text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <Play className="h-4 w-4" />
              Clock in
            </Button>
          </div>
        )}
      </section>

      {isEmpty ? (
        <section className="space-y-3 rounded-2xl bg-white/70 p-5 ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
          <h1 className="font-heading text-xl font-semibold text-[oklch(0.28_0.04_155)]">
            Welcome to Job Snap
          </h1>
          <p className="text-sm text-muted-foreground">
            Track customers, jobs, hours, photos and notes — all saved on this
            device. Three steps to get going:
          </p>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="font-semibold">1.</span>
              <span>
                <Link href="/contacts?import=1" className="font-medium underline underline-offset-2">
                  Import contacts
                </Link>{" "}
                from a .vcf file, or{" "}
                <Link href="/contacts?new=1" className="font-medium underline underline-offset-2">
                  add a customer
                </Link>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">2.</span>
              <span>
                <button
                  type="button"
                  onClick={() => setAddJobOpen(true)}
                  className="font-medium underline underline-offset-2"
                >
                  Create a job
                </button>{" "}
                and clock in.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">3.</span>
              <span>Snap photos and notes on the job, then export your timecard.</span>
            </li>
          </ol>
        </section>
      ) : null}

      {/* Quick actions */}
      <section aria-label="Quick actions" className="grid grid-cols-3 gap-2">
        <QuickAction
          icon={Briefcase}
          label="Add job"
          onClick={() => setAddJobOpen(true)}
        />
        <QuickAction icon={UserPlus} label="Add contact" href="/contacts?new=1" />
        <QuickAction icon={Upload} label="Import contacts" href="/contacts?import=1" />
        <QuickAction icon={NotebookPen} label="Add note" href="/notes" />
        <QuickAction
          icon={Camera}
          label="Add photo"
          onClick={() =>
            active
              ? router.push(`/jobs/${active.job.id}?tab=photos`)
              : jobs.length
                ? setPicker("photo")
                : setAddJobOpen(true)
          }
        />
        <QuickAction
          icon={active ? Square : Play}
          label={active ? "Clock out" : "Clock in"}
          onClick={() =>
            active ? void onPunchOut() : jobs.length ? setPicker("clock") : setAddJobOpen(true)
          }
        />
      </section>

      {/* Recent jobs */}
      {recent.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-lg font-semibold text-[oklch(0.28_0.04_155)]">
              Recent jobs
            </h2>
            <Link href="/jobs" className="text-sm font-medium text-[oklch(0.4_0.05_155)]">
              All jobs
            </Link>
          </div>
          <ul className="space-y-2">
            {recent.map(({ job, contact, isActive, lastActivityAt }) => (
              <li key={job.id}>
                <div className="flex items-center gap-2 rounded-2xl bg-white/70 p-1.5 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{job.title}</span>
                        <StatusBadge status={job.status} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact?.name ?? "Unknown"} ·{" "}
                        {isActive
                          ? "on the clock now"
                          : today
                            ? `${formatDistanceToNowStrict(new Date(lastActivityAt))} ago`
                            : ""}
                      </span>
                    </span>
                  </Link>
                  {!isActive ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyJobId === job.id}
                      onClick={() => void clockInto(job)}
                      className="h-10 shrink-0"
                      aria-label={`${active ? "Switch to" : "Clock in to"} ${job.title}`}
                    >
                      {active ? (
                        <>
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          Switch
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Clock in
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Job summary */}
      {jobs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-[oklch(0.28_0.04_155)]">
            Jobs by status
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {JOB_STATUSES.map((s) => (
              <li key={s}>
                <Link
                  href={`/jobs?status=${s}`}
                  className="flex min-h-14 items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
                >
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      STATUS_BADGE_CLASS[s],
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </span>
                  <span className="font-heading text-xl font-semibold tabular-nums">
                    {statusCounts[s]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <JobPickerDialog
        open={picker !== null}
        onOpenChange={(v) => !v && setPicker(null)}
        title={picker === "photo" ? "Add a photo to…" : "Clock in to…"}
        description={
          picker === "photo"
            ? "Opens the job's photos so you can take or pick a picture."
            : "Finished jobs move back to In Progress when you clock in."
        }
        jobs={jobs}
        contacts={contacts}
        onPick={(job) => {
          const mode = picker;
          setPicker(null);
          if (mode === "photo") router.push(`/jobs/${job.id}?tab=photos`);
          else void clockInto(job);
        }}
      />
      <AddJobDialog
        open={addJobOpen}
        onOpenChange={setAddJobOpen}
        contacts={contacts}
        onCreated={(job) => router.push(`/jobs/${job.id}`)}
      />
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/70 px-2 py-3 text-center text-xs font-medium text-[oklch(0.28_0.04_155)] shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)] transition hover:bg-white";
  const content = (
    <>
      <Icon className="h-5 w-5 text-[oklch(0.4_0.06_155)]" />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
