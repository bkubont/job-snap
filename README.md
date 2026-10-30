# Job Snap

Personal time-clock app: **phone contacts as folders**, jobs inside each contact, punch in and out, site photos with captions, daily notes, invoice-ready export, and full-device backup.

All data stays on your device (IndexedDB). No account required.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3456](http://localhost:3456).

## Features

- **Contacts** — Contact Picker API (Chrome/Edge on Android), **vCard (`.vcf`) import**, or manual add. Search, edit name/phone/email/address, optional **hourly rate**, and **Get directions** from a stored address.
- **Jobs per contact** — open/close jobs; rename titles on the job page; punch history and photos live on the job.
- **Punch clock** — one open punch at a time; Continue on home; Switch / Reopen on job pages; sticky bar to punch out; edit or delete punches.
- **Photos** — camera or library; optional captions; tap for full-screen lightbox; stored with the job and included in export.
- **Day notes** — notebook for the day (Notes tab + Today’s note on the job); included in exports.
- **Export (timecard)** — filter by contact and/or job; CSV, **ZIP + photos**, Print/PDF, or (with a contact selected) **Download invoice PDF**. Invoice groups closed punches by job × rate; contacts without a rate get a hours-only statement. Open punches list as “Still open” and are **excluded from billed hour totals**.
- **Full backup** — separate from the timecard ZIP. Downloads every contact, job, punch, day note, and photo blob; restore replaces all local data. Use the Job Snap download as-is (STORE ZIP).
- **PWA** — installable; service worker caches the shell for offline use of home, notes, and export.

## Timecard ZIP vs Full backup

| | Timecard ZIP | Full backup |
|---|---|---|
| Purpose | Invoice / evidence for a date range | Move or restore this device’s data |
| Scope | Filtered punches, notes, photos | Everything in IndexedDB |
| Restore | No (CSV + image files) | Yes — replaces local data |

## Tests

```bash
npm run build
npm run test:e2e
```

Playwright smoke covers Continue / Switch / Reopen, Today’s note, punch edit, export ZIP, invoice PDF download (with rate), and backup round-trip. `e2e/reliability.spec.ts` adds regression tests for exact hour totals, punch-edit precision, simultaneous punch-ins, notes autosave without blur, storage-failure screens, server-rendered Notes, and a byte-exact photo backup/restore (see `docs/AUDIT.md`). There is no GitHub Actions workflow in this repo yet — run e2e locally (or in CI after adding a workflow).

## Notes

- Phone contact import works best in Chrome or Edge on Android, over HTTPS or localhost.
- vCard import accepts multi-contact `.vcf` files and skips duplicates.
- Photos and punches never leave your browser unless you export or download a backup.
