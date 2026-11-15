/**
 * Affichage et éditeur des thèmes : couleurs CSS, décorations, aperçus et icônes.
 * La validation des thèmes et leur calendrier sont partagés avec le Worker dans theme-core.mjs.
 */
import {
  THEMES,
  COLOR_FIELDS,
  DEFAULT_APPEARANCE,
  catalogue,
  normaliseAppearance,
  resolveTheme,
  parisDate,
} from "./theme-core.mjs";
import { themeIconSvg, themeFaviconSvg } from "./icon-art.mjs";
import { iconPath, ICON_VERSION } from "./manifest-core.mjs";
export { normaliseAppearance };
const $ = (s) => document.querySelector(s);
const copy = (v) => JSON.parse(JSON.stringify(v));
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const CACHE = "collo-appearance-v1";
let current = copy(DEFAULT_APPEARANCE);
let draft,
  editing = null;
let iconKey = "";
function updateIcons(theme) {
  const key = JSON.stringify(theme);
  if (key === iconKey) return;
  iconKey = key;
  const svg = themeIconSvg(theme);
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon)
    favicon.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(themeFaviconSvg(theme));
  const apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (apple) apple.href = new URL(iconPath(theme), document.baseURI).href;
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest)
    manifest.href =
      "./manifest.webmanifest?v=" + ICON_VERSION + "&theme=" + encodeURIComponent(theme.id);
  const brand = document.querySelector(".brand-mark");
  if (brand)
    brand.innerHTML = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="HX1 · 67">`;
}
const symbols = { none: "", snow: "❄", pumpkins: "🎃", flowers: "✿", stars: "✦" };
function dark(colors) {
  const rgb = [1, 3, 5].map((i) => parseInt(colors.paper.slice(i, i + 2), 16) / 255);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 0.45;
}
function paint(element, theme) {
  for (const [key, value] of Object.entries(theme.colors))
    element.style.setProperty("--" + (key === "accentInk" ? "accent-ink" : key), value);
  element.dataset.theme = dark(theme.colors) ? "dark" : "light";
  element.dataset.decoration = theme.decoration;
  element.dataset.season = theme.id === "christmas" ? "christmas" : "";
}
function apply() {
  const theme = resolveTheme(current);
  paint(document.documentElement, theme);
  updateIcons(theme);
  document.documentElement.dataset.decoration = theme.decoration;
  const mark = $("#seasonMark");
  if (mark) mark.textContent = symbols[theme.decoration];
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = theme.colors.paper;
}
export function setAppearance(value) {
  current = normaliseAppearance(value);
  try {
    localStorage.setItem(CACHE, JSON.stringify(current));
  } catch {}
  apply();
}
try {
  current = normaliseAppearance(JSON.parse(localStorage.getItem(CACHE) || "null"));
} catch {}
apply();
setInterval(apply, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) apply();
});

function options(selected) {
  return catalogue(draft)
    .map(
      (t) =>
        `<option value="${escape(t.id)}" ${t.id === selected ? "selected" : ""}>${escape(t.name)}</option>`,
    )
    .join("");
}
function preview(override) {
  const area = $("#appearancePreview");
  try {
    const clean = normaliseAppearance(draft);
    const date = $("#themePreviewDate").value || parisDate();
    const t =
      typeof override === "string"
        ? catalogue(clean).find((t) => t.id === override)
        : resolveTheme(clean, date);
    paint(area, t);
    area.innerHTML = `<div class="preview-top"><b class="preview-brand"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(themeIconSvg(t))}" alt="Icône HX1 · 67">collo<span>.</span></b><span>Groupe 14</span></div><div class="theme-mini-hero"><small>PROCHAINE COLLE ${symbols[t.decoration]}</small><strong>Mathématiques</strong><span>Jeudi · 12:00 — 13:00</span></div><div class="preview-row">Rappels activés <span>✓</span></div><p>${escape(t.name)} · ${typeof override === "string" ? "Thème en cours d’édition" : escape(date)}</p>`;
    $("#appearanceError").textContent = "";
  } catch (error) {
    $("#appearanceError").textContent = error.message;
  }
}
export function renderAppearanceEditor(appearance) {
  draft = appearance;
  if (!draft.custom_themes.some((t) => t.id === editing))
    editing = draft.custom_themes[0]?.id || null;
  const panel = $("#appearancePanel");
  panel.innerHTML = `
    <div class="appearance-heading"><div><h3>L’ambiance de Collo</h3><p>Un style partagé par toute la classe. Les changements sont publiés avec « Enregistrer les modifications ».</p></div><span class="draft-badge">Brouillon</span></div>
    <h4>Palette par défaut</h4><p class="help">Utilisée lorsqu’aucune période n’est active. Clique sur une palette pour la sélectionner.</p>
    <div class="palette-grid">${catalogue(draft)
      .map(
        (t) =>
          `<button type="button" class="palette-choice ${draft.default_theme === t.id ? "selected" : ""}" data-palette="${escape(t.id)}" aria-pressed="${draft.default_theme === t.id}"><img class="palette-icon" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(themeIconSvg(t))}" alt="Icône HX1 · 67"><span class="palette-swatches" aria-hidden="true">${[t.colors.paper, t.colors.white, t.colors.lime, t.colors.ink].map((c) => `<i style="background:${escape(c)}"></i>`).join("")}</span><strong>${escape(t.name)}</strong><small>${symbols[t.decoration] || "◌"} ${draft.default_theme === t.id ? "Palette par défaut" : "Choisir cette palette"}</small></button>`,
      )
      .join("")}</div>
    <div class="theme-columns"><section><h4>Créer tes thèmes</h4><p class="help">Pars d’une palette, choisis tes couleurs et ajoute une décoration.</p><div class="theme-create"><label class="field"><span>Palette de départ</span><select id="themeSource">${options("christmas")}</select></label><button class="secondary" id="createTheme" type="button">+ Créer un thème</button></div><div id="customThemeEditor"></div></section>
    <section class="theme-preview-section"><h4>Aperçu par date</h4><label class="field"><span>Date à simuler</span><input id="themePreviewDate" type="date" value="${parisDate()}"></label><div class="theme-preview" id="appearancePreview" aria-label="Aperçu du thème"></div><p class="help">Cet aperçu ne modifie pas le thème publié.</p></section></div>
    <h4>Périodes programmées</h4><p class="help">Début et fin inclus, à minuit en heure de Paris. Les périodes actives ne peuvent pas se chevaucher. En dehors des périodes, retour automatique à la palette par défaut.</p>
    <div id="themePeriods"></div><button class="secondary" id="addThemePeriod" type="button">+ Ajouter une période</button>
    <p class="form-error" id="appearanceError" role="alert"></p>`;
  panel.querySelectorAll("[data-palette]").forEach(
    (button) =>
      (button.onclick = () => {
        draft.default_theme = button.dataset.palette;
        renderAppearanceEditor(draft);
      }),
  );
  $("#createTheme").onclick = () => {
    if (draft.custom_themes.length >= 30)
      return ($("#appearanceError").textContent = "30 thèmes personnalisés maximum.");
    const source = catalogue(draft).find((t) => t.id === $("#themeSource").value);
    const t = {
      ...copy(source),
      id: "custom-" + crypto.randomUUID(),
      name: "Mon thème " + (draft.custom_themes.length + 1),
    };
    draft.custom_themes.push(t);
    editing = t.id;
    renderAppearanceEditor(draft);
    $("#customThemeName").focus();
  };
  $("#addThemePeriod").onclick = () => {
    if (draft.periods.length >= 100)
      return ($("#appearanceError").textContent = "100 périodes maximum.");
    draft.periods.push({
      id: crypto.randomUUID(),
      theme: editing || "christmas",
      start: "",
      end: "",
      enabled: true,
    });
    renderPeriods();
    $("#themePeriods").lastElementChild.querySelector('input[type="date"]').focus();
  };
  $("#themePreviewDate").onchange = preview;
  renderCustomEditor();
  renderPeriods();
  preview();
}
function renderCustomEditor() {
  const container = $("#customThemeEditor");
  if (!draft.custom_themes.length) {
    container.innerHTML = '<p class="help">Aucun thème personnalisé pour le moment.</p>';
    return;
  }
  const t = draft.custom_themes.find((t) => t.id === editing);
  container.innerHTML = `<label class="field"><span>Thème à modifier</span><select id="customThemeSelect">${draft.custom_themes.map((t) => `<option value="${escape(t.id)}" ${t.id === editing ? "selected" : ""}>${escape(t.name)}</option>`).join("")}</select></label><label class="field"><span>Nom</span><input id="customThemeName" maxlength="80" value="${escape(t.name)}"></label><div class="color-grid">${Object.entries(
    COLOR_FIELDS,
  )
    .map(
      ([key, label]) =>
        `<label class="theme-color"><span>${label}</span><input type="color" data-theme-color="${key}" value="${t.colors[key]}"></label>`,
    )
    .join(
      "",
    )}</div><label class="field"><span>Décoration</span><select id="themeDecoration">${Object.entries(
    {
      none: "Sans décoration",
      snow: "Flocon · Noël / hiver",
      pumpkins: "Citrouille · Halloween",
      flowers: "Fleur · printemps",
      stars: "Étoile · fête",
    },
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${t.decoration === key ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="theme-edit-actions"><button class="secondary" id="useCustomTheme" type="button">Utiliser par défaut</button><button class="secondary danger-text" id="deleteCustomTheme" type="button">Supprimer ce thème</button></div>`;
  $("#customThemeSelect").onchange = (event) => {
    editing = event.target.value;
    renderCustomEditor();
    preview(editing);
  };
  $("#customThemeName").onchange = (event) => {
    t.name = event.target.value;
    renderAppearanceEditor(draft);
  };
  container.querySelectorAll("[data-theme-color]").forEach(
    (input) =>
      (input.oninput = () => {
        t.colors[input.dataset.themeColor] = input.value;
        preview(t.id);
      }),
  );
  $("#themeDecoration").onchange = (event) => {
    t.decoration = event.target.value;
    preview(t.id);
  };
  $("#useCustomTheme").onclick = () => {
    draft.default_theme = t.id;
    renderAppearanceEditor(draft);
  };
  $("#deleteCustomTheme").onclick = () => {
    if (draft.default_theme === t.id || draft.periods.some((p) => p.theme === t.id))
      return ($("#appearanceError").textContent =
        "Choisis une autre palette par défaut et retire les périodes liées avant de supprimer ce thème.");
    draft.custom_themes = draft.custom_themes.filter((item) => item.id !== t.id);
    renderAppearanceEditor(draft);
  };
}
function renderPeriods() {
  $("#themePeriods").innerHTML = draft.periods.length
    ? draft.periods
        .map(
          (p, i) =>
            `<div class="theme-period"><label class="field"><span>Thème</span><select data-period-index="${i}" data-period-field="theme">${options(p.theme)}</select></label><label class="field"><span>Du (inclus)</span><input type="date" data-period-index="${i}" data-period-field="start" value="${escape(p.start)}"></label><label class="field"><span>Au (inclus)</span><input type="date" data-period-index="${i}" data-period-field="end" value="${escape(p.end)}"></label><label class="period-enabled"><input type="checkbox" data-period-index="${i}" data-period-field="enabled" ${p.enabled ? "checked" : ""}> Active</label><button class="secondary danger-text" type="button" data-remove-period="${i}" aria-label="Supprimer la période ${i + 1}">Retirer</button></div>`,
        )
        .join("")
    : '<p class="help">Aucune période. La palette par défaut reste active toute l’année.</p>';
  $("#themePeriods")
    .querySelectorAll("[data-period-field]")
    .forEach(
      (input) =>
        (input.onchange = () => {
          draft.periods[Number(input.dataset.periodIndex)][input.dataset.periodField] =
            input.type === "checkbox" ? input.checked : input.value;
          preview();
        }),
    );
  $("#themePeriods")
    .querySelectorAll("[data-remove-period]")
    .forEach(
      (button) =>
        (button.onclick = () => {
          draft.periods.splice(Number(button.dataset.removePeriod), 1);
          renderPeriods();
          preview();
        }),
    );
}
