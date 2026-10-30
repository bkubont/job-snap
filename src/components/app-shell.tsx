"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, NotebookPen, Download, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivePunchBar } from "@/components/active-punch-bar";
import { BackupNudge } from "@/components/backup-nudge";
import { InstallPrompt } from "@/components/install-prompt";
import { PwaRegister } from "@/components/pwa-register";

const nav = [
  { href: "/", label: "Contacts", icon: FolderOpen },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/export", label: "Export", icon: Download },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col">
      <PwaRegister />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[oklch(0.72_0.12_75_/0.18)] blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-40 h-80 w-80 rounded-full bg-[oklch(0.45_0.06_155_/0.2)] blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231a2e24' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <header className="sticky top-0 z-30 border-b border-[oklch(0.35_0.03_155_/0.15)] bg-[oklch(0.97_0.01_95_/0.85)] backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[oklch(0.32_0.05_155)] text-[oklch(0.92_0.04_85)] shadow-sm transition-transform group-hover:scale-105">
              <Clock className="h-4.5 w-4.5" strokeWidth={2.25} />
            </span>
            <div className="leading-tight">
              <p className="font-heading text-lg font-semibold tracking-tight text-[oklch(0.28_0.04_155)]">
                Job Snap
              </p>
              <p className="text-[11px] text-muted-foreground">
                Contacts · jobs · clock
              </p>
            </div>
          </Link>
        </div>
        <ActivePunchBar />
        <BackupNudge />
        <InstallPrompt />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-5">
        {/* Boundary around page content only, so the header and nav are
            always in the first HTML even when a large page streams in. */}
        <Suspense
          fallback={
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          }
        >
          {children}
        </Suspense>
      </main>

      {/* usePathname() needs a boundary on dynamic routes; the fallback is
          the same nav without the active highlight. */}
      <Suspense fallback={<BottomNav pathname={null} />}>
        <CurrentBottomNav />
      </Suspense>
    </div>
  );
}

function CurrentBottomNav() {
  return <BottomNav pathname={usePathname()} />;
}

function BottomNav({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[oklch(0.35_0.03_155_/0.15)] bg-[oklch(0.98_0.008_95_/0.92)] backdrop-blur-md">
      <div className="mx-auto grid max-w-lg grid-cols-3 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            pathname !== null &&
            (href === "/"
              ? pathname === "/" ||
                pathname.startsWith("/contacts") ||
                pathname.startsWith("/jobs")
              : pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors",
                active
                  ? "text-[oklch(0.32_0.05_155)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform",
                  active && "scale-110",
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
