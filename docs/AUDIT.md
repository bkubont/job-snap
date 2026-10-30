# Job Snap — Phase 1 Audit

Date: 2026-10-30 · Branch: `claude/job-snap-audit-improvements-rhch83` · Baseline commit: `9fce297`

This is the Phase 1 report the handoff asks for. Phase 1 changed no application code; **Phase 2 repairs are recorded in [§8](#8-phase-2-status-functional-repairs)**. Every finding marked *Confirmed* was reproduced against a local production build (`npm run build && npm run start`) with scripted headless Chromium. Each test ran in a throwaway browser profile.

---

## 1. Current architecture

| Area | What it is |
|---|---|
| Framework | Next.js 16.4 (App Router, `cacheComponents` + `partialPrefetching`), React 19.3, Tailwind 4, shadcn/Radix UI |
| Rendering | Every page is a client component (`"use client"`). The server only serves the shell. |
| Data storage | **IndexedDB in the browser**, database `sitefold`, version 1, accessed via `idb` (`src/lib/db.ts`). Stores: `contacts`, `jobs`, `punches`, `photos` (original image `Blob`s), `dayNotes`. |
| Server data | **None.** There is no backend database, account, or sync. `/api/download-source` (serves a source ZIP if one is present) is the only API route. |
| State refresh | Module-level version counter (`src/hooks/use-sitefold.ts`); any write calls `refreshSitefold()` and hooks re-query IndexedDB. |
| Exports | Built in the browser (`src/lib/export.ts`): CSV, uncompressed ZIP (own ZIP writer), print stylesheet, invoice PDF via `jspdf` (`src/lib/invoice.ts`). |
| Backup/restore | `src/lib/backup.ts`: ZIP of `backup.json` + every photo blob. Restore wipes all five stores and rewrites them in a single IndexedDB transaction. |
| Offline | `public/sw.js` caches the app shell (network-first for pages, cache-first for static assets). It never touches IndexedDB. |
| Hosting | Hostinger Node.js app (`.hostinger/site.json`). |
| Tests | One Playwright smoke test (`e2e/smoke.spec.ts`). It passes at baseline. |

### Data model (as stored)

- `Contact { id, name, phone, email, address, notes, hourlyRate?, createdAt }`
- `Job { id, contactId, title, status: "open" | "closed", notes, createdAt }`
- `Punch { id, jobId, punchedInAt, punchedOutAt | null }` (ISO timestamps, millisecond precision)
- `Photo { id, jobId, blob, caption, createdAt }`
- `DayNote { id, date (YYYY-MM-DD, unique), body, updatedAt }`

### Storage limitations to be aware of

1. **Data lives only in the browser where it was entered.** The iPhone home-screen app, iPhone Safari, and a desktop browser each have **separate, unconnected data**. Moving data between them is manual: full backup on one, restore on the other, which **replaces** everything on the target.
2. **Clearing website data (or uninstalling the home-screen app) deletes every record.** Only a downloaded full backup survives that.
3. **Safari can evict storage.** In a regular Safari tab, Safari may delete a site's storage after about 7 days without a visit. The app never calls `navigator.storage.persist()` and never checks free space (`navigator.storage.estimate()`), so this risk is unmanaged. The installed home-screen app is less exposed.
4. The "last backup" date is stored in `localStorage` per browser. It records that a download **was started**, not that a file was saved.

---

## 2. Confirmed problems (defects)

Severity: **High** means data loss, wrong hours, or a blocked workflow. **Medium** means misleading or fragile behaviour. **Low** means polish.

| # | Sev | Problem | Evidence |
|---|---|---|---|
| D1 | **High** | **Notes page shows a blank "Loading Job Snap…" screen (no header, no nav) until every script has downloaded.** The page reads today's date during server prerender (`useState(todayKey)` in `src/app/notes/page.tsx`). Under Cache Components that aborts the prerender, and the root `<Suspense>` falls back to client-only rendering. On weak cellular, or if a script fails to load, it looks permanently stuck. **This is the most likely cause of the reported Notes loading issue.** | Prerendered `notes.html` contains only the fallback, plus `$RX(... "Switched to client rendering because the server render was aborted")`. With scripts delayed 4 s, the screen stayed on "Loading Job Snap…" for 4.4 s. When the date read was replaced with a constant, the full Notes page prerendered. `/export` also shows only the fallback when JS is slow or disabled. |
| D2 | **High** | **Job notes and the job page's "Today's note" are lost** if the app is closed, reloaded, or backgrounded before the text box loses focus. They save only on `blur`, with no autosave. | Typed into each box, waited 3 s, reloaded: both came back empty. (The Notes tab itself autosaves after 600 ms and survived navigation.) |
| D3 | **High** | **Hours are silently truncated.** Each punch is floored to whole minutes (`differenceInMinutes`) *before* summing, so short punches count as zero and every punch loses up to 59 s. | Ten 59-second punches (9 min 50 s of real time) show **Total hours 0.00** and **Closed total 0m**. The same per-punch flooring feeds CSV, print, and invoice totals. |
| D4 | **High** | **Editing a punch rewrites its original timestamps.** The edit dialog uses minute-precision `datetime-local` inputs, so saving (even with no change) drops the seconds from both the in and out times. | Punch 08:00:00 → 09:00:45 became 08:00:00 → 09:00:00 after opening Edit and pressing Save. |
| D5 | **High** | **Two timers can run at once.** The "one open punch" check and the write are separate IndexedDB operations, not one transaction. Two tabs (for example the home-screen app plus a Safari tab) can each start a timer. Afterwards the app shows only one; the other keeps running unseen. | Two pages tapped Punch in on different jobs at the same moment. Result: **2 open punches**, reproduced 3 out of 3 times. |
| D6 | **High** | **Storage errors are swallowed.** None of the data hooks handle errors. If IndexedDB fails (private mode, storage full, corruption), job and contact pages show "Loading…" forever. **The home screen shows "No contacts yet"**, which could lead a user to believe data is gone, or to re-import over it. | Simulated an `indexedDB.open` failure: `/jobs/*` and `/contacts/*` stayed on "Loading…"; `/` showed the empty-state onboarding; no error was shown anywhere. |
| D7 | Medium | **Photo save failures are silent.** `saveWithCaption` has `try/finally` but no `catch`. A quota error mid-batch leaves some photos saved and some not, with no message. | Code: `src/components/photo-gallery.tsx` (`saveWithCaption`). |
| D8 | Medium | **"Backup saved" is shown when a download was only started.** On iPhone the user can cancel the save sheet, yet the message appears and the last-backup date is recorded anyway. A **restore** also marks a backup as done, which hides the reminder even though no backup of the restored data exists. | Code: `downloadFullBackup` → `markBackupCompleted()`; `restoreFullBackup` → `markBackupCompleted()`. |
| D9 | Medium | **Downloads may fail on iOS Safari.** `downloadBlob` revokes the object URL immediately after `a.click()`. Safari can need the URL for a moment longer. | Code: `src/lib/export.ts`. This is a known Safari pattern; not reproducible here without a real iPhone. |
| D10 | Medium | **Large backups can crash a phone browser.** The ZIP writer holds every photo in memory and then copies the whole archive again (`concatBytes`, then a second copy). With hundreds of full-resolution photos this can exceed iOS memory limits. There is also no ZIP64 support (4 GB cap). | Code: `buildZipBlob`. Not stress-tested. |
| D11 | Medium | **No duplicate check when creating a contact manually**, and import de-duplication uses an exact `name\|phone` match. "(555) 123-4567" and "555-123-4567" count as different people. | Code: `contactDedupeKey` in `src/lib/vcard.ts`; `onCreateManual` on the home page. |
| D12 | Medium | **Deletes are not atomic.** `deleteContact` and `deleteJob` remove punches, photos, and jobs one at a time outside a transaction, so a failure part-way leaves orphaned records. | Code: `src/lib/db.ts`. |
| D13 | Low | **Offline pages hang on slow networks.** Page navigations are network-first with no timeout, so a weak signal waits indefinitely before falling back to the cached copy. Job and contact pages work offline only if that exact URL was opened before. | Code: `public/sw.js`. |
| D14 | Low | **Pinch-zoom is disabled** (`maximumScale: 1`), which works against "readable without zooming" for users who need zoom. | `src/app/layout.tsx`. |
| D15 | Low | **Lint fails** with 7 `react-hooks/set-state-in-effect` errors. The app behaves correctly; this is a code-health issue. | `npm run lint`. |

---

## 3. Verified working

Covered by the existing Playwright smoke test (passes at baseline) and by my probes:

- Creating a contact manually; creating a job and punching in; Continue on the home screen; Switch between jobs; Reopen a closed job and punch in
- Punch out from the job page and from the sticky bar
- Editing and deleting punches (apart from the precision issue in D4); validation that out is after in and that only one punch is left open
- Today's note on the job page (when focus leaves the box) and Notes tab autosave, including when navigating away
- CSV export; ZIP export with photos (files named by date, customer, and job); invoice PDF when a rate is set
- **Full backup → restore round trip** (in an isolated test profile)
- Restore is all-or-nothing: one IndexedDB transaction, and it shows a "replace all data" confirmation first
- Photos are stored as the **original file** (no recompression), captions work, and the full-screen viewer works
- `.vcf` and CSV import with exact-match duplicate skipping; contact search; contact editing; directions link

Not verified in this environment (see §7): iPhone Safari, the installed home-screen app, desktop Safari, and the live Hostinger site.

---

## 4. Gaps compared with the handoff (enhancements, not defects)

| Handoff item | Current state |
|---|---|
| Dashboard (today's hours, quick actions, job summary) | The home screen is a contact list with a "Continue" section. There are no daily totals, no status summary, and no quick-action grid. |
| Navigation: Home / Contacts / Jobs / Time / Export | Three tabs: Contacts (also serves as home), Notes, Export. There is no list of all jobs and no Time view. |
| Job statuses: Scheduled, In Progress, On Hold, Completed, Paid | Only `open` and `closed`. |
| Job overview fields: address, phone, scheduled date, description | Phone and address live on the contact only. There is no per-job address, scheduled date, or description field (job notes act as a description). |
| Manual time entry / missed punch | **Not possible.** The only way to record time is to punch in and then edit the times. |
| Daily, weekly, and per-job totals | Per-job only (and affected by D3). Daily totals appear only in the export preview. |
| Photo categories (Before / During / After / Other) | Not supported; one caption is applied to a whole batch. |
| Notes: job vs general, search, dated activity notes | One job-notes text field per job; general notes are one note per calendar day. No search, no per-entry timestamps, no delete. |
| Job history (created, status changes) | Not recorded. |
| Import progress, duplicate review | Results appear in an `alert()`; duplicates are skipped silently with no review step. |
| Photo ZIP organised by customer/job folders | Flat `photos/` folder, with customer and job in each file name. |
| Errors and success messages | Browser `alert()` everywhere; no inline error or retry states (D6). |

---

## 5. Proposed implementation plan (prioritised)

Each phase is a separate, reviewable commit series on this branch. **All changes keep existing records readable as they are. No stored data is rewritten.**

### Phase 2 — Functional repairs (recommended first)
1. **D1** Notes/Export prerender: read today's date after mount, so the header, nav, and page layout render immediately.
2. **D2** Debounced autosave for job notes and Today's note, plus a save on `visibilitychange`/`pagehide`, with a "Saving… / Saved / Couldn't save — Retry" indicator.
3. **D3** Sum durations in seconds and round only for display. Leave stored timestamps untouched.
4. **D4** Keep the original seconds when a time field is unchanged; only rewrite the field the user actually edited.
5. **D5** Run "check no open punch, then insert" inside one `readwrite` transaction. If two open punches already exist, show both on the home screen with a "fix" prompt.
6. **D6/D7** Add error states to the data hooks: a clear message, a **Retry** button, and **never** the "No contacts yet" empty state when the read failed. Catch and report photo save failures, saying which photos were and weren't saved.
7. **D8/D9** Delay the URL revoke; change the wording to "Backup download started — check it saved to Files"; stop marking a backup on restore.
8. Call `navigator.storage.persist()` and show storage usage on the Export/Settings page.
9. **D12** Make the delete cascade a single transaction.

### Phase 3 — Workflow
Dashboard (today's hours, clock status, quick actions, recent jobs, status counts) · bottom nav Home / Contacts / Jobs / Time / More · manual time entry and missed-punch correction · daily, weekly, and per-job totals · five job statuses with an inline status picker · optional per-job address, scheduled date, and description · job history log · photo categories and per-photo captions · separate job notes and general notes, with search and confirm-before-delete · contact duplicate review using normalised phone and email matching (review only, never automatic merge) · inline import results.

### Phase 4 — Mobile and visual
Design tokens (type scale, spacing, 44 px minimum tap targets), consistent primary and secondary buttons, restrained status colours, re-enable pinch-zoom, replace `alert()` with toasts and inline messages, and clearer separation of Reports and Backup on the Export page.

### Phase 5 — Validation
Expand the Playwright suite to run the handoff's 15-step scenario (two jobs, manual entry, photos, status change, reload persistence, CSV/ZIP/backup/restore in an isolated profile) at iPhone viewport size. Then a manual pass on a real iPhone (Safari and the home-screen app) before deploying.

---

## 6. Decisions needed before Phase 3

1. **How to map the existing `open`/`closed` statuses** to the five new ones. Proposal: read `open` as **In Progress** and `closed` as **Completed**, translated when records are read, so nothing stored is rewritten. Existing jobs can then be changed individually.
2. **Rounding for invoices.** The default proposal is no rounding (exact minutes). An optional setting, such as nearest 15 minutes for invoices only, would keep the raw timestamps.
3. **Cross-device sync** is out of scope under "avoid major architectural changes". Please confirm that single-device storage with manual backup is acceptable, or say if a server or sync option should be scoped separately.

---

## 7. Production data and limitations of this audit

- **Production data was not touched.** Job Snap's records live only in each user's own browser (IndexedDB on their phone or computer). Neither this repository nor the Hostinger server stores any user records, and nothing was deployed. All testing used temporary browser profiles with sample data.
- **The live site could not be reached** from this environment (the network policy blocks the host), so the audit is based on the source code at `9fce297`. If the deployed build differs from `main`, findings may differ.
- **No real iPhone or Safari testing was possible.** Mobile behaviour was checked at phone viewport sizes in Chromium only. D9 and D10 are code-level risks that need a real device to confirm.
- Running the Playwright suite in this container needs the preinstalled browser path (`launchOptions.executablePath`). The repo config itself is unchanged.

---

## 8. Phase 2 status (functional repairs)

Every defect below was re-tested after the fix. `e2e/reliability.spec.ts` has a regression test for each one. **All 8 of those tests fail on the original code and pass now.** The existing smoke test still passes (10 of 10 tests pass in total).

| # | Status | What changed |
|---|---|---|
| D1 | **Fixed** | Today's date is read only in the browser (`useToday`), so Notes pre-builds in full. The app-wide `<Suspense>` moved from around the whole app to around page content, with a separate boundary for the bottom nav. The header and nav are now in the first HTML on every page. Export's body still streams in after its scripts load because of its size, but the header and nav appear immediately. |
| D2 | **Fixed** | Job notes and Today's note autosave 600 ms after typing stops, and save immediately when the page is hidden or closed, or when you navigate away (`useAutosave`). Each shows Saving… / Saved / "Not saved · Retry". Job notes are written with `updateJobFields`, which reads the latest copy of the job and writes it in one transaction, so a note can't overwrite a title or status changed elsewhere. |
| D3 | **Fixed** | `durationMinutes` returns exact fractional minutes. Totals sum exact values and round only for display. Ten 59-second punches now show 0.16 h / 10m, where they used to show 0.00 / 0m. |
| D4 | **Fixed** | A time field left unchanged keeps its original timestamp, seconds included. Only the field the user edited is rewritten. |
| D5 | **Fixed** | `punchIn`, `switchPunchToJob` and `updatePunch` each check and write in **one** IndexedDB transaction, which the browser runs one at a time (across tabs too). If two timers are ever found running, from before this fix or from an old backup, the timer bar names them and links to each. |
| D6 | **Fixed** | The data hooks record errors. Home, contact, job, Notes and Export show "Couldn't load … This doesn't mean anything was deleted", with **Try again**. A failed database open is no longer cached, so Retry works without a reload. Onboarding ("No contacts yet") appears only after a *successful* empty read. |
| D7 | **Fixed** | Photo saves report "Saved X of Y" with the reason (including out-of-storage). The unsaved photos stay in the dialog so Save retries just those. Delete and caption failures are reported too. |
| D8 | **Fixed** | Wording is now "Backup download started … check that the file was saved (on iPhone: Files → Downloads)", and the label reads "Last backup download". A restore no longer counts as a backup. The restore dialog offers **Back up current data first**. |
| D9 | **Fixed** (needs iPhone confirmation) | Download links are revoked after 60 s instead of immediately, and the link is attached to the page before the click. |
| D10 | **Improved** (needs on-device stress test) | The ZIP writer reads one photo at a time for its checksum and then references the original file, so it no longer copies the whole archive twice in memory. Restore reads only the small headers and slices file data from the picked ZIP. Archives over 4 GB fail with a clear message. Generated ZIPs pass Python `zipfile` CRC checks. |
| D11 | **Partly fixed** | Import duplicate detection ignores phone formatting and letter case. Manual contact creation warns about a possible duplicate (same name, phone or email) and asks before creating; nothing is merged. A full duplicate *review* screen is still planned for Phase 3. Double-submit is blocked. |
| D12 | **Fixed** | Deleting a job or contact (with its punches and photos) is one all-or-nothing transaction. Confirmations state how many punches or photos will go. |
| D13 | **Fixed** | Page loads fall back to that page's cached copy after 4 s on a weak signal, while the network request keeps going and refreshes the cache. The cache was renamed to `v2`, which clears old leftovers. |
| D14 | **Fixed** | Pinch-zoom is re-enabled. |
| D15 | Open | Lint is down from 7 errors to 5. The rest are an older pattern in pages scheduled for rework in Phases 3–4; behaviour is unaffected. |
| — | Added | The app asks the browser for persistent storage (`navigator.storage.persist()`) on startup. Export shows storage used and whether data is protected from automatic clearing. |
| — | Fixed | The home header no longer squeezes the title into the buttons on narrow iPhones (found during visual checks). |

**Data compatibility:** no stored record format changed and no data migration runs. Existing contacts, jobs, punches, photos, notes and backups load as before. Older backups restore unchanged, and backups made now restore on the previous version.

**Still needs a real device:** D9 and D10 on iPhone Safari and the home-screen app; whether iOS honours `persist()` (it may only for the home-screen app); and the save-on-close behaviour when swiping the app away on iOS.

---

## 9. Phase 3 status (workflow)

Agreed decisions: existing **open → In Progress** and **closed → Completed**; **exact time by default, with optional rounding for invoices only**.

### Data model (all additions optional; no migration)
- **Five statuses**: Scheduled, In Progress, On Hold, Completed, Paid. Legacy `open`/`closed` values are *translated when read* (`normalizeStatus`) and stay stored exactly as they are until someone changes that job's status. A test checks that browsing every screen leaves legacy records byte-identical.
- **Job fields**: job address (blank = the customer's address), scheduled date, description, important instructions, and `history` (status changes, renames, detail edits, manual/edited/deleted time entries, dated notes). History is written in the same transaction as the change.
- **Time entries**: `source` ("clock" | "manual") and an optional `note`. Manual entries and edits are refused if they overlap another entry (on any job) or end in the future. Clocking in moves a job to In Progress, and that change is logged.
- **Photos**: `category` (Before / During / After / Other). Older photos show as Other. Originals are still stored unmodified.
- **Settings** (per device, included in backups): invoice rounding (off / 5 / 6 / 10 / 15 / 30 min, nearest or up, per entry) and week start (Sunday / Monday).
- **Backups**: carry photo categories and settings. Older backups restore unchanged, and restore keeps every status value.

### Screens
- **Navigation**: Home · Contacts · Jobs · Time · More (Notes, Reports & exports, Backup & restore, Settings), with the active tab highlighted. Wording standardised on "clock in/out" and "time entry".
- **Home (dashboard)**: today's hours and the week's total; clock status with the active job, elapsed time and Clock out; quick actions (Add job, Add contact, Import contacts, Add note, Add photo, Clock in/out); recent jobs with Clock in / Switch (replaces "Continue"); counts per status linking to the filtered Jobs list; and first-run steps when the app is empty.
- **Jobs**: search, status filter chips (default "Not finished"), an inline status picker, hours logged, photo count, scheduled date and last activity.
- **Job workspace**: header with a status picker; important instructions banner; clock card with today / week / all-time totals; sections **Overview** (customer, tap-to-call, job address and directions, schedule, description, edit, delete), **Time** (entries with clock/manual tag, edit, delete, add time), **Photos** (category picker, filter chips, category in the viewer), **Notes** (job notes, dated notes, today's general note) and **History** (timeline). The section is kept in the URL (`?tab=`).
- **Time**: week-by-week timecard with week and today totals, per-job totals, and per-day entries; add time manually; download the week as CSV (replaces Home's "This week CSV").
- **Contacts**: moved to `/contacts`. Search also matches phone digits regardless of formatting. Import now goes through a **review step**: new contacts are ticked, exact duplicates are skipped, and possible duplicates (same name, phone or email) are listed *unticked* next to the matching contact; nothing is merged. Import shows progress and a result, and has iPhone .vcf export instructions. The contact page adds Call and Email buttons, status pickers per job, and the shared New job dialog.
- **Notes**: search across day notes and job notes; a Job notes list linking to each job's Notes section.
- **Exports**: the CSV gains **Entry Type** and **Entry Note** columns *at the end* (earlier columns unchanged), a job status column in the Job notes section, and a photo category column. The photo ZIP is organised as `photos/<Customer>/<Job>/date_Category_caption_nn.ext`. Invoice amounts equal *hours shown × rate*; with rounding on, the PDF states the rule and the exact recorded hours.

### Tests
`e2e/smoke.spec.ts` is now the handoff's **required 15-step scenario**. Restore runs in a *separate browser profile*, and the test then confirms the original profile's records are unchanged. `e2e/reliability.spec.ts` adds two tests: legacy status mapping with no rewrites, and invoice rounding with recorded times preserved. **12 of 12 tests pass on 5 consecutive runs.**

### Still open
- Real-device checks (iPhone Safari and the home-screen app, desktop Safari), including the D9/D10 items from Phase 2.
- Lint: 4 errors remain, all the older set-state-in-effect pattern (contact page, Export, install prompt).
- Phase 4 visual refinement (type scale and spacing tokens, replacing remaining `alert()`s with inline messages and toasts).
