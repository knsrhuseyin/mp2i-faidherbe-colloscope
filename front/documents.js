/**
 * Espace Documents : connexion de classe, recherche, dossiers, pagination et réglages admin.
 * Les fichiers restent chez leurs fournisseurs ; cet écran affiche un catalogue de liens.
 */
import { api, DOCUMENT_TOKEN_KEY as KEY } from "./api-client.mjs";
import { $, escapeHtml as escape } from "./dom.mjs";
let source = "",
  parent = "",
  offset = 0,
  query = "",
  sources = [],
  sequence = 0;
let libraryController, openingController;
/** Annule la lecture précédente et invalide aussi une réponse qui arriverait malgré l’annulation. */
function cancelLibrary() {
  sequence++;
  libraryController?.abort();
  $("#documentsItems").setAttribute("aria-busy", "false");
}
function request(path, options = {}, admin = false) {
  return api(path, { ...options, auth: admin ? "admin" : "documents" });
}
function loginView(message = "") {
  cancelLibrary();
  $("#documentsLogin").hidden = false;
  $("#documentsLibrary").hidden = true;
  $("#documentLoginError").textContent = message;
  $("#documentsItems").replaceChildren();
  $("#documentBreadcrumbs").replaceChildren();
  $("#documentSubjects").replaceChildren();
  $("#documentSourceState").textContent = "";
  $("#documentOriginalSource").href = "#";
  $("#documentSearch").value = "";
  source = "";
  parent = "";
  offset = 0;
  query = "";
  sources = [];
  sequence++;
}
function date(value) {
  if (!value) return "En attente de synchronisation";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
function size(value) {
  if (!value) return "";
  return value >= 1e6
    ? (value / 1e6).toFixed(1) + " Mo"
    : Math.max(1, Math.round(value / 1e3)) + " ko";
}
function kind(item) {
  if (item.kind === "folder") return "DOSSIER";
  if (item.mime.includes("pdf")) return "PDF";
  if (item.mime.startsWith("audio")) return "AUDIO";
  if (item.mime.startsWith("video")) return "VIDÉO";
  if (item.mime.startsWith("image")) return "IMAGE";
  return item.name.includes(".")
    ? item.name.split(".").at(-1).toUpperCase().slice(0, 7)
    : "FICHIER";
}
function sourceTabs() {
  $("#documentSubjects").innerHTML =
    `<button class="filter ${!source ? "active" : ""}" data-document-source="" type="button">Récents</button>` +
    sources
      .map(
        (s) =>
          `<button class="filter ${source === s.id ? "active" : ""}" type="button" data-document-source="${s.id}">${escape(s.label)}</button>`,
      )
      .join("");
  $("#documentSubjects")
    .querySelectorAll("button")
    .forEach(
      (button) =>
        (button.onclick = () => {
          source = button.dataset.documentSource;
          parent = "";
          offset = 0;
          query = "";
          $("#documentSearch").value = "";
          sourceTabs();
          loadItems();
        }),
    );
}
/** Charge la sélection courante ; seule la dernière requête peut modifier les résultats affichés. */
async function loadItems() {
  cancelLibrary();
  const current = sequence;
  const controller = (libraryController = new AbortController());
  const params = new URLSearchParams({ source, parent, q: query, offset: String(offset) });
  $("#documentsItems").setAttribute("aria-busy", "true");
  $("#documentSourceState").textContent = "Chargement des documents…";
  $("#documentPrevious").disabled = $("#documentNext").disabled = true;
  try {
    const result = await request("/api/documents/items?" + params, { signal: controller.signal });
    if (current !== sequence) return;
    const selected = sources.find((s) => s.id === source);
    $("#documentSourceState").textContent = selected
      ? `${selected.label} · ${selected.item_count} fichiers · ${date(selected.synced_at)}${selected.error ? " · Synchronisation indisponible, dernier catalogue conservé." : ""}`
      : "Ajouts détectés par Collo, puis dates d’origine disponibles. Les dates inconnues sont classées à la fin.";
    const original = $("#documentOriginalSource");
    original.hidden = !selected;
    if (selected) {
      original.href = selected.url;
      original.textContent = "Ouvrir la source";
    }
    $("#documentBreadcrumbs").innerHTML = source
      ? `<button type="button" data-document-folder="">${escape(selected?.label || source)}</button>` +
        (result.breadcrumbs || [])
          .map(
            (c) =>
              `<span aria-hidden="true">/</span><button type="button" data-document-folder="${escape(c.id)}">${escape(c.name)}</button>`,
          )
          .join("")
      : "";
    $("#documentBreadcrumbs")
      .querySelectorAll("button")
      .forEach(
        (button) =>
          (button.onclick = () => {
            parent = button.dataset.documentFolder;
            offset = 0;
            query = "";
            $("#documentSearch").value = "";
            loadItems();
          }),
      );
    $("#documentsItems").innerHTML = result.items.length
      ? result.items
          .map((item) => {
            const privateArchive =
              item.source_id === "maths" &&
              new URL(item.url).hostname === "drive.google.com" &&
              item.kind === "file";
            const meta = [
              !source ? sources.find((s) => s.id === item.source_id)?.label : "",
              query ? item.path : "",
              size(item.size),
              item.recent_at
                ? ({
                    detected: "Ajout détecté le ",
                    published: "Publié le ",
                    modified: "Modifié le ",
                  }[item.date_kind] || "") +
                  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(
                    new Date(item.recent_at),
                  )
                : "Date de publication inconnue",
            ]
              .filter(Boolean)
              .map(escape)
              .join(" · ");
            const content = `<span class="document-type">${escape(kind(item))}</span><span class="document-label"><strong>${escape(item.name)}</strong><small>${meta || "Document de la classe"}</small>${privateArchive ? '<small class="document-note">Archive Drive privée : compte autorisé requis.</small>' : ""}</span><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${item.kind === "folder" ? "m9 5 7 7-7 7" : "M7 17 17 7M7 7h10v10"}"/></svg></span>`;
            return item.kind === "folder"
              ? `<button class="document-row" type="button" data-document-child="${escape(item.id)}" data-document-subject="${item.source_id}">${content}</button>`
              : `<a class="document-row" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
          })
          .join("")
      : '<p class="empty">' +
        (query
          ? "Aucun fichier trouvé."
          : selected && !selected.synced_at
            ? "Le premier catalogue de cette matière est en préparation. Tu peux déjà ouvrir sa source."
            : "Aucun document dans ce dossier.") +
        "</p>";
    $("#documentsItems")
      .querySelectorAll("[data-document-child]")
      .forEach(
        (button) =>
          (button.onclick = () => {
            source = button.dataset.documentSubject;
            parent = button.dataset.documentChild;
            offset = 0;
            query = "";
            $("#documentSearch").value = "";
            sourceTabs();
            loadItems();
          }),
      );
    $("#documentPageInfo").textContent = result.total
      ? `${offset + 1}–${Math.min(offset + 50, result.total)} sur ${result.total}`
      : "0 fichier";
    $("#documentPrevious").disabled = offset === 0;
    $("#documentNext").disabled = offset + 50 >= result.total;
  } catch (error) {
    if (current !== sequence || controller.signal.aborted) return;
    if (error.status === 401) {
      localStorage.removeItem(KEY);
      return loginView("Ta session a expiré ou le mot de passe a changé.");
    }
    $("#documentsItems").innerHTML =
      '<div class="empty"><p>' +
      escape(error.message) +
      '</p><button type="button" class="secondary" id="retryDocuments">Réessayer</button></div>';
    $("#retryDocuments").onclick = loadItems;
  } finally {
    if (current === sequence) $("#documentsItems").setAttribute("aria-busy", "false");
  }
}
/** Vérifie la session avant de charger les sources et le catalogue privé. */
async function openDocuments() {
  openingController?.abort();
  const controller = (openingController = new AbortController());
  if (!$("#documentsDialog").open) $("#documentsDialog").showModal();
  try {
    const session = await request("/api/documents/session", { signal: controller.signal });
    if (!session.authenticated) return loginView();
    sources = (await request("/api/documents/sources", { signal: controller.signal })).sources;
    if (controller.signal.aborted || !$("#documentsDialog").open) return;
    $("#documentsLogin").hidden = true;
    $("#documentsLibrary").hidden = false;
    sourceTabs();
    await loadItems();
  } catch (error) {
    if (!controller.signal.aborted) loginView(error.message);
  }
}
$("#documentsOpen").onclick = openDocuments;
$("#mobileDocuments").onclick = openDocuments;
$("#documentsClose").onclick = () => $("#documentsDialog").close();
$("#documentLoginForm").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("#documentLoginButton");
  button.disabled = true;
  $("#documentLoginError").textContent = "";
  try {
    const result = await request("/api/documents/login", {
      method: "POST",
      json: { password: $("#documentPassword").value },
    });
    localStorage.setItem(KEY, result.token);
    $("#documentPassword").value = "";
    $("#documentsDialog").close();
    await openDocuments();
  } catch (error) {
    $("#documentLoginError").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("#documentLogout").onclick = () => {
  localStorage.removeItem(KEY);
  loginView("Déconnecté de l’espace Documents.");
};
let timer;
$("#documentSearch").oninput = () => {
  cancelLibrary();
  clearTimeout(timer);
  timer = setTimeout(() => {
    query = $("#documentSearch").value.trim();
    offset = 0;
    loadItems();
  }, 250);
};
$("#documentPrevious").onclick = () => {
  offset = Math.max(0, offset - 50);
  loadItems();
};
$("#documentNext").onclick = () => {
  offset += 50;
  loadItems();
};
$("#documentsDialog").addEventListener("close", () => {
  if ($("#documentsDialog").open) return;
  cancelLibrary();
  openingController?.abort();
  clearTimeout(timer);
  $("#documentPassword").value = "";
});

export async function renderDocumentsAdmin() {
  const panel = $("#documentsAdminPanel");
  panel.innerHTML = '<p class="help">Chargement des paramètres Documents…</p>';
  try {
    const settings = await request("/api/admin/documents", {}, true);
    panel.innerHTML = `<div class="appearance-heading"><div><h3>Les fichiers de HX1</h3><p>Le catalogue est accessible avec un mot de passe de classe. Ces réglages ont leurs propres boutons d’enregistrement.</p></div></div>
      <section class="document-admin-access"><h4>Mot de passe de classe</h4><p class="help">${settings.password_configured ? "Un mot de passe est défini. Il n’est jamais affiché ni récupérable." : "Définis le mot de passe pour ouvrir l’accès aux élèves."} Le changer déconnectera toutes les sessions Documents. La session de consultation dure au maximum sept jours.</p>
      <form id="documentPasswordForm"><label class="field"><span>Nouveau mot de passe (5 caractères minimum)</span><input id="newDocumentPassword" type="password" minlength="5" maxlength="200" autocomplete="new-password" required></label><label class="field"><span>Confirmer</span><input id="confirmDocumentPassword" type="password" minlength="5" maxlength="200" autocomplete="new-password" required></label><button class="primary" type="submit">Enregistrer le mot de passe</button><p id="documentAdminPasswordStatus" role="status"></p></form></section>
      <h4>Sources du catalogue</h4><p class="help">La synchronisation se fait en arrière-plan. En cas d’erreur, le dernier catalogue reste disponible. Changer une source vide son ancien catalogue jusqu’à la prochaine synchronisation.</p>
      <div id="documentSourceEditors">${Object.entries({
        maths: "Mathématiques",
        english: "Anglais",
        physics: "Physique",
      })
        .map(([id, label]) => {
          const s = settings.sources.find((s) => s.id === id);
          return `<form class="document-source-editor" data-document-source-form="${id}"><h5>${label}</h5><p class="help">${s ? `${s.item_count} fichiers · ${date(s.synced_at)}${s.error ? " · " + escape(s.error) : ""}` : "Source à configurer"}</p><label class="field"><span>${id === "physics" ? "Lien du partage Nuage" : "Lien du dossier Drive"}</span><input name="root_url" type="url" maxlength="600" value="${escape(s?.root_url || "")}" required></label><button class="secondary" type="submit">Enregistrer cette source</button><p role="status"></p></form>`;
        })
        .join(
          "",
        )}</div><h4>Annonces Discord</h4><p class="help">Un webhook par matière : mathématiques, anglais et physique. Ils peuvent pointer vers le même salon. Dans chaque salon Discord : Modifier le salon → Intégrations → Webhooks → Nouveau webhook → Copier l’URL. Colle l’URL correspondante ci-dessous. Les sources sont vérifiées toutes les dix minutes environ ; les nouveaux fichiers et les changements de taille ou de date de modification seront annoncés, sans publier l’historique ni télécharger les documents.</p>
      <div id="documentDiscordEditors">${(settings.discord || []).map((d) => `<form class="document-source-editor" data-document-discord="${d.id}"><h5>${escape(d.label)}</h5><p class="help">${d.configured ? (d.enabled ? "Annonces activées" : "Annonces en pause") : "Webhook à configurer"}${d.last_sent_at ? " · Dernier envoi : " + date(d.last_sent_at) : ""}${d.error ? " · " + escape(d.error) : ""}</p><label class="field"><span>${d.configured ? "Remplacer l’URL du webhook (laisser vide pour la conserver)" : "URL du webhook de ce salon"}</span><input name="webhook" type="password" maxlength="400" autocomplete="new-password" placeholder="https://discord.com/api/webhooks/…" ${d.configured ? "" : "required"}></label><label><input name="enabled" type="checkbox" ${!d.configured || d.enabled ? "checked" : ""}> Annoncer les nouveaux fichiers et leurs mises à jour</label><div class="document-discord-actions"><button class="secondary" type="submit">Enregistrer</button><button class="secondary" type="button" data-discord-test ${d.configured ? "" : "disabled"}>Envoyer un test</button>${d.configured ? '<button class="secondary" type="button" data-discord-remove>Supprimer le webhook</button>' : ""}</div><p role="status"></p></form>`).join("")}</div>
      <button type="button" class="secondary" id="documentRefreshAdmin">Actualiser l’état</button>`;
    $("#documentPasswordForm").onsubmit = async (event) => {
      event.preventDefault();
      const status = $("#documentAdminPasswordStatus"),
        button = event.target.querySelector("button");
      if ($("#newDocumentPassword").value !== $("#confirmDocumentPassword").value) {
        status.textContent = "Les mots de passe ne correspondent pas.";
        return;
      }
      button.disabled = true;
      try {
        await request(
          "/api/admin/documents/password",
          { method: "POST", json: { password: $("#newDocumentPassword").value } },
          true,
        );
        event.target.reset();
        localStorage.removeItem(KEY);
        status.textContent =
          "Mot de passe enregistré. Les anciennes sessions Documents sont déconnectées.";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    panel.querySelectorAll("[data-document-source-form]").forEach(
      (form) =>
        (form.onsubmit = async (event) => {
          event.preventDefault();
          const button = form.querySelector("button"),
            status = form.querySelector("[role=status]");
          button.disabled = true;
          try {
            await request(
              "/api/admin/documents/source",
              {
                method: "POST",
                json: {
                  id: form.dataset.documentSourceForm,
                  root_url: form.elements.root_url.value,
                },
              },
              true,
            );
            status.textContent =
              "Source enregistrée. Le collecteur la prendra en compte au prochain passage.";
          } catch (error) {
            status.textContent = error.message;
          } finally {
            button.disabled = false;
          }
        }),
    );
    panel.querySelectorAll("[data-document-discord]").forEach((form) => {
      const status = form.querySelector("[role=status]");
      const action = async (path, payload, success) => {
        const buttons = [...form.querySelectorAll("button")],
          previous = buttons.map((b) => b.disabled);
        let succeeded = false;
        buttons.forEach((b) => (b.disabled = true));
        status.textContent = "En cours…";
        try {
          await request(path, { method: "POST", json: payload }, true);
          form.elements.webhook.value = "";
          form.elements.webhook.required = payload.remove === true;
          status.textContent = success;
          succeeded = true;
        } catch (error) {
          status.textContent = error.message;
        } finally {
          buttons.forEach((b, i) => (b.disabled = previous[i]));
          if (succeeded)
            form.querySelector("[data-discord-test]").disabled = payload.remove === true;
        }
      };
      form.onsubmit = (event) => {
        event.preventDefault();
        return action(
          "/api/admin/documents/discord",
          {
            id: form.dataset.documentDiscord,
            webhook: form.elements.webhook.value,
            enabled: form.elements.enabled.checked,
          },
          "Webhook enregistré. Les prochaines nouveautés seront annoncées si les annonces sont activées.",
        );
      };
      form.querySelector("[data-discord-test]").onclick = () =>
        action(
          "/api/admin/documents/discord/test",
          { id: form.dataset.documentDiscord },
          "Message de test envoyé dans le salon.",
        );
      const remove = form.querySelector("[data-discord-remove]");
      if (remove)
        remove.onclick = async () => {
          await action(
            "/api/admin/documents/discord",
            { id: form.dataset.documentDiscord, enabled: false, remove: true },
            "Webhook supprimé.",
          );
        };
    });
    $("#documentRefreshAdmin").onclick = renderDocumentsAdmin;
  } catch (error) {
    panel.innerHTML =
      '<p class="form-error">' +
      escape(error.message) +
      '</p><button type="button" class="secondary" id="retryDocumentsAdmin">Réessayer</button>';
    $("#retryDocumentsAdmin").onclick = renderDocumentsAdmin;
  }
}
