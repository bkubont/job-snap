# Job Snap

Personal time-clock app: **phone contacts as folders**, jobs inside each contact, punch in and out, site photos, daily notes, and CSV/print export.

All data stays on your device (IndexedDB). No account required.

## Run locally

```bash
npm install
npm run dev -- --port 3456
```

Open [http://localhost:3456](http://localhost:3456).

## Features

- **Contacts from your phone** — Contact Picker API (Chrome/Edge on Android). Manual add works everywhere.
- **Jobs per contact** — open/close jobs; punch history lives on the job.
- **Punch clock** — one open punch at a time; sticky bar to punch out from anywhere.
- **Photos** — camera or library; stored with the job.
- **Day notes** — notebook for the day; included in exports.
- **Export** — CSV download or Print/PDF for a date range (punches + notes).

## Notes

- Phone contact import works best in Chrome or Edge on Android, over HTTPS or localhost.
- Photos and punches never leave your browser unless you export.
