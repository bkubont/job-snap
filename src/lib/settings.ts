import { useSyncExternalStore } from "react";

/**
 * Invoice rounding. Applies only to invoice PDFs, per time entry. Stored
 * punches, CSV exports and on-screen totals always use exact times.
 */
export type RoundingSettings = {
  /** 0 = off; otherwise the increment in minutes. */
  roundingMinutes: number;
  roundingMode: "nearest" | "up";
};

export type AppSettings = RoundingSettings & {
  /** First day of the week for weekly totals: 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
};

export const ROUNDING_INCREMENTS = [0, 5, 6, 10, 15, 30] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  roundingMinutes: 0,
  roundingMode: "nearest",
  weekStartsOn: 0,
};

const LS_SETTINGS = "job-snap:settings";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: AppSettings = DEFAULT_SETTINGS;

export function sanitizeSettings(value: unknown): AppSettings {
  const v = (value && typeof value === "object" ? value : {}) as Partial<AppSettings>;
  const minutes = Number(v.roundingMinutes);
  return {
    roundingMinutes: (ROUNDING_INCREMENTS as readonly number[]).includes(minutes)
      ? minutes
      : 0,
    roundingMode: v.roundingMode === "up" ? "up" : "nearest",
    weekStartsOn: v.weekStartsOn === 1 ? 1 : 0,
  };
}

export function getSettings(): AppSettings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LS_SETTINGS);
  } catch {
    /* private mode */
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = sanitizeSettings(raw ? JSON.parse(raw) : null);
    } catch {
      cached = DEFAULT_SETTINGS;
    }
  }
  return cached;
}

export function saveSettings(next: AppSettings) {
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(sanitizeSettings(next)));
  } catch {
    throw new Error("Couldn't save settings in this browser.");
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_SETTINGS) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS);
}

/** Round one entry's minutes for billing; the stored entry is untouched. */
export function roundBilledMinutes(minutes: number, s: RoundingSettings) {
  if (!s.roundingMinutes || minutes <= 0) return minutes;
  const step = s.roundingMinutes;
  // Small epsilon so 14:59.9999 of float noise doesn't jump an increment.
  const units = minutes / step;
  const rounded =
    s.roundingMode === "up"
      ? Math.ceil(units - 1e-9)
      : Math.round(units);
  return rounded * step;
}

export function describeRounding(s: RoundingSettings) {
  if (!s.roundingMinutes) return "Exact time (no rounding)";
  return `${s.roundingMode === "up" ? "Rounded up" : "Rounded to nearest"} ${
    s.roundingMinutes
  } min per entry`;
}
