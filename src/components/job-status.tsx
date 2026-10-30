"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { JOB_STATUSES, type JobStatus } from "@/lib/types";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/status";
import { updateJobFields } from "@/lib/db";
import { refreshSitefold } from "@/hooks/use-sitefold";

export function StatusBadge({
  status,
  className,
}: {
  status: JobStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Change a job's status in place — a native select looks like the badge and
 * opens the system picker (large targets on iPhone). Changes are logged.
 */
export function StatusPicker({
  jobId,
  status,
  className,
  size = "sm",
}: {
  jobId: string;
  status: JobStatus;
  className?: string;
  size?: "sm" | "md";
}) {
  const [saving, setSaving] = useState(false);

  async function onChange(next: JobStatus) {
    if (next === status) return;
    setSaving(true);
    try {
      await updateJobFields(jobId, { status: next });
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not change status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full font-semibold",
        size === "md" ? "h-9 pl-3 pr-8 text-sm" : "h-8 pl-2.5 pr-7 text-xs",
        STATUS_BADGE_CLASS[status],
        saving && "opacity-60",
        className,
      )}
    >
      <span className="sr-only">Job status</span>
      <span aria-hidden>{STATUS_LABEL[status]}</span>
      <ChevronDown
        aria-hidden
        className={cn(
          "pointer-events-none absolute",
          size === "md" ? "right-2.5 h-4 w-4" : "right-2 h-3.5 w-3.5",
        )}
      />
      <select
        value={status}
        disabled={saving}
        onChange={(e) => void onChange(e.target.value as JobStatus)}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Job status"
      >
        {JOB_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
