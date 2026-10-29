"use client";

import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, subDays } from "date-fns";
import { Download, FolderArchive, Printer } from "lucide-react";
import {
  listAllJobs,
  listAllPhotos,
  listAllPunches,
  listContacts,
  listDayNotes,
} from "@/lib/db";
import type { Contact, DayNote, Job, Photo, Punch } from "@/lib/types";
import {
  buildExportPackageZip,
  buildExportRows,
  buildJobNoteRows,
  buildPhotoExportItems,
  downloadBlob,
  downloadTextFile,
  photosByJob,
  rowsToCsv,
  summarizeByDay,
  type PhotoExportItem,
} from "@/lib/export";
import { formatDay, hoursFromMinutes, todayKey } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ExportPhotoThumb({ item }: { item: PhotoExportItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(item.photo.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.photo.blob]);

  return (
    <figure className="overflow-hidden rounded-xl bg-[oklch(0.92_0.01_95)] print:break-inside-avoid">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={item.caption || `${item.job} photo`}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="aspect-[4/3] w-full bg-[oklch(0.92_0.01_95)]" />
      )}
      <figcaption className="space-y-0.5 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
        <span className="block tabular-nums">{item.date}</span>
        {item.caption ? (
          <span className="block text-[oklch(0.28_0.04_155)]">{item.caption}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}

export default function ExportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [punches, setPunches] = useState<Punch[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dayNotes, setDayNotes] = useState<DayNote[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [packaging, setPackaging] = useState(false);

  useEffect(() => {
    const end = new Date();
    setFrom(format(startOfMonth(end), "yyyy-MM-dd"));
    setTo(todayKey());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [p, j, c, n, ph] = await Promise.all([
        listAllPunches(),
        listAllJobs(),
        listContacts(),
        listDayNotes(),
        listAllPhotos(),
      ]);
      if (!cancelled) {
        setPunches(p);
        setJobs(j);
        setContacts(c);
        setDayNotes(n);
        setPhotos(ph);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () =>
      from && to
        ? buildExportRows({ punches, jobs, contacts, dayNotes, from, to })
        : [],
    [punches, jobs, contacts, dayNotes, from, to],
  );

  const jobNotes = useMemo(
    () =>
      from && to
        ? buildJobNoteRows({ punches, jobs, contacts, from, to })
        : [],
    [punches, jobs, contacts, from, to],
  );

  const photoItems = useMemo(
    () =>
      from && to
        ? buildPhotoExportItems({ punches, jobs, contacts, photos, from, to })
        : [],
    [punches, jobs, contacts, photos, from, to],
  );

  const photoGroups = useMemo(() => photosByJob(photoItems), [photoItems]);
  const byDay = useMemo(() => summarizeByDay(rows), [rows]);
  const totalMins = rows.reduce((s, r) => s + r.minutes, 0);

  function csvContent() {
    return rowsToCsv(rows, dayNotes, from, to, jobNotes, photoItems);
  }

  function onCsv() {
    downloadTextFile(
      `job-snap-timecard-${from}-to-${to}.csv`,
      csvContent(),
      "text/csv;charset=utf-8",
    );
  }

  async function onPackage() {
    setPackaging(true);
    try {
      const csvName = `job-snap-timecard-${from}-to-${to}.csv`;
      const zip = await buildExportPackageZip({
        csv: csvContent(),
        csvFilename: csvName,
        photos: photoItems,
      });
      downloadBlob(`job-snap-export-${from}-to-${to}.zip`, zip);
    } finally {
      setPackaging(false);
    }
  }

  function onPrint() {
    window.print();
  }

  function quickRange(kind: "week" | "month" | "today") {
    const end = new Date();
    if (kind === "today") {
      setFrom(todayKey());
      setTo(todayKey());
    } else if (kind === "week") {
      setFrom(format(subDays(end, 6), "yyyy-MM-dd"));
      setTo(todayKey());
    } else {
      setFrom(format(startOfMonth(end), "yyyy-MM-dd"));
      setTo(todayKey());
    }
  }

  const empty =
    !loading &&
    byDay.length === 0 &&
    jobNotes.length === 0 &&
    photoItems.length === 0;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
          Export
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download or print your time clock with daily notes, job notes, and
          site photos.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl bg-white/70 p-4 ring-1 ring-[oklch(0.35_0.03_155_/0.08)] print:hidden">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => quickRange("today")}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => quickRange("week")}>
            Last 7 days
          </Button>
          <Button size="sm" variant="outline" onClick={() => quickRange("month")}>
            This month
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onCsv} disabled={loading}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            onClick={onPackage}
            disabled={loading || packaging}
          >
            <FolderArchive className="h-4 w-4" />
            {packaging ? "Packaging…" : "ZIP + photos"}
          </Button>
          <Button variant="secondary" onClick={onPrint} disabled={loading}>
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
        </div>
        {photoItems.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            ZIP includes the CSV plus {photoItems.length} photo
            {photoItems.length === 1 ? "" : "s"} named by job and date.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            ZIP packages the CSV with any photos on jobs punched in this range.
          </p>
        )}
      </section>

      <section className="space-y-4" id="export-preview">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">Preview</h2>
            <p className="text-xs text-muted-foreground">
              {from} → {to}
              {photoItems.length > 0
                ? ` · ${photoItems.length} photo${photoItems.length === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-[oklch(0.32_0.05_155)]">
            {hoursFromMinutes(totalMins)} hrs
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : empty ? (
          <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No punches in this range.
          </p>
        ) : (
          <div className="space-y-4">
            {byDay.map((day) => (
              <article
                key={day.date}
                className="rounded-2xl bg-white/80 p-4 ring-1 ring-[oklch(0.35_0.03_155_/0.08)] print:break-inside-avoid"
              >
                <header className="mb-3 flex items-baseline justify-between gap-2 border-b border-[oklch(0.35_0.03_155_/0.1)] pb-2">
                  <h3 className="font-heading font-semibold">
                    {formatDay(day.date)}
                  </h3>
                  <span className="text-sm tabular-nums">
                    {hoursFromMinutes(day.minutes)} hrs
                  </span>
                </header>
                <ul className="space-y-2 text-sm">
                  {day.entries.map((row, i) => (
                    <li
                      key={`${row.jobId}-${row.punchedIn}-${i}`}
                      className="flex justify-between gap-3"
                    >
                      <span>
                        <span className="font-medium">{row.contact}</span>
                        {" · "}
                        {row.job}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {row.punchedIn} → {row.punchedOut}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{row.hours}h</span>
                    </li>
                  ))}
                </ul>
                {day.note ? (
                  <p className="mt-3 rounded-xl bg-[oklch(0.96_0.015_95)] px-3 py-2 text-sm leading-relaxed">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Day note
                    </span>
                    <br />
                    {day.note}
                  </p>
                ) : null}
              </article>
            ))}

            {jobNotes.length > 0 ? (
              <article className="rounded-2xl bg-white/80 p-4 ring-1 ring-[oklch(0.35_0.03_155_/0.08)] print:break-inside-avoid">
                <header className="mb-3 border-b border-[oklch(0.35_0.03_155_/0.1)] pb-2">
                  <h3 className="font-heading font-semibold">Job notes</h3>
                  <p className="text-xs text-muted-foreground">
                    Notes on jobs punched in this range
                  </p>
                </header>
                <ul className="space-y-3">
                  {jobNotes.map((note) => (
                    <li key={note.jobId} className="text-sm">
                      <p className="font-medium">
                        {note.contact}
                        <span className="font-normal text-muted-foreground">
                          {" · "}
                          {note.job}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[oklch(0.32_0.03_155)]">
                        {note.notes}
                      </p>
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}

            {photoGroups.length > 0 ? (
              <article className="rounded-2xl bg-white/80 p-4 ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
                <header className="mb-3 border-b border-[oklch(0.35_0.03_155_/0.1)] pb-2">
                  <h3 className="font-heading font-semibold">Photos</h3>
                  <p className="text-xs text-muted-foreground">
                    {photoItems.length} site photo
                    {photoItems.length === 1 ? "" : "s"} on jobs in this range
                  </p>
                </header>
                <div className="space-y-5">
                  {photoGroups.map((group) => (
                    <div key={group.jobId} className="space-y-2 print:break-inside-avoid">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">
                          {group.contact}
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {group.job}
                          </span>
                        </p>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {group.photos.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {group.photos.map((item) => (
                          <ExportPhotoThumb key={item.photo.id} item={item} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
