"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ContactRound,
  Plus,
  Smartphone,
  FolderOpen,
} from "lucide-react";
import { useContacts, refreshSitefold } from "@/hooks/use-sitefold";
import { canUseContactPicker, pickPhoneContacts } from "@/lib/contacts-picker";
import { createContact, countJobsForContact } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function HomePage() {
  const { contacts, loading } = useContacts();
  const [pickerOk, setPickerOk] = useState(false);
  const [jobCounts, setJobCounts] = useState<
    Record<string, { total: number; open: number }>
  >({});
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });

  useEffect(() => {
    setPickerOk(canUseContactPicker());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        contacts.map(async (c) => [c.id, await countJobsForContact(c.id)] as const),
      );
      if (!cancelled) {
        setJobCounts(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contacts]);

  async function onImportFromPhone() {
    setImporting(true);
    try {
      const picked = await pickPhoneContacts();
      if (!picked.length) return;
      const existing = new Set(
        contacts.map((c) => c.name.toLowerCase() + "|" + c.phone),
      );
      for (const p of picked) {
        const key = p.name.toLowerCase() + "|" + p.phone;
        if (existing.has(key)) continue;
        await createContact({
          name: p.name,
          phone: p.phone,
          email: p.email,
          notes: "",
        });
        existing.add(key);
      }
      refreshSitefold();
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Could not open your phone contacts. Try Chrome or Edge on Android, or add a contact manually.",
      );
    } finally {
      setImporting(false);
    }
  }

  async function onCreateManual(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await createContact(form);
    setForm({ name: "", phone: "", email: "", notes: "" });
    setOpen(false);
    refreshSitefold();
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[oklch(0.32_0.05_155)] px-5 py-7 text-[oklch(0.97_0.02_95)] shadow-sm">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[oklch(0.72_0.12_75_/0.25)] blur-2xl" />
        <div className="absolute bottom-0 left-1/3 h-24 w-48 rounded-full bg-[oklch(0.5_0.06_180_/0.2)] blur-2xl" />
        <p className="font-heading text-3xl font-semibold tracking-tight">
          Job Snap
        </p>
        <p className="mt-2 max-w-[18rem] text-sm leading-relaxed text-[oklch(0.9_0.03_95_/0.85)]">
          Your phone contacts become job folders. Punch the clock, snap photos,
          jot the day, export the hours.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {pickerOk ? (
            <Button
              onClick={onImportFromPhone}
              disabled={importing}
              className="bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
            >
              <Smartphone className="h-4 w-4" />
              {importing ? "Opening…" : "From phone"}
            </Button>
          ) : null}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant={pickerOk ? "secondary" : "default"}
                className={
                  pickerOk
                    ? "bg-white/15 text-white hover:bg-white/25"
                    : "bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
                }
              >
                <Plus className="h-4 w-4" />
                Add contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>New contact folder</DialogTitle>
              </DialogHeader>
              <form onSubmit={onCreateManual} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Client or person"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    rows={3}
                  />
                </div>
                {!pickerOk ? (
                  <p className="text-xs text-muted-foreground">
                    Phone contact import works best in Chrome or Edge on Android.
                    On other browsers, add contacts here.
                  </p>
                ) : null}
                <Button type="submit" className="w-full">
                  Create folder
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-[oklch(0.28_0.04_155)]">
            Contact folders
          </h2>
          <span className="text-xs text-muted-foreground">
            {contacts.length} {contacts.length === 1 ? "folder" : "folders"}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : contacts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] bg-white/50 px-5 py-12 text-center">
            <ContactRound className="mx-auto h-8 w-8 text-[oklch(0.45_0.05_155)]" />
            <p className="mt-3 font-medium">No contacts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import from your phone or add one manually to start a job folder.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => {
              const counts = jobCounts[c.id];
              return (
                <li key={c.id}>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="group flex items-center gap-3 rounded-2xl bg-white/70 px-3.5 py-3.5 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)] transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.93_0.02_95)] text-[oklch(0.35_0.05_155)]">
                      <FolderOpen className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {counts
                          ? `${counts.open} open · ${counts.total} jobs`
                          : "…"}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
