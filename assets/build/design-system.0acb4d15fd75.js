(() => {
  "use strict";

  const HUB_VERSION = "0.2.38";
  const ISSUE_URL = "https://github.com/felipe-juan/hub-arquivos-ifba/issues/new";
  let reloadScheduled = false;
  let promptedWorker = null;

  function toast(message, options = {}) {
    let host = document.querySelector(".hub-update-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "hub-update-toast-host";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    const item = document.createElement("div");
    item.className = "hub-update-toast";
    if (options.tone) item.dataset.tone = options.tone;
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    item.appendChild(paragraph);
    if (options.actionLabel && typeof options.onAction === "function") {
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = options.actionLabel;
      action.addEventListener("click", () => options.onAction(item));
      item.appendChild(action);
    }
    host.appendChild(item);
    if (options.duration !== 0) {
      window.setTimeout(() => item.remove(), Number(options.duration || 5000));
    }
    return item;
  }

  function issueUrl(extra = {}) {
    const theme = document.documentElement.dataset.themeMode || document.documentElement.dataset.theme || "não informado";
    const page = `${location.pathname}${location.hash || ""}`;
    const body = [
      "## Problema",
      "Descreva o que aconteceu e o que você esperava que acontecesse.",
      "",
      "## Como reproduzir",
      "1. ",
      "2. ",
      "3. ",
      "",
      "## Contexto automático",
      `- Página: ${page}`,
      `- Versão do HUB: v${HUB_VERSION}`,
      `- Tema: ${theme}`,
      `- Tela: ${window.innerWidth} × ${window.innerHeight}`,
      `- Navegador: ${navigator.userAgent}`,
      extra.context ? `- Contexto: ${extra.context}` : ""
    ].filter(Boolean).join("\n");
    const params = new URLSearchParams({
      title: `[Problema] ${extra.title || document.title} — v${HUB_VERSION}`,
      body
    });
    return `${ISSUE_URL}?${params.toString()}`;
  }

  function openIssue(extra = {}) {
    window.open(issueUrl(extra), "_blank", "noopener");
  }

  function setupReportButton(button, extra = {}) {
    if (!button || button.dataset.hubReportReady === "1") return;
    button.dataset.hubReportReady = "1";
    button.addEventListener("click", () => openIssue(extra));
  }

  function promptWorker(worker) {
    if (!worker || promptedWorker === worker) return;
    promptedWorker = worker;
    toast("Uma nova versão do HUB está disponível.", {
      actionLabel: "Atualizar agora",
      duration: 0,
      onAction: item => {
        try { sessionStorage.setItem("hubUpdateNotice", "pending"); } catch (_) {}
        worker.postMessage({ type: "SKIP_WAITING" });
        item.remove();
      }
    });
  }

  async function registerServiceWorker({ url = "service-worker.js", scope = "./" } = {}) {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const registration = await navigator.serviceWorker.register(url, { scope });
      if (registration.waiting && hadController) promptWorker(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) promptWorker(installing);
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloadScheduled) return;
        reloadScheduled = true;
        location.reload();
      });
      return registration;
    } catch (error) {
      console.warn("Service worker não registrado:", error);
      return null;
    }
  }

  function decorate() {
    document.querySelectorAll(".primary-button").forEach(node => node.classList.add("hub-button", "hub-button--primary"));
    document.querySelectorAll(".secondary-button,.reset-preferences,.campus-portal,.hub-shell-reset,.hub-shell-portal").forEach(node => node.classList.add("hub-button", "hub-button--ghost"));
    document.querySelectorAll("input[type='search'],input[type='text'],input[type='number'],select,textarea").forEach(node => node.classList.add("hub-field"));
    const updated = (() => { try { return sessionStorage.getItem("hubUpdateNotice"); } catch (_) { return ""; } })();
    if (updated) {
      try { sessionStorage.removeItem("hubUpdateNotice"); } catch (_) {}
      toast(`HUB atualizado para v${HUB_VERSION}.`, { tone: "success", duration: 4200 });
    }
  }

  window.HUB_UI = { HUB_VERSION, toast, issueUrl, openIssue, setupReportButton, registerServiceWorker, decorate };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorate, { once: true });
  else decorate();
})();
