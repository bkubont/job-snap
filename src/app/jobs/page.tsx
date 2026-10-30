"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Briefcase, Camera, Plus, Search } from "lucide-react";
import {
  useContacts,
  useJobOverviews,
  useToday,
} from "@/hooks/use-sitefold";
import { JOB_STATUSES, type JobStatus } from "@/lib/types";
import { STATUS_LABEL, isDoneStatus } from "@/lib/status";
import { formatDay, formatMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/load-error";
import { StatusPicker } from "@/components/job-status";
import { AddJobDialog } from "@/components/job-dialogs";

type Filter = "active" | "all" | JobStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "active", label: "Not finished" },
  ...JOB_STATUSES.map((s) => ({ value: s as Filter, label: STATUS_LABEL[s] })),
  { value: "all", label: "All" },
];

export default function JobsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <JobsList />
    </Suspense>
  );
}

function JobsList() {
  const router = useRouter();
  const params = useSearchParams();
  const today = useToday();
  const { overviews, loading, error, retry } = useJobOverviews();
  const { contacts } = useContacts();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const raw = params.get("status");
  const filter: Filter =
    raw === "all" || (JOB_STATUSES as readonly string[]).includes(raw ?? "")
      ? (raw as Filter)
      : "active";

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      overviews
        .filter(({ job }) =>
          filter === "all"
            ? true
            : filter === "active"
              ? !isDoneStatus(job.status)
              : job.status === filter,
        )
        .filter(({ job, contact }) =>
          q
            ? `${job.title} ${contact?.name ?? ""} ${job.address ?? ""} ${job.description ?? ""}`
                .toLowerCase()
                .includes(q)
            : true,
        )
        .sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return b.lastActivityAt.localeCompare(a.lastActivityAt);
        }),
    [overviews, filter, q],
  );

  function setFilter(next: Filter) {
    router.replace(next === "active" ? "/jobs" : `/jobs?status=${next}`, {
      scroll: false,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
            Jobs
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? " " : `${overviews.length} total`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          New job
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search job, customer, address"
          className="h-11 bg-white/70 pl-9 text-base"
          aria-label="Search jobs"
        />
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium ring-1 transition",
              filter === f.value
                ? "bg-[oklch(0.32_0.05_155)] text-[oklch(0.97_0.02_95)] ring-transparent"
                : "bg-white/70 text-foreground ring-[oklch(0.35_0.03_155_/0.15)]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && !overviews.length ? (
        <LoadError error={error} onRetry={retry} what="your jobs" />
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : overviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] bg-white/50 px-5 py-10 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-[oklch(0.45_0.05_155)]" />
          <p className="mt-3 font-medium">No jobs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a job for a customer to track time, photos and notes.
          </p>
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] px-4 py-8 text-center text-sm text-muted-foreground">
          No jobs match.{" "}
          {filter !== "all" ? (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="font-medium underline underline-offset-2"
            >
              Show all
            </button>
          ) : null}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map(({ job, contact, totalMinutes, photoCount, isActive, lastActivityAt }) => (
            <li
              key={job.id}
              className="relative rounded-2xl bg-white/70 px-3.5 py-3 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
            >
              <div className="flex items-start gap-2">
                <Link
                  href={`/jobs/${job.id}`}
                  className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-2xl"
                >
                  <p className="truncate font-medium">{job.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {contact?.name ?? "Unknown customer"}
                  </p>
                </Link>
                {/* Above the stretched link so it stays tappable. */}
                <StatusPicker jobId={job.id} status={job.status} className="relative z-10" />
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                {isActive ? (
                  <span className="font-semibold text-[oklch(0.4_0.1_155)]">● On the clock</span>
                ) : null}
                <span>{formatMinutes(totalMinutes)} logged</span>
                {photoCount ? (
                  <span className="inline-flex items-center gap-1">
                    <Camera className="h-3 w-3" />
                    {photoCount}
                  </span>
                ) : null}
                {job.scheduledDate ? <span>Scheduled {formatDay(job.scheduledDate)}</span> : null}
                {today && !isActive ? (
                  <span>
                    Active {formatDistanceToNowStrict(new Date(lastActivityAt))} ago
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}

      <AddJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        contacts={contacts}
        onCreated={(job) => router.push(`/jobs/${job.id}`)}
      />
    </div>
  );
}
