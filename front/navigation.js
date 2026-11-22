/** One page state for desktop, mobile, deep links and browser Back/Forward. */
const pages = { planning: "planningPage", documents: "documentsPanel", rappels: "remindersPage" };
let active;
const fromLocation = () =>
  location.hash.startsWith("#documents-key=")
    ? "documents"
    : Object.hasOwn(pages, location.hash.slice(1))
      ? location.hash.slice(1)
      : "planning";
export const currentPage = () => active;
function apply(page, focus = false) {
  const changed = active !== page;
  active = page;
  document.body.dataset.page = page;
  for (const [name, id] of Object.entries(pages))
    document.getElementById(id).hidden = name !== page;
  for (const button of document.querySelectorAll("button[data-page]")) {
    if (button.dataset.page === page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  document.title = `Collo — ${page === "planning" ? "Planning" : page === "documents" ? "Documents" : "Rappels"} · MP2I`;
  if (changed) {
    window.scrollTo({ top: 0, behavior: "instant" });
    window.dispatchEvent(new CustomEvent("collo-page-change", { detail: { page } }));
    if (focus)
      document.getElementById(pages[page]).querySelector("h1")?.focus({ preventScroll: true });
  }
}
export function navigate(page) {
  if (!Object.hasOwn(pages, page)) return;
  if (active !== page) history.pushState(null, "", "#" + page);
  apply(page, true);
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-page]");
  if (target) navigate(target.dataset.page);
});
window.addEventListener("popstate", () => apply(fromLocation()));
window.addEventListener("hashchange", () => apply(fromLocation()));
apply(fromLocation());
