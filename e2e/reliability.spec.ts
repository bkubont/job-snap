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
  await page.goto("/jobs/jA?tab=time");
  await expect(page.locator("main dl").first()).toContainText("All time0.16 h");
  await expect(page.getByText(/Completed entries:/)).toHaveText(
    "Completed entries: 10m (0.16 h)",
  );
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
  await page.goto("/jobs/jA?tab=time");
  await page.getByRole("button", { name: "Edit entry" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Edit time entry" })).toBeHidden();
  const [px] = await readPunches(page);
  expect(px.punchedInAt).toBe("2026-10-02T08:00:12.000Z");
  expect(px.punchedOutAt).toBe("2026-10-02T09:00:45.000Z");
});

test("simultaneous punch-ins never leave two timers running", async ({
  page,
}) => {
  // Closed punches make both jobs show on Home with their own Clock in button.
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
    page.getByRole("button", { name: /^Clock in to Job/ }),
  ).toHaveCount(2);
  // Click both in the same tick, as two tabs (or a double tap) racing would.
  await page.evaluate(() => {
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Clock in to Job"]'),
    ];
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
  { label: "job notes", placeholder: /Materials, measurements/ },
  { label: "today's note", placeholder: /Quick day note/ },
]) {
  test(`${field.label} survive closing the app without leaving the field`, async ({
    page,
  }) => {
    await resetAndSeed(page, {
      contacts: [contact],
      jobs: [job("jA", "Notes job")],
    });
    await page.goto("/jobs/jA?tab=notes");
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
  await expect(page.getByText("Couldn't load your data.")).toBeVisible();
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
  // Wait until the page is interactive (Restore is disabled until then).
  await expect(page.getByRole("button", { name: "Download backup" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const backupPath = testInfo.outputPath("backup.zip");
  await (await downloadPromise).saveAs(backupPath);
  await expect(page.getByText(/Backup download started/)).toBeVisible();

  // Wipe everything, then restore from the file.
  await resetAndSeed(page, {});
  await page.goto("/export");
  // Wait until the page is interactive (Restore is disabled until then).
  await expect(page.getByRole("button", { name: "Download backup" })).toBeEnabled();
  await page.locator('#full-backup input[type="file"]').setInputFiles(backupPath);
  await page.getByRole("button", { name: "Replace all local data" }).click();
  // The dialog closes only after the restore has committed.
  await expect(page.getByRole("heading", { name: "Restore full backup?" })).toBeHidden({
    timeout: 30_000,
  });
  await page.waitForLoadState("load");
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

test("jobs saved as open/closed show as In Progress/Completed and stay unchanged until edited", async ({
  page,
}) => {
  await resetAndSeed(page, {
    contacts: [contact],
    jobs: [
      { ...job("jOpen", "Legacy open"), status: "open" },
      { ...job("jClosed", "Legacy closed"), status: "closed" },
    ],
  });
  const stored = () =>
    page.evaluate(
      () =>
        new Promise<Record<string, unknown>[]>((resolve) => {
          const req = indexedDB.open("sitefold");
          req.onsuccess = () => {
            const get = req.result.transaction("jobs").objectStore("jobs").getAll();
            get.onsuccess = () => {
              resolve(get.result);
              req.result.close();
            };
          };
        }),
    );
  const before = await stored();

  await page.goto("/jobs?status=all");
  const rows = page.locator("main li");
  await expect(rows.filter({ hasText: "Legacy open" }).locator("select")).toHaveValue(
    "in_progress",
  );
  await expect(rows.filter({ hasText: "Legacy closed" }).locator("select")).toHaveValue(
    "completed",
  );
  await page.goto("/jobs/jOpen?tab=notes");
  await page.goto("/");
  // Viewing does not rewrite anything.
  expect(await stored()).toEqual(before);

  // Changing the status stores the new value and logs it.
  await page.goto("/jobs/jClosed");
  await page.locator('main select[aria-label="Job status"]').selectOption("paid");
  await expect(page.locator('main select[aria-label="Job status"]')).toHaveValue("paid");
  const after = await stored();
  const closed = after.find((j) => j.id === "jClosed") as {
    status: string;
    history: { text: string }[];
  };
  expect(closed.status).toBe("paid");
  expect(closed.history.map((h) => h.text)).toContain("Status: Completed → Paid");
  expect(after.find((j) => j.id === "jOpen")).toEqual(
    before.find((j) => j.id === "jOpen"),
  );
});

test("invoice rounding applies only to the invoice and keeps recorded time", async ({
  page,
}) => {
  const base = Date.parse("2026-10-05T08:00:00.000Z");
  await resetAndSeed(page, {
    contacts: [{ ...contact, hourlyRate: 100 }],
    jobs: [job("jA", "Rounded job")],
    punches: [
      // 52 minutes and 7 minutes
      { id: "r1", jobId: "jA", punchedInAt: new Date(base).toISOString(), punchedOutAt: new Date(base + 52 * 60_000).toISOString() },
      { id: "r2", jobId: "jA", punchedInAt: new Date(base + 3_600_000).toISOString(), punchedOutAt: new Date(base + 3_600_000 + 7 * 60_000).toISOString() },
    ],
  });
  await page.goto("/settings");
  await page.locator("#rounding-minutes").selectOption("15");
  await expect(page.getByText(/a 52m entry is billed as 45m/)).toBeVisible();
  await page.locator("#rounding-mode").selectOption("up");
  await expect(page.getByText(/a 52m entry is billed as 1h/)).toBeVisible();

  await page.goto("/export");
  // Wait until the page is interactive (Restore is disabled until then).
  await expect(page.getByRole("button", { name: "Download backup" })).toBeEnabled();
  await page.locator("#export-contact").selectOption({ label: "Reliability Customer" });
  await page.locator("#from").fill("2026-10-01");
  await page.locator("#to").fill("2026-10-31");
  await expect(page.getByText(/Rounded up 15 min per entry/)).toBeVisible();
  // On-screen totals stay exact: 59 minutes = 0.98 h.
  await expect(page.locator("main").getByText("0.98 hrs").first()).toBeVisible();

  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download invoice PDF" }).click(),
  ]);
  const bytes = await (await pdf.createReadStream())!.toArray();
  const text = Buffer.concat(bytes).toString("latin1");
  // 52m → 60m, 7m → 15m: 1.25 h billed at $100/h; recorded 0.98 h noted.
  expect(text).toContain("1.25");
  expect(text).toContain("$125.00");
  expect(text).toContain("Recorded time: 0.98 h");

  // Recorded entries are untouched.
  const punches = await readPunches(page);
  expect(punches.find((p) => p.id === "r1")!.punchedOutAt).toBe(
    new Date(base + 52 * 60_000).toISOString(),
  );
});

test("deleting a job asks in-app; Cancel keeps it, Delete removes it with its entries", async ({
  page,
}) => {
  const nativeDialogs: string[] = [];
  page.on("dialog", (d) => nativeDialogs.push(d.message()));
  await resetAndSeed(page, {
    contacts: [contact],
    jobs: [job("jDel", "Job to delete")],
    punches: [
      {
        id: "dp",
        jobId: "jDel",
        punchedInAt: "2026-10-06T08:00:00.000Z",
        punchedOutAt: "2026-10-06T09:00:00.000Z",
      },
    ],
  });
  await page.goto("/jobs/jDel");
  await page.getByRole("button", { name: "Delete job" }).click();
  const confirmDialog = page.getByRole("dialog");
  await expect(confirmDialog.getByRole("heading", { name: 'Delete "Job to delete"?' })).toBeVisible();
  await expect(confirmDialog).toContainText("1 time entry and 0 photos");
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  expect(await readPunches(page)).toHaveLength(1);

  await page.getByRole("button", { name: "Delete job" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete job" }).click();
  await expect(page).toHaveURL(/\/contacts\/c1$/);
  expect(await readPunches(page)).toHaveLength(0);
  expect(nativeDialogs).toEqual([]);
});

test("controls are at least 40px tall on a touch phone", async ({ page }) => {
  await resetAndSeed(page, {
    contacts: [{ ...contact, phone: "555-0100", address: "1 Main St" }],
    jobs: [job("jT", "Touch job")],
    punches: [
      {
        id: "tp",
        jobId: "jT",
        punchedInAt: "2026-10-06T08:00:00.000Z",
        punchedOutAt: "2026-10-06T09:00:00.000Z",
      },
    ],
  });
  const found: string[] = [];
  for (const path of [
    "/",
    "/contacts",
    "/contacts/c1",
    "/jobs",
    "/jobs/jT",
    "/jobs/jT?tab=time",
    "/time",
    "/more",
    "/settings",
    "/notes",
    "/export",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).not.toContainText("Loading…");
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "main button, main a[href], main input:not([type=file]):not([type=checkbox]), main select, nav a",
        ),
      ]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          // Skip hidden elements and inline text links inside sentences.
          if (!r.width || !r.height || style.visibility === "hidden") return false;
          if (el.tagName === "A" && style.display === "inline") return false;
          if (el.closest("[hidden], [aria-hidden=true], details:not([open])")) return false;
          return r.height < 40;
        })
        .map((el) => `${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().height)}px`),
    );
    found.push(...small.map((x) => `${path}: ${x}`));
  }
  expect(found).toEqual([]);
});
