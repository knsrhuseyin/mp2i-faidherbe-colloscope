import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import DEFAULT from '../src/default-data.js';

const library = {
  items: [{ id: 'File1234567890', parent_id: '', name: 'Cours.pdf', source_id: 'english', kind: 'file', mime: 'application/pdf', url: 'https://drive.google.com/file/d/File1234567890/view', path: '' }],
  total: 1, breadcrumbs: [], offset: 0, limit: 50,
};
async function mount(page, override = () => undefined, time = '2026-11-16T09:00:00Z') {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript(() => {
    localStorage.setItem('collo-group-v2', '14');
    localStorage.setItem('collo-documents-token', 'class-test-token');
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.COLLOSCOPE_CONFIG={API_URL:"http://127.0.0.1:4173"};' });
    if (url.pathname.startsWith('/api/')) {
      const custom = await override(url, route.request());
      const payload = custom ?? ({
        '/api/colloscope': { data: DEFAULT, updated_at: '2026-11-16T09:00:00Z' },
        '/api/admin/session': { authenticated: false },
        '/api/admin/login': { token: 'admin-test-token' },
        '/api/admin/documents': { password_configured: true, sources: [], discord: [] },
        '/api/documents/session': { authenticated: true },
        '/api/documents/sources': { sources: [{ id: 'english', label: 'Anglais', item_count: 1, synced_at: '2026-11-15T12:00:00Z', url: 'https://drive.google.com/drive/folders/RootFolder1234' }] },
        '/api/documents/items': library,
        '/api/push/config': { enabled: false },
      })[url.pathname];
      return route.fulfill(custom?.status ? { status: custom.status, json: custom.body } : { json: payload || {} }).catch(() => {});
    }
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    return route.abort();
  });
  await page.goto('/');
  return errors;
}

test('unchanged minute retains DOM nodes, focus and scroll without planning mutations', async ({ page }) => {
  const errors = await mount(page);
  await expect(page.locator('#sessionList .session').first()).toBeVisible();
  await page.locator('[data-week="0"]').click();
  await page.evaluate(() => {
    const strip = document.querySelector('#weekStrip');
    strip.scrollLeft = 80;
    window.scrollTo(0, 400);
    const button = document.querySelector('[data-week="0"]');
    button.focus({ preventScroll: true });
    window.before = { button, row: document.querySelector('.session'), left: strip.scrollLeft, y: scrollY, mutations: 0 };
    const observer = new MutationObserver(records => window.before.mutations += records.length);
    for (const id of ['filters', 'weekStrip', 'sessionList', 'stats', 'nextCard']) observer.observe(document.getElementById(id), { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await page.clock.fastForward(60000);
  expect(await page.evaluate(() => ({
    sameButton: window.before.button === document.querySelector('[data-week="0"]'),
    sameRow: window.before.row === document.querySelector('.session'),
    focused: document.activeElement === window.before.button,
    scroll: scrollY === window.before.y && document.querySelector('#weekStrip').scrollLeft === window.before.left,
    mutations: window.before.mutations,
  }))).toEqual({ sameButton: true, sameRow: true, focused: true, scroll: true, mutations: 0 });
  expect(errors).toEqual([]);
});

test('minute crossing a colle end updates its state without replacing its row', async ({ page }) => {
  const data = { ...DEFAULT, weeks: [{ id: 7, label: 'S7', start: '2026-11-16', end: '2026-11-20' }], slots: [{ ...DEFAULT.slots[0], day: 'lundi', start: '10:00', end: '11:00', group_by_week: [14] }] };
  const errors = await mount(page, url => url.pathname === '/api/colloscope' ? { data, updated_at: '2026-11-16T09:00:00Z' } : undefined, '2026-11-16T09:59:30Z');
  await expect(page.locator('.session')).toBeVisible();
  await page.evaluate(() => window.originalRow = document.querySelector('.session'));
  await expect(page.locator('.session')).not.toHaveClass(/past/);
  await page.clock.fastForward(60000);
  await expect(page.locator('.session')).toHaveClass(/past/);
  await expect(page.locator('#nextCard')).toContainText('Semestre terminé');
  expect(await page.evaluate(() => window.originalRow === document.querySelector('.session'))).toBe(true);
  expect(errors).toEqual([]);
});

test('remote changes refresh rooms and retain week, group and filter', async ({ page }) => {
  let current = { data: DEFAULT, updated_at: '2026-11-16T09:00:00Z' };
  const errors = await mount(page, url => url.pathname === '/api/colloscope' ? current : undefined);
  await expect(page.locator('.session').first()).toBeVisible();
  await page.locator('[data-week="0"]').click();
  await page.locator('[data-filter="mathematiques"]').click();
  current = { data: structuredClone(DEFAULT), updated_at: '2026-11-16T09:01:00Z' };
  current.data.slots.forEach(slot => slot.room = 'Nouvelle salle');
  await page.clock.fastForward(60000);
  await expect(page.locator('.session').first()).toContainText('Nouvelle salle');
  await expect(page.locator('#groupSelect')).toHaveValue('14');
  await expect(page.locator('[data-week="0"]')).toHaveClass(/active/);
  await expect(page.locator('[data-filter="mathematiques"]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('obsolete document search is cancelled and cannot replace fresh results', async ({ page }) => {
  let started, release;
  const oldStarted = new Promise(resolve => started = resolve);
  const oldGate = new Promise(resolve => release = resolve);
  const failed = [];
  page.on('requestfailed', request => failed.push(request.url()));
  const errors = await mount(page, async url => {
    if (url.pathname !== '/api/documents/items') return;
    if (url.searchParams.get('q') === 'ancien') { started(); await oldGate; return { ...library, items: [{ ...library.items[0], name: 'Ancien.pdf' }] }; }
    if (url.searchParams.get('q') === 'nouveau') return { ...library, items: [{ ...library.items[0], name: 'Nouveau.pdf' }] };
  });
  try {
    await page.locator(await page.locator('#documentsOpen').isVisible() ? '#documentsOpen' : '#mobileDocuments').click();
    await expect(page.locator('#documentsItems')).toContainText('Cours.pdf');
    await page.locator('#documentSearch').fill('ancien');
    await page.clock.runFor(300);
    await oldStarted;
    await page.locator('#documentSearch').fill('nouveau');
    await page.clock.runFor(300);
    await expect(page.locator('#documentsItems')).toContainText('Nouveau.pdf');
    await expect.poll(() => failed.some(url => url.includes('q=ancien'))).toBe(true);
    release();
    await expect(page.locator('#documentsItems')).not.toContainText('Ancien.pdf');
    await expect(page.locator('#documentSearch')).toBeFocused();
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('admin imports, exports and saves against the draft version', async ({ page }) => {
  let saved;
  const errors = await mount(page, (url, request) => {
    if (url.pathname === '/api/admin/colloscope') {
      saved = request.postDataJSON();
      return { data: saved, updated_at: '2026-11-16T09:02:00Z' };
    }
  });
  await expect(page.locator('.session').first()).toBeVisible();
  await page.locator('#adminOpen').click();
  await page.locator('#adminPassword').fill('test-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  const imported = { ...DEFAULT, title: 'Import navigateur' };
  await page.locator('#jsonFile').setInputFiles({ name: 'planning.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  const downloading = page.waitForEvent('download');
  await page.locator('#exportJson').click();
  const downloaded = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
  expect(downloaded.title).toBe('Import navigateur');
  await page.locator('#saveAdmin').click();
  await expect(page.locator('#scheduleTitle')).toHaveText('Import navigateur');
  expect(saved.expected_updated_at).toBe('2026-11-16T09:00:00Z');
  expect(saved.title).toBe('Import navigateur');
  await expect(page.locator('#adminDialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('initial load error offers a working retry', async ({ page }) => {
  let failing = true;
  const errors = await mount(page, url => url.pathname === '/api/colloscope' && failing ? { status: 503, body: { error: 'Service indisponible' } } : undefined);
  await expect(page.locator('#retryPlanning')).toBeVisible();
  failing = false;
  await page.locator('#retryPlanning').click();
  await expect(page.locator('.session').first()).toBeVisible();
  await expect(page.locator('#siteNotice')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('admin configures, tests and pauses the maths webhook independently', async ({ page }) => {
  const calls = [];
  const errors = await mount(page, (url, request) => {
    if (url.pathname === '/api/admin/documents') return {
      password_configured: true, sources: [],
      discord: [{ id: 'maths', label: 'Mathématiques' }, { id: 'english', label: 'Anglais' }, { id: 'physics', label: 'Physique' }],
    };
    if (url.pathname.startsWith('/api/admin/documents/discord')) {
      expect(request.headers().authorization).toBe('Bearer admin-test-token');
      calls.push({ path: url.pathname, body: request.postDataJSON() });
      return { ok: true };
    }
  });
  await page.locator('#adminOpen').click();
  await page.locator('#adminPassword').fill('test-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('[data-admin-tab="documents"]').click();
  await expect(page.locator('[data-document-discord]')).toHaveCount(3);
  const maths = page.locator('[data-document-discord="maths"]');
  await expect(maths.locator('h5')).toHaveText('Mathématiques');
  await expect(maths.locator('[data-discord-test]')).toBeDisabled();
  const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_1234567890';
  await maths.locator('[name="webhook"]').fill(webhook);
  await maths.locator('button[type="submit"]').click();
  await expect(maths.locator('[role="status"]')).toContainText('Webhook enregistré');
  expect(calls.at(-1)).toEqual({ path: '/api/admin/documents/discord', body: { id: 'maths', webhook, enabled: true } });
  await expect(maths.locator('[name="webhook"]')).toHaveValue('');
  await maths.locator('[data-discord-test]').click();
  await expect(maths.locator('[role="status"]')).toContainText('Message de test envoyé');
  expect(calls.at(-1)).toEqual({ path: '/api/admin/documents/discord/test', body: { id: 'maths' } });
  await maths.locator('[name="enabled"]').uncheck();
  await maths.locator('button[type="submit"]').click();
  await expect(maths.locator('[role="status"]')).toContainText('Webhook enregistré');
  expect(calls.at(-1)).toEqual({ path: '/api/admin/documents/discord', body: { id: 'maths', webhook: '', enabled: false } });
  expect(errors).toEqual([]);
});

test('editing retains its base version and preserves the draft on conflict', async ({ page }) => {
  let reads = 0, saved;
  const errors = await mount(page, (url, request) => {
    if (url.pathname === '/api/colloscope') { reads++; return { data: DEFAULT, updated_at: '2026-11-16T09:00:00Z' }; }
    if (url.pathname === '/api/admin/colloscope') {
      saved = request.postDataJSON();
      return { status: 409, body: { error: 'Le planning a été modifié dans une autre session.' } };
    }
  });
  await expect(page.locator('.session').first()).toBeVisible();
  await page.locator('#adminOpen').click();
  await page.locator('#adminPassword').fill('test-password');
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  await page.clock.fastForward(60000);
  expect(reads).toBe(1);
  await page.locator('#saveAdmin').click();
  await expect(page.locator('#saveError')).toContainText('autre session');
  await expect(page.locator('#adminDialog')).toBeVisible();
  await expect(page.locator('#exportJson')).toBeEnabled();
  expect(saved.expected_updated_at).toBe('2026-11-16T09:00:00Z');
  expect(errors).toEqual([]);
});
