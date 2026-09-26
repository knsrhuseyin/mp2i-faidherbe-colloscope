const GROUP_KEY = "collo-group-v2";
const THEME_KEY = "collo-theme";
const ADMIN_TOKEN_KEY = "collo-admin-token";
const API_BASE = String(window.COLLOSCOPE_CONFIG?.API_URL || "").replace(/\/+$/, "");
const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const DAY_SLUGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];
const SUBJECTS = {
  mathematiques: { label: "Maths", color: "math" },
  physique: { label: "Physique", color: "phys" },
  anglais: { label: "Anglais", color: "eng" },
  francais: { label: "Français", color: "fr" },
};

let data = null;
let updatedAt = null;
let activeWeek = null;
let currentWeek = null;
let activeFilter = "toutes";
let adminDraft = null;
let editingSlot = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));

function apiFetch(path, options = {}) {
  if (!API_BASE || API_BASE.includes("CHANGE-ME")) {
    return Promise.reject(new Error("L’adresse de l’API n’est pas configurée dans config.js"));
  }
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function localDate(date, time = "12:00") {
  const [year, month, day] = String(date).split("-").map(Number);
  const [hour, minute] = String(time).split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function localKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, offset) {
  const result = new Date(date);
  result.setDate(result.getDate() + offset);
  return result;
}

function formatDate(value, options = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("fr-FR", options).format(value).replace(".", "");
}

function subjectInfo(subject) {
  return SUBJECTS[subject] || { label: subject.charAt(0).toUpperCase() + subject.slice(1), color: "other" };
}

function normaliseSubject(value) {
  const text = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["maths", "math", "mathematique", "mathematiques"].includes(text)) return "mathematiques";
  if (["physique", "physics"].includes(text)) return "physique";
  if (["anglais", "english"].includes(text)) return "anglais";
  if (["francais", "french"].includes(text)) return "francais";
  return text.replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "autre";
}

function normaliseImportedData(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.weeks) || !Array.isArray(input.slots)) throw new Error("Ce fichier ne ressemble pas à un colloscope JSON.");
  const weeks = input.weeks.map((week, index) => ({
    id: Number(week.id ?? week.n ?? index + 1),
    label: String(week.label || `S${week.id ?? week.n ?? index + 1}`),
    start: String(week.start || ""),
    end: String(week.end || ""),
  }));
  const groups = Array.isArray(input.groups) && input.groups.length
    ? input.groups.map((group) => typeof group === "object" ? {
        id: Number(group.id), label: String(group.label || `G${group.id}`), members_raw: String(group.members_raw || ""),
      } : { id: Number(group), label: `G${group}`, members_raw: "" })
    : Array.from({ length: 17 }, (_, index) => ({ id: index + 1, label: `G${index + 1}`, members_raw: "" }));
  const slots = input.slots.map((slot) => {
    const old = Array.isArray(slot);
    const day = old ? slot[2] : slot.day;
    return {
      subject: normaliseSubject(old ? slot[0] : slot.subject),
      examiner: String(old ? slot[1] : slot.examiner || ""),
      day: Number.isInteger(day) ? DAY_SLUGS[day] : String(day || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      start: String(old ? slot[3] : slot.start || ""),
      end: String(old ? slot[4] : slot.end || ""),
      room: old || !slot.room ? null : String(slot.room),
      group_by_week: (old ? slot[5] : slot.group_by_week || []).map((group) => !group || Number(group) === 0 ? null : Number(group)),
    };
  });
  return {
    schema_version: 1,
    source: String(input.source || "Import JSON"), title: String(input.title || "Colloscope"),
    class: String(input.class || "MP2I"), semester: Number(input.semester) || 1,
    school_year: String(input.school_year || ""), groups, weeks, slots,
  };
}

function resolveCurrentWeek() {
  const today = localKey();
  const exact = data.weeks.find((week) => week.start <= today && today <= week.end);
  if (exact) return exact.id;
  const next = data.weeks.find((week) => week.start > today);
  return next ? next.id : data.weeks.at(-1)?.id || null;
}

function selectedGroup() {
  return Number($("#groupSelect").value || 0);
}

function sessionsFor(group) {
  if (!data || !group) return [];
  const result = [];
  data.slots.forEach((slot) => {
    slot.group_by_week.forEach((slotGroup, index) => {
      if (slotGroup !== group || !data.weeks[index]) return;
      const week = data.weeks[index];
      const dayIndex = DAY_SLUGS.indexOf(slot.day);
      if (dayIndex < 0) return;
      const date = addDays(localDate(week.start), dayIndex);
      result.push({
        subject: slot.subject, teacher: slot.examiner, room: slot.room, day: dayIndex,
        start: slot.start, end: slot.end, week: week.id, weekLabel: week.label, date,
        startsAt: localDate(localKey(date), slot.start), endsAt: localDate(localKey(date), slot.end),
      });
    });
  });
  return result.sort((left, right) => left.startsAt - right.startsAt);
}

function render() {
  if (!data || !selectedGroup()) return;
  const all = sessionsFor(selectedGroup());
  const now = new Date();
  const upcoming = all.find((session) => session.endsAt >= now);
  renderNext(upcoming);
  renderStats(all.filter((session) => session.endsAt >= now));
  renderFilters();
  renderWeeks();
  const shown = all.filter((session) =>
    (activeWeek === 0 || session.week === activeWeek) &&
    (activeFilter === "toutes" || session.subject === activeFilter));
  renderSessions(shown, now);
}

let renderedDay = localKey();
setInterval(() => {
  if (!data) return;
  const today = localKey();
  if (today !== renderedDay) {
    renderedDay = today;
    currentWeek = resolveCurrentWeek();
    activeWeek = currentWeek;
  }
  render();
}, 60_000);

function renderNext(session) {
  if (!session) {
    $("#nextCard").innerHTML = '<div class="next-subject">Semestre terminé</div><div class="next-meta">Aucune colle restante</div>';
    return;
  }
  const info = subjectInfo(session.subject);
  $("#nextCard").innerHTML = `
    <div class="next-subject">${escapeHtml(info.label)}</div>
    <div class="next-meta">
      <div>${DAY_NAMES[session.day]} ${formatDate(session.date, { day: "numeric", month: "long" })}</div>
      <div class="next-time">${session.start.replace(":", "h")} → ${session.end.replace(":", "h")}</div>
      <div>${escapeHtml(session.teacher)}</div>
      ${session.room ? `<span class="next-badge">Salle ${escapeHtml(session.room)}</span>` : ""}
    </div>`;
}

function renderStats(remaining) {
  const subjects = [...new Set(data.slots.map((slot) => slot.subject))];
  const cards = [{ subject: null, value: remaining.length, label: "colles restantes", color: "var(--lime)" }]
    .concat(subjects.map((subject) => ({
      subject, value: remaining.filter((session) => session.subject === subject).length,
      label: `restantes · ${subjectInfo(subject).label.toLowerCase()}`,
      color: `var(--${subjectInfo(subject).color})`,
    })));
  $("#stats").innerHTML = cards.map((card) => `
    <article class="stat-card"><div><div class="stat-dot" style="background:${card.color}"></div>
    <div class="stat-value">${card.value}</div></div><div class="stat-label">${escapeHtml(card.label)}</div></article>`).join("");
}

function renderFilters() {
  const subjects = [...new Set(data.slots.map((slot) => slot.subject))];
  if (activeFilter !== "toutes" && !subjects.includes(activeFilter)) activeFilter = "toutes";
  $("#filters").innerHTML = [{ key: "toutes", label: "Toutes" }]
    .concat(subjects.map((subject) => ({ key: subject, label: subjectInfo(subject).label })))
    .map((item) => `<button class="filter ${activeFilter === item.key ? "active" : ""}" data-filter="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`).join("");
  $$(".filter").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    render();
  }));
  $("#legend").innerHTML = subjects.map((subject) => {
    const info = subjectInfo(subject);
    return `<span><i style="background:var(--${info.color})"></i>${escapeHtml(info.label)}</span>`;
  }).join("");
}

function renderWeeks() {
  const allButton = `<button class="week-btn ${activeWeek === 0 ? "active" : ""}" data-week="0">Tout<span>S1–S${data.weeks.length}</span></button>`;
  $("#weekStrip").innerHTML = allButton + data.weeks.map((week) => `
    <button class="week-btn ${activeWeek === week.id ? "active" : ""} ${currentWeek === week.id ? "current" : ""}" data-week="${week.id}">
      ${escapeHtml(week.label)}<span>${formatDate(localDate(week.start))}</span>
    </button>`).join("");
  $$(".week-btn").forEach((button) => button.addEventListener("click", () => {
    activeWeek = Number(button.dataset.week);
    render();
  }));
  requestAnimationFrame(() => $(".week-btn.active")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
}

function renderSessions(items, now) {
  const week = data.weeks.find((item) => item.id === activeWeek);
  $("#weekTitle").textContent = activeWeek === 0 ? "Tout le semestre" : `${week?.label || `Semaine ${activeWeek}`} · ${week ? `${formatDate(localDate(week.start), { day: "numeric", month: "long" })} au ${formatDate(localDate(week.end), { day: "numeric", month: "long" })}` : ""}`;
  $("#resultCount").textContent = `${items.length} colle${items.length !== 1 ? "s" : ""}`;
  $("#sessionList").innerHTML = items.length ? items.map((session) => {
    const info = subjectInfo(session.subject);
    return `<article class="session ${session.endsAt < now ? "past" : ""}">
      <div class="session-date">${formatDate(session.date, { day: "2-digit" })}<small>${formatDate(session.date, { month: "short" })}</small></div>
      <div class="bar ${info.color === "other" ? "autre" : session.subject}"></div>
      <div><div class="subject-line">${escapeHtml(info.label)}</div><div class="teacher">${escapeHtml(session.weekLabel)} · ${DAY_NAMES[session.day]} · ${escapeHtml(session.teacher)}${session.room ? ` · Salle ${escapeHtml(session.room)}` : ""}</div></div>
      <div class="session-time">${session.start.replace(":", "h")} — ${session.end.replace(":", "h")}</div>
    </article>`;
  }).join("") : '<div class="empty">Aucune colle avec ces filtres.</div>';
}

function populateGroups() {
  const selected = localStorage.getItem(GROUP_KEY) || $("#groupSelect").value;
  $("#groupSelect").innerHTML = data.groups.map((group) => `<option value="${group.id}">${escapeHtml(group.label)}</option>`).join("");
  $("#welcomeGroup").innerHTML = '<option value="" selected disabled>Choisir un groupe</option>' + data.groups.map((group) => `<option value="${group.id}">${escapeHtml(group.label)}</option>`).join("");
  if (data.groups.some((group) => String(group.id) === String(selected))) $("#groupSelect").value = selected;
}

function updateThemeButton() {
  const dark = document.documentElement.dataset.theme !== "light";
  $("#themeToggle").textContent = dark ? "☀️" : "🌙";
  $("#themeToggle").setAttribute("aria-label", dark ? "Passer au mode clair" : "Passer au mode sombre");
}

function initGroupChoice() {
  const saved = Number(localStorage.getItem(GROUP_KEY));
  if (data.groups.some((group) => group.id === saved)) {
    $("#groupSelect").value = String(saved);
    render();
  } else {
    $("#groupDialog").showModal();
    $("#welcomeGroup").focus();
  }
}

async function loadData() {
  try {
    const response = await apiFetch("/api/colloscope", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Chargement impossible");
    const payload = await response.json();
    data = normaliseImportedData(payload.data);
    updatedAt = payload.updated_at;
    currentWeek = resolveCurrentWeek();
    activeWeek = currentWeek;
    populateGroups();
    $("#scheduleTitle").textContent = data.title || "Mes colles";
    $("#sourceNote").innerHTML = `<b>Source :</b> ${escapeHtml(data.source || data.title || "colloscope MP2I")}`;
    $("#updateNote").textContent = updatedAt ? `Mis à jour le ${formatDate(new Date(updatedAt), { dateStyle: "long", timeStyle: "short" })}` : "Planning public en lecture seule.";
    initGroupChoice();
  } catch (error) {
    $("#siteNotice").classList.remove("hidden");
    $("#siteNotice").textContent = "Impossible de charger le colloscope. Réessaie dans quelques instants.";
    $("#sessionList").innerHTML = '<div class="empty">Le colloscope est temporairement indisponible.</div>';
  }
}

function showLogin() {
  $("#adminLogin").classList.remove("hidden");
  $("#adminApp").classList.add("hidden");
  $("#loginError").textContent = "";
  setTimeout(() => $("#adminPassword").focus(), 50);
}

function showAdminApp() {
  adminDraft = clone(data);
  $("#adminLogin").classList.add("hidden");
  $("#adminApp").classList.remove("hidden");
  $("#saveError").textContent = "";
  renderSlotList();
  renderWeekEditor();
}

async function openAdmin() {
  $("#adminDialog").showModal();
  showLogin();
  try {
    const response = await apiFetch("/api/admin/session");
    const payload = await response.json();
    if (payload.authenticated) showAdminApp();
  } catch { /* Le formulaire de connexion reste utilisable. */ }
}

function closeAdmin() {
  adminDraft = null;
  $("#adminDialog").close();
}

function renderSlotList() {
  if (!adminDraft) return;
  const query = $("#slotSearch").value.trim().toLowerCase();
  const rows = adminDraft.slots.map((slot, index) => ({ slot, index })).filter(({ slot }) =>
    !query || `${subjectInfo(slot.subject).label} ${slot.examiner} ${slot.room || ""}`.toLowerCase().includes(query));
  $("#slotList").innerHTML = rows.length ? rows.map(({ slot, index }) => {
    const info = subjectInfo(slot.subject);
    const assigned = slot.group_by_week.filter(Boolean).length;
    return `<article class="slot-row">
      <div class="slot-color" style="background:var(--${info.color})"></div>
      <div><strong>${escapeHtml(info.label)} · ${escapeHtml(slot.examiner)}</strong><small>${escapeHtml(DAY_NAMES[DAY_SLUGS.indexOf(slot.day)] || slot.day)} · ${escapeHtml(slot.start)}–${escapeHtml(slot.end)}${slot.room ? ` · Salle ${escapeHtml(slot.room)}` : ""}</small></div>
      <div class="slot-count">${assigned}/${adminDraft.weeks.length}<br>semaines</div>
      <button class="slot-edit" data-slot-index="${index}" type="button">Modifier</button>
    </article>`;
  }).join("") : '<div class="empty">Aucun créneau trouvé.</div>';
  $$('[data-slot-index]').forEach((button) => button.addEventListener("click", () => openSlotEditor(Number(button.dataset.slotIndex))));
}

function openSlotEditor(index = null) {
  editingSlot = index;
  const slot = index === null ? {
    subject: "mathematiques", examiner: "", day: "lundi", start: "17:00", end: "18:00", room: null,
    group_by_week: adminDraft.weeks.map(() => null),
  } : clone(adminDraft.slots[index]);
  $("#slotDialogTitle").textContent = index === null ? "Ajouter un créneau" : "Modifier le créneau";
  $("#slotSubject").value = slot.subject;
  $("#slotExaminer").value = slot.examiner;
  $("#slotDay").value = slot.day;
  $("#slotRoom").value = slot.room || "";
  $("#slotStart").value = slot.start;
  $("#slotEnd").value = slot.end;
  $("#allocationGrid").innerHTML = adminDraft.weeks.map((week, weekIndex) => `
    <label class="allocation"><span>${escapeHtml(week.label)}</span><input data-allocation="${weekIndex}" type="number" min="1" max="99" inputmode="numeric" value="${slot.group_by_week[weekIndex] || ""}" placeholder="—"></label>`).join("");
  $("#deleteSlot").classList.toggle("hidden", index === null);
  $("#slotError").textContent = "";
  $("#slotDialog").showModal();
}

function applySlot() {
  const examiner = $("#slotExaminer").value.trim();
  const start = $("#slotStart").value;
  const end = $("#slotEnd").value;
  if (!examiner || !start || !end || end <= start) {
    $("#slotError").textContent = "Vérifie le colleur et les heures du créneau.";
    return;
  }
  const validGroups = new Set(adminDraft.groups.map((group) => group.id));
  const allocation = $$('[data-allocation]').map((input) => input.value === "" ? null : Number(input.value));
  if (allocation.some((group) => group !== null && !validGroups.has(group))) {
    $("#slotError").textContent = "Un groupe indiqué n’existe pas dans ce colloscope.";
    return;
  }
  const slot = {
    subject: normaliseSubject($("#slotSubject").value), examiner, day: $("#slotDay").value,
    start, end, room: $("#slotRoom").value.trim() || null, group_by_week: allocation,
  };
  if (editingSlot === null) adminDraft.slots.push(slot);
  else adminDraft.slots[editingSlot] = slot;
  $("#slotDialog").close();
  renderSlotList();
}

function renderWeekEditor() {
  $("#weekEditor").innerHTML = adminDraft.weeks.map((week, index) => `
    <div class="week-edit-row"><strong>${escapeHtml(week.label)}</strong>
      <label class="field"><span>Début</span><input data-week-start="${index}" type="date" value="${escapeHtml(week.start)}"></label>
      <label class="field"><span>Fin</span><input data-week-end="${index}" type="date" value="${escapeHtml(week.end)}"></label>
    </div>`).join("");
  $$('[data-week-start]').forEach((input) => input.addEventListener("change", () => { adminDraft.weeks[Number(input.dataset.weekStart)].start = input.value; }));
  $$('[data-week-end]').forEach((input) => input.addEventListener("change", () => { adminDraft.weeks[Number(input.dataset.weekEnd)].end = input.value; }));
}

async function saveAdmin() {
  const button = $("#saveAdmin");
  button.disabled = true;
  button.textContent = "Enregistrement…";
  $("#saveError").textContent = "";
  try {
    const response = await apiFetch("/api/admin/colloscope", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(adminDraft),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Enregistrement impossible");
    data = normaliseImportedData(payload.data);
    updatedAt = payload.updated_at;
    currentWeek = resolveCurrentWeek();
    activeWeek = currentWeek;
    populateGroups();
    $("#scheduleTitle").textContent = data.title || "Mes colles";
    $("#sourceNote").innerHTML = `<b>Source :</b> ${escapeHtml(data.source || data.title || "colloscope MP2I")}`;
    $("#updateNote").textContent = `Mis à jour le ${formatDate(new Date(updatedAt), { dateStyle: "long", timeStyle: "short" })}`;
    closeAdmin();
    render();
    $("#siteNotice").classList.remove("hidden");
    $("#siteNotice").textContent = "Le colloscope a bien été mis à jour.";
    setTimeout(() => $("#siteNotice").classList.add("hidden"), 4500);
  } catch (error) {
    $("#saveError").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Enregistrer les modifications";
  }
}

$("#themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeButton();
});
$("#groupSelect").addEventListener("change", () => {
  localStorage.setItem(GROUP_KEY, $("#groupSelect").value);
  activeWeek = currentWeek;
  render();
});
$("#groupDialog").addEventListener("cancel", (event) => event.preventDefault());
$("#confirmGroup").addEventListener("click", () => {
  const group = $("#welcomeGroup").value;
  if (!group) return $("#welcomeGroup").focus();
  $("#groupSelect").value = group;
  localStorage.setItem(GROUP_KEY, group);
  $("#groupDialog").close();
  activeWeek = currentWeek;
  render();
});

$("#adminOpen").addEventListener("click", openAdmin);
$$('[data-admin-close]').forEach((button) => button.addEventListener("click", closeAdmin));
$("#adminDialog").addEventListener("cancel", (event) => { event.preventDefault(); closeAdmin(); });
$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginError").textContent = "";
  try {
    const response = await apiFetch("/api/admin/login", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("#adminPassword").value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Connexion impossible");
    sessionStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
    $("#adminPassword").value = "";
    showAdminApp();
  } catch (error) { $("#loginError").textContent = error.message; }
});
$("#logoutAdmin").addEventListener("click", async () => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  showLogin();
});
$("#slotSearch").addEventListener("input", renderSlotList);
$("#addSlot").addEventListener("click", () => openSlotEditor(null));
$("#applySlot").addEventListener("click", applySlot);
$("#deleteSlot").addEventListener("click", () => {
  if (editingSlot === null || !confirm("Supprimer définitivement ce créneau du brouillon ?")) return;
  adminDraft.slots.splice(editingSlot, 1);
  $("#slotDialog").close();
  renderSlotList();
});
$("#slotForm").addEventListener("submit", (event) => event.preventDefault());
$("#saveAdmin").addEventListener("click", saveAdmin);
$$('[data-admin-tab]').forEach((button) => button.addEventListener("click", () => {
  $$('.admin-tab').forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#slotsPanel").classList.toggle("hidden", button.dataset.adminTab !== "slots");
  $("#weeksPanel").classList.toggle("hidden", button.dataset.adminTab !== "weeks");
}));
$("#jsonFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    adminDraft = normaliseImportedData(JSON.parse(await file.text()));
    renderSlotList();
    renderWeekEditor();
    $("#saveError").textContent = "";
  } catch (error) { $("#saveError").textContent = error.message; }
  event.target.value = "";
});
$("#exportJson").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(adminDraft, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "colloscope.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function registerModelTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const register = (tool) => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch {} };
  register({
    name: "select_group", title: "Choisir un groupe", description: "Sélectionne le groupe de colle mémorisé et actualise le planning.",
    inputSchema: { type: "object", properties: { group: { type: "integer", minimum: 1, maximum: 99 } }, required: ["group"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute({ group }) {
      if (!data.groups.some((item) => item.id === group)) throw new Error("Groupe invalide");
      $("#groupSelect").value = String(group); localStorage.setItem(GROUP_KEY, String(group));
      if ($("#groupDialog").open) $("#groupDialog").close(); activeWeek = currentWeek; render();
      return { group, remaining: sessionsFor(group).filter((session) => session.endsAt >= new Date()).length };
    },
  });
  register({
    name: "read_group_schedule", title: "Lire le planning d’un groupe", description: "Renvoie les colles d’un groupe, avec un filtre facultatif par semaine ou matière.",
    inputSchema: { type: "object", properties: { group: { type: "integer", minimum: 1, maximum: 99 }, week: { type: "integer", minimum: 1, maximum: 99 }, subject: { type: "string" } }, required: ["group"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute({ group, week, subject }) {
      return { group, sessions: sessionsFor(group).filter((session) => (!week || session.week === week) && (!subject || session.subject === normaliseSubject(subject))).map((session) => ({
        week: session.week, date: localKey(session.date), subject: session.subject, start: session.start, end: session.end, examiner: session.teacher, room: session.room,
      })) };
    },
  });
}

updateThemeButton();
loadData().then(registerModelTools);
