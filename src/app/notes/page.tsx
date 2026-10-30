"use client";

import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useAutosave,
  useDayNote,
  useDayNotes,
  useToday,
} from "@/hooks/use-sitefold";
import { formatDay } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { LoadError, SaveStatus } from "@/components/load-error";

export default function NotesPage() {
  const today = useToday();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const { notes } = useDayNotes();

  function shift(days: number) {
    if (!date) return;
    setPicked(format(addDays(parseISO(`${date}T12:00:00`), days), "yyyy-MM-dd"));
  }

  const recent = notes.filter((n) => n.body.trim()).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
          Day notes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One notebook for the day — autosaves as you type. Exported with your
          time clock.
        </p>
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

      {recent.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">Recent</h2>
          <ul className="space-y-2">
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setPicked(n.date)}
                  className="w-full rounded-2xl bg-white/70 px-4 py-3 text-left ring-1 ring-[oklch(0.35_0.03_155_/0.08)] transition hover:bg-white"
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
