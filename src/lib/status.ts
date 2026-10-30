import type { JobStatus, PhotoCategory, StoredJobStatus } from "./types";

export const STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  paid: "Paid",
};

/** Restrained badge colours: one hue per status, low saturation. */
export const STATUS_BADGE_CLASS: Record<JobStatus, string> = {
  scheduled: "bg-[oklch(0.93_0.03_250)] text-[oklch(0.35_0.08_250)]",
  in_progress: "bg-[oklch(0.92_0.05_155)] text-[oklch(0.32_0.07_155)]",
  on_hold: "bg-[oklch(0.94_0.05_75)] text-[oklch(0.42_0.09_65)]",
  completed: "bg-[oklch(0.93_0.005_95)] text-[oklch(0.38_0.01_95)]",
  paid: "bg-[oklch(0.3_0.05_155)] text-[oklch(0.96_0.02_95)]",
};

/**
 * Read a stored status. Legacy "open" means In Progress and "closed" means
 * Completed (agreed mapping); anything unknown falls back to In Progress.
 * The stored value itself is not rewritten.
 */
export function normalizeStatus(value: StoredJobStatus | string | undefined): JobStatus {
  switch (value) {
    case "scheduled":
    case "in_progress":
    case "on_hold":
    case "completed":
    case "paid":
      return value;
    case "closed":
      return "completed";
    default:
      return "in_progress";
  }
}

/** Finished jobs: punching in asks to reopen them. */
export function isDoneStatus(status: JobStatus) {
  return status === "completed" || status === "paid";
}

export const PHOTO_CATEGORY_LABEL: Record<PhotoCategory, string> = {
  before: "Before",
  during: "During",
  after: "After",
  other: "Other",
};
