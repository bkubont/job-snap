"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ContactRound,
  Download,
  Plus,
  Smartphone,
  FolderOpen,
  Play,
  ArrowRightLeft,
} from "lucide-react";
import {
  useContacts,
  useActivePunch,
  useRecentJobs,
  refreshSitefold,
} from "@/hooks/use-sitefold";
import { canUseContactPicker, pickPhoneContacts } from "@/lib/contacts-picker";
import {
  createContact,
  countJobsForContact,
  switchPunchToJob,
  listAllPunches,
  listAllJobs,
  listDayNotes,
  listContacts,
} from "@/lib/db";
import { downloadThisWeekCsv } from "@/lib/export";
import { formatElapsedLive, formatDay } from "@/lib/time";
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

export default function HomePage() {
  const { contacts, loading } = useContacts();
  const { active } = useActivePunch();
  const { recent } = useRecentJobs(5);
  const [pickerOk, setPickerOk] = useState(false);
  const [jobCounts, setJobCounts] = useState<
    Record<string, { total: number; open: number }>
  >({});
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [, setTick] = useState(0);
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
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

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
    setShowMore(false);
    setOpen(false);
    refreshSitefold();
  }

  async function onContinuePunch(jobId: string) {
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

  async function onThisWeekCsv() {
    setCsvBusy(true);
    try {
      const [punches, jobs, contactRows, dayNotes] = await Promise.all([
        listAllPunches(),
        listAllJobs(),
        listContacts(),
        listDayNotes(),
      ]);
      await downloadThisWeekCsv({
        punches,
        jobs,
        contacts: contactRows,
        dayNotes,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not download CSV");
    } finally {
      setCsvBusy(false);
    }
  }

  const hasContacts = contacts.length > 0;
  const continueJobs = recent.filter((r) => r.job.id !== active?.job.id).slice(0, 5);

  return (
    <div className="space-y-6">
      {hasContacts ? (
        <section className="flex items-center justify-between gap-3 rounded-2xl bg-[oklch(0.32_0.05_155)] px-4 py-3 text-[oklch(0.97_0.02_95)] shadow-sm">
          <div className="min-w-0">
            <p className="font-heading text-lg font-semibold tracking-tight">
              Job Snap
            </p>
            <p className="text-[11px] text-[oklch(0.9_0.03_95_/0.75)]">
              {contacts.length} {contacts.length === 1 ? "folder" : "folders"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={csvBusy}
              onClick={onThisWeekCsv}
              className="bg-white/15 text-white hover:bg-white/25"
            >
              <Download className="h-3.5 w-3.5" />
              This week CSV
            </Button>
            {pickerOk ? (
              <Button
                size="sm"
                onClick={onImportFromPhone}
                disabled={importing}
                className="bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
              >
                <Smartphone className="h-3.5 w-3.5" />
                {importing ? "…" : "Phone"}
              </Button>
            ) : null}
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setShowMore(false);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white/15 text-white hover:bg-white/25"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>New contact folder</DialogTitle>
                </DialogHeader>
                <ContactCreateForm
                  form={form}
                  setForm={setForm}
                  showMore={showMore}
                  setShowMore={setShowMore}
                  pickerOk={pickerOk}
                  onSubmit={onCreateManual}
                />
              </DialogContent>
            </Dialog>
          </div>
        </section>
      ) : (
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
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setShowMore(false);
              }}
            >
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
                <ContactCreateForm
                  form={form}
                  setForm={setForm}
                  showMore={showMore}
                  setShowMore={setShowMore}
                  pickerOk={pickerOk}
                  onSubmit={onCreateManual}
                />
              </DialogContent>
            </Dialog>
          </div>
        </section>
      )}

      {hasContacts ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-[oklch(0.28_0.04_155)]">
            Continue
          </h2>
          {active ? (
            <Link
              href={`/jobs/${active.job.id}`}
              className="flex items-center gap-3 rounded-2xl bg-[oklch(0.42_0.08_155)] px-3.5 py-3.5 text-[oklch(0.97_0.02_95)] shadow-sm"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[oklch(0.82_0.14_75)] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[oklch(0.82_0.14_75)]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  On the clock · {formatElapsedLive(active.punch.punchedInAt)}
                </p>
                <p className="truncate text-xs opacity-80">
                  {active.contact.name} / {active.job.title}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 opacity-70" />
            </Link>
          ) : null}

          {!active && continueJobs.length === 0 && recent.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] px-4 py-6 text-center text-sm text-muted-foreground">
              Punch in from a job once — recent work shows up here.
            </p>
          ) : null}

          {(active ? continueJobs : recent).length > 0 ? (
            <ul className="space-y-2">
              {(active ? continueJobs : recent).map((r) => {
                const switchMode = !!active && active.job.id !== r.job.id;
                return (
                  <li key={r.job.id}>
                    <div className="flex items-stretch gap-2 rounded-2xl bg-white/70 p-1.5 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)]">
                      <Link
                        href={`/jobs/${r.job.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-[oklch(0.96_0.01_95)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.job.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.contact.name} · {formatDay(r.lastPunchedInAt)}
                          </p>
                        </div>
                      </Link>
                      <Button
                        size="sm"
                        disabled={busyJobId === r.job.id}
                        onClick={() => onContinuePunch(r.job.id)}
                        className="shrink-0 self-center bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
                      >
                        {switchMode ? (
                          <>
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            Switch
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Punch in
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

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

function ContactCreateForm({
  form,
  setForm,
  showMore,
  setShowMore,
  pickerOk,
  onSubmit,
}: {
  form: { name: string; phone: string; email: string; notes: string };
  setForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      phone: string;
      email: string;
      notes: string;
    }>
  >;
  showMore: boolean;
  setShowMore: (v: boolean) => void;
  pickerOk: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Client or person"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>
      {showMore ? (
        <>
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
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
        >
          More (email, notes)
        </button>
      )}
      {!pickerOk ? (
        <p className="text-xs text-muted-foreground">
          Phone contact import works best in Chrome or Edge on Android. On other
          browsers, add contacts here.
        </p>
      ) : null}
      <Button type="submit" className="w-full">
        Create folder
      </Button>
    </form>
  );
}
