/**
 * Route Cloudflare Pages du manifeste d’installation, adapté au thème publié.
 */
import { publishedTheme, createManifest } from "../manifest-core.mjs";
export async function onRequestGet({ request, env }) {
  const theme = await publishedTheme(env);
  return new Response(JSON.stringify(createManifest(theme, new URL(request.url).origin)), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
