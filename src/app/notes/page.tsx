"use client";

import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDayNote, useDayNotes } from "@/hooks/use-sitefold";
import { todayKey, formatDay } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const AUTOSAVE_MS = 600;

export default function NotesPage() {
  const [date, setDate] = useState(todayKey);
  const { note, loading, save } = useDayNote(date);
  const { notes } = useDayNotes();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const body = draft ?? note?.body ?? "";
  const dirty = draft !== null && draft !== (note?.body ?? "");

  useEffect(() => {
    if (!dirty || draft === null) return;
    const snapshot = draft;
    const t = window.setTimeout(() => {
      void (async () => {
        setSaving(true);
        try {
          await save(snapshot);
          setDraft(null);
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), 1500);
        } finally {
          setSaving(false);
        }
      })();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [draft, dirty, save]);

  async function persist() {
    if (draft === null) return;
    if (draft === (note?.body ?? "")) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await save(draft);
      setDraft(null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  function changeDate(next: string) {
    void persist();
    setDraft(null);
    setDate(next);
  }

  function shift(days: number) {
    changeDate(
      format(addDays(parseISO(`${date}T12:00:00`), days), "yyyy-MM-dd"),
    );
  }

  const recent = notes.filter((n) => n.body.trim()).slice(0, 8);

  const statusLabel = savedFlash
    ? "Saved"
    : saving
      ? "Saving…"
      : dirty
        ? "Editing…"
        : "Autosaved";

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
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          className="flex-1 bg-white/70"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => shift(1)}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => changeDate(todayKey())}
        >
          Today
        </Button>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">{formatDay(date)}</h2>
          <span className="text-xs font-medium text-muted-foreground">
            {statusLabel}
          </span>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            void persist();
          }}
          placeholder="Weather, what got done, materials ordered, who you talked to…"
          rows={10}
          className="min-h-48 bg-white/70 text-base leading-relaxed"
          disabled={loading}
        />
      </section>

      {recent.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">Recent</h2>
          <ul className="space-y-2">
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => changeDate(n.date)}
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
