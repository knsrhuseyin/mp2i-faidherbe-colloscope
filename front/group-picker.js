/** A shared, accessible group picker: dialog on desktop, sheet on mobile. */
const el = (id) => document.getElementById(id),
  dialog = el("groupDialog");
let groups = [],
  draft = "",
  required = false;
const normal = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function syncGroupLabel() {
  const select = el("groupSelect"),
    group = groups.find((g) => String(g.id) === select.value);
  el("currentGroupLabel").textContent = group?.label || "Choisir";
  el("groupOpen").setAttribute(
    "aria-label",
    group ? `Mon groupe : ${group.label}. Changer de groupe` : "Choisir mon groupe",
  );
  el("reminderGroup").textContent = group?.label || "À choisir";
}
function selection() {
  const selected = groups.find((group) => String(group.id) === draft);
  el("confirmGroup").disabled = !selected;
  el("confirmGroup").textContent = selected ? `Choisir ${selected.label}` : "Choisir ce groupe";
  el("groupSelectionLabel").textContent = selected ? `Groupe ${selected.id}` : "À toi de choisir";
  el("groupMembers").textContent =
    selected?.members_raw ||
    (selected
      ? "Le planning et les rappels suivront ce groupe."
      : "Sélectionne un groupe ci-dessus.");
}
function filter() {
  const query = normal(el("groupSearch").value.trim());
  let count = 0;
  for (const item of el("groupChoices").querySelectorAll("label")) {
    const group = groups.find((g) => String(g.id) === item.dataset.group);
    item.hidden = !normal(`${group.label} groupe ${group.id} ${group.members_raw || ""}`).includes(
      query,
    );
    if (!item.hidden) count++;
  }
  el("groupEmpty").hidden = count > 0;
}
function build() {
  const fieldset = el("groupChoices");
  fieldset.replaceChildren();
  const legend = document.createElement("legend");
  legend.className = "sr-only";
  legend.textContent = "Choisir son groupe";
  fieldset.append(legend);
  for (const group of groups) {
    const label = document.createElement("label");
    label.className = "group-choice";
    label.dataset.group = group.id;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "collo-group";
    input.value = group.id;
    input.checked = String(group.id) === draft;
    const face = document.createElement("span");
    face.textContent = group.label;
    input.setAttribute(
      "aria-label",
      `Groupe ${group.id}${group.members_raw ? " : " + group.members_raw : ""}`,
    );
    label.append(input, face);
    fieldset.append(label);
  }
  selection();
  filter();
}
export function updateGroupPicker(value) {
  groups = value;
  for (const button of document.querySelectorAll("[data-group-open]"))
    button.disabled = !groups.length;
  if (!dialog.open) draft = el("groupSelect").value;
  else if (!groups.some((g) => String(g.id) === draft)) draft = "";
  build();
  syncGroupLabel();
}
export function openGroupPicker(mustChoose = false) {
  if (!groups.length || dialog.open) return;
  required = mustChoose;
  draft = mustChoose ? "" : el("groupSelect").value;
  el("groupClose").hidden = required;
  el("groupSearch").value = "";
  build();
  dialog.showModal();
  for (const button of document.querySelectorAll("[data-group-open]"))
    button.setAttribute("aria-expanded", "true");
  const input = dialog.querySelector("input[type=radio]:checked");
  (
    input ||
    (el("groupClose").hidden && el("groupChoices").querySelector("input")) ||
    el("groupClose")
  ).focus({ preventScroll: true });
}
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-group-open]")) openGroupPicker();
});
el("groupSearch").addEventListener("input", filter);
el("groupChoices").addEventListener("change", (event) => {
  if (event.target.matches("input[type=radio]")) {
    draft = event.target.value;
    selection();
  }
});
el("groupClose").addEventListener("click", () => dialog.close());
dialog.addEventListener("cancel", (event) => {
  if (required) event.preventDefault();
});
dialog.addEventListener("close", () => {
  for (const button of document.querySelectorAll("[data-group-open]"))
    button.setAttribute("aria-expanded", "false");
});
el("confirmGroup").addEventListener("click", () => {
  if (!groups.some((group) => String(group.id) === draft)) return;
  el("groupSelect").value = draft;
  el("groupSelect").dispatchEvent(new Event("change"));
  dialog.close();
});
