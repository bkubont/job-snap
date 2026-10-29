import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { DM_Sans, Fraunces } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Snap — contacts, jobs, time clock",
  description:
    "Turn phone contacts into job folders. Punch in and out, take photos, write daily notes, and export your time clock.",
  appleWebApp: {
    capable: true,
    title: "Job Snap",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2a4036",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Suspense
          fallback={
            <div className="flex min-h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Loading Job Snap…
            </div>
          }
        >
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
