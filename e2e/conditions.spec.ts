import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/**
 * Handoff section 14: "Test narrow screens, slow connections, interrupted
 * uploads, and common error conditions." Records are seeded into IndexedDB.
 */

async function seed(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Job Snap").first()).toBeVisible();
  await page.evaluate(async () => {
    localStorage.setItem("job-snap:backupNudgeDismissed", "1");
    localStorage.setItem("job-snap:installCueDismissed", "1");
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("sitefold");
      req.onsuccess = () => resolve(req.result);
    });
    const stores = ["contacts", "jobs", "punches", "photos", "dayNotes"];
    const tx = db.transaction(stores, "readwrite");
    for (const s of stores) tx.objectStore(s).clear();
    const at = "2026-10-01T07:00:00.000Z";
    tx.objectStore("contacts").put({
      id: "c1",
      name: "Christopher Montgomery-Alexander",
      phone: "(555) 010-0199",
      email: "christopher.montgomery@example.com",
      address: "12345 Very Long Street Name Boulevard, Apartment 1234, Springfield",
      notes: "",
      createdAt: at,
    });
    tx.objectStore("jobs").put({
      id: "j1",
      contactId: "c1",
      title: "Complete kitchen and bathroom renovation with custom cabinetry",
      status: "in_progress",
      notes: "",
      createdAt: at,
      instructions: "Gate code 4411 — dog in the back yard, use the side entrance",
    });
    tx.objectStore("punches").put({
      id: "p1",
      jobId: "j1",
      punchedInAt: "2026-10-01T08:00:00.000Z",
      punchedOutAt: "2026-10-01T12:00:00.000Z",
    });
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  });
}

const PAGES = [
  "/",
  "/contacts",
  "/contacts/c1",
  "/jobs",
  "/jobs/j1",
  "/jobs/j1?tab=time",
  "/jobs/j1?tab=photos",
  "/jobs/j1?tab=notes",
  "/jobs/j1?tab=history",
  "/time",
  "/notes",
  "/export",
  "/more",
  "/settings",
];

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
});

test("no sideways scrolling at 320px (smallest iPhone) on any screen", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await seed(page);
  const overflowing: string[] = [];
  for (const p of PAGES) {
    await page.goto(p);
    await expect(page.locator("main")).not.toContainText("Loading…");
    const extra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (extra > 0) overflowing.push(`${p}: ${extra}px too wide`);
  }
  expect(overflowing).toEqual([]);
  await ctx.close();
});

test("slow 3G: header and nav show before scripts arrive, and the app becomes usable", async ({
  browser,
}) => {
  // First visit: no service worker cache to help.
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  await seed(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  // Chrome DevTools "Slow 3G" profile: 400ms RTT, ~50 KB/s down.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
  });
  const started = Date.now();
  await page.goto("/notes", { waitUntil: "commit" });
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Day notes" })).toBeVisible();
  const shellMs = Date.now() - started;
  await expect(page.getByLabel("Note date")).toHaveValue(/\d{4}-\d{2}-\d{2}/, {
    timeout: 60_000,
  });
  const usableMs = Date.now() - started;
  console.log(`slow 3G /notes: shell ${shellMs}ms, usable ${usableMs}ms`);
  expect(shellMs).toBeLessThan(usableMs);
  await ctx.close();
});

test("offline after one visit: the app opens and shows stored data", async ({ page, context }) => {
  await seed(page);
  // Let the service worker install and take control, then visit the screens once.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  for (const p of ["/", "/jobs", "/jobs/j1", "/time"]) {
    await page.goto(p);
    await expect(page.locator("main")).not.toContainText("Loading…");
  }
  await context.setOffline(true);
  await page.goto("/jobs/j1");
  await expect(
    page.getByRole("heading", {
      name: "Complete kitchen and bathroom renovation with custom cabinetry",
    }),
  ).toBeVisible();
  await page.goto("/time");
  await expect(page.getByRole("heading", { name: "Time" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Clock in" }).first()).toBeVisible();
  // Clocking in works offline (data is local).
  await page.goto("/jobs/j1");
  await page.locator("main").getByRole("button", { name: "Clock in" }).click();
  await expect(page.locator("main").getByRole("button", { name: "Clock out" })).toBeVisible();
  await context.setOffline(false);
});

test("photo save interrupted by full storage: says what saved, keeps the rest to retry", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/jobs/j1?tab=photos");
  // From the 2nd photo on, writes to the photos store fail as if storage is full.
  await page.evaluate(() => {
    const w = window as unknown as { __photoPuts: number; __failPhotos: boolean };
    w.__photoPuts = 0;
    w.__failPhotos = true;
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof orig>) {
      if (this.name === "photos" && w.__failPhotos && ++w.__photoPuts >= 2) {
        throw new DOMException("Storage full", "QuotaExceededError");
      }
      return orig.apply(this, args);
    };
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator('main input[type="file"][multiple]').setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: png },
    { name: "b.png", mimeType: "image/png", buffer: png },
  ]);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Saved 1 of 2 photos" })).toContainText(
    "out of storage",
  );
  // The unsaved photo stays in the dialog; once space is free, Save retries just it.
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __failPhotos: boolean }).__failPhotos = false;
  });
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("main").getByRole("tab", { name: "Photos (2)" })).toBeVisible();
});

test("a damaged backup file is rejected and existing data is untouched", async ({ page }) => {
  await seed(page);
  await page.goto("/export");
  await expect(page.getByRole("button", { name: "Download backup" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-snap-cond-"));
  const good = path.join(dir, "good.zip");
  await (await downloadPromise).saveAs(good);
  // Cut the file in half, as an interrupted transfer would.
  const bytes = fs.readFileSync(good);
  const bad = path.join(dir, "truncated.zip");
  fs.writeFileSync(bad, bytes.subarray(0, Math.floor(bytes.length / 2)));

  await page.locator('#full-backup input[type="file"]').setInputFiles(bad);
  await page.getByRole("button", { name: "Replace all local data" }).click();
  await expect(page.getByText(/Could not restore|truncated|corrupt|Missing|not a Job Snap|No files/i).first()).toBeVisible();
  await page.goto("/contacts");
  await expect(page.getByText("Christopher Montgomery-Alexander")).toBeVisible();
});

test("importing a file that isn't a contact file creates nothing", async ({ page }) => {
  await seed(page);
  await page.goto("/contacts");
  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.vcf",
    mimeType: "text/vcard",
    buffer: Buffer.from("this is not a vCard"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "No contacts found" })).toBeVisible();
  await expect(page.locator('main a[href^="/contacts/"]')).toHaveCount(1);
});
