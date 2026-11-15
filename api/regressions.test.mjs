import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
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

console.log('Regression tests passed: concurrent login limits, planning validation and conflicting saves.');
