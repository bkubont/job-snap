"use client";

import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { useDayNote, useDayNotes } from "@/hooks/use-sitefold";
import { todayKey, formatDay } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export default function NotesPage() {
  const [date, setDate] = useState("");
  const { note, loading, save } = useDayNote(date || "1970-01-01");
  const { notes } = useDayNotes();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDate(todayKey());
  }, []);

  useEffect(() => {
    setBody(note?.body ?? "");
  }, [note, date]);

  function shift(days: number) {
    const next = format(addDays(parseISO(`${date}T12:00:00`), days), "yyyy-MM-dd");
    setDate(next);
  }

  async function onSave() {
    setSaving(true);
    try {
      await save(body);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  const recent = notes.filter((n) => n.body.trim()).slice(0, 8);

  if (!date) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
          Day notes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One notebook for the day — exported with your time clock.
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
          onChange={(e) => setDate(e.target.value)}
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
        <Button variant="secondary" size="sm" onClick={() => setDate(todayKey())}>
          Today
        </Button>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">{formatDay(date)}</h2>
          <Button size="sm" onClick={onSave} disabled={saving || loading}>
            <Save className="h-4 w-4" />
            {savedFlash ? "Saved" : saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
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
                  onClick={() => setDate(n.date)}
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
