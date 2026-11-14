(() => {
  const api = String(window.COLLOSCOPE_CONFIG?.API_URL || "").replace(/\/+$/, "");
  const $ = s => document.querySelector(s);
  const dialog = $("#notificationsDialog");
  const status = $("#pushStatus");
  const key = "collo-reminders-v1";
  let registration, config, installPrompt;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  if (!saved?.id) saved = { id: [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join(""), reminders: [60], enabled: false };
  const persist = () => localStorage.setItem(key, JSON.stringify(saved));
  persist();
  const show = text => { status.textContent = text; };
  const buttons = [$("#pushSave"), $("#pushTest"), $("#pushDisable")];
  async function call(path, body) {
    const response = await fetch(api + "/api/push/" + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + saved.id }, body: JSON.stringify(body || {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Service momentanément indisponible.");
    return result;
  }
  const ready = (async () => {
    if (!("serviceWorker" in navigator)) return;
    registration = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    const response = await fetch(api + "/api/push/config");
    if (!response.ok) throw new Error("Impossible de joindre le serveur des rappels.");
    config = await response.json();
  })();
  ready.catch(() => {});
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); installPrompt = e;
    $("#installApp").hidden = false;
  });
  window.addEventListener("appinstalled", () => { $("#installApp").hidden = true; installPrompt = null; });
  $("#installApp").onclick = async () => {
    if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $("#installApp").hidden = true; }
  };
  $("#installHelp").textContent = standalone ? "Collo est installé sur cet appareil. L’icône de l’onglet suit le thème. Sur l’écran d’accueil, sa mise à jour dépend du téléphone ; sur iPhone, il peut être nécessaire de réinstaller l’icône pour la changer. Après réinstallation, vérifie tes rappels." : ios
    ? "Sur iPhone (iOS 16.4+), ouvre Collo dans Safari, puis Partager → Sur l’écran d’accueil. Ouvre ensuite l’icône Collo pour activer les rappels."
    : "Installe Collo avec le bouton ci-dessous ou le menu du navigateur → Installer l’application / Ajouter à l’écran d’accueil.";
  $("#notificationsOpen").onclick = async () => {
    $("#reminderMinutes").value = saved.reminders.join(", ");
    dialog.showModal();
    buttons.forEach(b => b.disabled = true);
    show("Vérification des notifications…");
    try {
      await ready;
      if (ios && !standalone) return show("Ajoute d’abord Collo à l’écran d’accueil, puis ouvre l’appli depuis son icône.");
      if (!supported) return show("Les notifications ne sont pas disponibles dans ce navigateur. Essaie Safari sur iPhone ou Chrome sur Android.");
      if (!config?.enabled) return show("Les notifications ne sont pas encore activées sur le serveur. L’activation sera disponible après configuration du serveur.");
      const sub = await registration.pushManager.getSubscription();
      show(Notification.permission === "denied" ? "Notifications bloquées : autorise-les dans les réglages de ton téléphone ou du navigateur." : saved.enabled && sub ? `Rappels actifs pour le groupe G${saved.group}.` : "Choisis tes délais, puis active les rappels sur ce téléphone.");
      $("#pushSave").disabled = Notification.permission === "denied";
      $("#pushTest").disabled = $("#pushDisable").disabled = !saved.enabled;
    } catch (e) { show(e.message); }
  };
  $("#notificationsClose").onclick = () => dialog.close();
  function minutes() {
    const raw = $("#reminderMinutes").value.trim();
    const parts = raw.split(",").map(s => s.trim());
    if (!raw || parts.some(s => !/^\d+$/.test(s)) || parts.length > 5) throw new Error("Indique de 1 à 5 délais en minutes, séparés par des virgules.");
    const values = [...new Set(parts.map(Number))];
    if (values.some(n => n > 10080)) throw new Error("Chaque délai doit être compris entre 0 et 10 080 minutes (7 jours).");
    return values;
  }
  async function subscribe(subscription, group, reminders) {
    await call("subscribe", { subscription: subscription.toJSON(), group, reminders });
    saved = { ...saved, enabled: true, group, reminders }; persist();
  }
  $("#pushSave").onclick = async () => {
    const button = $("#pushSave"); button.disabled = true;
    try {
      const reminders = minutes();
      const group = Number($("#groupSelect").value);
      if (!group) throw new Error("Choisis d’abord ton groupe sur le planning.");
      // Request permission directly from a click, especially for Safari.
      if (await Notification.requestPermission() !== "granted") throw new Error("Autorise les notifications pour recevoir les rappels.");
      const applicationServerKey = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      await subscribe(subscription, group, reminders);
      $("#pushTest").disabled = $("#pushDisable").disabled = false;
      show(`Rappels enregistrés pour G${group} : ${reminders.join(", ")} min avant chaque colle. Ils fonctionnent aussi quand l’appli est fermée.`);
    } catch (e) { show(e.message); } finally { button.disabled = false; }
  };
  $("#pushTest").onclick = async () => {
    $("#pushTest").disabled = true;
    try { await call("test"); show("Notification de test envoyée. Vérifie les notifications de ton téléphone."); }
    catch (e) { show(e.message); } finally { $("#pushTest").disabled = !saved.enabled; }
  };
  $("#pushDisable").onclick = async () => {
    $("#pushDisable").disabled = true;
    try {
      await call("unsubscribe");
      const sub = await registration.pushManager.getSubscription();
      saved.enabled = false; persist();
      if (sub) await sub.unsubscribe(); $("#pushTest").disabled = true;
      show("Rappels désactivés sur cet appareil.");
    } catch (e) { $("#pushDisable").disabled = false; show(e.message); }
  };
  // The saved push group stays visible until an update is confirmed by the server.
  let syncing = false;
  async function syncGroup() {
    const group = Number($("#groupSelect").value);
    if (syncing || !saved.enabled || !group || group === saved.group) return;
    syncing = true;
    try {
      await ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) throw new Error("Réactive les rappels dans les réglages.");
      await subscribe(sub, group, saved.reminders);
    } catch {
      const notice = $("#siteNotice"); notice.classList.remove("hidden");
      notice.textContent = `Les rappels restent réglés sur G${saved.group}. Ouvre Rappels et enregistre le nouveau groupe.`;
    } finally { syncing = false; }
  }
  window.addEventListener("collo-group-change", syncGroup);
})();
