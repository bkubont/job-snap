import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import type { Contact, DayNote, Job, Punch } from "./types";
import { durationMinutes, formatDateTime, hoursFromMinutes } from "./time";

export type ExportRow = {
  date: string;
  contact: string;
  job: string;
  punchedIn: string;
  punchedOut: string;
  hours: string;
  minutes: number;
  dayNote: string;
};

export function buildExportRows(args: {
  punches: Punch[];
  jobs: Job[];
  contacts: Contact[];
  dayNotes: DayNote[];
  from: string;
  to: string;
}): ExportRow[] {
  const fromDate = startOfDay(parseISO(`${args.from}T12:00:00`));
  const toDate = endOfDay(parseISO(`${args.to}T12:00:00`));
  const jobMap = new Map(args.jobs.map((j) => [j.id, j]));
  const contactMap = new Map(args.contacts.map((c) => [c.id, c]));
  const noteMap = new Map(args.dayNotes.map((n) => [n.date, n.body]));

  return args.punches
    .filter((p) => {
      const d = parseISO(p.punchedInAt);
      return isWithinInterval(d, { start: fromDate, end: toDate });
    })
    .sort(
      (a, b) =>
        new Date(a.punchedInAt).getTime() - new Date(b.punchedInAt).getTime(),
    )
    .map((p) => {
      const job = jobMap.get(p.jobId);
      const contact = job ? contactMap.get(job.contactId) : undefined;
      const date = format(parseISO(p.punchedInAt), "yyyy-MM-dd");
      const minutes = durationMinutes(p.punchedInAt, p.punchedOutAt);
      return {
        date,
        contact: contact?.name ?? "Unknown",
        job: job?.title ?? "Unknown job",
        punchedIn: formatDateTime(p.punchedInAt),
        punchedOut: p.punchedOutAt
          ? formatDateTime(p.punchedOutAt)
          : "Still open",
        hours: hoursFromMinutes(minutes),
        minutes,
        dayNote: noteMap.get(date) ?? "",
      };
    });
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(
  rows: ExportRow[],
  dayNotes: DayNote[],
  from: string,
  to: string,
) {
  const lines: string[] = [];
  lines.push("Time clock export");
  lines.push(`Range,${from},${to}`);
  lines.push("");
  lines.push("Date,Contact,Job,Punch In,Punch Out,Hours,Day Note");
  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.contact,
        row.job,
        row.punchedIn,
        row.punchedOut,
        row.hours,
        row.dayNote,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  lines.push("");
  lines.push("Daily notes");
  lines.push("Date,Note");
  const inRange = dayNotes
    .filter((n) => n.date >= from && n.date <= to && n.body.trim())
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const note of inRange) {
    lines.push([note.date, note.body].map(csvEscape).join(","));
  }
  const totalMins = rows.reduce((sum, r) => sum + r.minutes, 0);
  lines.push("");
  lines.push(`Total hours,${hoursFromMinutes(totalMins)}`);
  return lines.join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime: string,
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function summarizeByDay(rows: ExportRow[]) {
  const map = new Map<
    string,
    { minutes: number; note: string; entries: ExportRow[] }
  >();
  for (const row of rows) {
    const existing = map.get(row.date) ?? {
      minutes: 0,
      note: row.dayNote,
      entries: [],
    };
    existing.minutes += row.minutes;
    existing.note = existing.note || row.dayNote;
    existing.entries.push(row);
    map.set(row.date, existing);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, ...value }));
}
