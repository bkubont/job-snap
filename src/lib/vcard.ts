/** Parsed contact fields from a vCard or simple CSV row. */
export type ImportedContact = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

/**
 * Split a multi-contact .vcf into individual vCard blocks.
 * Handles CRLF/LF and unfolded continuation lines (leading space/tab).
 */
function unfoldAndSplitCards(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // RFC 2425 line unfolding: CRLF + WSP → nothing
  const unfolded = normalized.replace(/\n[ \t]/g, "");
  const cards: string[] = [];
  let current: string[] = [];
  let inCard = false;

  for (const rawLine of unfolded.split("\n")) {
    const line = rawLine.trimEnd();
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VCARD") {
      inCard = true;
      current = [line];
      continue;
    }
    if (!inCard) continue;
    current.push(line);
    if (upper === "END:VCARD") {
      cards.push(current.join("\n"));
      current = [];
      inCard = false;
    }
  }
  return cards;
}

/** Decode common vCard escapes (3.0) and optional quoted-printable. */
function decodeValue(raw: string, params: string[]): string {
  let value = raw;
  const encoding = params
    .map((p) => p.toUpperCase())
    .find((p) => p.startsWith("ENCODING="));
  if (encoding?.includes("QUOTED-PRINTABLE") || params.some((p) => p.toUpperCase() === "QUOTED-PRINTABLE")) {
    value = decodeQuotedPrintable(value);
  }
  // vCard 3.0 backslash escapes
  value = value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
  return value.trim();
}

function decodeQuotedPrintable(input: string): string {
  // Soft line breaks already removed by unfold; decode =XX hex
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "=" && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(input.charCodeAt(i));
  }
  try {
    return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

type PropLine = {
  name: string;
  params: string[];
  value: string;
};

function parsePropLine(line: string): PropLine | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(";");
  const namePart = parts[0] ?? "";
  // group.NAME or NAME
  const name = (namePart.includes(".") ? namePart.split(".").pop()! : namePart).toUpperCase();
  return { name, params: parts.slice(1), value };
}

function nameFromN(nValue: string): string {
  // N: Family;Given;Additional;Prefix;Suffix
  const parts = nValue.split(";").map((p) => p.trim());
  const [family = "", given = "", additional = "", prefix = "", suffix = ""] =
    parts;
  return [prefix, given, additional, family, suffix]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Join ADR components into a single readable line/multiline string. */
export function formatAdr(adrValue: string): string {
  // ADR: PO Box; Extended; Street; Locality; Region; Postal; Country
  const parts = adrValue.split(";").map((p) => p.replace(/\n/g, " ").trim());
  const [, , street, locality, region, postal, country] = parts;
  const cityLine = [locality, region, postal].filter(Boolean).join(", ");
  return [street, cityLine, country].filter(Boolean).join("\n");
}

function parseOneCard(cardText: string): ImportedContact | null {
  let fn = "";
  let n = "";
  let phone = "";
  let email = "";
  let address = "";
  let notes = "";

  for (const line of cardText.split("\n")) {
    const prop = parsePropLine(line);
    if (!prop) continue;
    const value = decodeValue(prop.value, prop.params);
    if (!value) continue;

    switch (prop.name) {
      case "FN":
        if (!fn) fn = value;
        break;
      case "N":
        if (!n) n = value;
        break;
      case "TEL":
        if (!phone) phone = value.replace(/^tel:/i, "").trim();
        break;
      case "EMAIL":
        if (!email) email = value;
        break;
      case "ADR":
        if (!address) address = formatAdr(value);
        break;
      case "NOTE":
        if (!notes) notes = value;
        break;
      default:
        break;
    }
  }

  const name = (fn || nameFromN(n)).trim();
  if (!name) return null;

  return {
    name,
    phone: phone.trim(),
    email: email.trim(),
    address: address.trim(),
    notes: notes.trim(),
  };
}

/** Parse one or more vCard 2.1/3.0 contacts from .vcf text. */
export function parseVCard(text: string): ImportedContact[] {
  return unfoldAndSplitCards(text)
    .map(parseOneCard)
    .filter((c): c is ImportedContact => c !== null);
}

/**
 * Parse a simple CSV with headers including name (required) and optional
 * phone, email, address, notes. Commas inside quotes are supported.
 */
export function parseContactCsv(text: string): ImportedContact[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const nameIdx = headers.findIndex((h) => h === "name" || h === "full name");
  if (nameIdx < 0) return [];

  const phoneIdx = headers.findIndex(
    (h) => h === "phone" || h === "tel" || h === "mobile",
  );
  const emailIdx = headers.findIndex((h) => h === "email" || h === "e-mail");
  const addressIdx = headers.findIndex(
    (h) => h === "address" || h === "adr" || h === "street",
  );
  const notesIdx = headers.findIndex((h) => h === "notes" || h === "note");

  const out: ImportedContact[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    const name = (cols[nameIdx] ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      phone: phoneIdx >= 0 ? (cols[phoneIdx] ?? "").trim() : "",
      email: emailIdx >= 0 ? (cols[emailIdx] ?? "").trim() : "",
      address: addressIdx >= 0 ? (cols[addressIdx] ?? "").trim() : "",
      notes: notesIdx >= 0 ? (cols[notesIdx] ?? "").trim() : "",
    });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export type FileImportResult = {
  contacts: ImportedContact[];
  kind: "vcf" | "csv" | "unknown";
};

/** Detect .vcf vs CSV from filename/mime and parse. */
export function parseContactImportFile(
  text: string,
  fileName: string,
  mime?: string,
): FileImportResult {
  const lower = fileName.toLowerCase();
  const mimeLower = (mime ?? "").toLowerCase();
  const looksVcf =
    lower.endsWith(".vcf") ||
    mimeLower.includes("vcard") ||
    /^\s*BEGIN:VCARD/im.test(text);
  const looksCsv =
    lower.endsWith(".csv") ||
    mimeLower.includes("csv") ||
    mimeLower === "text/comma-separated-values";

  if (looksVcf) {
    return { contacts: parseVCard(text), kind: "vcf" };
  }
  if (looksCsv) {
    return { contacts: parseContactCsv(text), kind: "csv" };
  }
  // Fallback: try vCard first, then CSV
  const vcards = parseVCard(text);
  if (vcards.length) return { contacts: vcards, kind: "vcf" };
  const csv = parseContactCsv(text);
  if (csv.length) return { contacts: csv, kind: "csv" };
  return { contacts: [], kind: "unknown" };
}

/** Digits only, ignoring a leading US country code: "+1 (555) 123-4567" → "5551234567". */
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Exact-duplicate key for imports (same name and same phone number, ignoring
 * formatting). Matching contacts are skipped, never merged.
 */
export function contactDedupeKey(c: { name: string; phone: string }) {
  return normalizeName(c.name) + "|" + normalizePhone(c.phone);
}

/**
 * Existing contacts that may be the same person: same phone number, same
 * email, or same name. For review only — never merged automatically.
 */
export function findPossibleDuplicates<
  T extends { name: string; phone: string; email: string },
>(candidate: { name: string; phone: string; email: string }, existing: T[]) {
  const name = normalizeName(candidate.name);
  const phone = normalizePhone(candidate.phone);
  const email = candidate.email.trim().toLowerCase();
  return existing.filter(
    (c) =>
      (name && normalizeName(c.name) === name) ||
      (phone.length >= 7 && normalizePhone(c.phone) === phone) ||
      (email && c.email.trim().toLowerCase() === email),
  );
}
