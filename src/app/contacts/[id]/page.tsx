"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  Briefcase,
  Check,
  ChevronRight,
  MapPin,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useContact,
  useActivePunch,
  refreshSitefold,
} from "@/hooks/use-sitefold";
import {
  createJob,
  deleteContact,
  updateContact,
  updateJob,
  switchPunchToJob,
} from "@/lib/db";
import { mapsDirectionsUrl } from "@/lib/export";
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

type EditForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

export default function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { contact, jobs } = useContact(id);
  const { active } = useActivePunch();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  useEffect(() => {
    if (!contact || editing) return;
    setEditForm({
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      notes: contact.notes,
    });
  }, [contact, editing]);

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

  async function createAndPunch(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const job = await createJob(id, title);
      setTitle("");
      setOpen(false);
      await switchPunchToJob(job.id);
      refreshSitefold();
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not create job");
      refreshSitefold();
    } finally {
      setCreating(false);
    }
  }

  async function onAddJobOnly(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const job = await createJob(id, title);
      setTitle("");
      setOpen(false);
      refreshSitefold();
      router.push(`/jobs/${job.id}`);
    } finally {
      setCreating(false);
    }
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

  async function onQuickPunch(jobId: string) {
    setBusyJobId(jobId);
    try {
      await switchPunchToJob(jobId);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not punch in");
    } finally {
      setBusyJobId(null);
    }
  }

  function startEdit() {
    setEditForm({
      name: contact!.name,
      phone: contact!.phone,
      email: contact!.email,
      address: contact!.address,
      notes: contact!.notes,
    });
    setEditing(true);
    setSavedFlash(false);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm({
      name: contact!.name,
      phone: contact!.phone,
      email: contact!.email,
      address: contact!.address,
      notes: contact!.notes,
    });
  }

  async function onSaveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.name.trim() || !contact) return;
    setSaving(true);
    try {
      await updateContact({
        ...contact,
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email,
        address: editForm.address,
        notes: editForm.notes,
      });
      refreshSitefold();
      setEditing(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save contact");
    } finally {
      setSaving(false);
    }
  }

  const headerSubtitle =
    [contact.phone, contact.email, contact.address]
      .filter(Boolean)
      .join(" · ") || "Contact folder";
  const directionsUrl = mapsDirectionsUrl(contact.address);

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
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {headerSubtitle}
          </p>
        </div>
        {!editing ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={startEdit}
            aria-label="Edit contact"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete contact"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {directionsUrl && !editing ? (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-sm font-medium text-[oklch(0.32_0.05_155)] shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)] transition hover:bg-white"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="block">Get directions</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {contact.address}
            </span>
          </span>
        </a>
      ) : null}

      {savedFlash ? (
        <p className="flex items-center gap-1.5 text-sm text-[oklch(0.42_0.08_155)]">
          <Check className="h-4 w-4" />
          Contact saved
        </p>
      ) : null}

      {editing ? (
        <form
          onSubmit={onSaveContact}
          className="space-y-3 rounded-2xl bg-white/70 px-4 py-4 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-sm font-semibold">Edit contact</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={cancelEdit}
              aria-label="Cancel edit"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              required
              value={editForm.name}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, name: e.target.value }))
              }
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={editForm.phone}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={editForm.email}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-address">Address</Label>
            <Textarea
              id="edit-address"
              value={editForm.address}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, address: e.target.value }))
              }
              rows={2}
              className="min-h-0"
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={3}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : contact.notes ? (
        <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm leading-relaxed ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
          {contact.notes}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Jobs</h2>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setTitle("");
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New job &amp; punch in
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New job in {contact.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={createAndPunch} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Job title</Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Kitchen remodel, Service call…"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Notes live on the job page after create.
              </p>
              <Button type="submit" className="w-full" disabled={creating}>
                <Play className="h-4 w-4" />
                {creating ? "Starting…" : "Create & punch in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={creating || !title.trim()}
                onClick={onAddJobOnly}
              >
                Create without punching in
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
          {jobs.map((job) => {
            const isHere = active?.job.id === job.id;
            const switchMode = !!active && !isHere;
            return (
              <li key={job.id}>
                <div className="flex items-stretch gap-1.5 rounded-2xl bg-white/70 p-1.5 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-[oklch(0.96_0.01_95)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{job.title}</p>
                        <Badge
                          variant={
                            job.status === "open" ? "default" : "secondary"
                          }
                          className="shrink-0 text-[10px]"
                        >
                          {job.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Started {formatDay(job.createdAt)}
                        {isHere ? " · on clock" : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                  {job.status === "open" && !isHere ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyJobId === job.id}
                      onClick={() => onQuickPunch(job.id)}
                      className="shrink-0 self-center"
                    >
                      {switchMode ? (
                        <>
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          Switch
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          In
                        </>
                      )}
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleStatus(job.id, job.status)}
                    className="shrink-0 self-center px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {job.status === "open" ? "Close" : "Reopen"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
