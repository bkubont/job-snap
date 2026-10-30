"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ContactRound,
  Download,
  Plus,
  Search,
  Smartphone,
  FolderOpen,
  Play,
  ArrowRightLeft,
  Upload,
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
  listAllPhotos,
  listDayNotes,
  listContacts,
} from "@/lib/db";
import { downloadThisWeekCsv } from "@/lib/export";
import { formatElapsedLive, formatDay } from "@/lib/time";
import {
  contactDedupeKey,
  parseContactImportFile,
} from "@/lib/vcard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ContactForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  /** Empty string = no rate; otherwise a numeric string for the input. */
  hourlyRate: string;
};

const emptyForm: ContactForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  hourlyRate: "",
};

function parseHourlyRateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function contactMatchesQuery(
  c: { name: string; phone: string; email: string; address: string },
  q: string,
) {
  if (!q) return true;
  const hay = [c.name, c.phone, c.email, c.address]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

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
  const [fileImporting, setFileImporting] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [, setTick] = useState(0);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const vcfInputRef = useRef<HTMLInputElement>(null);

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
      const existing = new Set(contacts.map(contactDedupeKey));
      let imported = 0;
      let skipped = 0;
      for (const p of picked) {
        const key = contactDedupeKey(p);
        if (existing.has(key)) {
          skipped += 1;
          continue;
        }
        await createContact({
          name: p.name,
          phone: p.phone,
          email: p.email,
          address: "",
          notes: "",
        });
        existing.add(key);
        imported += 1;
      }
      refreshSitefold();
      alert(
        imported || skipped
          ? `Imported ${imported} contact${imported === 1 ? "" : "s"}${
              skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""
            }.`
          : "No contacts selected.",
      );
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Could not open your phone contacts. Try Chrome or Edge on Android, import a .vcf, or add a contact manually.",
      );
    } finally {
      setImporting(false);
    }
  }

  async function onImportVcfFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setFileImporting(true);
    try {
      const text = await file.text();
      const { contacts: parsed, kind } = parseContactImportFile(
        text,
        file.name,
        file.type,
      );
      if (!parsed.length) {
        alert(
          kind === "csv"
            ? "No contacts found. CSV needs a name column (and optional phone, email, address)."
            : "No contacts found in that file. Export contacts as .vcf from iOS Contacts, or use a CSV with name/phone/email/address headers.",
        );
        return;
      }
      const existing = new Set(contacts.map(contactDedupeKey));
      let imported = 0;
      let skipped = 0;
      for (const p of parsed) {
        const key = contactDedupeKey(p);
        if (existing.has(key)) {
          skipped += 1;
          continue;
        }
        await createContact({
          name: p.name,
          phone: p.phone,
          email: p.email,
          address: p.address,
          notes: p.notes,
        });
        existing.add(key);
        imported += 1;
      }
      refreshSitefold();
      alert(
        `Imported ${imported} contact${imported === 1 ? "" : "s"}${
          skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""
        }.`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not import that file.");
    } finally {
      setFileImporting(false);
      if (vcfInputRef.current) vcfInputRef.current.value = "";
    }
  }

  async function onCreateManual(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await createContact({
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
      hourlyRate: parseHourlyRateInput(form.hourlyRate),
    });
    setForm(emptyForm);
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
      const [punches, jobs, contactRows, dayNotes, photos] = await Promise.all([
        listAllPunches(),
        listAllJobs(),
        listContacts(),
        listDayNotes(),
        listAllPhotos(),
      ]);
      await downloadThisWeekCsv({
        punches,
        jobs,
        contacts: contactRows,
        dayNotes,
        photos,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not download CSV");
    } finally {
      setCsvBusy(false);
    }
  }

  const hasContacts = contacts.length > 0;
  const continueJobs = recent.filter((r) => r.job.id !== active?.job.id).slice(0, 5);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredContacts = useMemo(
    () => contacts.filter((c) => contactMatchesQuery(c, normalizedQuery)),
    [contacts, normalizedQuery],
  );

  return (
    <div className="space-y-6">
      <input
        ref={vcfInputRef}
        type="file"
        accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => onImportVcfFile(e.target.files)}
      />
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
                disabled={importing || fileImporting}
                className="bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
              >
                <Smartphone className="h-3.5 w-3.5" />
                {importing ? "…" : "Phone"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={fileImporting || importing}
              onClick={() => vcfInputRef.current?.click()}
              className="bg-white/15 text-white hover:bg-white/25"
            >
              <Upload className="h-3.5 w-3.5" />
              {fileImporting ? "…" : "Import .vcf"}
            </Button>
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
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[oklch(0.72_0.12_75_/0.25)] blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-48 rounded-full bg-[oklch(0.5_0.06_180_/0.2)] blur-2xl" />
          <p className="relative font-heading text-3xl font-semibold tracking-tight">
            Job Snap
          </p>
          <p className="relative mt-2 max-w-[18rem] text-sm leading-relaxed text-[oklch(0.9_0.03_95_/0.85)]">
            Your phone contacts become job folders. Punch the clock, snap photos,
            jot the day, export the hours.
          </p>
          <div className="relative mt-5 flex flex-wrap gap-2">
            {pickerOk ? (
              <Button
                onClick={onImportFromPhone}
                disabled={importing || fileImporting}
                className="bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
              >
                <Smartphone className="h-4 w-4" />
                {importing ? "Opening…" : "From phone"}
              </Button>
            ) : null}
            <Button
              variant={pickerOk ? "secondary" : "default"}
              disabled={fileImporting || importing}
              onClick={() => vcfInputRef.current?.click()}
              className={
                pickerOk
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
              }
            >
              <Upload className="h-4 w-4" />
              {fileImporting ? "Importing…" : "Import .vcf"}
            </Button>
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setShowMore(false);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="secondary"
                  className="bg-white/15 text-white hover:bg-white/25"
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
            {normalizedQuery
              ? `${filteredContacts.length} of ${contacts.length}`
              : `${contacts.length} ${contacts.length === 1 ? "folder" : "folders"}`}
          </span>
        </div>

        {hasContacts ? (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, email, address…"
              className="bg-white/70 pl-9"
              aria-label="Search contacts"
            />
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : contacts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] bg-white/50 px-5 py-12 text-center">
            <ContactRound className="mx-auto h-8 w-8 text-[oklch(0.45_0.05_155)]" />
            <p className="mt-3 font-medium">No contacts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              On iPhone, export contacts as .vcf and import here. On Android, use
              From phone — or add one manually.
            </p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] px-4 py-8 text-center text-sm text-muted-foreground">
            No contacts match “{query.trim()}”.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredContacts.map((c) => {
              const counts = jobCounts[c.id];
              const subtitle = [
                counts
                  ? `${counts.open} open · ${counts.total} jobs`
                  : "…",
                c.phone || null,
                c.address || null,
              ]
                .filter(Boolean)
                .join(" · ");
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
                        {subtitle}
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
  form: ContactForm;
  setForm: React.Dispatch<React.SetStateAction<ContactForm>>;
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
      <div className="space-y-1.5">
        <Label htmlFor="address">Address (optional)</Label>
        <Textarea
          id="address"
          value={form.address}
          onChange={(e) =>
            setForm((f) => ({ ...f, address: e.target.value }))
          }
          placeholder="Job site or mailing address"
          rows={2}
          className="min-h-0"
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
            <Label htmlFor="hourlyRate">Hourly rate (optional)</Label>
            <Input
              id="hourlyRate"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={form.hourlyRate}
              onChange={(e) =>
                setForm((f) => ({ ...f, hourlyRate: e.target.value }))
              }
              placeholder="e.g. 75"
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
          More (email, rate, notes)
        </button>
      )}
      {!pickerOk ? (
        <p className="text-xs text-muted-foreground">
          iPhone Safari can’t use the contact picker — use Import .vcf (or CSV)
          from the home screen, or add contacts here.
        </p>
      ) : null}
      <Button type="submit" className="w-full">
        Create folder
      </Button>
    </form>
  );
}
