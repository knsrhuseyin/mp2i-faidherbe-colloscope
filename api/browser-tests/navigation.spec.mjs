import { test, expect } from "@playwright/test";
import DEFAULT from "../src/default-data.js";
async function mount(page, { saved = true, theme = "midnight", hash = "" } = {}) {
  const errors = [],
    subscriptions = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ saved }) => {
      if (saved && !localStorage.getItem("collo-group-v2"))
        localStorage.setItem("collo-group-v2", "17");
      const subscription = {
        toJSON: () => ({
          endpoint: "https://push.test/device",
          keys: { p256dh: "fixture", auth: "fixture" },
        }),
        unsubscribe: async () => true,
      };
      const registration = {
        pushManager: {
          getSubscription: async () => subscription,
          subscribe: async () => subscription,
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        value: { register: async () => registration, ready: Promise.resolve(registration) },
      });
      Object.defineProperty(window, "PushManager", { value: class {} });
      Object.defineProperty(window, "Notification", {
        value: { permission: "granted", requestPermission: async () => "granted" },
      });
    },
    { saved },
  );
  await page.route("**/config.js", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: 'window.COLLOSCOPE_CONFIG={API_URL:"http://127.0.0.1:4173"}',
    }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/push/subscribe") subscriptions.push(route.request().postDataJSON());
    return route.fulfill({
      json:
        path === "/api/colloscope"
          ? {
              data: {
                ...DEFAULT,
                appearance: { default_theme: theme, periods: [], custom_themes: [] },
              },
              updated_at: "2026-11-22T12:00:00Z",
            }
          : path === "/api/push/config"
            ? { enabled: true, publicKey: "AQID" }
            : path === "/api/documents/catalogue"
              ? { schema: 1, provider: "prepa-sync", documents: [] }
              : { ok: true, authenticated: false },
    });
  });
  await page.goto("/" + hash);
  await expect(page.locator("#groupOpen")).toBeEnabled();
  return { errors, subscriptions };
}
const desktop = ".desktop-page[data-page=planning]";
const nav = (mobile, page) =>
  mobile
    ? `#mobile${{ planning: "Planning", documents: "Documents", rappels: "Reminders" }[page]}`
    : page === "planning"
      ? desktop
      : page === "documents"
        ? "#documentsOpen"
        : "#notificationsOpen";
test("one current page, browser history, reminder controls and persistent group changes", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile",
    { errors, subscriptions } = await mount(page);
  await page.locator(nav(mobile, "documents")).click();
  await expect(page.locator("#documentsPanel")).toBeVisible();
  await expect(page.locator("#planningPage")).toBeHidden();
  await expect(page.locator("#documentsBack")).toHaveCount(0);
  await expect(page.locator(nav(mobile, "documents"))).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#mobilePlanning")).not.toHaveAttribute("aria-current");
  if (mobile) {
    const colors = await page.evaluate(() =>
      ["mobileDocuments", "mobilePlanning"].map(
        (id) => getComputedStyle(document.getElementById(id)).color,
      ),
    );
    expect(colors[0]).not.toBe(colors[1]);
  }
  await page.locator(nav(mobile, "rappels")).click();
  await expect(page.locator("#remindersPage")).toBeVisible();
  await expect(page.locator("#documentsPanel")).toBeHidden();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#reminderGroup")).toHaveText("G17");
  await expect(page.locator("#pushSave")).toBeEnabled();
  await page.locator('[data-reminder="15"]').click();
  await expect(page.locator("#reminderMinutes")).toHaveValue("15, 60");
  await page.locator("#pushSave").click();
  await expect(page.locator("#pushStatus")).toContainText("Rappels enregistrés pour G17");
  expect(subscriptions.at(-1).group).toBe(17);
  expect(subscriptions.at(-1).reminders).toEqual([15, 60]);
  await page.goBack();
  await expect(page.locator("#documentsPanel")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#remindersPage")).toBeVisible();
  await expect(page.locator('[data-reminder="15"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator(mobile ? "#mobileGroup" : "#groupOpen").click();
  await expect(page.locator("#groupDialog")).toBeVisible();
  await expect(page.locator('input[name="collo-group"][value="17"]')).toBeChecked();
  await page.locator("#groupSearch").fill("G14");
  await expect(page.locator(".group-choice:visible")).toHaveCount(1);
  await page.locator('input[name="collo-group"][value="14"]').check();
  await expect(page.locator("#groupMembers")).not.toBeEmpty();
  await page.locator("#groupClose").click();
  await expect(page.locator("#groupSelect")).toHaveValue("17");
  await page.locator(".reminder-group [data-group-open]").click();
  await page.locator('input[name="collo-group"][value="14"]').check();
  await page.locator("#confirmGroup").click();
  await expect(page.locator("#currentGroupLabel")).toHaveText("G14");
  await expect(page.locator("#reminderGroup")).toHaveText("G14");
  await expect(page.locator("#reminderSummary")).toContainText("Groupe 14");
  expect(await page.evaluate(() => localStorage.getItem("collo-group-v2"))).toBe("14");
  await expect(page.locator("#remindersPage")).toBeVisible();
  await page.reload();
  await expect(page.locator("#remindersPage")).toBeVisible();
  await expect(page.locator("#reminderGroup")).toHaveText("G14");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `/tmp/collo-rappels-${info.project.name}.png`, fullPage: true });
});
test("first group selection, searching by name, keyboard and theme-aware grid", async ({
  page,
}, info) => {
  const { errors } = await mount(page, { saved: false, theme: "indigo" });
  await expect(page.locator("#groupDialog")).toBeVisible();
  await expect(page.locator("#groupClose")).toBeHidden();
  await expect(page.locator("#confirmGroup")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#groupDialog")).toBeVisible();
  await page.locator("#groupSearch").fill("zzzznothing");
  await expect(page.locator("#groupEmpty")).toBeVisible();
  await page.locator("#groupSearch").fill("Grandvuinet");
  await expect(page.locator(".group-choice:visible")).toHaveCount(1);
  await page.locator('input[name="collo-group"][value="1"]').check();
  await expect(page.locator("#groupMembers")).toContainText("Grandvuinet");
  await page.locator("#groupSearch").fill("");
  await page.locator('input[name="collo-group"][value="1"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('input[name="collo-group"][value="2"]')).toBeChecked();
  await page.screenshot({ path: `/tmp/collo-group-${info.project.name}.png`, fullPage: true });
  await page.locator("#confirmGroup").click();
  await expect(page.locator("#groupSelect")).toHaveValue("2");
  expect(await page.evaluate(() => localStorage.getItem("collo-group-v2"))).toBe("2");
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
