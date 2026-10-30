"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  Briefcase,
  Check,
  Mail,
  Phone,
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
  deleteContact,
  updateContact,
  switchPunchToJob,
} from "@/lib/db";
import { LoadError } from "@/components/load-error";
import { StatusPicker } from "@/components/job-status";
import { AddJobDialog } from "@/components/job-dialogs";
import { mapsDirectionsUrl } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDay } from "@/lib/time";

type EditForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  /** Empty string = no rate; otherwise a numeric string for the input. */
  hourlyRate: string;
};

function rateToInput(rate: number | null | undefined) {
  if (rate == null || !Number.isFinite(rate)) return "";
  return String(rate);
}

function parseHourlyRateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function contactToEditForm(contact: {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  hourlyRate?: number | null;
}): EditForm {
  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    address: contact.address,
    notes: contact.notes,
    hourlyRate: rateToInput(contact.hourlyRate),
  };
}

export default function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { contact, jobs, error, retry } = useContact(id);
  const { active } = useActivePunch();
  const [open, setOpen] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    hourlyRate: "",
  });

  useEffect(() => {
    if (!contact || editing) return;
    setEditForm(contactToEditForm(contact));
  }, [contact, editing]);

  if (contact === undefined) {
    return error ? (
      <LoadError error={error} onRetry={retry} what="this contact" />
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
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

  async function onDelete() {
    if (
      !confirm(
        `Delete ${contact!.name} and all ${jobs.length} job${
          jobs.length === 1 ? "" : "s"
        } inside, with every punch and photo? This can't be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteContact(id);
      refreshSitefold();
      router.push("/");
    } catch (e) {
      alert(
        e instanceof Error
          ? `Nothing was deleted: ${e.message}`
          : "Nothing was deleted.",
      );
    }
  }

  async function onQuickPunch(jobId: string) {
    setBusyJobId(jobId);
    try {
      await switchPunchToJob(jobId);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not clock in");
    } finally {
      setBusyJobId(null);
    }
  }

  function startEdit() {
    setEditForm(contactToEditForm(contact!));
    setEditing(true);
    setSavedFlash(false);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(contactToEditForm(contact!));
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
        hourlyRate: parseHourlyRateInput(editForm.hourlyRate),
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

  const phoneHref = contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : null;
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

      {!editing && (phoneHref || contact.email) ? (
        <div className="flex gap-2">
          {phoneHref ? (
            <Button asChild variant="outline" className="h-11 flex-1">
              <a href={phoneHref}>
                <Phone className="h-4 w-4" />
                Call
              </a>
            </Button>
          ) : null}
          {contact.email ? (
            <Button asChild variant="outline" className="h-11 flex-1">
              <a href={`mailto:${contact.email}`}>
                <Mail className="h-4 w-4" />
                Email
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

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
            <Label htmlFor="edit-hourlyRate">Hourly rate (optional)</Label>
            <Input
              id="edit-hourlyRate"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={editForm.hourlyRate}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, hourlyRate: e.target.value }))
              }
              placeholder="e.g. 75 — leave blank for hours-only"
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
        <h2 className="font-heading text-lg font-semibold">
          Jobs{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {jobs.length ? `(${jobs.length})` : ""}
          </span>
        </h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New job
        </Button>
      </div>
      <AddJobDialog
        open={open}
        onOpenChange={setOpen}
        contacts={[contact]}
        contactId={contact.id}
        onCreated={(job) => router.push(`/jobs/${job.id}`)}
      />

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] px-5 py-10 text-center">
          <Briefcase className="mx-auto h-7 w-7 text-[oklch(0.45_0.05_155)]" />
          <p className="mt-2 text-sm text-muted-foreground">
            No jobs yet. Each job gets its own time, photos and notes.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => {
            const isHere = active?.job.id === job.id;
            const switchMode = !!active && !isHere;
            return (
              <li key={job.id}>
                <div className="relative flex items-center gap-2 rounded-2xl bg-white/70 p-1.5 pl-3.5 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="min-w-0 flex-1 py-2 after:absolute after:inset-0 after:rounded-2xl"
                  >
                    <p className="truncate font-medium">{job.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {isHere
                        ? "On the clock now"
                        : job.scheduledDate
                          ? `Scheduled ${formatDay(job.scheduledDate)}`
                          : `Created ${formatDay(job.createdAt)}`}
                    </p>
                  </Link>
                  <StatusPicker
                    jobId={job.id}
                    status={job.status}
                    className="relative z-10"
                  />
                  {!isHere ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyJobId === job.id}
                      onClick={() => onQuickPunch(job.id)}
                      className="relative z-10 h-10 shrink-0"
                      aria-label={`${switchMode ? "Switch to" : "Clock in to"} ${job.title}`}
                    >
                      {switchMode ? (
                        <ArrowRightLeft className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
