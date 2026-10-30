import { format, parseISO } from "date-fns";
import type { Contact } from "./types";
import type { ExportRow } from "./export";
import { downloadBlob } from "./export";
import { hoursFromMinutes, todayKey } from "./time";
import {
  DEFAULT_SETTINGS,
  describeRounding,
  roundBilledMinutes,
  type RoundingSettings,
} from "./settings";

export type InvoiceLineItem = {
  jobId: string;
  job: string;
  /** Billed minutes (after optional per-entry rounding). */
  minutes: number;
  /** Exact recorded minutes. */
  rawMinutes: number;
  hours: string;
  amount: number | null;
};

export type InvoiceData = {
  contact: Contact;
  from: string;
  to: string;
  invoiceDate: string;
  rate: number | null;
  lineItems: InvoiceLineItem[];
  totalMinutes: number;
  totalHours: string;
  /** Exact recorded minutes, before rounding. */
  rawTotalMinutes: number;
  /** e.g. "Rounded to nearest 15 min per entry"; null when exact. */
  roundingNote: string | null;
  totalAmount: number | null;
  /** True when PDF is hours-only (no rate on contact). */
  hoursOnly: boolean;
};

function money(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function rateLabel(rate: number) {
  return `${money(rate)}/hr`;
}

/** Hours shown on the invoice (2 decimals) — amounts are computed from this. */
function billedHours(minutes: number) {
  return Number(hoursFromMinutes(minutes));
}

/**
 * Group closed-punch minutes by job. Open punches contribute 0. Optional
 * rounding applies per entry, for billing only; recorded times are unchanged.
 */
export function buildInvoiceLineItems(
  rows: ExportRow[],
  rate: number | null,
  rounding: RoundingSettings = DEFAULT_SETTINGS,
): InvoiceLineItem[] {
  const byJob = new Map<
    string,
    { jobId: string; job: string; minutes: number; rawMinutes: number }
  >();

  for (const row of rows) {
    if (row.isOpen || row.minutes <= 0) continue;
    const billed = roundBilledMinutes(row.minutes, rounding);
    const existing = byJob.get(row.jobId);
    if (existing) {
      existing.minutes += billed;
      existing.rawMinutes += row.minutes;
    } else {
      byJob.set(row.jobId, {
        jobId: row.jobId,
        job: row.job,
        minutes: billed,
        rawMinutes: row.minutes,
      });
    }
  }

  return [...byJob.values()]
    .sort((a, b) => a.job.localeCompare(b.job))
    .map((item) => {
      const hoursNum = billedHours(item.minutes);
      return {
        jobId: item.jobId,
        job: item.job,
        minutes: item.minutes,
        rawMinutes: item.rawMinutes,
        hours: hoursFromMinutes(item.minutes),
        amount: rate != null ? Math.round(hoursNum * rate * 100) / 100 : null,
      };
    });
}

export function buildInvoiceData(args: {
  contact: Contact;
  rows: ExportRow[];
  from: string;
  to: string;
  invoiceDate?: string;
  rounding?: RoundingSettings;
}): InvoiceData {
  const rate =
    args.contact.hourlyRate != null &&
    Number.isFinite(args.contact.hourlyRate) &&
    args.contact.hourlyRate >= 0
      ? args.contact.hourlyRate
      : null;
  const rounding = args.rounding ?? DEFAULT_SETTINGS;
  const lineItems = buildInvoiceLineItems(args.rows, rate, rounding);
  const totalMinutes = lineItems.reduce((s, i) => s + i.minutes, 0);
  const rawTotalMinutes = lineItems.reduce((s, i) => s + i.rawMinutes, 0);
  const totalAmount =
    rate != null
      ? lineItems.reduce((s, i) => s + (i.amount ?? 0), 0)
      : null;

  return {
    contact: args.contact,
    from: args.from,
    to: args.to,
    invoiceDate: args.invoiceDate ?? todayKey(),
    rate,
    lineItems,
    totalMinutes,
    totalHours: hoursFromMinutes(totalMinutes),
    rawTotalMinutes,
    roundingNote: rounding.roundingMinutes ? describeRounding(rounding) : null,
    totalAmount,
    hoursOnly: rate == null,
  };
}

function formatRangeLabel(from: string, to: string) {
  const fmt = (d: string) => format(parseISO(`${d}T12:00:00`), "MMM d, yyyy");
  return `${fmt(from)} – ${fmt(to)}`;
}

function sanitizeFilenamePart(value: string) {
  return (
    value
      .trim()
      .replace(/[^\w\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "client"
  );
}

/** Build a real PDF blob (client-only; dynamically imports jsPDF). */
export async function buildInvoicePdfBlob(data: InvoiceData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(35, 70, 55);
  doc.text("Job Snap", margin, y);
  y += 22;

  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text(data.hoursOnly ? "Hours statement" : "Invoice", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Invoice date: ${format(parseISO(`${data.invoiceDate}T12:00:00`), "MMM d, yyyy")}`,
    margin,
    y,
  );
  y += 14;
  doc.text(`Period: ${formatRangeLabel(data.from, data.to)}`, margin, y);
  y += 24;

  // Bill to
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text("Bill to", margin, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.contact.name, margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  const identity = [
    data.contact.phone ? `Phone: ${data.contact.phone}` : null,
    data.contact.email ? `Email: ${data.contact.email}` : null,
    data.contact.address ? `Address: ${data.contact.address}` : null,
  ].filter(Boolean) as string[];

  for (const line of identity) {
    const wrapped = doc.splitTextToSize(line, contentWidth);
    ensureSpace(wrapped.length * 13 + 4);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 13;
  }

  if (identity.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text("No phone, email, or address on file", margin, y);
    y += 13;
  }

  y += 10;
  if (data.rate != null) {
    doc.setTextColor(70, 70, 70);
    doc.text(`Rate: ${rateLabel(data.rate)}`, margin, y);
    y += 14;
  } else {
    doc.setTextColor(120, 90, 40);
    doc.text("Rate not set — hours only", margin, y);
    y += 14;
  }

  y += 8;
  ensureSpace(40);

  // Table header
  const colJob = margin;
  const colHours = margin + contentWidth * 0.55;
  const colAmount = margin + contentWidth;

  doc.setDrawColor(180, 185, 175);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("Job", colJob, y);
  doc.text("Hours", colHours, y);
  if (!data.hoursOnly) {
    doc.text("Amount", colAmount, y, { align: "right" });
  }
  y += 6;
  doc.line(margin, y, margin + contentWidth, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);

  if (data.lineItems.length === 0) {
    ensureSpace(20);
    doc.setTextColor(120, 120, 120);
    doc.text("No closed punches in this range.", margin, y);
    y += 16;
  } else {
    for (const item of data.lineItems) {
      const jobLines = doc.splitTextToSize(item.job, contentWidth * 0.5);
      ensureSpace(jobLines.length * 13 + 8);
      doc.setTextColor(40, 40, 40);
      doc.text(jobLines, colJob, y);
      doc.text(item.hours, colHours, y);
      if (!data.hoursOnly && item.amount != null) {
        doc.text(money(item.amount), colAmount, y, { align: "right" });
      }
      y += Math.max(jobLines.length * 13, 14) + 4;
    }
  }

  y += 4;
  ensureSpace(36);
  doc.setDrawColor(180, 185, 175);
  doc.line(margin, y, margin + contentWidth, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(35, 70, 55);
  doc.text("Total hours", colJob, y);
  doc.text(data.totalHours, colHours, y);
  if (!data.hoursOnly && data.totalAmount != null) {
    doc.text(money(data.totalAmount), colAmount, y, { align: "right" });
  }
  y += 20;

  if (!data.hoursOnly && data.totalAmount != null) {
    ensureSpace(20);
    doc.setFontSize(12);
    doc.text(`Amount due: ${money(data.totalAmount)}`, margin, y);
    y += 18;
  }

  if (data.roundingNote) {
    ensureSpace(16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `${data.roundingNote}. Recorded time: ${hoursFromMinutes(data.rawTotalMinutes)} h.`,
      margin,
      y,
    );
  }

  // Footer note
  const footerY = pageHeight - 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Generated by Job Snap · closed entries only · amount = hours shown × rate",
    margin,
    footerY,
  );

  return doc.output("blob");
}

export async function downloadInvoicePdf(data: InvoiceData) {
  const blob = await buildInvoicePdfBlob(data);
  const name = sanitizeFilenamePart(data.contact.name);
  const kind = data.hoursOnly ? "hours" : "invoice";
  downloadBlob(
    `job-snap-${kind}-${name}-${data.from}-to-${data.to}.pdf`,
    blob,
  );
}
