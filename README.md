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

- **Home dashboard** — today's and this week's hours, clock status, quick actions, recent jobs, jobs by status.
- **Contacts** — vCard (`.vcf`) / CSV import with a review step (new, exact duplicates skipped, possible duplicates for you to decide — never auto-merged), Contact Picker on Android, manual add, search, edit, hourly rate, call / email / directions.
- **Jobs** — many per customer; statuses Scheduled · In Progress · On Hold · Completed · Paid (changeable inline); job address, scheduled date, description, important instructions; history of changes.
- **Time** — clock in/out (one timer at a time, enforced across tabs), switch jobs, manual entries for missed punches (no overlaps), edit/delete with history, daily / weekly / per-job totals.
- **Photos** — camera or library, Before / During / After / Other, captions, full-screen viewer; originals kept as-is.
- **Notes** — day notes, job notes, dated job notes; searchable.
- **Export** — timecard CSV (filter by dates, customer, job), print / PDF, ZIP with photos in customer/job folders, invoice PDF (optional per-entry rounding for invoices only — recorded time is never changed).
- **Full backup / restore** — everything on the device, including settings.
- **PWA** — installable; works offline after first visit.

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
