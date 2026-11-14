import assert from "node:assert/strict";
import { THEMES, DEFAULT_APPEARANCE, normaliseAppearance, resolveTheme, parisDate } from "../front/theme-core.mjs";

assert.equal(THEMES.length, 8);
assert.deepEqual(normaliseAppearance(), DEFAULT_APPEARANCE);
const custom = { ...structuredClone(THEMES[6]), id: "custom-noel", name: "Noël de la classe" };
const appearance = normaliseAppearance({ default_theme: "indigo", custom_themes: [custom], periods: [
  { id: "halloween-2026", theme: "halloween", start: "2026-10-20", end: "2026-11-02", enabled: true },
  { id: "noel-2026", theme: "custom-noel", start: "2026-12-01", end: "2026-12-31", enabled: true },
] });
for (const [date, expected] of [["2026-10-19", "indigo"], ["2026-10-20", "halloween"], ["2026-11-02", "halloween"], ["2026-11-03", "indigo"], ["2026-12-01", "custom-noel"], ["2026-12-31", "custom-noel"], ["2027-01-01", "indigo"]]) assert.equal(resolveTheme(appearance, date).id, expected);
assert.equal(parisDate(new Date("2026-11-30T23:00:00Z")), "2026-12-01");
assert.equal(parisDate(new Date("2026-06-30T22:00:00Z")), "2026-07-01");
const invalid = input => assert.throws(() => normaliseAppearance(input));
let changed = structuredClone(appearance);
changed.periods[0].end = "2026-12-01"; invalid(changed);
changed.periods[0].enabled = false; normaliseAppearance(changed);
for (const date of ["2026-02-30", "2026-13-01", "2026-00-01", "2026-12-32", "2026-1-1", "bad"]) {
  changed = structuredClone(appearance); changed.periods[0].start = date; invalid(changed);
}
changed = structuredClone(appearance); changed.default_theme = "missing"; invalid(changed);
changed = structuredClone(appearance); changed.periods[0].theme = "missing"; invalid(changed);
changed = structuredClone(appearance); changed.periods[0].end = "2026-10-19"; invalid(changed);
changed = structuredClone(appearance); changed.custom_themes[0].colors.lime = "red; background:url(evil)"; invalid(changed);
changed = structuredClone(appearance); changed.custom_themes[0].id = "christmas"; invalid(changed);
changed = structuredClone(appearance); changed.custom_themes.push(custom); invalid(changed);
changed = structuredClone(appearance); changed.periods[0].id = changed.periods[1].id; invalid(changed);
changed = structuredClone(appearance); changed.custom_themes[0].decoration = "<script>"; invalid(changed);
console.log("Tests apparence réussis : palettes, thèmes personnalisés, dates inclusives, Paris, chevauchements et validation.");
