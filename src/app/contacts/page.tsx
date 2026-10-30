"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronRight,
  ContactRound,
  Plus,
  Search,
  Smartphone,
  Upload,
} from "lucide-react";
import { useContacts, useJobOverviews, refreshSitefold } from "@/hooks/use-sitefold";
import { canUseContactPicker, pickPhoneContacts } from "@/lib/contacts-picker";
import { createContact } from "@/lib/db";
import {
  contactDedupeKey,
  findPossibleDuplicates,
  parseContactImportFile,
  type ImportedContact,
} from "@/lib/vcard";
import type { Contact } from "@/lib/types";
import { isDoneStatus } from "@/lib/status";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  const hay = [c.name, c.phone, c.email, c.address].join(" ").toLowerCase();
  if (hay.includes(q)) return true;
  // Phone search ignoring formatting: "5550100" finds "(555) 0100".
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits);
}

type ReviewItem = {
  key: string;
  contact: ImportedContact;
  kind: "new" | "possible";
  matches: Contact[];
  include: boolean;
};

/** Sort an import into new / exact-duplicate / possible-duplicate. */
function buildReview(parsed: ImportedContact[], existing: Contact[]) {
  const exactKeys = new Set(existing.map(contactDedupeKey));
  const seenInFile = new Set<string>();
  const items: ReviewItem[] = [];
  let exact = 0;
  parsed.forEach((p, i) => {
    const key = contactDedupeKey(p);
    if (exactKeys.has(key) || seenInFile.has(key)) {
      exact += 1;
      return;
    }
    seenInFile.add(key);
    const matches = findPossibleDuplicates(p, existing);
    items.push({
      key: `${i}`,
      contact: p,
      kind: matches.length ? "possible" : "new",
      matches,
      // Possible duplicates need an explicit choice.
      include: matches.length === 0,
    });
  });
  return { items, exact };
}

export default function ContactsPage() {
  const { contacts, loading, error, retry } = useContacts();
  const { overviews } = useJobOverviews();
  const pickerOk = useSyncExternalStore(noopSubscribe, canUseContactPicker, () => false);
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [review, setReview] = useState<{
    source: string;
    items: ReviewItem[];
    exact: number;
  } | null>(null);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const vcfInputRef = useRef<HTMLInputElement>(null);

  const jobCounts = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    for (const o of overviews) {
      const m = map.get(o.job.contactId) ?? { total: 0, active: 0 };
      m.total += 1;
      if (!isDoneStatus(o.job.status)) m.active += 1;
      map.set(o.job.contactId, m);
    }
    return map;
  }, [overviews]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => contacts.filter((c) => contactMatchesQuery(c, normalizedQuery)),
    [contacts, normalizedQuery],
  );

  function startReview(source: string, parsed: ImportedContact[]) {
    setResult(null);
    const r = buildReview(parsed, contacts);
    setReview({ source, ...r });
  }

  async function onImportFromPhone() {
    try {
      const picked = await pickPhoneContacts();
      if (!picked.length) return;
      startReview(
        "your phone",
        picked.map((p) => ({ ...p, address: "", notes: "" })),
      );
    } catch (e) {
      alert(
        e instanceof Error
          ? e.message
          : "Could not open your phone contacts. Import a .vcf file or add a contact manually.",
      );
    }
  }

  async function onImportFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (vcfInputRef.current) vcfInputRef.current.value = "";
    if (!file) return;
    setReadingFile(true);
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
            ? "No contacts found. A CSV needs a name column (phone, email and address are optional)."
            : "No contacts found in that file. Export contacts as .vcf (see the steps on this page) or use a CSV with name/phone/email/address headers.",
        );
        return;
      }
      startReview(file.name, parsed);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setReadingFile(false);
    }
  }

  async function confirmImport() {
    if (!review || importing) return;
    const chosen = review.items.filter((i) => i.include);
    setImporting({ done: 0, total: chosen.length });
    let done = 0;
    try {
      for (const item of chosen) {
        await createContact({
          name: item.contact.name,
          phone: item.contact.phone,
          email: item.contact.email,
          address: item.contact.address,
          notes: item.contact.notes,
        });
        done += 1;
        setImporting({ done, total: chosen.length });
      }
      const skipped = review.items.length - chosen.length + review.exact;
      setResult(
        `Imported ${done} contact${done === 1 ? "" : "s"}${
          skipped ? ` · skipped ${skipped}` : ""
        }${review.exact ? ` (${review.exact} already here)` : ""}.`,
      );
      setReview(null);
    } catch (e) {
      setResult(
        `Imported ${done} of ${chosen.length} before an error: ${
          e instanceof Error ? e.message : "unknown error"
        }. The rest were not saved.`,
      );
      setReview(null);
    } finally {
      setImporting(null);
      refreshSitefold();
    }
  }

  async function onCreateManual(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || creating) return;
    const dupes = findPossibleDuplicates(form, contacts);
    if (
      dupes.length &&
      !confirm(
        `Possible duplicate of ${dupes
          .slice(0, 3)
          .map((d) => d.name + (d.phone ? ` (${d.phone})` : ""))
          .join(", ")}. Create a separate contact anyway?`,
      )
    ) {
      return;
    }
    setCreating(true);
    try {
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
    } catch (err) {
      alert(
        err instanceof Error ? `Contact not saved: ${err.message}` : "Contact not saved.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <QueryActions
          onNew={() => setOpen(true)}
          onImport={() => setResult(null)}
        />
      </Suspense>
      <input
        ref={vcfInputRef}
        type="file"
        accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onImportFile(e.target.files)}
      />

      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
            Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading || (error && !contacts.length)
              ? " "
              : `${contacts.length} ${contacts.length === 1 ? "customer" : "customers"}`}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      <section
        id="import"
        className="space-y-3 rounded-2xl bg-white/70 p-4 ring-1 ring-[oklch(0.35_0.03_155_/0.08)]"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={readingFile || !!importing}
            onClick={() => vcfInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {readingFile ? "Reading…" : "Import .vcf / CSV"}
          </Button>
          {pickerOk ? (
            <Button variant="outline" onClick={onImportFromPhone} disabled={!!importing}>
              <Smartphone className="h-4 w-4" />
              From phone
            </Button>
          ) : null}
        </div>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            How to get a .vcf from iPhone
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open the Contacts app and tap a contact (or a list to share several).</li>
            <li>Tap <strong>Share Contact</strong> → <strong>Save to Files</strong>.</li>
            <li>Come back here, tap <strong>Import .vcf / CSV</strong>, and pick the file.</li>
          </ol>
          <p className="mt-2">
            You&apos;ll see who&apos;s new and any possible duplicates before anything is
            saved. Contacts are never merged automatically.
          </p>
        </details>
        {result ? (
          <p role="status" className="text-sm font-medium text-[oklch(0.35_0.06_155)]">
            {result}
          </p>
        ) : null}
      </section>

      {contacts.length > 0 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, email, address"
            className="h-11 bg-white/70 pl-9 text-base"
            aria-label="Search contacts"
          />
        </div>
      ) : null}

      {error && !contacts.length ? (
        <LoadError error={error} onRetry={retry} what="your contacts" />
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] bg-white/50 px-5 py-10 text-center">
          <ContactRound className="mx-auto h-8 w-8 text-[oklch(0.45_0.05_155)]" />
          <p className="mt-3 font-medium">No contacts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import from a .vcf file or add your first customer with Add.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] px-4 py-8 text-center text-sm text-muted-foreground">
          No contacts match “{query.trim()}”.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const counts = jobCounts.get(c.id);
            const subtitle = [
              counts
                ? `${counts.active} active · ${counts.total} job${counts.total === 1 ? "" : "s"}`
                : "No jobs yet",
              c.phone || null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.id}>
                <Link
                  href={`/contacts/${c.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/70 px-3.5 py-3 shadow-sm ring-1 ring-[oklch(0.35_0.03_155_/0.08)] transition hover:bg-white"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[oklch(0.93_0.02_95)] text-sm font-semibold text-[oklch(0.35_0.05_155)]">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (creating) return;
          setOpen(v);
          if (!v) setShowMore(false);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New contact</DialogTitle>
          </DialogHeader>
          <ContactCreateForm
            form={form}
            setForm={setForm}
            showMore={showMore}
            setShowMore={setShowMore}
            onSubmit={onCreateManual}
            submitting={creating}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!review}
        onOpenChange={(v) => {
          if (importing) return;
          if (!v) setReview(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review import</DialogTitle>
            <DialogDescription>
              From {review?.source}: {review?.items.filter((i) => i.kind === "new").length ?? 0}{" "}
              new
              {review?.items.some((i) => i.kind === "possible")
                ? `, ${review.items.filter((i) => i.kind === "possible").length} possible duplicate(s) — tick only if they're really different people`
                : ""}
              {review?.exact ? `. ${review.exact} already here (skipped).` : "."}
            </DialogDescription>
          </DialogHeader>
          {review && review.items.length > 0 ? (
            <ul className="space-y-1.5">
              {review.items.map((item) => (
                <li key={item.key}>
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-black/5">
                    <input
                      type="checkbox"
                      checked={item.include}
                      disabled={!!importing}
                      onChange={(e) =>
                        setReview((r) =>
                          r && {
                            ...r,
                            items: r.items.map((x) =>
                              x.key === item.key ? { ...x, include: e.target.checked } : x,
                            ),
                          },
                        )
                      }
                      className="mt-1 h-5 w-5 shrink-0 accent-[oklch(0.32_0.05_155)]"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">{item.contact.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[item.contact.phone, item.contact.email].filter(Boolean).join(" · ") ||
                          "No phone or email"}
                      </span>
                      {item.kind === "possible" ? (
                        <span className="mt-1 block text-xs font-medium text-[oklch(0.45_0.1_65)]">
                          Possible duplicate of{" "}
                          {item.matches
                            .slice(0, 2)
                            .map((m) => m.name + (m.phone ? ` (${m.phone})` : ""))
                            .join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing new to import — everyone in this file is already in Job Snap.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={!!importing} onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              disabled={!!importing || !review?.items.some((i) => i.include)}
              onClick={() => void confirmImport()}
            >
              {importing
                ? `Importing ${importing.done} of ${importing.total}…`
                : `Import ${review?.items.filter((i) => i.include).length ?? 0}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const noopSubscribe = () => () => {};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}

/** Dashboard quick actions link here with ?new=1 (open Add) or ?import=1. */
function QueryActions({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  const params = useSearchParams();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (params.get("new") === "1") onNew();
    if (params.get("import") === "1") {
      onImport();
      document.getElementById("import")?.scrollIntoView({ block: "start" });
    }
  }, [params, onNew, onImport]);
  return null;
}

function ContactCreateForm({
  form,
  setForm,
  showMore,
  setShowMore,
  onSubmit,
  submitting,
}: {
  form: ContactForm;
  setForm: React.Dispatch<React.SetStateAction<ContactForm>>;
  showMore: boolean;
  setShowMore: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
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
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
              placeholder="e.g. 75"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
        >
          More (email, rate, notes)
        </button>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Saving…" : "Create contact"}
      </Button>
    </form>
  );
}
