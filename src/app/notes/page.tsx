"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  useAutosave,
  useDayNote,
  useDayNotes,
  useJobOverviews,
  useToday,
} from "@/hooks/use-sitefold";
import { formatDateTime, formatDay } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { LoadError, SaveStatus } from "@/components/load-error";

export default function NotesPage() {
  const today = useToday();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const { notes } = useDayNotes();
  const { overviews } = useJobOverviews();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Jobs with notes or dated notes, most recently noted first.
  const jobNotes = useMemo(
    () =>
      overviews
        .map(({ job, contact }) => {
          const logs = (job.history ?? []).filter((e) => e.type === "note");
          const lastLog = logs[logs.length - 1];
          return { job, contact, logs, lastAt: lastLog?.at ?? job.createdAt };
        })
        .filter(({ job, logs }) => job.notes.trim() || logs.length)
        .filter(({ job, contact, logs }) =>
          q
            ? [job.title, contact?.name ?? "", job.notes, ...logs.map((l) => l.text)]
                .join(" ")
                .toLowerCase()
                .includes(q)
            : true,
        )
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    [overviews, q],
  );

  function shift(days: number) {
    if (!date) return;
    setPicked(format(addDays(parseISO(`${date}T12:00:00`), days), "yyyy-MM-dd"));
  }

  const dayMatches = notes.filter(
    (n) => n.body.trim() && (!q || n.body.toLowerCase().includes(q)),
  );
  const recent = q ? dayMatches : dayMatches.slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">
          Day notes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">Day notes</strong> are
          general notes for a date. <strong className="font-medium text-foreground">Job notes</strong>{" "}
          belong to one job. Both autosave and are included in exports.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all notes"
          className="h-11 bg-white/70 pl-9 text-base"
          aria-label="Search all notes"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => shift(-1)}
          aria-label="Previous day"
          disabled={!date}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date ?? ""}
          onChange={(e) => e.target.value && setPicked(e.target.value)}
          className="flex-1 bg-white/70"
          aria-label="Note date"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => shift(1)}
          aria-label="Next day"
          disabled={!date}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPicked(null)}>
          Today
        </Button>
      </div>

      {date ? (
        // Keyed by date: switching days unmounts the editor, which saves any
        // pending text for the previous day before the next one loads.
        <DayNoteEditor key={date} date={date} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">
          Job notes{q ? ` matching “${query.trim()}”` : ""}
        </h2>
        {jobNotes.length ? (
          <ul className="space-y-2">
            {jobNotes.map(({ job, contact, logs }) => {
              const latest = logs[logs.length - 1];
              return (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}?tab=notes`}
                    className="block rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-hairline transition hover:bg-white"
                  >
                    <p className="text-sm font-medium">
                      {job.title}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {contact?.name ?? "Unknown"}
                      </span>
                    </p>
                    {job.notes.trim() ? (
                      <p className="mt-1 line-clamp-2 text-sm">{job.notes}</p>
                    ) : null}
                    {latest ? (
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {formatDateTime(latest.at)} — {latest.text}
                        {logs.length > 1 ? ` (+${logs.length - 1} more)` : ""}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {q ? "No job notes match." : "Notes you write on a job's Notes section appear here."}
          </p>
        )}
      </section>

      {recent.length > 0 || q ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">
            {q ? "Day notes matching" : "Recent day notes"}
          </h2>
          {q && !recent.length ? (
            <p className="text-sm text-muted-foreground">No day notes match.</p>
          ) : null}
          <ul className="space-y-2">
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setPicked(n.date)}
                  className="w-full rounded-2xl bg-white/70 px-4 py-3 text-left ring-1 ring-hairline transition hover:bg-white"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatDay(n.date)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm">{n.body}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DayNoteEditor({ date }: { date: string }) {
  const { note, loading, error, retry, save } = useDayNote(date);
  const autosave = useAutosave(note?.body ?? "", save);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{formatDay(date)}</h2>
        <SaveStatus
          status={autosave.status}
          dirty={autosave.dirty}
          error={autosave.error}
          onRetry={() => void autosave.flush()}
        />
      </div>
      {error && !note ? (
        <LoadError error={error} onRetry={retry} what="this day's note" />
      ) : (
        <Textarea
          value={autosave.value}
          onChange={(e) => autosave.setValue(e.target.value)}
          onBlur={() => void autosave.flush()}
          placeholder={
            loading
              ? "Loading…"
              : "Weather, what got done, materials ordered, who you talked to…"
          }
          rows={10}
          className="min-h-48 bg-white/70 text-base leading-relaxed"
          disabled={loading}
        />
      )}
    </section>
  );
}
