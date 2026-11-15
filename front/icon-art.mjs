/**
 * Dessins vectoriels HX1/67 : icônes de l’application et favicons des thèmes.
 * Les fonctions retournent du SVG ; elles ne modifient pas directement la page.
 */
// Self-contained SVG artwork; no remote fonts, images or user-supplied markup.
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const text = (value, x, y, size, color, family = "Arial,sans-serif") =>
  `<text class="${value === "67" ? "icon-reference" : "icon-monogram"}" x="${x}" y="${y}" text-anchor="middle" font-family="${family}" font-size="${size}" font-weight="900" letter-spacing="-4" fill="${color}">${value}</text>`;
export function themeIconSvg(theme) {
  const c = theme.colors;
  const bg = c.paper,
    accent = c.lime,
    ink = c.accentInk;
  let art;
  switch (theme.id) {
    case "sage":
      art = `<rect width="256" height="256" fill="${accent}"/><path d="M128 29q48 23 81 18v87q-3 52-81 95-78-43-81-95V47q33 5 81-18z" fill="${c.white}"/><path d="M128 45q42 20 65 16v73q0 41-65 77-65-36-65-77V61q23 4 65-16z" stroke="${accent}" stroke-width="3"/>${text("HX1", 126, 142, 69, accent, "Georgia,serif")}<path d="m128 162 4 10 11 1-8 7 2 11-9-6-10 6 3-11-8-7 11-1z" fill="#b69959"/>`;
      break;
    case "indigo":
      art = `<rect width="256" height="256" fill="${accent}"/><rect x="33" y="48" width="190" height="170" rx="25" fill="${c.white}"/><path d="M33 96h190" stroke="${c.line}" stroke-width="3"/><path d="M75 36v29m106-29v29" stroke="#c9c8ff" stroke-width="13" stroke-linecap="round"/>${text("HX1", 126, 171, 73, accent)}<path d="M105 189h46" stroke="#b9b7e8" stroke-width="5" stroke-linecap="round"/>`;
      break;
    case "polar":
      art = `<rect width="256" height="256" fill="${accent}"/><path d="M43 64v126m62-126v126M43 125h62M128 67l78 120m0-120-78 120" stroke="#f5f8ff" stroke-width="20"/><rect x="168" y="157" width="65" height="64" rx="14" fill="#112c6a"/>${text("1", 198, 208, 53, "#d8ee90")}`;
      break;
    case "sand":
      art = `<rect width="256" height="256" fill="${accent}"/><rect x="48" y="31" width="165" height="194" rx="16" fill="${c.white}"/><path d="M73 31v194" stroke="${c.line}" stroke-width="3"/><path d="M42 65h17M42 103h17M42 141h17M42 179h17" stroke="${c.ink}" stroke-width="8" stroke-linecap="round"/><path d="m173 31 40 40h-24q-16 0-16-16z" fill="${c.line}"/>${text("HX1", 139, 147, 58, accent)}<path d="M105 174h66m-66 14h43" stroke="#d1b393" stroke-width="5" stroke-linecap="round"/>`;
      break;
    case "lavender":
      art = `<rect width="256" height="256" fill="${bg}"/><ellipse cx="128" cy="128" rx="103" ry="49" transform="rotate(-32 128 128)" stroke="#75628e" stroke-width="3"/><ellipse cx="128" cy="128" rx="103" ry="49" transform="rotate(32 128 128)" stroke="#75628e" stroke-width="3"/><rect x="35" y="89" width="187" height="77" rx="19" fill="${bg}"/>${text("HX1", 124, 155, 79, accent)}<circle cx="211" cy="75" r="8" fill="#e4cd8c"/><circle cx="45" cy="181" r="5" fill="${accent}"/>`;
      break;
    case "christmas":
      art = `<rect width="256" height="256" fill="#0c302c"/><path d="M0 217q88-22 159 0t97-6v45H0z" fill="#eae4cc"/><path d="m35 171 22-37 23 37H69l19 34H27l19-34z" fill="#568161"/><path d="m35 171 22-37 9 16-10-4-11 25z" fill="#f2eddc"/><circle cx="208" cy="49" r="3" fill="#ecd39a"/><path d="M198 74h22m-11-11v22m-7-18 14 14m-14 0 14-14" stroke="#f9f3df" stroke-width="3"/><path d="m53 79 34-39q24-24 60 23L99 64z" fill="#bf3944"/><path d="m49 77 65-12" stroke="#fff3df" stroke-width="13" stroke-linecap="round"/><circle cx="149" cy="65" r="12" fill="#fff3df"/>${text("HX1", 126, 157, 84, "#f4d38f")}<path d="M47 179q76 21 160-3" stroke="#bd4550" stroke-width="3"/><g fill="#f0d994"><circle cx="67" cy="183" r="4"/><circle cx="104" cy="188" r="4"/><circle cx="143" cy="186" r="4"/><circle cx="181" cy="181" r="4"/></g>`;
      break;
    case "halloween":
      art = `<rect width="256" height="256" fill="${bg}"/><path d="m59 91 52-65 49 65z" fill="#6b478b"/><path d="m69 79 79-1" stroke="${accent}" stroke-width="8"/><ellipse cx="108" cy="93" rx="74" ry="9" fill="#8c60ac"/>${text("HX1", 125, 168, 84, accent)}<path d="M37 199q0-22 20-22t20 22q0 21-20 21t-20-21" fill="#d88642"/><path d="m54 177 7-9" stroke="#749561" stroke-width="5"/><path d="m45 194 6-4 3 7m7-7 7 5-8 2m-10 10q8 4 15-1" stroke="#412339" stroke-width="3"/>`;
      break;
    default:
      art = `<rect width="256" height="256" fill="${bg}"/><path d="M35 56h25M35 56v25M221 175v25h-25" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>${text("HX1", 126, 159, 87, accent)}`;
      if (theme.decoration === "snow")
        art += `<path d="M180 49h28m-14-14v28m-9-23 18 18m-18 0 18-18" stroke="${accent}" stroke-width="3"/>`;
      if (theme.decoration === "pumpkins")
        art += `<ellipse cx="192" cy="52" rx="17" ry="14" fill="${accent}"/><path d="m190 36 6-7" stroke="${c.ink}" stroke-width="4"/>`;
      if (theme.decoration === "flowers" || theme.decoration === "stars")
        art += `<path d="m191 32 5 13 14 1-11 9 3 14-11-7-12 7 3-14-10-9 13-1z" fill="${accent}"/>`;
  }
  // A discreet class reference that remains clear at app-icon sizes.
  art += `<rect x="176" y="213" width="49" height="29" rx="9" fill="${theme.id === "christmas" ? "#a72e38" : accent}"/>${text("67", 199, 234, 22, theme.id === "christmas" ? "#fff3df" : ink)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="512" height="512" fill="none"><title>HX1 · 67 · ${escape(theme.name)}</title>${art}</svg>`;
}

// Browser tabs need a transparent canvas, unlike installed-app icons.
// Adjust floating lettering for the browser's light/dark appearance as well.
function tabInk(hex, dark) {
  const initial = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (rgb) =>
    rgb
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const background = dark ? luminance([41, 42, 45]) : 1;
  let color = initial;
  for (let i = 0; i <= 20; i++) {
    color = initial.map((v) => Math.round(v + (((dark ? 255 : 0) - v) * i) / 20));
    const l = luminance(color);
    if ((Math.max(l, background) + 0.05) / (Math.min(l, background) + 0.05) >= 4.5) break;
  }
  return "#" + color.map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function themeFaviconSvg(theme) {
  let svg = themeIconSvg(theme).replace(
    /<rect width="256" height="256" fill="#[0-9a-fA-F]{6}"\/>/,
    "",
  );
  if (theme.id === "lavender")
    svg = svg.replace(
      /<rect x="35" y="89" width="187" height="77" rx="19" fill="#[0-9a-fA-F]{6}"\/>/,
      "",
    );
  if (theme.id === "christmas") svg = svg.replace(/<path d="M0 217[^"]*" fill="#eae4cc"\/>/, "");
  let styles = "";
  if (!["sage", "sand", "indigo", "polar"].includes(theme.id)) {
    styles = `.icon-monogram{fill:${tabInk(theme.colors.lime, false)}}@media(prefers-color-scheme:dark){.icon-monogram{fill:${tabInk(theme.colors.lime, true)}}}`;
  }
  if (theme.id === "polar") {
    svg = svg.replace(
      'stroke="#f5f8ff" stroke-width="20"',
      'class="icon-electric" stroke="#f5f8ff" stroke-width="20"',
    );
    styles = `.icon-electric{stroke:${tabInk(theme.colors.lime, false)}}@media(prefers-color-scheme:dark){.icon-electric{stroke:#f5f8ff}}`;
  }
  return svg.replace("<title>", `<style>${styles}</style><title>`);
}
