import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

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
  await page.goto("/");
  await page.getByRole("button", { name: /Add( contact)?/ }).click();
  await page.locator("#name").fill(name);
  if (extras?.phone) await page.locator("#phone").fill(extras.phone);
  if (extras?.address) await page.locator("#address").fill(extras.address);
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(
    page.locator(`a[href^="/contacts/"]:visible`, { hasText: name }),
  ).toBeVisible();
}

async function openContact(page: Page, name: string) {
  await page.goto("/");
  await page.locator(`a[href^="/contacts/"]:visible`, { hasText: name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", async (dialog) => {
    // Auto-accept confirm/alert so a single alert cannot stall the suite.
    console.log(`[dialog] ${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });
});

test.describe("Job Snap smoke", () => {
  test("Continue / Switch / Reopen, notes, punch edit, export ZIP, backup", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "job-snap-e2e-"));
    await clearAppData(page);
    await dismissCues(page);

    // ── Contact A + Job A punch in ──
    await addContact(page, "Alpha Client", {
      phone: "555-0101",
      address: "12 Oak St",
    });
    await openContact(page, "Alpha Client");
    await page.getByRole("button", { name: /New job/ }).click();
    await page.locator("#title").fill("Kitchen remodel");
    await page.getByRole("button", { name: /Create & punch in/ }).click();
    await expect(page).toHaveURL(/\/jobs\//);
    await expect(
      page.locator("main").getByRole("button", { name: "Punch out" }),
    ).toBeVisible();
    await dismissCues(page);

    // ── Contact B + Job B, Switch from job page ──
    await addContact(page, "Beta Client", { phone: "555-0202" });
    await openContact(page, "Beta Client");
    await page.getByRole("button", { name: /New job/ }).click();
    await page.locator("#title").fill("Service call");
    await page
      .getByRole("button", { name: "Create without punching in" })
      .click();
    await expect(page).toHaveURL(/\/jobs\//);
    await expect(
      page.locator("main").getByRole("button", { name: "Switch to this job" }),
    ).toBeVisible();
    await page
      .locator("main")
      .getByRole("button", { name: "Switch to this job" })
      .click();
    await expect(
      page.locator("main").getByRole("button", { name: "Punch out" }),
    ).toBeVisible();

    // ── Today’s note ──
    const noteBox = page.getByPlaceholder(/Quick day note/);
    await noteBox.fill("Arrived, checked panel");
    await noteBox.blur();
    await expect(page.getByText("Saved")).toBeVisible();

    // ── Punch out, close, Reopen & punch in ──
    await page
      .locator("main")
      .getByRole("button", { name: "Punch out" })
      .click();
    await expect(
      page.locator("main").getByRole("button", { name: "Punch in" }),
    ).toBeVisible();

    await openContact(page, "Beta Client");
    await page.getByRole("button", { name: "Close" }).click();
    await page
      .locator('main a[href^="/jobs/"]:visible', { hasText: "Service call" })
      .click();
    await expect(
      page.locator("main").getByRole("button", { name: /Reopen & punch in/ }),
    ).toBeVisible();
    await page
      .locator("main")
      .getByRole("button", { name: /Reopen & punch in/ })
      .click();
    await expect(
      page.locator("main").getByRole("button", { name: "Punch out" }),
    ).toBeVisible();
    await page
      .locator("main")
      .getByRole("button", { name: "Punch out" })
      .click();
    await expect(
      page.locator("main").getByRole("button", { name: "Punch in" }),
    ).toBeVisible();

    // ── Home Continue ──
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Continue" })).toBeVisible();
    await expect(
      page.locator("main").getByText(/Service call|Kitchen remodel/).first(),
    ).toBeVisible();

    // ── Punch edit on Alpha job ──
    await openContact(page, "Alpha Client");
    await page
      .locator('main a[href^="/jobs/"]:visible', { hasText: "Kitchen remodel" })
      .click();
    await page.getByRole("button", { name: "Edit punch" }).first().click();
    const punchDialog = page.getByRole("dialog");
    await expect(
      punchDialog.getByRole("heading", { name: "Edit punch" }),
    ).toBeVisible();
    const inVal = await punchDialog.locator("#punch-in").inputValue();
    expect(inVal).toBeTruthy();
    const [datePart, timePart] = inVal.split("T");
    const [hh, mm] = timePart.split(":").map(Number);
    const outH = String((hh + 1) % 24).padStart(2, "0");
    await punchDialog
      .locator("#punch-out")
      .fill(`${datePart}T${outH}:${String(mm).padStart(2, "0")}`);
    await punchDialog.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit punch" }),
    ).toHaveCount(0);

    // ── Photo with caption + lightbox caption edit ──
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page
      .locator('main input[type="file"][multiple]')
      .setInputFiles({ name: "site.png", mimeType: "image/png", buffer: png });
    const captionDialog = page.getByRole("dialog");
    await captionDialog.locator("#new-photo-caption").fill("Before demo");
    await captionDialog.getByRole("button", { name: "Save photo" }).click();
    await page.getByRole("button", { name: "View photo: Before demo" }).click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Edit caption" }).click();
    await viewer.locator("#lightbox-caption").fill("Before demo wall");
    await viewer.getByRole("button", { name: "Save" }).click();
    await expect(viewer.getByText("Before demo wall")).toBeVisible();
    await viewer.getByRole("button", { name: "Close photo" }).click();
    await expect(
      page.getByRole("button", { name: "View photo: Before demo wall" }),
    ).toBeVisible();

    // ── Edit job title ──
    await page.getByRole("button", { name: "Edit job title" }).click();
    const titleDialog = page.getByRole("dialog");
    await titleDialog.locator("#job-title").fill("Kitchen remodel HVAC");
    await titleDialog.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("heading", { name: "Kitchen remodel HVAC" }),
    ).toBeVisible();

    // ── Set hourly rate on Alpha ──
    await openContact(page, "Alpha Client");
    await page.getByRole("button", { name: "Edit contact" }).click();
    await page.locator("#edit-hourlyRate").fill("85");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Contact saved")).toBeVisible();

    // ── Export ZIP + invoice PDF (filtered) ──
    await page.goto("/export");
    await dismissCues(page);
    await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
    await page.locator("#export-contact").selectOption({ label: "Alpha Client" });
    await expect(page.getByText("Phone: 555-0101")).toBeVisible();
    await expect(page.getByText(/Rate: \$85\/hr/)).toBeVisible();

    const zipDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /ZIP \+ photos/ }).click();
    const zipDownload = await zipDownloadPromise;
    const zipPath = path.join(tmp, await zipDownload.suggestedFilename());
    await zipDownload.saveAs(zipPath);
    expect(fs.statSync(zipPath).size).toBeGreaterThan(20);

    const csvDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    const csvDownload = await csvDownloadPromise;
    const csvPath = path.join(tmp, await csvDownload.suggestedFilename());
    await csvDownload.saveAs(csvPath);
    const csv = fs.readFileSync(csvPath, "utf8");
    expect(csv).toContain("Client,Alpha Client");
    expect(csv).toContain("12 Oak St");
    expect(csv).toContain("555-0101");
    expect(csv).toContain("Before demo wall");
    expect(csv).not.toContain("Beta Client");

    const pdfDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download invoice PDF" }).click();
    const pdfDownload = await pdfDownloadPromise;
    const pdfName = await pdfDownload.suggestedFilename();
    expect(pdfName).toMatch(/\.pdf$/i);
    expect(pdfName).toMatch(/invoice/i);
    const pdfPath = path.join(tmp, pdfName);
    await pdfDownload.saveAs(pdfPath);
    expect(fs.statSync(pdfPath).size).toBeGreaterThan(200);
    const pdfHead = fs.readFileSync(pdfPath).subarray(0, 5).toString("utf8");
    expect(pdfHead).toBe("%PDF-");

    // ── Full backup round-trip ──
    const backupDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup" }).click();
    const backupDownload = await backupDownloadPromise;
    const backupPath = path.join(tmp, await backupDownload.suggestedFilename());
    await backupDownload.saveAs(backupPath);
    expect(fs.statSync(backupPath).size).toBeGreaterThan(50);
    await expect(page.getByText(/Backup saved/)).toBeVisible();

    await addContact(page, "Throwaway Temp");
    await expect(
      page.locator(`a[href^="/contacts/"]:visible`, { hasText: "Throwaway Temp" }),
    ).toBeVisible();

    await page.goto("/export");
    await page
      .locator('#full-backup input[type="file"]')
      .setInputFiles(backupPath);
    await expect(
      page.getByRole("heading", { name: "Restore full backup?" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Replace all local data" })
      .click();
    await page.waitForURL(/\/export/);
    await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();

    await page.goto("/");
    await expect(
      page.locator(`a[href^="/contacts/"]:visible`, { hasText: "Throwaway Temp" }),
    ).toHaveCount(0);
    await expect(
      page.locator(`a[href^="/contacts/"]:visible`, { hasText: "Alpha Client" }),
    ).toBeVisible();
    await expect(
      page.locator(`a[href^="/contacts/"]:visible`, { hasText: "Beta Client" }),
    ).toBeVisible();

    await openContact(page, "Alpha Client");
    await page
      .locator('main a[href^="/jobs/"]:visible', { hasText: "Kitchen remodel HVAC" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Kitchen remodel HVAC" }),
    ).toBeVisible();

    await openContact(page, "Beta Client");
    await page
      .locator('main a[href^="/jobs/"]:visible', { hasText: "Service call" })
      .click();
    await expect(page.getByPlaceholder(/Quick day note/)).toHaveValue(
      "Arrived, checked panel",
    );
  });
});
