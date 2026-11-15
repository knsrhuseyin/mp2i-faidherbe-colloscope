import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '../front/api-client.mjs';

const calls = [];
const client = createApiClient({
  baseUrl: 'https://test.invalid/', tokenFor: auth => auth === 'admin' ? 'admin-token' : '',
  fetchImpl: async (url, options) => { calls.push({ url, options }); await new Promise(resolve => setTimeout(resolve, 2)); return Response.json({ ok: true }); },
});
await Promise.all([client('/items'), client('/items')]);
assert.equal(calls.length, 1, 'Concurrent identical reads share one request');
await client('/items');
assert.equal(calls.length, 2, 'A later read fetches fresh data');
await Promise.all([client('/items'), client('/items', { auth: 'admin' })]);
assert.equal(calls.length, 4, 'Different sessions never share a response');
assert.equal(calls[3].options.headers.get('authorization'), 'Bearer admin-token');
await Promise.all([client('/save', { method: 'POST', json: { title: 'a' } }), client('/save', { method: 'POST', json: { title: 'a' } })]);
assert.equal(calls.length, 6, 'Writes are not coalesced or retried');
assert.equal(calls[5].options.body, '{"title":"a"}');
assert.equal(calls[5].options.headers.get('content-type'), 'application/json');

const cancellable = createApiClient({ baseUrl: 'https://test.invalid', timeout: 100,
  fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    setTimeout(() => resolve(Response.json({ ok: true })), 5);
  }),
});
const controller = new AbortController();
const cancelled = cancellable('/search', { signal: controller.signal });
const independent = cancellable('/search');
controller.abort();
await assert.rejects(cancelled, { name: 'AbortError' });
assert.deepEqual(await independent, { ok: true });

const timeout = createApiClient({ baseUrl: 'https://test.invalid', timeout: 2,
  fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
});
await assert.rejects(timeout('/slow'), error => error instanceof ApiError && /trop de temps/.test(error.message));
for (const [response, status, message] of [
  [Response.json({ error: 'Session expirée' }, { status: 401 }), 401, /Session expirée/],
  [new Response('<html>external details</html>', { status: 502 }), 502, /réponse illisible/],
]) {
  const failing = createApiClient({ baseUrl: 'https://test.invalid', fetchImpl: async () => response });
  await assert.rejects(failing('/items'), error => error.status === status && message.test(error.message) && !error.message.includes('external details'));
}
console.log('API client tests passed: coalesced reads, session isolation, writes, cancellation, timeout and errors.');
