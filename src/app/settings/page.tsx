"use client";

import { useState } from "react";
import {
  ROUNDING_INCREMENTS,
  describeRounding,
  roundBilledMinutes,
  saveSettings,
  useSettings,
  type AppSettings,
} from "@/lib/settings";
import { formatMinutes } from "@/lib/time";
import { Label } from "@/components/ui/label";

const selectClass =
  "flex h-11 w-full rounded-lg border border-input bg-white/70 px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function SettingsPage() {
  const settings = useSettings();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(patch: Partial<AppSettings>) {
    setError(null);
    try {
      saveSettings({ ...settings, ...patch });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    }
  }

  const example = 52; // minutes
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
          Settings
        </h1>
        <span role="status" className="text-xs font-medium text-muted-foreground">
          {saved ? "Saved" : ""}
        </span>
      </div>

      <section className="space-y-3 rounded-2xl bg-white/70 p-4 ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
        <h2 className="font-heading text-lg font-semibold">Invoice rounding</h2>
        <p className="text-sm text-muted-foreground">
          Applies to invoice PDFs only, per time entry. Your recorded times,
          on-screen totals and CSV exports always stay exact.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="rounding-minutes">Round to</Label>
            <select
              id="rounding-minutes"
              className={selectClass}
              value={settings.roundingMinutes}
              onChange={(e) => update({ roundingMinutes: Number(e.target.value) })}
            >
              {ROUNDING_INCREMENTS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "Off (exact)" : `${m} minutes`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rounding-mode">Direction</Label>
            <select
              id="rounding-mode"
              className={selectClass}
              value={settings.roundingMode}
              disabled={!settings.roundingMinutes}
              onChange={(e) =>
                update({ roundingMode: e.target.value === "up" ? "up" : "nearest" })
              }
            >
              <option value="nearest">Nearest</option>
              <option value="up">Always up</option>
            </select>
          </div>
        </div>
        <p className="text-sm">
          {describeRounding(settings)}.{" "}
          {settings.roundingMinutes ? (
            <span className="text-muted-foreground">
              Example: a {formatMinutes(example)} entry is billed as{" "}
              {formatMinutes(roundBilledMinutes(example, settings))}.
            </span>
          ) : null}
        </p>
      </section>

      <section className="space-y-3 rounded-2xl bg-white/70 p-4 ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
        <h2 className="font-heading text-lg font-semibold">Weekly totals</h2>
        <div className="space-y-1.5">
          <Label htmlFor="week-start">Week starts on</Label>
          <select
            id="week-start"
            className={selectClass}
            value={settings.weekStartsOn}
            onChange={(e) => update({ weekStartsOn: e.target.value === "1" ? 1 : 0 })}
          >
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
          </select>
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="px-1 text-xs text-muted-foreground">
        Settings are saved on this device and included in full backups.
      </p>
    </div>
  );
}
