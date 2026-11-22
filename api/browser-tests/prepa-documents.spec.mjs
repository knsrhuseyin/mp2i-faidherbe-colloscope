import { test, expect } from "@playwright/test";
import DEFAULT from "../src/default-data.js";
const KEY = "r".repeat(43);
const documents = [
  {
    id: "maths:a",
    name: "Semaine_8.pdf",
    subject: "maths",
    path: "Programmes de colle",
    size: 12000,
    source_url: "https://cahier-de-prepa.fr/mp2i-faidherbe/download?id=8",
    drive_url: "https://drive.google.com/file/d/ExampleFile123/view",
  },
  {
    id: "english:b",
    name: "English.pdf",
    subject: "english",
    path: "Cours",
    size: null,
    source_url: "https://drive.google.com/file/d/EnglishFile123/view",
  },
];
async function mount(page, hash = "") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("collo-group-v2", "17"));
  await page.route("**/config.js", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: 'window.COLLOSCOPE_CONFIG={API_URL:"http://127.0.0.1:4173"}',
    }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/documents/catalogue")
      return route.fulfill(
        route.request().headers().authorization === "Bearer " + KEY
          ? {
              json: {
                schema: 1,
                provider: "prepa-sync",
                documents,
                updated_at: new Date().toISOString(),
              },
            }
          : { status: 401, json: { error: "Clé invalide" } },
      );
    return route.fulfill({
      json:
        path === "/api/colloscope"
          ? { data: DEFAULT, updated_at: new Date().toISOString() }
          : path === "/api/push/config"
            ? { enabled: false }
            : { authenticated: false },
    });
  });
  await page.goto("/" + hash);
  return errors;
}
test("private library unlocks filters and forgets", async ({ page }) => {
  const errors = await mount(page);
  await page
    .locator(test.info().project.name === "mobile" ? "#mobileDocuments" : "#documentsOpen")
    .click();
  await expect(page.locator("#documentsPanel")).toBeVisible();
  await expect(page.locator("#planning")).toBeHidden();
  await expect(page.locator("#documentsLibrary")).toBeHidden();
  await page.locator("#documentsKey").fill("wrong");
  await page.locator("#documentsUnlock").click();
  await expect(page.locator("#documentsStatus")).toContainText("invalide");
  await expect(page.locator("#documentsLibrary")).toBeHidden();
  await page.locator("#documentsKey").fill(KEY);
  await page.locator("#documentsUnlock").click();
  await expect(page.locator(".documents-file")).toHaveCount(2);
  await expect(page.locator("#documentsKey")).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("collo-prepa-sync-read-key-v1"))).toBe(KEY);
  await page.locator("#documentsSubject").selectOption("maths");
  await expect(page.locator(".documents-file")).toHaveCount(1);
  await expect(page.locator(".documents-file a")).toHaveCount(2);
  await page.locator("#documentsSearch").fill("missing");
  await expect(page.locator(".documents-empty")).toBeVisible();
  await page.locator("#documentsSearch").fill("");
  await page.reload();
  await page
    .locator(test.info().project.name === "mobile" ? "#mobileDocuments" : "#documentsOpen")
    .click();
  await expect(page.locator(".documents-file")).toHaveCount(2);
  await page.locator("#documentsForget").click();
  await expect(page.locator("#documentsLibrary")).toBeHidden();
  expect(
    await page.evaluate(() => localStorage.getItem("collo-prepa-sync-read-key-v1")),
  ).toBeNull();
  await page.locator("#documentsBack").click();
  await expect(page.locator("#planning")).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
test("private transfer clears the fragment", async ({ page }) => {
  const errors = await mount(page, "#documents-key=" + KEY);
  await expect(page.locator(".documents-file")).toHaveCount(2);
  expect(page.url()).not.toContain(KEY);
  expect(page.url()).toMatch(/#documents$/);
  expect(await page.evaluate(() => localStorage.getItem("collo-prepa-sync-read-key-v1"))).toBe(KEY);
  expect(errors).toEqual([]);
  if (test.info().project.name === "mobile")
    await page.screenshot({ path: "/tmp/collo-private-documents-mobile.png", fullPage: true });
});
