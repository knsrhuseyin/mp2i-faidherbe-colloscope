export const ADMIN_TOKEN_KEY = 'collo-admin-token';
export const DOCUMENT_TOKEN_KEY = 'collo-documents-token';

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function createApiClient({ baseUrl, tokenFor = () => '', fetchImpl = (...args) => fetch(...args), timeout = 15000 }) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const pending = new Map();
  return function request(path, options = {}) {
    if (!base || base.includes('CHANGE-ME')) return Promise.reject(new ApiError('L’adresse du serveur n’est pas configurée.'));
    const { auth = 'none', token = tokenFor(auth), json, signal, deduplicate = true, ...init } = options;
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (token) headers.set('authorization', 'Bearer ' + token);
    if (json !== undefined) headers.set('content-type', 'application/json');
    const method = String(init.method || 'GET').toUpperCase();
    // A caller-owned cancellation must never cancel another consumer's request.
    const key = method === 'GET' && !signal && deduplicate
      ? JSON.stringify([path, [...headers.entries()].sort(), init.cache || 'no-store', init.credentials, init.mode, init.redirect]) : null;
    if (key && pending.has(key)) return pending.get(key);
    const run = (async () => {
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      let expired = false;
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => { expired = true; controller.abort(); }, timeout);
      try {
        const response = await fetchImpl(base + path, {
          cache: 'no-store', ...init, method, headers, signal: controller.signal,
          ...(json === undefined ? {} : { body: JSON.stringify(json) }),
        });
        let payload;
        try { payload = await response.json(); }
        catch { throw new ApiError('Le serveur a renvoyé une réponse illisible. Réessaie.', response.status); }
        if (!response.ok) throw new ApiError(payload?.error || 'Le service est momentanément indisponible. Réessaie.', response.status);
        return payload;
      } catch (error) {
        if (signal?.aborted) throw signal.reason || new DOMException('Requête annulée', 'AbortError');
        if (expired) throw new ApiError('Le serveur met trop de temps à répondre. Réessaie.');
        if (error instanceof ApiError) throw error;
        throw new ApiError('Connexion au serveur impossible. Vérifie ta connexion puis réessaie.');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    })();
    if (key) {
      pending.set(key, run);
      const release = () => { if (pending.get(key) === run) pending.delete(key); };
      run.then(release, release);
    }
    return run;
  };
}

function storedToken(auth) {
  if (auth === 'none') return '';
  try {
    const admin = sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
    return auth === 'documents' ? localStorage.getItem(DOCUMENT_TOKEN_KEY) || admin : admin;
  } catch { return ''; }
}

export const api = createApiClient({
  baseUrl: typeof window === 'undefined' ? '' : window.COLLOSCOPE_CONFIG?.API_URL,
  tokenFor: storedToken,
});
