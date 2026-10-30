import Link from "next/link";
import {
  ChevronRight,
  Download,
  HardDriveDownload,
  NotebookPen,
  Settings,
} from "lucide-react";

const items = [
  {
    href: "/notes",
    icon: NotebookPen,
    title: "Notes",
    body: "Day notes and every job's notes, searchable.",
  },
  {
    href: "/export",
    icon: Download,
    title: "Reports & exports",
    body: "Timecard CSV, print/PDF, photo ZIP, invoice PDF.",
  },
  {
    href: "/export#full-backup",
    icon: HardDriveDownload,
    title: "Backup & restore",
    body: "Save everything on this device to a file, or restore one.",
  },
  {
    href: "/settings",
    icon: Settings,
    title: "Settings",
    body: "Invoice rounding and week start.",
  },
];

export default function MorePage() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">
        More
      </h1>
      <ul className="space-y-2">
        {items.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 shadow-sm ring-1 ring-hairline transition hover:bg-white"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.93_0.02_95)] text-[oklch(0.35_0.05_155)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">{body}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-1 text-xs text-muted-foreground">
        Job Snap keeps your data on this device only. Make a full backup
        regularly — it&apos;s the only copy if this phone is lost or the
        browser&apos;s data is cleared.
      </p>
    </div>
  );
}
