// Shared by the browser and the Worker: one catalogue and one validation contract.
const theme = (id, name, colors, decoration = "none") => ({ id, name, colors, decoration });
const colors = (paper, white, ink, muted, line, lime, accentInk) => ({ paper, white, ink, muted, line, lime, accentInk });
export const THEMES = [
  theme("midnight", "Minuit citron", colors("#0c1112", "#161d1e", "#f1f4ef", "#91a09a", "#2b3532", "#d6f574", "#1c2813")),
  theme("indigo", "Craie & indigo", colors("#f5f6fa", "#ffffff", "#20263d", "#777f96", "#e4e7ef", "#4e58d6", "#ffffff")),
  theme("lavender", "Prune & lavande", colors("#17131e", "#241e2d", "#f5effc", "#a89ab9", "#3a3045", "#cfb1fa", "#2a1744")),
  theme("polar", "Bleu polaire", colors("#edf4f9", "#ffffff", "#142c41", "#6b8598", "#dce8f0", "#1769db", "#ffffff")),
  theme("sand", "Sable & terracotta", colors("#f7f1e8", "#fffcf7", "#42342b", "#958576", "#e8ddd0", "#b95437", "#fff7ee")),
  theme("sage", "Sauge & forêt", colors("#f0f4ef", "#fcfefb", "#203d30", "#7b8e80", "#dde6dc", "#326b50", "#f4fff6")),
  theme("christmas", "Noël", colors("#071d27", "#102c2b", "#fff6e7", "#bccdc4", "#39574f", "#e5c382", "#231a12"), "snow"),
  theme("halloween", "Halloween", colors("#1b1325", "#2a2035", "#fff3e6", "#b5a4c7", "#483551", "#ffa75e", "#341904"), "pumpkins"),
];
export const COLOR_FIELDS = { paper: "Fond", white: "Cartes", ink: "Texte", muted: "Texte secondaire", line: "Bordures", lime: "Accent", accentInk: "Texte sur l’accent" };
export const DEFAULT_APPEARANCE = { default_theme: "midnight", custom_themes: [], periods: [] };
const clone = value => JSON.parse(JSON.stringify(value));
export function catalogue(appearance) { return [...THEMES, ...(appearance?.custom_themes || [])]; }
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
}
export function normaliseAppearance(input = DEFAULT_APPEARANCE) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Apparence invalide");
  const custom = input.custom_themes ?? [];
  const periods = input.periods ?? [];
  if (!Array.isArray(custom) || custom.length > 30 || !Array.isArray(periods) || periods.length > 100) throw new Error("Liste des thèmes ou périodes invalide (30 thèmes et 100 périodes maximum)");
  const ids = new Set(THEMES.map(t => t.id));
  const custom_themes = custom.map(t => {
    if (!t || !/^custom-[a-zA-Z0-9-]{1,70}$/.test(t.id) || ids.has(t.id)) throw new Error("Identifiant de thème invalide ou dupliqué");
    if (typeof t.name !== "string" || !t.name.trim() || t.name.length > 80) throw new Error("Nom de thème invalide (80 caractères maximum)");
    const clean = {};
    for (const key of Object.keys(COLOR_FIELDS)) {
      if (!/^#[0-9a-fA-F]{6}$/.test(t.colors?.[key] || "")) throw new Error("Couleur du thème invalide");
      clean[key] = t.colors[key].toLowerCase();
    }
    if (!["none", "snow", "pumpkins", "flowers", "stars"].includes(t.decoration)) throw new Error("Décoration du thème invalide");
    ids.add(t.id);
    return theme(t.id, t.name.trim(), clean, t.decoration);
  });
  const default_theme = input.default_theme ?? "midnight";
  if (!ids.has(default_theme)) throw new Error("Thème par défaut inconnu");
  const periodIds = new Set();
  const cleanPeriods = periods.map(p => {
    if (!p || typeof p.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) || periodIds.has(p.id)) throw new Error("Identifiant de période invalide ou dupliqué");
    if (!ids.has(p.theme)) throw new Error("Thème de la période inconnu");
    if (!validDate(p.start) || !validDate(p.end) || p.end < p.start) throw new Error("Dates de période invalides : la fin doit suivre le début");
    if (typeof p.enabled !== "boolean") throw new Error("Activation de période invalide");
    periodIds.add(p.id);
    return { id: p.id, theme: p.theme, start: p.start, end: p.end, enabled: p.enabled };
  });
  const enabled = cleanPeriods.filter(p => p.enabled).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < enabled.length; i++) if (enabled[i].start <= enabled[i - 1].end) throw new Error("Deux périodes actives se chevauchent. Modifie les dates ou désactive l’une des périodes.");
  return { default_theme, custom_themes, periods: cleanPeriods };
}
export function parisDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function resolveTheme(appearance, date = parisDate()) {
  const all = catalogue(appearance);
  const period = appearance.periods.find(p => p.enabled && p.start <= date && date <= p.end);
  return clone(all.find(t => t.id === (period?.theme || appearance.default_theme)) || THEMES[0]);
}
