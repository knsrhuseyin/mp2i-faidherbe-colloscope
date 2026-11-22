import { currentPage } from "./navigation.js";
import { createApiClient } from "./api-client.mjs";
const STORAGE = "collo-prepa-sync-read-key-v1",
  labels = { maths: "Mathématiques", physics: "Physique", english: "Anglais" };
const $ = (id) => document.getElementById(id),
  panel = $("documentsPanel");
let key = "",
  rows = [],
  loading = false,
  controller = null,
  epoch = 0,
  active = false,
  view = "folders";
try {
  key = localStorage.getItem(STORAGE) || "";
} catch {}
const api = createApiClient({ baseUrl: window.COLLOSCOPE_CONFIG?.API_URL, tokenFor: () => key });
function text(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}
function status(value, error = false) {
  $("documentsStatus").textContent = value;
  $("documentsStatus").classList.toggle("error", error);
}
function toggle(open) {
  active = open;

  if (!open) {
    controller?.abort();
    epoch++;
    loading = false;
    $("documentsRefresh").disabled = false;
    $("documentsUnlock").disabled = false;
  }
}
function link(url, label) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const a = text("a", label);
    a.href = u.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  } catch {
    return null;
  }
}
function normal(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
function folders() {
  const select = $("documentsFolder"),
    previous = select.value;
  select.replaceChildren();
  const all = text("option", "Tous les dossiers");
  all.value = "all";
  select.append(all);
  const paths = [
    ...new Set(
      rows
        .filter(
          (d) => $("documentsSubject").value === "all" || d.subject === $("documentsSubject").value,
        )
        .map((d) => d.path || ""),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));
  for (const path of paths) {
    const option = text("option", path || "Racine");
    option.value = "path:" + path;
    select.append(option);
  }
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}
function render() {
  const query = normal($("documentsSearch").value.trim()),
    subject = $("documentsSubject").value,
    folder = $("documentsFolder").value;
  const filtered = rows.filter(
    (row) =>
      (subject === "all" || row.subject === subject) &&
      (folder === "all" || folder === "path:" + (row.path || "")) &&
      normal(row.name + " " + row.path + " " + labels[row.subject]).includes(query),
  );
  $("documentsCount").textContent =
    filtered.length + " document" + (filtered.length === 1 ? "" : "s") + " sur " + rows.length;
  const list = $("documentsList");
  list.replaceChildren();
  if (!filtered.length) {
    list.append(
      text(
        "div",
        rows.length
          ? "Aucun document ne correspond à ces filtres."
          : "Aucun document disponible pour le moment.",
        "documents-empty",
      ),
    );
    return;
  }
  const groups = new Map();
  const ordered = filtered.sort(
    view === "recent"
      ? (a, b) =>
          (documentDate(b)?.stamp ?? -Infinity) - (documentDate(a)?.stamp ?? -Infinity) ||
          a.name.localeCompare(b.name, "fr", { numeric: true })
      : (a, b) =>
          (a.path || "").localeCompare(b.path || "", "fr") ||
          a.name.localeCompare(b.name, "fr", { numeric: true }),
  );
  for (const row of ordered) {
    const date = documentDate(row);
    const group =
      view === "recent"
        ? date
          ? new Intl.DateTimeFormat("fr-FR", {
              timeZone: "Europe/Paris",
              dateStyle: "long",
            }).format(date.stamp)
          : "Date non disponible"
        : labels[row.subject] + " · " + (row.path || "Racine");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  for (const [name, items] of groups) {
    const section = text("section", "", "documents-folder");
    section.append(text("h2", name));
    const ul = document.createElement("ul");
    for (const row of items) ul.append(documentRow(row));
    section.append(ul);
    list.append(section);
  }
}
function documentDate(row) {
  for (const [value, label] of [
    [row.published_at, "Publié"],
    [row.detected_at, "Repéré"],
  ]) {
    const stamp = Date.parse(value || "");
    if (Number.isFinite(stamp)) return { stamp, label };
  }
  return null;
}
function documentRow(row) {
  const li = text("li", "", "documents-file"),
    details = document.createElement("div");
  details.append(text("strong", row.name));
  let detail = labels[row.subject];
  if (row.size !== null && Number.isFinite(row.size))
    detail +=
      " · " +
      new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(row.size / 1024) +
      " Ko";
  details.append(text("small", detail));
  if (view === "recent") {
    details.append(text("small", row.path || "Racine", "documents-location"));
    const date = documentDate(row);
    if (date) {
      const time = text(
        "time",
        date.label +
          " le " +
          new Intl.DateTimeFormat("fr-FR", {
            timeZone: "Europe/Paris",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(date.stamp),
      );
      time.dateTime = new Date(date.stamp).toISOString();
      details.append(time);
    }
  }
  const links = text("div", "", "documents-links");
  for (const [url, label] of [
    [row.source_url, "Source"],
    [row.drive_url, "Drive"],
  ]) {
    const a = link(url, label);
    if (a) links.append(a);
  }
  li.append(details, links);
  return li;
}
function selectView(value) {
  view = value;
  document.querySelectorAll("[data-document-view]").forEach((button) => {
    const selected = button.dataset.documentView === view;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) $("documentsList").setAttribute("aria-labelledby", button.id);
  });
  $("documentsViewHelp").hidden = view !== "recent";
  render();
}
const viewTabs = [...document.querySelectorAll("[data-document-view]")];
for (const button of viewTabs) {
  button.addEventListener("click", () => selectView(button.dataset.documentView));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? viewTabs[0]
        : event.key === "End"
          ? viewTabs.at(-1)
          : viewTabs[(viewTabs.indexOf(button) + 1) % viewTabs.length];
    selectView(next.dataset.documentView);
    next.focus();
  });
}

async function load(candidate = key) {
  if (loading || !candidate) return;
  loading = true;
  key = candidate;
  const sequence = ++epoch;
  controller?.abort();
  controller = new AbortController();
  $("documentsRefresh").disabled = true;
  $("documentsUnlock").disabled = true;
  status("Lecture du catalogue Prépa Sync…");
  try {
    const data = await api("/api/documents/catalogue", {
      token: candidate,
      signal: controller.signal,
    });
    if (sequence !== epoch || !active) return;
    if (!Array.isArray(data.documents)) throw new Error("Le catalogue est illisible.");
    rows = data.documents;
    try {
      localStorage.setItem(STORAGE, candidate);
    } catch {
      status("Accès ouvert pour cette session ; la clé ne peut pas être mémorisée.");
    }
    $("documentsKey").value = "";
    $("documentsKeyForm").hidden = true;
    $("documentsLibrary").hidden = false;
    folders();
    render();
    status(
      data.truncated
        ? "Le catalogue est partiel. Consulte Prépa Sync pour les autres documents."
        : data.stale
          ? "Prépa Sync n’a pas donné de nouvelles récemment. Le dernier catalogue disponible est affiché."
          : data.updated_at
            ? "Catalogue actualisé le " +
              new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(data.updated_at),
              ) +
              "."
            : "Catalogue Prépa Sync disponible.",
    );
  } catch (error) {
    if (sequence !== epoch || error.name === "AbortError") return;
    if (error.status === 401) {
      rows = [];
      $("documentsList").replaceChildren();
      $("documentsLibrary").hidden = true;
      $("documentsKeyForm").hidden = false;
      key = "";
      try {
        localStorage.removeItem(STORAGE);
      } catch {}
    }
    status(error.message || "Le catalogue est temporairement indisponible.", true);
  } finally {
    if (sequence === epoch) {
      loading = false;
      $("documentsRefresh").disabled = false;
      $("documentsUnlock").disabled = false;
    }
  }
}
function open() {
  toggle(true);
  if (rows.length) render();
  if (key) load();
}
window.addEventListener("collo-page-change", (event) => {
  if (event.detail.page === "documents") open();
  else toggle(false);
});
$("documentsKeyForm").onsubmit = (event) => {
  event.preventDefault();
  load($("documentsKey").value.trim());
};
$("documentsRefresh").onclick = () => load();
$("documentsSearch").oninput = render;
$("documentsFolder").onchange = render;
$("documentsSubject").onchange = () => {
  folders();
  render();
};
$("documentsForget").onclick = () => {
  controller?.abort();
  epoch++;
  loading = false;
  key = "";
  rows = [];
  $("documentsUnlock").disabled = false;
  $("documentsRefresh").disabled = false;
  try {
    localStorage.removeItem(STORAGE);
  } catch {}
  $("documentsList").replaceChildren();
  $("documentsLibrary").hidden = true;
  $("documentsKeyForm").hidden = false;
  $("documentsKey").value = "";
  status("Accès oublié sur cet appareil.");
};
const fragment = new URLSearchParams(location.hash.slice(1)),
  supplied = fragment.get("documents-key");
if (supplied !== null) {
  history.replaceState(null, "", location.pathname + location.search + "#documents");
  toggle(true);
  if (/^[A-Za-z0-9_-]{43,128}$/.test(supplied)) load(supplied);
  else status("Le lien d’accès est invalide. Rouvre les documents depuis Prépa Sync.", true);
} else if (currentPage() === "documents") open();
