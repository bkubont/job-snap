"use client";

import { errorMessage, notify } from "@/components/feedback";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useActivePunch } from "@/hooks/use-sitefold";
import { formatElapsedLive } from "@/lib/time";
import { punchOut } from "@/lib/db";
import { refreshSitefold } from "@/hooks/use-sitefold";
import { Button } from "@/components/ui/button";

/**
 * Global running-timer bar. `compact` (used on the dashboard, which shows the
 * timer itself) hides the timer row but keeps any multiple-timer warning.
 */
export function ActivePunchBar({ compact = false }: { compact?: boolean }) {
  const { active, openPunches } = useActivePunch();
  const extras = openPunches.filter((p) => p.punch.id !== active?.punch.id);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;
  if (compact && extras.length === 0) return null;

  async function onPunchOut() {
    setBusy(true);
    try {
      await punchOut(active!.punch.id);
      refreshSitefold();
    } catch (e) {
      notify.error(errorMessage(e, "Could not clock out"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-[oklch(0.55_0.12_75_/0.25)] bg-[oklch(0.42_0.08_155)] px-4 py-2.5 text-primary-foreground">
      {compact ? null : (
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.82_0.14_75)] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[oklch(0.82_0.14_75)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            On the clock · {formatElapsedLive(active.punch.punchedInAt)}
          </p>
          <Link
            href={`/jobs/${active.job.id}`}
            className="truncate text-xs text-[oklch(0.9_0.03_95_/0.85)] underline-offset-2 hover:underline"
          >
            {active.contact.name} / {active.job.title}
          </Link>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onPunchOut}
          className="shrink-0 bg-[oklch(0.92_0.04_85)] text-ink hover:bg-white"
        >
          Clock out
        </Button>
      </div>
      )}
      {extras.length > 0 ? (
        <div
          role="alert"
          className="mx-auto mt-2 max-w-lg rounded-lg bg-[oklch(0.93_0.05_75)] px-3 py-2 text-xs text-ink"
        >
          <p className="font-semibold">
            {extras.length + 1} timers are running at once.
          </p>
          <p className="mt-0.5">
            Open each job, then punch out or fix its time:{" "}
            {extras.map((x, i) => (
              <span key={x.punch.id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/jobs/${x.job.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  {x.contact.name} / {x.job.title}
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </div>
  );
}
