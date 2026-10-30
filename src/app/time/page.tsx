"use client";

import { errorMessage, notify } from "@/components/feedback";
import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import {
  useTicker,
  useTimeData,
  useToday,
} from "@/hooks/use-sitefold";
import { listAllPhotos, listDayNotes } from "@/lib/db";
import { downloadRangeCsv } from "@/lib/export";
import { useSettings } from "@/lib/settings";
import { dailyBuckets, minutesForPunches, weekRange } from "@/lib/totals";
import { formatClock, formatDuration, formatMinutes, hoursFromMinutes } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/load-error";
import { ManualEntryDialog } from "@/components/job-dialogs";

export default function TimePage() {
  const today = useToday();
  const settings = useSettings();
  const { punches, jobs, contacts, loading, error, retry } = useTimeData();
  const [weekOffset, setWeekOffset] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const running = punches.some((p) => p.punchedOutAt === null);
  useTicker(running, 30_000);

  const jobMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  // Everything below needs the clock, which is only read in the browser.
  const anchor = today ? addDays(parseISO(`${today}T12:00:00`), weekOffset * 7) : null;
  const days = anchor ? dailyBuckets(punches, anchor, settings.weekStartsOn) : [];
  const range = anchor ? weekRange(anchor, settings.weekStartsOn) : null;
  const weekEntries = days.flatMap((d) => d.entries);
  const weekTotal = minutesForPunches(weekEntries);
  const todayBucket = days.find((d) => d.key === today);

  const perJobMap = new Map<string, number>();
  for (const p of weekEntries) {
    perJobMap.set(p.jobId, (perJobMap.get(p.jobId) ?? 0) + minutesForPunches([p]));
  }
  const perJob = [...perJobMap.entries()].sort((a, b) => b[1] - a[1]);

  async function onCsv() {
    if (!range) return;
    setCsvBusy(true);
    try {
      const [dayNotes, photos] = await Promise.all([listDayNotes(), listAllPhotos()]);
      await downloadRangeCsv(
        { punches, jobs, contacts, dayNotes, photos },
        format(range.start, "yyyy-MM-dd"),
        format(range.end, "yyyy-MM-dd"),
      );
    } catch (e) {
      notify.error(errorMessage(e, "Could not create CSV"));
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">
          Time
        </h1>
        <Button onClick={() => setManualOpen(true)} disabled={!jobs.length}>
          <Plus className="h-4 w-4" />
          Add time
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => setWeekOffset((n) => n - 1)}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="flex-1 text-center text-sm font-medium tabular-nums">
          {range
            ? `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`
            : " "}
        </p>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => setWeekOffset((n) => n + 1)}
          disabled={weekOffset >= 0}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {weekOffset !== 0 ? (
        <button
          type="button"
          onClick={() => setWeekOffset(0)}
          className="-mt-3 block w-full text-center text-sm font-medium text-[oklch(0.4_0.05_155)] underline-offset-2 hover:underline"
        >
          Back to this week
        </button>
      ) : null}

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
          <p className="text-xs opacity-80">Week total</p>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {hoursFromMinutes(weekTotal)} h
          </p>
          <p className="text-xs opacity-70 tabular-nums">{formatMinutes(weekTotal)}</p>
        </div>
        <div className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-hairline">
          <p className="text-xs text-muted-foreground">
            {weekOffset === 0 ? "Today" : "Entries"}
          </p>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {weekOffset === 0
              ? `${hoursFromMinutes(todayBucket?.minutes ?? 0)} h`
              : weekEntries.length}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {weekOffset === 0 ? formatMinutes(todayBucket?.minutes ?? 0) : "this week"}
          </p>
        </div>
      </section>

      {error && !punches.length ? (
        <LoadError error={error} onRetry={retry} what="your time entries" />
      ) : loading || !today ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {perJob.length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-heading text-lg font-semibold">By job</h2>
              <ul className="divide-y divide-black/5 rounded-2xl bg-white/70 ring-1 ring-hairline">
                {perJob.map(([jobId, mins]) => {
                  const job = jobMap.get(jobId);
                  return (
                    <li key={jobId}>
                      <Link
                        href={`/jobs/${jobId}?tab=time`}
                        className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {job?.title ?? "Deleted job"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {job ? contactMap.get(job.contactId)?.name : ""}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {hoursFromMinutes(mins)} h
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">By day</h2>
            {days.map((d) => (
              <div key={d.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">
                    {format(d.date, "EEEE, MMM d")}
                    {today && isSameDay(d.date, parseISO(`${today}T12:00:00`)) ? (
                      <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                        Today
                      </span>
                    ) : null}
                  </h3>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {d.entries.length ? `${hoursFromMinutes(d.minutes)} h` : "—"}
                  </span>
                </div>
                {d.entries.length ? (
                  <ul className="space-y-1.5">
                    {d.entries.map((p) => {
                      const job = jobMap.get(p.jobId);
                      return (
                        <li key={p.id}>
                          <Link
                            href={`/jobs/${p.jobId}?tab=time`}
                            className="flex min-h-12 items-center gap-3 rounded-xl bg-white/70 px-3.5 py-2.5 text-sm ring-1 ring-hairline"
                          >
                            <span className="w-[4.5rem] shrink-0 text-xs leading-snug tabular-nums text-muted-foreground">
                              <span className="block">{formatClock(p.punchedInAt)}</span>
                              <span className="block">
                                – {p.punchedOutAt ? formatClock(p.punchedOutAt) : "now"}
                              </span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {job?.title ?? "Deleted job"}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {job ? contactMap.get(job.contactId)?.name : ""}
                                {p.source === "manual" ? " · manual" : ""}
                              </span>
                            </span>
                            <span className="shrink-0 font-medium tabular-nums">
                              {formatDuration(p.punchedInAt, p.punchedOutAt)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>

          <div className="space-y-2 rounded-2xl bg-white/70 p-4 text-sm ring-1 ring-hairline">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void onCsv()}
              disabled={csvBusy || !range}
            >
              <Download className="h-4 w-4" />
              {csvBusy ? "Preparing…" : "Download this week as CSV"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Entries count on the day they started. For other date ranges,
              customer filters, photos or invoices, use{" "}
              <Link href="/export" className="font-medium underline underline-offset-2">
                Export
              </Link>
              . Week starts on {settings.weekStartsOn === 1 ? "Monday" : "Sunday"} —
              change in{" "}
              <Link href="/settings" className="font-medium underline underline-offset-2">
                Settings
              </Link>
              .
            </p>
          </div>
        </>
      )}

      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        jobs={jobs}
        contacts={contacts}
      />
    </div>
  );
}
