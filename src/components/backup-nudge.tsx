"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HardDriveDownload, X } from "lucide-react";
import { listAllPunches } from "@/lib/db";
import {
  dismissBackupNudge,
  getLastBackupAt,
  isBackupNudgeDismissed,
} from "@/lib/backup";
import { Button } from "@/components/ui/button";

export function BackupNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getLastBackupAt() || isBackupNudgeDismissed()) return;
      const punches = await listAllPunches();
      if (!cancelled && punches.length > 0) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      className="border-b border-[oklch(0.55_0.12_75_/0.25)] bg-[oklch(0.93_0.05_75_/0.92)] px-4 py-2 print:hidden"
    >
      <div className="mx-auto flex max-w-lg items-start gap-2">
        <HardDriveDownload className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.42_0.08_75)]" />
        <p className="min-w-0 flex-1 text-xs leading-snug text-[oklch(0.28_0.04_155)]">
          Your time records are stored only on this device.{" "}
          <Link
            href="/export#full-backup"
            className="font-semibold underline underline-offset-2"
            onClick={() => setShow(false)}
          >
            Make a full backup
          </Link>
          .
        </p>
        <Button
          size="icon-sm"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-label="Dismiss backup reminder"
          onClick={() => {
            dismissBackupNudge();
            setShow(false);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
