/**
 * Modèle du planning : normalisation des imports, dates et colles d’un groupe.
 * Ce module ne lit ni le DOM, ni le réseau, ni le stockage du navigateur.
 */
import { normaliseAppearance } from "./theme-core.mjs";

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const DAY_SLUGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];
const SUBJECTS = {
  mathematiques: { label: "Maths", color: "math" },
  physique: { label: "Physique", color: "phys" },
  anglais: { label: "Anglais", color: "eng" },
  francais: { label: "Français", color: "fr" },
};

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
  return (
    SUBJECTS[subject] || {
      label: subject.charAt(0).toUpperCase() + subject.slice(1),
      color: "other",
    }
  );
}

function normaliseSubject(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["maths", "math", "mathematique", "mathematiques"].includes(text)) return "mathematiques";
  if (["physique", "physics"].includes(text)) return "physique";
  if (["anglais", "english"].includes(text)) return "anglais";
  if (["francais", "french"].includes(text)) return "francais";
  return text.replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "autre";
}

/** Convertit les anciens et nouveaux JSON dans le format du front ; la validation stricte reste côté API. */
function normaliseImportedData(input) {
  if (
    !input ||
    typeof input !== "object" ||
    !Array.isArray(input.weeks) ||
    !Array.isArray(input.slots)
  )
    throw new Error("Ce fichier ne ressemble pas à un colloscope JSON.");
  const weeks = input.weeks.map((week, index) => ({
    id: Number(week.id ?? week.n ?? index + 1),
    label: String(week.label || `S${week.id ?? week.n ?? index + 1}`),
    start: String(week.start || ""),
    end: String(week.end || ""),
  }));
  const groups =
    Array.isArray(input.groups) && input.groups.length
      ? input.groups.map((group) =>
          typeof group === "object"
            ? {
                id: Number(group.id),
                label: String(group.label || `G${group.id}`),
                members_raw: String(group.members_raw || ""),
              }
            : { id: Number(group), label: `G${group}`, members_raw: "" },
        )
      : Array.from({ length: 17 }, (_, index) => ({
          id: index + 1,
          label: `G${index + 1}`,
          members_raw: "",
        }));
  const slots = input.slots.map((slot) => {
    const old = Array.isArray(slot);
    const day = old ? slot[2] : slot.day;
    return {
      subject: normaliseSubject(old ? slot[0] : slot.subject),
      examiner: String(old ? slot[1] : slot.examiner || ""),
      day: Number.isInteger(day)
        ? DAY_SLUGS[day]
        : String(day || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, ""),
      start: String(old ? slot[3] : slot.start || ""),
      end: String(old ? slot[4] : slot.end || ""),
      room: old || !slot.room ? null : String(slot.room),
      group_by_week: (old ? slot[5] : slot.group_by_week || []).map((group) =>
        !group || Number(group) === 0 ? null : Number(group),
      ),
    };
  });
  return {
    appearance: normaliseAppearance(input.appearance),
    schema_version: 1,
    source: String(input.source || "Import JSON"),
    title: String(input.title || "Colloscope"),
    class: String(input.class || "MP2I"),
    semester: Number(input.semester) || 1,
    school_year: String(input.school_year || ""),
    groups,
    weeks,
    slots,
  };
}

/** Choisit la semaine du jour, puis la prochaine, ou la dernière lorsque le semestre est terminé. */
function resolveCurrentWeek(data, today = localKey()) {
  const exact = data.weeks.find((week) => week.start <= today && today <= week.end);
  if (exact) return exact.id;
  const next = data.weeks.find((week) => week.start > today);
  return next ? next.id : data.weeks.at(-1)?.id || null;
}

const sessionCache = new WeakMap();
/** Déplie les affectations par semaine. Le cache suppose que chaque mise à jour fournit un nouvel objet data. */
function sessionsFor(data, group) {
  if (!data || !group) return [];
  let groups = sessionCache.get(data);
  if (!groups) {
    groups = new Map();
    sessionCache.set(data, groups);
  }
  if (groups.has(group)) return groups.get(group);
  const result = [];
  data.slots.forEach((slot, slotIndex) => {
    slot.group_by_week.forEach((slotGroup, index) => {
      if (slotGroup !== group || !data.weeks[index]) return;
      const week = data.weeks[index];
      const dayIndex = DAY_SLUGS.indexOf(slot.day);
      if (dayIndex < 0) return;
      const date = addDays(localDate(week.start), dayIndex);
      result.push({
        key: `${slotIndex}:${week.id}`,
        subject: slot.subject,
        teacher: slot.examiner,
        room: slot.room,
        day: dayIndex,
        start: slot.start,
        end: slot.end,
        week: week.id,
        weekLabel: week.label,
        date,
        startsAt: localDate(localKey(date), slot.start),
        endsAt: localDate(localKey(date), slot.end),
      });
    });
  });
  result.sort((left, right) => left.startsAt - right.startsAt);
  groups.set(group, result);
  return result;
}

export {
  DAY_NAMES,
  DAY_SLUGS,
  localDate,
  localKey,
  addDays,
  formatDate,
  subjectInfo,
  normaliseSubject,
  normaliseImportedData,
  resolveCurrentWeek,
  sessionsFor,
};
