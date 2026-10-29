import {
  differenceInMinutes,
  format,
  formatDistanceStrict,
  parseISO,
} from "date-fns";

export function todayKey(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

export function formatClock(iso: string) {
  return format(parseISO(iso), "h:mm a");
}

export function formatDay(isoOrKey: string) {
  const value = isoOrKey.includes("T") ? parseISO(isoOrKey) : parseISO(`${isoOrKey}T12:00:00`);
  return format(value, "EEE, MMM d");
}

export function formatDateTime(iso: string) {
  return format(parseISO(iso), "MMM d, yyyy · h:mm a");
}

export function durationMinutes(startIso: string, endIso: string | null) {
  const end = endIso ? parseISO(endIso) : new Date();
  return Math.max(0, differenceInMinutes(end, parseISO(startIso)));
}

export function formatDuration(startIso: string, endIso: string | null) {
  const end = endIso ? parseISO(endIso) : new Date();
  const mins = Math.max(0, differenceInMinutes(end, parseISO(startIso)));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatElapsedLive(startIso: string) {
  return formatDistanceStrict(parseISO(startIso), new Date(), {
    roundingMethod: "floor",
  });
}

export function hoursFromMinutes(mins: number) {
  return (mins / 60).toFixed(2);
}

/** Value for `<input type="datetime-local">` from an ISO timestamp. */
export function toDatetimeLocalValue(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
}

/** Convert a datetime-local input value to ISO. */
export function fromDatetimeLocalValue(value: string) {
  return new Date(value).toISOString();
}
