# Job Snap — Developer Deliverables

Date: 2026-10-30 · Covers the five handoff phases. Full detail and evidence: [`AUDIT.md`](./AUDIT.md).

This document answers the handoff's section 16 ("Developer deliverables") item by item.

---

## 1. Current application architecture

- **Next.js 16 + React 19, all screens rendered in the browser.** The server only delivers the app shell; there is no backend database, account or sync.
- **Data is stored in the browser's IndexedDB** (database `sitefold`) on each device: contacts, jobs, time entries, photos (original files) and day notes. Settings live in `localStorage`. A **full backup** is a ZIP holding `backup.json` plus every photo, and restore replaces everything in one all-or-nothing transaction.
- **Offline:** a service worker caches the app's pages, scripts and route data, so the app opens and works without signal after one online visit. Data is always local.
- **Hosting:** a Hostinger Node.js app.

What this means in practice:
- Each device and browser has **its own separate data**.
- Clearing website data, or deleting the home-screen app, erases it. **A downloaded full backup is the only other copy.**
- The app asks the browser to protect its storage, and the Export page shows whether it is protected.

## 2. Confirmed problems vs. recommended enhancements

**Confirmed defects** (each reproduced, fixed, and covered by a test that failed on the old code):

| # | Problem | Status |
|---|---|---|
| D1 | Notes stuck on "Loading Job Snap…" (blank page, no menu) until all scripts loaded | Fixed |
| D2 | Job notes / today's note lost if the app was closed before tapping out of the box | Fixed |
| D3 | Hours silently cut short (ten 59-second entries = 0.00 h) | Fixed |
| D4 | Editing a time entry silently changed its stored seconds | Fixed |
| D5 | Two timers could run at once (two tabs) | Fixed |
| D6 | Storage errors showed endless "Loading…" or "No contacts yet" | Fixed |
| D7 | Failed photo saves gave no message | Fixed |
| D8 | "Backup saved" shown when the download had only started | Fixed |
| D9 | Downloads could fail on iOS Safari | Fixed in code; **needs iPhone check** |
| D10 | Large backups could run a phone out of memory | Improved; **needs iPhone check** |
| D11 | Weak duplicate-contact detection | Fixed (review step, never merges) |
| D12 | Deletes could leave partial data | Fixed |
| D13 | Slow signal: pages waited indefinitely | Fixed (4-second fallback to cached copy) |
| D14 | Pinch-zoom disabled | Fixed |
| D15 | Code-quality errors | Fixed (lint: 0 errors, 0 warnings) |
| D16 | Job and contact pages didn't open offline; navigating between screens offline failed (found in Phase 5) | Fixed |
| D17 | Error messages shown during a dialog were hidden from screen readers (found in Phase 5) | Fixed |

**Enhancements delivered** (from the handoff, not defects): dashboard; five-tab menu; five job statuses; job workspace; manual time entries; daily, weekly and job totals; photo categories; notes search and dated notes; contact import review; invoice-only rounding; photo ZIP in customer/job folders; in-app messages instead of pop-ups; larger touch targets. Details are in §4.

## 3. Prioritised implementation plan (as carried out)

1. **Audit and protection:** document the architecture, reproduce defects, verify backup. → `AUDIT.md` §1–7
2. **Functional repairs:** D1–D15. → §8
3. **Workflow:** dashboard, navigation, statuses, job workspace, time, contacts, notes, exports. → §9
4. **Mobile and visual:** in-app feedback, touch targets, design tokens, clean lint. → §10
5. **Validation:** the required scenario, edge conditions, this document. → §5–8 below

## 4. Completed changes

- **Reliability:** see the table in §2.
- **Home dashboard:** today's and this week's hours, clock status with the running job and Clock in/out, six quick actions (Add job, Add contact, Import contacts, Add note, Add photo, Clock in/out), recent jobs with one-tap Clock in / Switch, job counts by status, and first-run steps.
- **Navigation:** Home · Contacts · Jobs · Time · More (Notes, Reports & exports, Backup & restore, Settings). The active tab is highlighted, and the wording consistently says "clock in/out" and "time entry".
- **Jobs:** five statuses (Scheduled, In Progress, On Hold, Completed, Paid), changeable from any job list or job page. Jobs saved as "open"/"closed" display as In Progress/Completed and are **not rewritten** until changed.
  - Each job has Overview / Time / Photos / Notes / History sections, plus a job address, scheduled date, description and important instructions.
  - History records status changes, edits and time-entry changes.
- **Time:** one timer at a time (enforced across tabs); switching jobs; manual entries for missed punches (overlaps refused); edit and delete with history; exact totals; a Time page with daily, weekly and per-job totals and a weekly CSV.
- **Contacts:** `.vcf`/CSV import with a review step. Exact duplicates are skipped; possible duplicates are shown for a decision and never merged. Also: iPhone export instructions, search (including phone digits), edit, call / email / directions.
- **Photos:** camera or library; Before / During / After / Other; captions; full-screen viewer; originals stored unmodified.
- **Notes:** autosaving day notes and job notes, dated job notes, and search across all of them.
- **Exports:**
  - The CSV gains Entry Type and Entry Note columns at the end; existing columns are unchanged.
  - Print/PDF is unchanged.
  - The photo ZIP is organised as `photos/Customer/Job/…`.
  - Invoice PDF amounts equal hours shown × rate, with optional per-entry rounding for invoices only; the PDF states the rule and the exact recorded hours.
- **Backup:** honest wording, last-download date, "back up current data first" in the restore dialog, lower memory use, and the backup now includes settings and photo categories.
- **Mobile:** 40–48 px touch targets, no iPhone input zoom, no sideways scrolling at 320 px, pinch-zoom allowed, and in-app messages and confirmations instead of browser pop-ups.

## 5. Features verified to work

All of the following are verified by automated browser tests that run against a production build:

- Creating contacts (manual and imported); import review; duplicate warning
- Creating jobs (with and without clocking in), editing details, status changes and their history
- Clock in / out / switch / reopen; one timer at a time; manual entries; overlap refusal; edit and delete
- Totals: exact minutes, daily / weekly / per-job; Time page
- Photos: several at once, categories, captions, viewer
- Notes: job notes, dated notes, today's note; autosave without leaving the field
- Everything persisting after closing and reopening
- CSV, photo ZIP (folders checked), invoice PDF (rounding checked), print view
- Full backup → restore, including a restore into a **separate browser profile**, with photos byte-identical
- Offline use after one visit
- Error handling: storage failure, storage full during a photo save, damaged backup file, wrong import file

## 6. Test results

**20 of 20 automated tests pass** (headless Chromium at phone size; repeated runs stable). Lint and type checks are clean.

| Suite | Covers |
|---|---|
| `e2e/smoke.spec.ts` | The handoff's **required 15-step scenario** end to end |
| `e2e/reliability.spec.ts` (13 tests) | One test per defect; legacy statuses; invoice rounding; backup fidelity; in-app delete confirmation; 40 px touch targets on 11 screens |
| `e2e/conditions.spec.ts` (6 tests) | 320 px screens on 14 views; slow 3G; offline; interrupted photo save; damaged backup; bad import file |

Measured on slow 3G, first visit with nothing cached: the menu and header appear at **0.5 s**, and the Notes page is usable at **5.9 s**. Previously the screen stayed blank for that whole wait.

Run them with `npm run build && npm run test:e2e`.

## 7. Production data

**No production data was accessed, modified or migrated.** Job Snap's records exist only on users' own devices; neither the repository nor the server holds any. All testing used temporary browser profiles with sample data. Every change is backward compatible:
- New fields are optional, and no data conversion runs.
- Old status values stay stored as they are until the user changes them (verified by a test).
- Older backups restore unchanged, and the restore keeps every status value.

## 8. Unresolved issues and limitations

- **Not tested on real devices.** The test environment has Chromium only, no WebKit and no iPhone. The checklist below covers what must be checked by hand, including D9 (iOS downloads) and D10 (large backups).
- **The live site wasn't reachable** from the test environment, so testing used local production builds of this code.
- **No syncing between devices.** Moving data means a backup on one device and a restore on the other, and the restore replaces everything.
- **Safari may clear data** for a site not used for about 7 days in a regular tab. Using the installed home-screen app plus regular backups is the protection.
- **Photo ZIP and backup size:** archives over 4 GB are refused with a clear message.
- **Single light theme;** no dark mode.

### Real-device checklist (iPhone Safari and the home-screen app; then desktop Safari)

1. Add Job Snap to the Home Screen and open it from there.
2. Import a `.vcf` exported from the Contacts app (Share Contact → Save to Files).
3. Create a job, clock in, **lock the phone for a minute**, unlock, and check the timer is still running; then clock out.
4. Type a job note and **immediately swipe the app away**; reopen and confirm the note is there.
5. Take two photos with the camera and one from the library; check categories and the full-screen view.
6. Export → **CSV**, **ZIP + photos**, **invoice PDF**: each should offer to save, and the files should open in Files.
7. Export → **Download backup**; confirm the file is in Files → Downloads. Repeat with 50+ photos to check memory (D10).
8. Restore that backup on a second device or browser and compare the data.
9. Turn on Airplane Mode and open the app, a job and the Time page; clock in and out.
10. Check that nothing needs zooming or sideways scrolling, and that buttons are easy to tap with a thumb.

## 9. Recommendations for future improvements

1. **Do the real-device checklist above before the next deploy.** It is the main open risk.
2. **Automatic backup reminders**, for example "Last backup 9 days ago", shown on the dashboard.
3. **Optional cloud backup or sync,** if more than one device will be used. This would be the first server component, so it needs a decision on accounts and privacy.
4. **Photo storage management:** show storage used per job and offer exporting then removing old photos (with confirmation) when space runs low.
5. **Continuous integration:** run `npm run lint`, the build and the test suite on every pull request (GitHub Actions); the suite takes about a minute.
6. **Dark mode** for early-morning and evening use.
