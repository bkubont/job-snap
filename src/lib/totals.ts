import {
  addDays,
  endOfDay,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { Punch } from "./types";
import { durationMinutes } from "./time";

/**
 * Totals follow the timecard convention used by exports: an entry counts on
 * the day it started. Open entries count their time so far.
 */
export function minutesForPunches(punches: Punch[]) {
  return punches.reduce(
    (sum, p) => sum + durationMinutes(p.punchedInAt, p.punchedOutAt),
    0,
  );
}

export function punchesStartedBetween(punches: Punch[], start: Date, end: Date) {
  const a = start.getTime();
  const b = end.getTime();
  return punches.filter((p) => {
    const t = parseISO(p.punchedInAt).getTime();
    return t >= a && t <= b;
  });
}

export function weekRange(day: Date, weekStartsOn: 0 | 1) {
  const start = startOfWeek(day, { weekStartsOn });
  return { start, end: endOfDay(addDays(start, 6)) };
}

export function todayMinutes(punches: Punch[], now = new Date()) {
  return minutesForPunches(
    punchesStartedBetween(punches, startOfDay(now), endOfDay(now)),
  );
}

export function weekMinutes(punches: Punch[], weekStartsOn: 0 | 1, now = new Date()) {
  const { start, end } = weekRange(now, weekStartsOn);
  return minutesForPunches(punchesStartedBetween(punches, start, end));
}

/** Seven day buckets for the week containing `day`. */
export function dailyBuckets(punches: Punch[], day: Date, weekStartsOn: 0 | 1) {
  const { start } = weekRange(day, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const entries = punchesStartedBetween(punches, startOfDay(d), endOfDay(d))
      .sort((a, b) => a.punchedInAt.localeCompare(b.punchedInAt));
    return {
      key: format(d, "yyyy-MM-dd"),
      date: d,
      entries,
      minutes: minutesForPunches(entries),
    };
  });
}
