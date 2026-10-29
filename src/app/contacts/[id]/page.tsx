"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useContact, refreshSitefold } from "@/hooks/use-sitefold";
import { createJob, deleteContact, updateJob } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDay } from "@/lib/time";

export default function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { contact, jobs } = useContact(id);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  if (contact === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (contact === null) {
    return (
      <div className="space-y-3">
        <p>Contact not found.</p>
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
      </div>
    );
  }

  async function onAddJob(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const job = await createJob(id, title, notes);
    setTitle("");
    setNotes("");
    setOpen(false);
    refreshSitefold();
    router.push(`/jobs/${job.id}`);
  }

  async function onDelete() {
    if (
      !confirm(
        `Delete ${contact!.name} and all jobs, punches, and photos inside?`,
      )
    ) {
      return;
    }
    await deleteContact(id);
    refreshSitefold();
    router.push("/");
  }

  async function toggleStatus(jobId: string, status: "open" | "closed") {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    await updateJob({
      ...job,
      status: status === "open" ? "closed" : "open",
    });
    refreshSitefold();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="-ml-2 shrink-0">
          <Link href="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
            {contact.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[contact.phone, contact.email].filter(Boolean).join(" · ") ||
              "Contact folder"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete contact"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {contact.notes ? (
        <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm leading-relaxed ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
          {contact.notes}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Jobs</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New job in {contact.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onAddJob} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Job title</Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Kitchen remodel, Service call…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-notes">Notes</Label>
                <Textarea
                  id="job-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <Button type="submit" className="w-full">
                Create job
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] px-5 py-10 text-center">
          <Briefcase className="mx-auto h-7 w-7 text-[oklch(0.45_0.05_155)]" />
          <p className="mt-2 text-sm text-muted-foreground">
            No jobs yet. Add one to punch in and take photos.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id}>
              <div className="flex items-stretch gap-2 rounded-2xl bg-white/70 p-1.5 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-[oklch(0.96_0.01_95)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{job.title}</p>
                      <Badge
                        variant={job.status === "open" ? "default" : "secondary"}
                        className="shrink-0 text-[10px]"
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Started {formatDay(job.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
                <button
                  type="button"
                  onClick={() => toggleStatus(job.id, job.status)}
                  className="shrink-0 self-center px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {job.status === "open" ? "Close" : "Reopen"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
