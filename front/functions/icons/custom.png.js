/**
 * Route Cloudflare Pages qui valide une palette et renvoie son icône PNG personnalisée.
 */
import { normaliseAppearance } from "../../theme-core.mjs";
import { customIconPng } from "../../icon-png.mjs";
export async function onRequestGet({ request }) {
  const url = new URL(request.url),
    q = url.searchParams;
  const size = Number(q.get("size"));
  if (url.search.length > 2048 || ![192, 512].includes(size))
    return new Response("Invalid icon", { status: 400 });
  try {
    const colors = Object.fromEntries(
      ["paper", "white", "ink", "muted", "line", "lime", "accentInk"].map((key) => [
        key,
        q.get(key),
      ]),
    );
    const theme = normaliseAppearance({
      default_theme: "custom-rendered",
      custom_themes: [
        { id: "custom-rendered", name: "HX1", colors, decoration: q.get("decoration") },
      ],
      periods: [],
    }).custom_themes[0];
    return new Response(await customIconPng(theme, size), {
      headers: {
        "content-type": "image/png",
        "cache-control": "public,max-age=31536000,immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Invalid icon", { status: 400 });
  }
}
