/**
 * Éditeur administrateur : brouillon local, créneaux, semaines et import/export JSON.
 * La publication passe par l’API ; fermer l’éditeur abandonne le brouillon courant.
 */
import { api, ADMIN_TOKEN_KEY } from "./api-client.mjs";
import { $, $$, escapeHtml } from "./dom.mjs";
import {
  DAY_NAMES,
  DAY_SLUGS,
  subjectInfo,
  normaliseSubject,
  normaliseImportedData,
} from "./planning-model.mjs";
import { renderAppearanceEditor, normaliseAppearance } from "./appearance.js";
import { renderDocumentsAdmin } from "./documents.js";

/** Branche les formulaires sur l’état public fourni par app.js, sans partager son objet de données modifiable. */
export function initAdmin({ getData, getUpdatedAt, onSaved }) {
  const clone = (value) => structuredClone(value);
  let adminDraft = null,
    editingSlot = null,
    draftVersion = null;
  function showLogin() {
    $("#adminLogin").classList.remove("hidden");
    $("#adminApp").classList.add("hidden");
    $("#loginError").textContent = "";
    setTimeout(() => $("#adminPassword").focus(), 50);
  }

  function showAdminApp() {
    if (!getData()) throw new Error("Charge le planning avec Réessayer avant de l’administrer.");
    adminDraft = clone(getData());
    draftVersion = getUpdatedAt();
    $("#adminLogin").classList.add("hidden");
    $("#adminApp").classList.remove("hidden");
    $("#saveError").textContent = "";
    renderSlotList();
    renderWeekEditor();
    renderAppearanceEditor(adminDraft.appearance);
    renderDocumentsAdmin();
  }

  async function openAdmin() {
    $("#adminDialog").showModal();
    showLogin();
    try {
      const payload = await api("/api/admin/session", { auth: "admin" });
      if (payload.authenticated) showAdminApp();
    } catch {
      /* Le formulaire de connexion reste utilisable. */
    }
  }

  function closeAdmin() {
    adminDraft = null;
    $("#adminDialog").close();
  }

  function renderSlotList() {
    if (!adminDraft) return;
    const query = $("#slotSearch").value.trim().toLowerCase();
    const rows = adminDraft.slots
      .map((slot, index) => ({ slot, index }))
      .filter(
        ({ slot }) =>
          !query ||
          `${subjectInfo(slot.subject).label} ${slot.examiner} ${slot.room || ""}`
            .toLowerCase()
            .includes(query),
      );
    $("#slotList").innerHTML = rows.length
      ? rows
          .map(({ slot, index }) => {
            const info = subjectInfo(slot.subject);
            const assigned = slot.group_by_week.filter(Boolean).length;
            return `<article class="slot-row">
        <div class="slot-color" style="background:var(--${info.color})"></div>
        <div><strong>${escapeHtml(info.label)} · ${escapeHtml(slot.examiner)}</strong><small>${escapeHtml(DAY_NAMES[DAY_SLUGS.indexOf(slot.day)] || slot.day)} · ${escapeHtml(slot.start)}–${escapeHtml(slot.end)}${slot.room ? ` · Salle ${escapeHtml(slot.room)}` : ""}</small></div>
        <div class="slot-count">${assigned}/${adminDraft.weeks.length}<br>semaines</div>
        <button class="slot-edit" data-slot-index="${index}" type="button">Modifier</button>
      </article>`;
          })
          .join("")
      : '<div class="empty">Aucun créneau trouvé.</div>';
    $$("[data-slot-index]").forEach((button) =>
      button.addEventListener("click", () => openSlotEditor(Number(button.dataset.slotIndex))),
    );
  }

  function openSlotEditor(index = null) {
    editingSlot = index;
    const slot =
      index === null
        ? {
            subject: "mathematiques",
            examiner: "",
            day: "lundi",
            start: "17:00",
            end: "18:00",
            room: null,
            group_by_week: adminDraft.weeks.map(() => null),
          }
        : clone(adminDraft.slots[index]);
    $("#slotDialogTitle").textContent =
      index === null ? "Ajouter un créneau" : "Modifier le créneau";
    $("#slotSubject").value = slot.subject;
    $("#slotExaminer").value = slot.examiner;
    $("#slotDay").value = slot.day;
    $("#slotRoom").value = slot.room || "";
    $("#slotStart").value = slot.start;
    $("#slotEnd").value = slot.end;
    $("#allocationGrid").innerHTML = adminDraft.weeks
      .map(
        (week, weekIndex) => `
      <label class="allocation"><span>${escapeHtml(week.label)}</span><input data-allocation="${weekIndex}" type="number" min="1" max="99" inputmode="numeric" value="${slot.group_by_week[weekIndex] || ""}" placeholder="—"></label>`,
      )
      .join("");
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
    const allocation = $$("[data-allocation]").map((input) =>
      input.value === "" ? null : Number(input.value),
    );
    if (allocation.some((group) => group !== null && !validGroups.has(group))) {
      $("#slotError").textContent = "Un groupe indiqué n’existe pas dans ce colloscope.";
      return;
    }
    const slot = {
      subject: normaliseSubject($("#slotSubject").value),
      examiner,
      day: $("#slotDay").value,
      start,
      end,
      room: $("#slotRoom").value.trim() || null,
      group_by_week: allocation,
    };
    if (editingSlot === null) adminDraft.slots.push(slot);
    else adminDraft.slots[editingSlot] = slot;
    $("#slotDialog").close();
    renderSlotList();
  }

  function renderWeekEditor() {
    $("#weekEditor").innerHTML = adminDraft.weeks
      .map(
        (week, index) => `
      <div class="week-edit-row"><strong>${escapeHtml(week.label)}</strong>
        <label class="field"><span>Début</span><input data-week-start="${index}" type="date" value="${escapeHtml(week.start)}"></label>
        <label class="field"><span>Fin</span><input data-week-end="${index}" type="date" value="${escapeHtml(week.end)}"></label>
      </div>`,
      )
      .join("");
    $$("[data-week-start]").forEach((input) =>
      input.addEventListener("change", () => {
        adminDraft.weeks[Number(input.dataset.weekStart)].start = input.value;
      }),
    );
    $$("[data-week-end]").forEach((input) =>
      input.addEventListener("change", () => {
        adminDraft.weeks[Number(input.dataset.weekEnd)].end = input.value;
      }),
    );
  }

  async function saveAdmin() {
    const button = $("#saveAdmin");
    button.disabled = true;
    button.textContent = "Enregistrement…";
    $("#saveError").textContent = "";
    try {
      adminDraft.appearance = normaliseAppearance(adminDraft.appearance);
      const payload = await api("/api/admin/colloscope", {
        auth: "admin",
        method: "POST",
        json: { ...adminDraft, expected_updated_at: draftVersion },
      });
      closeAdmin();
      onSaved(payload);
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

  $("#adminOpen").addEventListener("click", openAdmin);
  $$("[data-admin-close]").forEach((button) => button.addEventListener("click", closeAdmin));
  $("#adminDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAdmin();
  });
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#loginError").textContent = "";
    try {
      const payload = await api("/api/admin/login", {
        method: "POST",
        json: { password: $("#adminPassword").value },
      });
      sessionStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
      $("#adminPassword").value = "";
      showAdminApp();
    } catch (error) {
      $("#loginError").textContent = error.message;
    }
  });
  $("#logoutAdmin").addEventListener("click", async () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    showLogin();
  });
  $("#slotSearch").addEventListener("input", renderSlotList);
  $("#addSlot").addEventListener("click", () => openSlotEditor(null));
  $("#applySlot").addEventListener("click", applySlot);
  $("#deleteSlot").addEventListener("click", () => {
    if (editingSlot === null || !confirm("Supprimer définitivement ce créneau du brouillon ?"))
      return;
    adminDraft.slots.splice(editingSlot, 1);
    $("#slotDialog").close();
    renderSlotList();
  });
  $("#slotForm").addEventListener("submit", (event) => event.preventDefault());
  $("#saveAdmin").addEventListener("click", saveAdmin);
  $$("[data-admin-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      $$(".admin-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      $("#slotsPanel").classList.toggle("hidden", button.dataset.adminTab !== "slots");
      $("#weeksPanel").classList.toggle("hidden", button.dataset.adminTab !== "weeks");
      $("#appearancePanel").classList.toggle("hidden", button.dataset.adminTab !== "appearance");
      $("#documentsAdminPanel").classList.toggle("hidden", button.dataset.adminTab !== "documents");
      $("#saveAdmin").hidden = button.dataset.adminTab === "documents";
    }),
  );
  $("#jsonFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (imported.appearance === undefined) imported.appearance = adminDraft.appearance;
      adminDraft = normaliseImportedData(imported);
      renderSlotList();
      renderWeekEditor();
      renderAppearanceEditor(adminDraft.appearance);
      $("#saveError").textContent = "";
    } catch (error) {
      $("#saveError").textContent = error.message;
    }
    event.target.value = "";
  });
  $("#exportJson").addEventListener("click", () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(adminDraft, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "colloscope.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
