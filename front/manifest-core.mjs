import { THEMES, normaliseAppearance, resolveTheme } from './theme-core.mjs';
export const ICON_VERSION = 'hx1-67-v1';
export function iconPath(theme, size = 192) {
  if (THEMES.some(t => t.id === theme.id)) return `icons/themes/${theme.id}-${size}.png?v=${ICON_VERSION}`;
  const query = new URLSearchParams({ size: String(size), decoration: theme.decoration, ...theme.colors, v: ICON_VERSION });
  return 'icons/custom.png?' + query;
}
export function createManifest(theme, origin) {
  return {
    id: origin + '/', name: 'Collo — HX1', short_name: 'Collo HX1', lang: 'fr',
    start_url: origin + '/', scope: origin + '/', display: 'standalone',
    background_color: theme.colors.paper, theme_color: theme.colors.paper,
    icons: [192, 512].map(size => ({ src: new URL(iconPath(theme, size), origin + '/').href, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
  };
}
export async function publishedTheme(env = {}) {
  try {
    const response = await fetch((env.COLLOSCOPE_API_URL || 'https://colloscope-api.huseyinkenesari200819.workers.dev').replace(/\/$/, '') + '/api/colloscope', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Unavailable');
    return resolveTheme(normaliseAppearance((await response.json()).data.appearance));
  } catch { return THEMES[0]; }
}
