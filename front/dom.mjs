/**
 * Petits outils de rendu : échapper le texte et conserver les éléments DOM inchangés.
 * Ils servent à préserver le focus et le défilement pendant les rafraîchissements.
 */
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char],
  );

const rendered = new WeakMap();
export function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}
/** Évite de reparcourir et remplacer un bloc dont le HTML et le contenu réel n’ont pas changé. */
export function setHtml(element, html) {
  const previous = rendered.get(element);
  if (previous?.html === html && previous.actual === element.innerHTML) return false;
  element.innerHTML = html;
  rendered.set(element, { html, actual: element.innerHTML });
  return true;
}

const rows = new WeakMap();
/** Réutilise les lignes par item.key, qui doit être unique. renderRow doit produire un seul élément racine. */
export function renderRows(container, items, renderRow) {
  const previous = rows.get(container) || new Map();
  const next = new Map();
  let cursor = container.firstElementChild;
  for (const item of items) {
    const key = item.key;
    const html = renderRow(item);
    let row = previous.get(key);
    if (!row || row.html !== html || row.element.parentNode !== container) {
      const template = container.ownerDocument.createElement("template");
      template.innerHTML = html;
      const element = template.content.firstElementChild;
      if (row?.element === cursor) cursor = cursor.nextElementSibling;
      row?.element.remove();
      row = { html, element };
    }
    if (row.element !== cursor) container.insertBefore(row.element, cursor);
    cursor = row.element.nextElementSibling;
    next.set(key, row);
  }
  const kept = new Set([...next.values()].map((row) => row.element));
  for (const child of [...container.children]) if (!kept.has(child)) child.remove();
  rows.set(container, next);
  return [...next.values()].map((row) => row.element);
}
