import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker, { normaliseData } from './src/index.js';
import DEFAULT from './src/default-data.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./migrations/0001_initial.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) {
  const stmt = sqlite.prepare(sql); let args = [];
  const q = { bind(...a) { args = a; return q; }, async first() { return stmt.get(...args) || null; }, async run() { return { meta: { changes: stmt.run(...args).changes } }; } };
  return q;
} };
const env = { DB, ADMIN_PASSWORD: 'local-test-password', SESSION_SECRET: 'local-test-secret-never-deployed' };
const call = (path, body, token) => worker.fetch(new Request('https://test.invalid' + path, {
  method: 'POST', headers: { 'cf-connecting-ip': '192.0.2.123', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
}), env);
const responses = await Promise.all(Array.from({ length: 20 }, () => call('/api/admin/login', { password: 'wrong' })));
assert.equal(responses.filter(r => r.status === 401).length, 5);
assert.equal(responses.filter(r => r.status === 429).length, 15);
assert.equal(sqlite.prepare('SELECT attempts FROM login_attempts').get().attempts, 20);
assert.equal((await call('/api/admin/login', { password: env.ADMIN_PASSWORD })).status, 429);
sqlite.prepare('UPDATE login_attempts SET window_started=0').run();
const login = await call('/api/admin/login', { password: env.ADMIN_PASSWORD });
assert.equal(login.status, 200);
const { token } = await login.json();
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n, 0);

for (const mutate of [
  d => { d.weeks[0].start = '2026-02-30'; },
  d => { d.slots[0].start = '18:00'; d.slots[0].end = '17:00'; },
  d => { d.slots[0].end = d.slots[0].start; },
  d => { d.weeks[1].id = d.weeks[0].id; },
  d => { d.groups[1].id = d.groups[0].id; },
  d => { d.weeks[0].start = '2026-09-22'; },
  d => { d.weeks[0].end = '2026-09-30'; },
  d => { d.weeks.reverse(); },
]) {
  const input = structuredClone(DEFAULT); mutate(input);
  assert.throws(() => normaliseData(input));
}
assert.deepEqual(normaliseData(DEFAULT).weeks, DEFAULT.weeks);
assert.equal((await call('/api/admin/colloscope', DEFAULT, token)).status, 428);
const first = await call('/api/admin/colloscope', { ...DEFAULT, expected_updated_at: null }, token);
assert.equal(first.status, 200);
const version = (await first.json()).updated_at;
const writes = await Promise.all(['A', 'B'].map(title => call('/api/admin/colloscope', { ...DEFAULT, title, expected_updated_at: version }, token)));
assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
assert.equal((await call('/api/admin/colloscope', { ...DEFAULT, title: 'stale', expected_updated_at: null }, token)).status, 409);
assert.notEqual(JSON.parse(sqlite.prepare('SELECT json FROM colloscope_data').get().json).title, 'stale');

// Exercise the real browser refresh function with controlled DOM/network boundaries.
const app = readFileSync(new URL('../front/app.js', import.meta.url), 'utf8');
const refreshCode = app.slice(app.indexOf('let planningRefreshAt = 0;'), app.indexOf('setInterval(refreshPlanning,'));
const remote = structuredClone(DEFAULT); remote.slots[0].room = 'NEW ROOM';
let rendered = 0;
const elements = new Map();
const context = {
  data: structuredClone(DEFAULT), updatedAt: 'old', activeWeek: 2, currentWeek: 1,
  document: { hidden: false }, $: selector => { if (!elements.has(selector)) elements.set(selector, { open: false }); return elements.get(selector); },
  normaliseImportedData: d => structuredClone(d), setAppearance: () => {}, selectedGroup: () => 14,
  resolveCurrentWeek: () => 7, populateGroups: () => {}, initGroupChoice: () => {},
  escapeHtml: s => s, formatDate: () => 'date', render: () => rendered++,
  apiFetch: async () => ({ ok: true, json: async () => ({ data: remote, updated_at: '2026-11-15T12:00:00Z' }) }),
};
const sandbox = vm.createContext(context);
vm.runInContext(refreshCode, sandbox);
await vm.runInContext('refreshPlanning()', sandbox);
assert.equal(context.data.slots[0].room, 'NEW ROOM');
assert.equal(context.updatedAt, '2026-11-15T12:00:00Z');
assert.equal(context.activeWeek, 2);
assert.equal(elements.get('#groupSelect').value, '14');
assert.equal(rendered, 1);
// A request that completes after the admin opens must not change the draft's base.
context.apiFetch = async () => { elements.get('#adminDialog').open = true; return { ok: true, json: async () => ({ data: DEFAULT, updated_at: 'newer' }) }; };
await vm.runInContext('planningRefreshAt=0; refreshPlanning()', sandbox);
assert.equal(context.updatedAt, '2026-11-15T12:00:00Z');
assert.equal(rendered, 1);
console.log('Regression tests passed: concurrent login limits, planning validation, conflicting saves and remote refresh.');
