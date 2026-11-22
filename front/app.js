/**
 * Planning public : charge les données, mémorise le groupe et orchestre le rendu.
 * Les formulaires d’administration et le calcul des colles vivent dans leurs propres modules.
 */
import "./navigation.js";
import { updateGroupPicker, openGroupPicker, syncGroupLabel } from "./group-picker.js";
import { api } from "./api-client.mjs";
import { $, escapeHtml, setHtml, setText, renderRows } from "./dom.mjs";
import { initAdmin } from "./admin.mjs";
import { setAppearance } from "./appearance.js";
import {
  DAY_NAMES,
  localDate,
  localKey,
  formatDate,
  subjectInfo,
  normaliseSubject,
  normaliseImportedData,
  resolveCurrentWeek,
  sessionsFor,
} from "./planning-model.mjs";
const GROUP_KEY = "collo-group-v2";
let data = null;
let updatedAt = null;
let activeWeek = null;
let currentWeek = null;
let activeFilter = "toutes";

function selectedGroup() {
  return Number($("#groupSelect").value || 0);
}

let renderedGroup = null;
/** Actualise les contrôles après une action ou de nouvelles données ; le timer utilise renderTemporal. */
function render({ centerWeek = false } = {}) {
  if (!data || !selectedGroup()) return;
  syncGroupLabel();
  if (selectedGroup() !== renderedGroup) {
    renderedGroup = selectedGroup();
    window.dispatchEvent(new Event("collo-group-change"));
  }
  renderFilters();
  renderWeeks(centerWeek);
  renderTemporal();
}

/** Actualise uniquement ce qui dépend de l’heure : prochaine colle, compteurs et état passé des lignes. */
function renderTemporal(now = new Date()) {
  if (!data || !selectedGroup()) return;
  const all = sessionsFor(data, selectedGroup());
  const upcoming = all.find((session) => session.endsAt >= now);
  renderNext(upcoming);
  renderStats(all.filter((session) => session.endsAt >= now));
  const shown = all.filter(
    (session) =>
      (activeWeek === 0 || session.week === activeWeek) &&
      (activeFilter === "toutes" || session.subject === activeFilter),
  );
  renderSessions(shown, now);
}

let renderedDay = localKey();
function tickPlanning() {
  if (!data || document.hidden) return;
  const today = localKey();
  if (today !== renderedDay) {
    renderedDay = today;
    const following = activeWeek === currentWeek;
    currentWeek = resolveCurrentWeek(data);
    if (following) activeWeek = currentWeek;
    render();
    return;
  }
  renderTemporal();
}
setInterval(tickPlanning, 60_000);

function renderNext(session) {
  if (!session) {
    setHtml(
      $("#nextCard"),
      '<div class="next-subject">Semestre terminé</div><div class="next-meta">Aucune colle restante</div>',
    );
    return;
  }
  const info = subjectInfo(session.subject);
  setHtml(
    $("#nextCard"),
    `
    <div class="next-subject">${escapeHtml(info.label)}</div>
    <div class="next-meta">
      <div>${DAY_NAMES[session.day]} ${formatDate(session.date, { day: "numeric", month: "long" })}</div>
      <div class="next-time">${session.start.replace(":", "h")} → ${session.end.replace(":", "h")}</div>
      <div>${escapeHtml(session.teacher)}</div>
      ${session.room ? `<span class="next-badge">Salle ${escapeHtml(session.room)}</span>` : ""}
    </div>`,
  );
}

function renderStats(remaining) {
  const subjects = [...new Set(data.slots.map((slot) => slot.subject))];
  const cards = [
    { subject: null, value: remaining.length, label: "colles restantes", color: "var(--lime)" },
  ].concat(
    subjects.map((subject) => ({
      subject,
      value: remaining.filter((session) => session.subject === subject).length,
      label: `restantes · ${subjectInfo(subject).label.toLowerCase()}`,
      color: `var(--${subjectInfo(subject).color})`,
    })),
  );
  renderRows(
    $("#stats"),
    cards.map((card) => ({ ...card, key: card.subject || "total" })),
    (card) => `
    <article class="stat-card"><div><div class="stat-dot" style="background:${card.color}"></div>
    <div class="stat-value">${card.value}</div></div><div class="stat-label">${escapeHtml(card.label)}</div></article>`,
  );
}

function renderFilters() {
  const subjects = [...new Set(data.slots.map((slot) => slot.subject))];
  if (activeFilter !== "toutes" && !subjects.includes(activeFilter)) activeFilter = "toutes";
  const buttons = renderRows(
    $("#filters"),
    [{ key: "toutes", label: "Toutes" }].concat(
      subjects.map((subject) => ({ key: subject, label: subjectInfo(subject).label })),
    ),
    (item) =>
      `<button class="filter" data-filter="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`,
  );
  buttons.forEach((button) =>
    button.classList.toggle("active", activeFilter === button.dataset.filter),
  );
  setHtml(
    $("#legend"),
    subjects
      .map((subject) => {
        const info = subjectInfo(subject);
        return `<span><i style="background:var(--${info.color})"></i>${escapeHtml(info.label)}</span>`;
      })
      .join(""),
  );
}

function renderWeeks(centerWeek = false) {
  const weeks = [
    { key: 0, label: "Tout", caption: `S1–S${data.weeks.length}` },
    ...data.weeks.map((week) => ({
      ...week,
      key: week.id,
      caption: formatDate(localDate(week.start)),
    })),
  ];
  const buttons = renderRows(
    $("#weekStrip"),
    weeks,
    (week) =>
      `<button class="week-btn" data-week="${week.key}">${escapeHtml(week.label)}<span>${escapeHtml(week.caption)}</span></button>`,
  );
  buttons.forEach((button) => {
    button.classList.toggle("active", activeWeek === Number(button.dataset.week));
    button.classList.toggle("current", currentWeek === Number(button.dataset.week));
  });
  if (!centerWeek) return;
  requestAnimationFrame(() => {
    const strip = $("#weekStrip");
    const active = strip.querySelector(".week-btn.active");
    if (!active) return;
    const left =
      active.getBoundingClientRect().left -
      strip.getBoundingClientRect().left +
      strip.scrollLeft -
      (strip.clientWidth - active.clientWidth) / 2;
    // Center the week horizontally without moving the whole page on load.
    strip.scrollTo({ left, behavior: "smooth" });
  });
}

function renderSessions(items, now) {
  const week = data.weeks.find((item) => item.id === activeWeek);
  setText(
    $("#weekTitle"),
    activeWeek === 0
      ? "Tout le semestre"
      : `${week?.label || `Semaine ${activeWeek}`} · ${week ? `${formatDate(localDate(week.start), { day: "numeric", month: "long" })} au ${formatDate(localDate(week.end), { day: "numeric", month: "long" })}` : ""}`,
  );
  setText($("#resultCount"), `${items.length} colle${items.length !== 1 ? "s" : ""}`);
  const elements = renderRows(
    $("#sessionList"),
    items.length ? items : [{ key: "empty", empty: true }],
    (session) => {
      if (session.empty) return '<div class="empty">Aucune colle avec ces filtres.</div>';
      const info = subjectInfo(session.subject);
      return `<article class="session">
      <div class="session-date">${formatDate(session.date, { day: "2-digit" })}<small>${formatDate(session.date, { month: "short" })}</small></div>
      <div class="bar ${info.color === "other" ? "autre" : session.subject}"></div>
      <div><div class="subject-line">${escapeHtml(info.label)}</div><div class="teacher">${escapeHtml(session.weekLabel)} · ${DAY_NAMES[session.day]} · ${escapeHtml(session.teacher)}${session.room ? ` · Salle ${escapeHtml(session.room)}` : ""}</div></div>
      <div class="session-time">${session.start.replace(":", "h")} — ${session.end.replace(":", "h")}</div>
    </article>`;
    },
  );
  elements.forEach((element, index) =>
    element.classList.toggle("past", Boolean(items[index]?.endsAt < now)),
  );
}

function populateGroups() {
  const selected = localStorage.getItem(GROUP_KEY) || $("#groupSelect").value;
  setHtml(
    $("#groupSelect"),
    data.groups
      .map((group) => `<option value="${group.id}">${escapeHtml(group.label)}</option>`)
      .join(""),
  );
  if (data.groups.some((group) => String(group.id) === String(selected)))
    $("#groupSelect").value = selected;
  updateGroupPicker(data.groups);
}

function initGroupChoice() {
  const saved = Number(localStorage.getItem(GROUP_KEY));
  if (data.groups.some((group) => group.id === saved)) {
    $("#groupSelect").value = String(saved);
    render({ centerWeek: true });
  } else {
    openGroupPicker(true);
  }
}

async function loadData() {
  try {
    const payload = await api("/api/colloscope");
    $("#siteNotice").classList.add("hidden");
    data = normaliseImportedData(payload.data);
    setAppearance(data.appearance);
    updatedAt = payload.updated_at;
    currentWeek = resolveCurrentWeek(data);
    activeWeek = currentWeek;
    populateGroups();
    renderMetadata();
    initGroupChoice();
  } catch (error) {
    $("#siteNotice").classList.remove("hidden");
    $("#siteNotice").textContent = error.message;
    $("#sessionList").innerHTML =
      '<div class="empty"><p>Le colloscope est temporairement indisponible.</p><button type="button" class="secondary" id="retryPlanning">Réessayer</button></div>';
    $("#retryPlanning").onclick = loadData;
  }
}

// Delegate clicks once; background updates retain the focused button.
$("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  render();
});
$("#weekStrip").addEventListener("click", (event) => {
  const button = event.target.closest("[data-week]");
  if (!button) return;
  activeWeek = Number(button.dataset.week);
  render({ centerWeek: true });
});

$("#groupSelect").addEventListener("change", () => {
  localStorage.setItem(GROUP_KEY, $("#groupSelect").value);
  activeWeek = currentWeek;
  render({ centerWeek: true });
});

function registerModelTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const register = (tool) => {
    try {
      Promise.resolve(context.registerTool(tool)).catch(() => {});
    } catch {}
  };
  register({
    name: "select_group",
    title: "Choisir un groupe",
    description: "Sélectionne le groupe de colle mémorisé et actualise le planning.",
    inputSchema: {
      type: "object",
      properties: { group: { type: "integer", minimum: 1, maximum: 99 } },
      required: ["group"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute({ group }) {
      if (!data.groups.some((item) => item.id === group)) throw new Error("Groupe invalide");
      $("#groupSelect").value = String(group);
      localStorage.setItem(GROUP_KEY, String(group));
      if ($("#groupDialog").open) $("#groupDialog").close();
      activeWeek = currentWeek;
      render({ centerWeek: true });
      return {
        group,
        remaining: sessionsFor(data, group).filter((session) => session.endsAt >= new Date())
          .length,
      };
    },
  });
  register({
    name: "read_group_schedule",
    title: "Lire le planning d’un groupe",
    description:
      "Renvoie les colles d’un groupe, avec un filtre facultatif par semaine ou matière.",
    inputSchema: {
      type: "object",
      properties: {
        group: { type: "integer", minimum: 1, maximum: 99 },
        week: { type: "integer", minimum: 1, maximum: 99 },
        subject: { type: "string" },
      },
      required: ["group"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute({ group, week, subject }) {
      return {
        group,
        sessions: sessionsFor(data, group)
          .filter(
            (session) =>
              (!week || session.week === week) &&
              (!subject || session.subject === normaliseSubject(subject)),
          )
          .map((session) => ({
            week: session.week,
            date: localKey(session.date),
            subject: session.subject,
            start: session.start,
            end: session.end,
            examiner: session.teacher,
            room: session.room,
          })),
      };
    },
  });
}

loadData().then(registerModelTools);

// Refresh the full planning on return, retaining the selected group and filters.
let planningRefreshAt = 0;
let planningRefreshing = false;
/** Recharge la version publiée sans remplacer la base d’un brouillon administrateur ouvert. */
async function refreshPlanning() {
  if (
    !data ||
    document.hidden ||
    $("#adminDialog").open ||
    planningRefreshing ||
    Date.now() - planningRefreshAt < 60000
  )
    return;
  planningRefreshAt = Date.now();
  planningRefreshing = true;
  const version = updatedAt;
  try {
    const payload = await api("/api/colloscope");
    // A response started before editing/saving must not replace the draft's base.
    if ($("#adminDialog").open || updatedAt !== version) return;
    if (payload.updated_at !== updatedAt) {
      const next = normaliseImportedData(payload.data);
      const group = selectedGroup();
      data = next;
      updatedAt = payload.updated_at;
      currentWeek = resolveCurrentWeek(data);
      if (activeWeek !== 0 && !data.weeks.some((week) => week.id === activeWeek))
        activeWeek = currentWeek;
      populateGroups();
      if (data.groups.some((item) => item.id === group)) $("#groupSelect").value = String(group);
      else initGroupChoice();
      renderMetadata();
      render();
    }
    setAppearance(data.appearance);
  } catch {
    /* Keep the last confirmed planning when the network is unavailable. */
  } finally {
    planningRefreshing = false;
  }
}
setInterval(refreshPlanning, 60000);
document.addEventListener("visibilitychange", () => {
  tickPlanning();
  refreshPlanning();
});

initAdmin({
  getData: () => data,
  getUpdatedAt: () => updatedAt,
  onSaved(payload) {
    data = normaliseImportedData(payload.data);
    updatedAt = payload.updated_at;
    currentWeek = resolveCurrentWeek(data);
    if (activeWeek !== 0 && !data.weeks.some((week) => week.id === activeWeek))
      activeWeek = currentWeek;
    populateGroups();
    renderMetadata();
    setAppearance(data.appearance);
    render();
  },
});

function renderMetadata() {
  $("#scheduleTitle").textContent = data.title || "Mes colles";
  $("#sourceNote").innerHTML =
    `<b>Source :</b> ${escapeHtml(data.source || data.title || "colloscope MP2I")}`;
  $("#updateNote").textContent = updatedAt
    ? `Mis à jour le ${formatDate(new Date(updatedAt), { dateStyle: "long", timeStyle: "short" })}`
    : "Planning public en lecture seule.";
}
