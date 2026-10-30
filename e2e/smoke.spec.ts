import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/**
 * The handoff's required test scenario (section 14), end to end:
 * customer → two jobs → clock in/out → manual entry → photos → job notes →
 * status change → reload → verify → export time + photos → full backup →
 * restore in an isolated browser profile → original records unchanged.
 * Also covers switch / reopen / entry edit / captions / rename / invoice.
 */

async function dismissCues(page: Page) {
  for (const name of ["Dismiss backup reminder", "Dismiss install tip"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
  }
}

async function clearAppData(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("sitefold");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });
  await page.goto("/");
  await expect(page.getByText("Job Snap").first()).toBeVisible();
}

async function addContact(
  page: Page,
  name: string,
  extras?: { phone?: string; address?: string },
) {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.locator("#name").fill(name);
  if (extras?.phone) await page.locator("#phone").fill(extras.phone);
  if (extras?.address) await page.locator("#address").fill(extras.address);
  await page.getByRole("button", { name: "Create contact" }).click();
  await expect(
    page.locator(`main a[href^="/contacts/"]`, { hasText: name }),
  ).toBeVisible();
}

async function openContact(page: Page, name: string) {
  await page.goto("/contacts");
  await page.locator(`main a[href^="/contacts/"]`, { hasText: name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function newJob(page: Page, title: string, clockIn: boolean) {
  await page.getByRole("button", { name: "New job" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#job-title-new").fill(title);
  await dialog
    .getByRole("button", {
      name: clockIn ? "Create & clock in" : "Create without clocking in",
    })
    .click();
  await expect(page).toHaveURL(/\/jobs\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

const main = (page: Page) => page.locator("main");
const tab = (page: Page, name: RegExp) =>
  main(page).getByRole("tab", { name }).click();

function localDate(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", async (dialog) => {
    // Auto-accept confirm/alert so a single alert cannot stall the suite.
    console.log(`[dialog] ${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });
});

test.describe("Job Snap required scenario", () => {
  test("customer, two jobs, time, photos, notes, status, reload, exports, backup, isolated restore", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "job-snap-e2e-"));
    await clearAppData(page);
    await dismissCues(page);

    // 1. Sample customer (+ a second one for filters / switching)
    await addContact(page, "Alpha Client", { phone: "555-0101", address: "12 Oak St" });
    await addContact(page, "Beta Client", { phone: "555-0202" });

    // 2. Two separate jobs for that customer; 3. clock into the first
    await openContact(page, "Alpha Client");
    await newJob(page, "Kitchen remodel", true);
    const kitchenUrl = page.url();
    await expect(main(page).getByRole("button", { name: "Clock out" })).toBeVisible();
    await expect(main(page).locator('select[aria-label="Job status"]:visible')).toHaveValue(
      "in_progress",
    );

    await openContact(page, "Alpha Client");
    await newJob(page, "Bathroom tile", false);
    const bathUrl = page.url();
    // Switching from the second job clocks out of the first.
    await main(page).getByRole("button", { name: "Switch to this job" }).click();
    await expect(main(page).getByRole("button", { name: "Clock out" })).toBeVisible();

    // 4. Clock out
    await main(page).getByRole("button", { name: "Clock out" }).click();
    await expect(main(page).getByRole("button", { name: "Clock in" })).toBeVisible();

    // 5. Manual time entry on the first job (yesterday 08:00–12:30)
    await page.goto(`${kitchenUrl}?tab=time`);
    await main(page).getByRole("button", { name: "Add time" }).click();
    const manual = page.getByRole("dialog");
    await manual.locator("#manual-date").fill(localDate(-1));
    await manual.locator("#manual-start").fill("08:00");
    await manual.locator("#manual-end").fill("12:30");
    await expect(manual.getByText("4h 30m")).toBeVisible();
    await manual.locator("#manual-note").fill("Forgot to clock in");
    await manual.getByRole("button", { name: "Add entry" }).click();
    await expect(manual).toBeHidden();
    await expect(main(page).getByText(/Manual entry · Forgot to clock in/)).toBeVisible();

    // Overlapping manual entries are refused.
    await main(page).getByRole("button", { name: "Add time" }).click();
    await manual.locator("#manual-date").fill(localDate(-1));
    await manual.locator("#manual-start").fill("09:00");
    await manual.locator("#manual-end").fill("10:00");
    await manual.getByRole("button", { name: "Add entry" }).click();
    await expect(manual.getByRole("alert")).toContainText("Overlaps another entry");
    await page.keyboard.press("Escape");
    await expect(manual).toBeHidden();

    // Edit an entry's end time (only the edited field changes).
    await main(page).getByRole("button", { name: "Edit entry" }).last().click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByRole("heading", { name: "Edit time entry" })).toBeVisible();
    await editDialog.locator("#punch-out").fill(`${localDate(-1)}T12:45`);
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).toBeHidden();
    await expect(main(page).getByText("4h 45m", { exact: true })).toBeVisible();

    // 6. Attach multiple photos with categories and captions
    await tab(page, /^Photos/);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const fileInput = main(page).locator('input[type="file"][multiple]');
    await fileInput.setInputFiles({ name: "before.png", mimeType: "image/png", buffer: png });
    let photoDialog = page.getByRole("dialog");
    await expect(photoDialog.getByRole("radio", { name: "Before" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await photoDialog.locator("#new-photo-caption").fill("Old cabinets");
    await photoDialog.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByRole("button", { name: "View photo: Old cabinets" })).toBeVisible();

    await fileInput.setInputFiles([
      { name: "after1.png", mimeType: "image/png", buffer: png },
      { name: "after2.png", mimeType: "image/png", buffer: png },
    ]);
    photoDialog = page.getByRole("dialog");
    await photoDialog.getByRole("radio", { name: "After" }).click();
    await photoDialog.locator("#new-photo-caption").fill("New cabinets");
    await photoDialog.getByRole("button", { name: "Save photo" }).click();
    await expect(main(page).getByRole("button", { name: "After 2" })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Before 1" })).toBeVisible();

    // Caption edit in the viewer
    await page.getByRole("button", { name: "View photo: Old cabinets" }).click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await viewer.getByRole("button", { name: "Edit caption" }).click();
    await viewer.locator("#lightbox-caption").fill("Old cabinets, water damage");
    await viewer.getByRole("button", { name: "Save" }).click();
    await expect(viewer.getByText("Old cabinets, water damage")).toBeVisible();
    await viewer.getByRole("button", { name: "Close photo" }).click();

    // 7. Job notes, a dated note, and today's general note
    await tab(page, /^Notes/);
    await main(page).getByPlaceholder(/Materials, measurements/).fill("Cabinets on order");
    await expect(main(page).getByText("Saved", { exact: true }).first()).toBeVisible();
    await main(page).getByLabel("New dated note").fill("Customer approved tile");
    await main(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(main(page).getByText("Customer approved tile")).toBeVisible();
    await main(page).getByPlaceholder(/Quick day note/).fill("Arrived, checked panel");
    await main(page).getByPlaceholder(/Quick day note/).blur();

    // Rename via Edit details
    await main(page).getByRole("button", { name: "Edit job details" }).click();
    const details = page.getByRole("dialog");
    await details.locator("#d-title").fill("Kitchen remodel HVAC");
    await details.locator("#d-instructions").fill("Gate code 4411");
    await details.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Kitchen remodel HVAC" })).toBeVisible();
    await expect(main(page).getByText("Gate code 4411")).toBeVisible();

    // 8. Change the status without leaving the page
    await main(page).locator('select[aria-label="Job status"]:visible').selectOption("completed");
    await expect(main(page).getByRole("button", { name: /Reopen & clock in/ })).toBeVisible();

    // 9–10. Close and reopen the app; everything is still there
    await page.reload();
    await expect(page.getByRole("heading", { name: "Kitchen remodel HVAC" })).toBeVisible();
    await expect(main(page).locator('select[aria-label="Job status"]:visible')).toHaveValue("completed");
    await tab(page, /^Time/);
    await expect(main(page).getByText(/Manual entry · Forgot to clock in/)).toBeVisible();
    await expect(main(page).getByRole("tab", { name: "Photos (3)" })).toBeVisible();
    await tab(page, /^Notes/);
    await expect(main(page).getByPlaceholder(/Materials, measurements/)).toHaveValue(
      "Cabinets on order",
    );
    await expect(main(page).getByPlaceholder(/Quick day note/)).toHaveValue(
      "Arrived, checked panel",
    );
    await tab(page, /^History/);
    await expect(main(page).getByText("Status: In Progress → Completed")).toBeVisible();
    await expect(main(page).getByText(/Manual entry added/)).toBeVisible();
    await expect(main(page).getByText(/Renamed from "Kitchen remodel"/)).toBeVisible();

    // Reopen & clock in moves it back to In Progress; then clock out.
    await main(page).getByRole("button", { name: /Reopen & clock in/ }).click();
    await expect(main(page).locator('select[aria-label="Job status"]:visible')).toHaveValue(
      "in_progress",
    );
    await main(page).getByRole("button", { name: "Clock out" }).click();
    await expect(main(page).getByRole("button", { name: "Clock in" })).toBeVisible();

    // Dashboard and lists reflect the work
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Recent jobs" })).toBeVisible();
    await expect(main(page).getByText("Kitchen remodel HVAC")).toBeVisible();
    await page.goto("/jobs");
    await expect(main(page).getByText("Bathroom tile")).toBeVisible();
    await page.goto("/time");
    await expect(main(page).getByText("Kitchen remodel HVAC").first()).toBeVisible();

    // Hourly rate for the invoice
    await openContact(page, "Alpha Client");
    await page.getByRole("button", { name: "Edit contact" }).click();
    await page.locator("#edit-hourlyRate").fill("85");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Contact saved")).toBeVisible();

    // 11. Export the time records (filtered to the customer)
    await page.goto("/export");
    // Wait until the page is interactive (Restore is disabled until then).
    await expect(page.getByRole("button", { name: "Download backup" })).toBeEnabled();
    await dismissCues(page);
    await page.locator("#export-contact").selectOption({ label: "Alpha Client" });
    await page.locator("#from").fill(localDate(-6));
    await page.locator("#to").fill(localDate(0));
    await expect(page.getByText(/Rate: \$85\/hr/)).toBeVisible();

    const csvDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    const csvPath = path.join(tmp, "timecard.csv");
    await (await csvDownloadPromise).saveAs(csvPath);
    const csv = fs.readFileSync(csvPath, "utf8");
    expect(csv).toContain("Client,Alpha Client");
    expect(csv).toContain("Entry Type,Entry Note");
    expect(csv).toContain("Manual,Forgot to clock in");
    expect(csv).toContain("Old cabinets, water damage");
    expect(csv).toContain("Before");
    expect(csv).not.toContain("Beta Client");

    // 12. Export the photos (ZIP in customer / job folders)
    const zipDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /ZIP \+ photos/ }).click();
    const zipPath = path.join(tmp, "export.zip");
    await (await zipDownloadPromise).saveAs(zipPath);
    const zipText = fs.readFileSync(zipPath).toString("latin1");
    expect(zipText).toContain("photos/Alpha-Client/Kitchen-remodel-HVAC-");
    expect(zipText).toMatch(/_Before_Old-cabinets-water-damage_01\.png/);

    const pdfDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download invoice PDF" }).click();
    const pdfPath = path.join(tmp, "invoice.pdf");
    await (await pdfDownloadPromise).saveAs(pdfPath);
    expect(fs.readFileSync(pdfPath).subarray(0, 5).toString("utf8")).toBe("%PDF-");

    // 13. Full backup
    const backupDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup" }).click();
    const backupPath = path.join(tmp, "backup.zip");
    await (await backupDownloadPromise).saveAs(backupPath);
    await expect(page.getByText(/Backup download started/)).toBeVisible();

    // 14. Restore in an isolated environment (a separate browser profile)
    const isolated = await browser.newContext();
    const other = await isolated.newPage();
    other.on("dialog", (d) => d.accept());
    await other.goto("/export");
    // Wait until the page is interactive (Restore is disabled until then).
    await expect(other.getByRole("button", { name: "Download backup" })).toBeEnabled();
    await other.locator('#full-backup input[type="file"]').setInputFiles(backupPath);
    await other.getByRole("button", { name: "Replace all local data" }).click();
    // The dialog closes only after the restore has committed.
    await expect(other.getByRole("heading", { name: "Restore full backup?" })).toBeHidden({
      timeout: 30_000,
    });
    await other.waitForLoadState("load");
    await other.goto(kitchenUrl.replace(/^https?:\/\/[^/]+/, ""));
    await expect(other.getByRole("heading", { name: "Kitchen remodel HVAC" })).toBeVisible();
    await expect(other.getByText("Gate code 4411")).toBeVisible();
    await expect(other.locator('main select[aria-label="Job status"]:visible')).toHaveValue(
      "in_progress",
    );
    await expect(other.locator("main").getByRole("tab", { name: "Photos (3)" })).toBeVisible();
    await other.locator("main").getByRole("tab", { name: /^Photos/ }).click();
    await expect(other.locator("main").getByRole("button", { name: "After 2" })).toBeVisible();
    await other.goto(bathUrl.replace(/^https?:\/\/[^/]+/, ""));
    await expect(other.getByRole("heading", { name: "Bathroom tile" })).toBeVisible();
    await isolated.close();

    // 15. The original records are unchanged by the isolated restore
    await page.goto("/contacts");
    await expect(main(page).getByText("Alpha Client")).toBeVisible();
    await expect(main(page).getByText("Beta Client")).toBeVisible();
    await page.goto(`${kitchenUrl}?tab=time`);
    await expect(main(page).getByText(/Manual entry · Forgot to clock in/)).toBeVisible();

    // Same-profile restore still replaces local data (with confirmation).
    await addContact(page, "Throwaway Temp");
    await page.goto("/export");
    // Wait until the page is interactive (Restore is disabled until then).
    await expect(page.getByRole("button", { name: "Download backup" })).toBeEnabled();
    await page.locator('#full-backup input[type="file"]').setInputFiles(backupPath);
    await expect(page.getByRole("heading", { name: "Restore full backup?" })).toBeVisible();
    await page.getByRole("button", { name: "Replace all local data" }).click();
    await expect(page.getByRole("heading", { name: "Restore full backup?" })).toBeHidden({
      timeout: 30_000,
    });
    await page.waitForLoadState("load");
    await page.goto("/contacts");
    await expect(main(page).getByText("Alpha Client")).toBeVisible();
    await expect(main(page).getByText("Throwaway Temp")).toHaveCount(0);
  });
});
