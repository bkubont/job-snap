import { test, expect, type Page } from "@playwright/test";

/**
 * Regression tests for the Phase 2 reliability fixes (see docs/AUDIT.md).
 * Records are seeded straight into IndexedDB so timestamps are exact.
 */

type Seed = {
  contacts?: Record<string, unknown>[];
  jobs?: Record<string, unknown>[];
  punches?: Record<string, unknown>[];
};

async function resetAndSeed(page: Page, seed: Seed) {
  await page.goto("/");
  // Let the app open (and create) the database first.
  await expect(page.getByText("Job Snap").first()).toBeVisible();
  await page.evaluate(async (data: Seed) => {
    localStorage.setItem("job-snap:backupNudgeDismissed", "1");
    localStorage.setItem("job-snap:installCueDismissed", "1");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("sitefold");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = ["contacts", "jobs", "punches", "photos", "dayNotes"];
    const tx = db.transaction(stores, "readwrite");
    for (const s of stores) tx.objectStore(s).clear();
    for (const c of data.contacts ?? []) tx.objectStore("contacts").put(c);
    for (const j of data.jobs ?? []) tx.objectStore("jobs").put(j);
    for (const p of data.punches ?? []) tx.objectStore("punches").put(p);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, seed);
}

async function readPunches(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        { id: string; jobId: string; punchedInAt: string; punchedOutAt: string | null }[]
      >((resolve) => {
        const req = indexedDB.open("sitefold");
        req.onsuccess = () => {
          const get = req.result
            .transaction("punches")
            .objectStore("punches")
            .getAll();
          get.onsuccess = () => {
            resolve(get.result);
            req.result.close();
          };
        };
      }),
  );
}

const created = "2026-10-01T07:00:00.000Z";
const contact = {
  id: "c1",
  name: "Reliability Customer",
  phone: "",
  email: "",
  address: "",
  notes: "",
  createdAt: created,
};
const job = (id: string, title: string) => ({
  id,
  contactId: "c1",
  title,
  status: "open",
  notes: "",
  createdAt: created,
});

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
});

test("short punches add up exactly instead of truncating to zero", async ({
  page,
}) => {
  const base = Date.parse("2026-10-01T08:00:00.000Z");
  await resetAndSeed(page, {
    contacts: [contact],
    jobs: [job("jA", "Short punches")],
    // Ten 59-second punches = 9 min 50 s.
    punches: Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      jobId: "jA",
      punchedInAt: new Date(base + i * 3_600_000).toISOString(),
      punchedOutAt: new Date(base + i * 3_600_000 + 59_000).toISOString(),
    })),
  });
  await page.goto("/jobs/jA");
  await expect(page.getByText("Total hours")).toContainText("0.16");
  await expect(page.getByText(/Closed total/)).toHaveText("Closed total 10m");
});

test("saving a punch without changes keeps its original seconds", async ({
  page,
}) => {
  await resetAndSeed(page, {
    contacts: [contact],
    jobs: [job("jA", "Precise punch")],
    punches: [
      {
        id: "px",
        jobId: "jA",
        punchedInAt: "2026-10-02T08:00:12.000Z",
        punchedOutAt: "2026-10-02T09:00:45.000Z",
      },
    ],
  });
  await page.goto("/jobs/jA");
  await page.getByRole("button", { name: "Edit punch" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Edit punch" })).toBeHidden();
  const [px] = await readPunches(page);
  expect(px.punchedInAt).toBe("2026-10-02T08:00:12.000Z");
  expect(px.punchedOutAt).toBe("2026-10-02T09:00:45.000Z");
});

test("simultaneous punch-ins never leave two timers running", async ({
  page,
}) => {
  // Closed punches make both jobs show on Home with their own Punch in button.
  await resetAndSeed(page, {
    contacts: [contact],
    jobs: [job("jA", "Job A"), job("jB", "Job B")],
    punches: [
      { id: "h1", jobId: "jA", punchedInAt: "2026-10-01T08:00:00.000Z", punchedOutAt: "2026-10-01T09:00:00.000Z" },
      { id: "h2", jobId: "jB", punchedInAt: "2026-10-01T10:00:00.000Z", punchedOutAt: "2026-10-01T11:00:00.000Z" },
    ],
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Punch in", exact: true }),
  ).toHaveCount(2);
  // Click both in the same tick, as two tabs (or a double tap) racing would.
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].filter(
      (el) => el.textContent?.trim() === "Punch in",
    );
    buttons.forEach((el) => el.click());
  });
  await expect
    .poll(async () => (await readPunches(page)).length)
    .toBeGreaterThan(2);
  await page.waitForTimeout(500);
  const open = (await readPunches(page)).filter((p) => p.punchedOutAt === null);
  expect(open).toHaveLength(1);
});

test("an existing pair of open punches is flagged for the user", async ({
  page,
}) => {
  await resetAndSeed(page, {
    contacts: [contact],
    jobs: [job("jA", "First timer"), job("jB", "Second timer")],
    punches: [
      { id: "o1", jobId: "jA", punchedInAt: "2026-10-03T08:00:00.000Z", punchedOutAt: null },
      { id: "o2", jobId: "jB", punchedInAt: "2026-10-03T09:00:00.000Z", punchedOutAt: null },
    ],
  });
  await page.goto("/");
  await expect(page.getByText("2 timers are running at once.")).toBeVisible();
});

for (const field of [
  { label: "job notes", placeholder: /Materials, access codes/ },
  { label: "today's note", placeholder: /Quick day note/ },
]) {
  test(`${field.label} survive closing the app without leaving the field`, async ({
    page,
  }) => {
    await resetAndSeed(page, {
      contacts: [contact],
      jobs: [job("jA", "Notes job")],
    });
    await page.goto("/jobs/jA");
    // Only this field is touched, so it never loses focus before the reload
    // (like locking the iPhone or swiping the app away).
    await page.getByPlaceholder(field.placeholder).fill("Gate code 4411");
    await page.waitForTimeout(2000);
    await page.reload();
    await expect(page.getByPlaceholder(field.placeholder)).toHaveValue(
      "Gate code 4411",
    );
  });
}

test("a storage failure shows an error with retry, never an empty app", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("Simulated storage failure", "UnknownError");
    };
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Couldn't load your contacts.")).toBeVisible();
  await expect(page.getByText("No contacts yet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await page.goto("/jobs/anything");
  await expect(page.getByText("Couldn't load this job.")).toBeVisible();
  await context.close();
});

test("Notes page header and nav are in the server HTML", async ({ request }) => {
  const html = await (await request.get("/notes")).text();
  expect(html).toContain("Day notes");
  expect(html).not.toContain("Loading Job Snap");
});

test("full backup and restore reproduce photos, captions, and exact times", async ({
  page,
}, testInfo) => {
  await resetAndSeed(page, {
    contacts: [contact],
    jobs: [job("jA", "Backup job")],
    punches: [
      {
        id: "bp",
        jobId: "jA",
        punchedInAt: "2026-10-04T08:00:07.000Z",
        punchedOutAt: "2026-10-04T12:34:56.000Z",
      },
    ],
  });
  // Seed a photo with known bytes (all 256 byte values, twice).
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const bytes = new Uint8Array(512).map((_, i) => i % 256);
        const req = indexedDB.open("sitefold");
        req.onsuccess = () => {
          const tx = req.result.transaction("photos", "readwrite");
          tx.objectStore("photos").put({
            id: "ph1",
            jobId: "jA",
            blob: new Blob([bytes], { type: "image/png" }),
            caption: "Before — kitchen wall",
            createdAt: "2026-10-04T09:00:00.000Z",
          });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
      }),
  );

  await page.goto("/export");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const backupPath = testInfo.outputPath("backup.zip");
  await (await downloadPromise).saveAs(backupPath);
  await expect(page.getByText(/Backup download started/)).toBeVisible();

  // Wipe everything, then restore from the file.
  await resetAndSeed(page, {});
  await page.goto("/export");
  await page.locator('#full-backup input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Replace all local data" }).click();
  await page.waitForURL(/\/export/);
  await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();

  const restored = await page.evaluate(
    () =>
      new Promise<{ caption: string; type: string; bytesOk: boolean; punch: unknown }>(
        (resolve) => {
          const req = indexedDB.open("sitefold");
          req.onsuccess = () => {
            const tx = req.result.transaction(["photos", "punches"]);
            const ph = tx.objectStore("photos").get("ph1");
            const pu = tx.objectStore("punches").get("bp");
            tx.oncomplete = async () => {
              const blob: Blob = ph.result.blob;
              const bytes = new Uint8Array(await blob.arrayBuffer());
              resolve({
                caption: ph.result.caption,
                type: blob.type,
                bytesOk:
                  bytes.length === 512 && bytes.every((b, i) => b === i % 256),
                punch: pu.result,
              });
            };
          };
        },
      ),
  );
  expect(restored.caption).toBe("Before — kitchen wall");
  expect(restored.type).toBe("image/png");
  expect(restored.bytesOk).toBe(true);
  expect(restored.punch).toEqual({
    id: "bp",
    jobId: "jA",
    punchedInAt: "2026-10-04T08:00:07.000Z",
    punchedOutAt: "2026-10-04T12:34:56.000Z",
  });
});
