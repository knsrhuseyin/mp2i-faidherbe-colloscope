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
async function mount(page, hash = "", items = documents) {
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
                documents: items,
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
  await page
    .locator(
      test.info().project.name === "mobile"
        ? "#mobilePlanning"
        : ".desktop-page[data-page=planning]",
    )
    .click();
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

test("recent additions sort by publication or detection, retain filters and keyboard tabs", async ({
  page,
}) => {
  const items = [
    {
      ...documents[0],
      published_at: "2026-11-20T08:00:00Z",
      synced_at: "2026-12-01T10:00:00Z",
      modified_at: "2026-12-01T10:00:00Z",
    },
    { ...documents[1], published_at: "2026-11-21T23:30:00Z", detected_at: "2026-11-20T00:00:00Z" },
    {
      id: "physics:c",
      name: "Physique.pdf",
      subject: "physics",
      path: "TD / Électricité",
      published_at: "invalid",
      detected_at: "2026-11-22T08:00:00Z",
      source_url: "https://nuage13.apps.education.fr/test",
    },
    {
      id: "maths:d",
      name: "Sans date.pdf",
      subject: "maths",
      path: "Archives",
      published_at: null,
      detected_at: "invalid",
    },
  ];
  const errors = await mount(page, "#documents-key=" + KEY, items);
  await expect(page.locator(".documents-file")).toHaveCount(4);
  await page.getByRole("tab", { name: "Ajouts récents" }).click();
  await expect(page.locator("#documentsRecentTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".documents-file strong")).toHaveText([
    "Physique.pdf",
    "English.pdf",
    "Semaine_8.pdf",
    "Sans date.pdf",
  ]);
  await expect(page.locator(".documents-folder h2")).toHaveText([
    "22 novembre 2026",
    "20 novembre 2026",
    "Date non disponible",
  ]);
  await expect(page.locator(".documents-file time")).toHaveCount(3);
  await expect(page.locator(".documents-file time").first()).toContainText("Repéré");
  await expect(page.locator(".documents-location").first()).toHaveText("TD / Électricité");
  await page.locator("#documentsSubject").selectOption("maths");
  await expect(page.locator(".documents-file")).toHaveCount(2);
  await page.locator("#documentsSearch").fill("Semaine");
  await expect(page.locator(".documents-file")).toHaveCount(1);
  await page.locator("#documentsSearch").fill("absent");
  await expect(page.locator(".documents-empty")).toBeVisible();
  await page.locator("#documentsSearch").fill("");
  await page.locator("#documentsSubject").selectOption("all");
  await page.locator("#documentsRecentTab").focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#documentsFoldersTab")).toBeFocused();
  await expect(page.locator(".documents-file time")).toHaveCount(0);
  await page.keyboard.press("End");
  await expect(page.locator("#documentsRecentTab")).toBeFocused();
  await expect(page.locator(".documents-file strong").first()).toHaveText("Physique.pdf");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  if (test.info().project.name === "mobile")
    await page.screenshot({ path: "/tmp/collo-recent-documents-mobile.png", fullPage: true });
});
