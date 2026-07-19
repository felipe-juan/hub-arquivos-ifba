(() => {
  "use strict";

  const LOCAL = {
    script: new URL("vendor/js-dos/js-dos.js", location.href).href,
    css: new URL("vendor/js-dos/js-dos.css", location.href).href,
    emulators: new URL("vendor/emulators/", location.href).href,
    bundle: new URL("game/doom.jsdos", location.href).href,
  };
  const REMOTE_V8 = {
    script: "https://v8.js-dos.com/8.xx/8.4.1/js-dos.js",
    css: "https://v8.js-dos.com/8.xx/8.4.1/js-dos.css",
    emulators: "https://v8.js-dos.com/8.xx/8.4.1/emulators/",
    bundle: "https://v8.js-dos.com/bundles/doom.jsdos",
  };
  const REMOTE_LATEST = {
    script: "https://v8.js-dos.com/latest/js-dos.js",
    css: "https://v8.js-dos.com/latest/js-dos.css",
    emulators: "https://v8.js-dos.com/latest/emulators/",
  };
  const REMOTE_V6 = {
    script: "https://js-dos.com/6.22/current/js-dos.js",
    wdosbox: "https://js-dos.com/6.22/current/wdosbox.js",
  };

  const RETURN_CONTEXT_KEY = "hubDoomReturnContextV1";
  const TOUCH_PREFS_KEY = "hubDoomTouchPreferencesV1";
  const LEGACY_PATTERN = /doom|js-?dos|dosbox|emulators-ui/i;
  const DEFAULT_TOUCH_PREFS = Object.freeze({
    opacity: 88,
    sensitivity: 100,
    leftHanded: false,
    vibration: true,
  });
  let playerProps = null;
  let commandInterface = null;
  let starting = false;
  let startupTimer = 0;
  let activeEngine = "";
  let playerReady = false;
  let controlsActive = false;
  let emulatorPaused = false;
  let sessionElapsedMs = 0;
  let sessionSegmentStartedAt = 0;
  let startupCancel = null;
  let runGeneration = 0;
  let mobileInput = false;
  let mobileHintDismissed = false;
  let softFullscreen = false;
  let joystickPointerId = null;
  let joystickActions = new Set();
  let lookPointerId = null;
  let lookOriginX = 0;
  let lookAction = "";
  let weaponSlot = 2;
  let touchPreferences = { ...DEFAULT_TOUCH_PREFS };
  let stoppingPlayer = false;
  let recoveryAttempts = 0;
  let recoveryInProgress = false;
  let currentStartRecovery = false;
  let recoveryToastTimer = 0;

  const actionSources = new Map();
  const V8_KEY_CODES = Object.freeze({
    menu: 256,
    right: 262,
    left: 263,
    down: 264,
    up: 265,
    run: 340,
    fire: 341,
    strafe: 342,
    use: 32,
  });
  const V6_KEY_CODES = Object.freeze({
    menu: 27,
    right: 39,
    left: 37,
    down: 40,
    up: 38,
    run: 16,
    fire: 17,
    strafe: 18,
    use: 32,
  });
  const BROWSER_KEY_CODES = Object.freeze({
    [V8_KEY_CODES.menu]: V6_KEY_CODES.menu,
    [V8_KEY_CODES.right]: V6_KEY_CODES.right,
    [V8_KEY_CODES.left]: V6_KEY_CODES.left,
    [V8_KEY_CODES.down]: V6_KEY_CODES.down,
    [V8_KEY_CODES.up]: V6_KEY_CODES.up,
    [V8_KEY_CODES.run]: V6_KEY_CODES.run,
    [V8_KEY_CODES.fire]: V6_KEY_CODES.fire,
    [V8_KEY_CODES.strafe]: V6_KEY_CODES.strafe,
    [V8_KEY_CODES.use]: V6_KEY_CODES.use,
  });
  const BROWSER_KEY_NAMES = Object.freeze({
    16: ["Shift", "ShiftLeft"],
    17: ["Control", "ControlLeft"],
    18: ["Alt", "AltLeft"],
    27: ["Escape", "Escape"],
    32: [" ", "Space"],
    37: ["ArrowLeft", "ArrowLeft"],
    38: ["ArrowUp", "ArrowUp"],
    39: ["ArrowRight", "ArrowRight"],
    40: ["ArrowDown", "ArrowDown"],
  });

  const byId = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));

  function loadTouchPreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(TOUCH_PREFS_KEY) || "null");
      if (stored && typeof stored === "object") {
        touchPreferences = {
          opacity: clamp(stored.opacity ?? DEFAULT_TOUCH_PREFS.opacity, 35, 100),
          sensitivity: clamp(stored.sensitivity ?? DEFAULT_TOUCH_PREFS.sensitivity, 60, 160),
          leftHanded: Boolean(stored.leftHanded),
          vibration: stored.vibration !== false,
        };
      }
    } catch (_) {
      touchPreferences = { ...DEFAULT_TOUCH_PREFS };
    }
  }

  function saveTouchPreferences() {
    try { localStorage.setItem(TOUCH_PREFS_KEY, JSON.stringify(touchPreferences)); } catch (_) {}
  }

  function applyTouchPreferences() {
    const root = document.documentElement;
    root.style.setProperty("--doom-touch-opacity", String(touchPreferences.opacity / 100));
    root.dataset.doomHandedness = touchPreferences.leftHanded ? "left" : "right";
    const opacity = byId("doomTouchOpacity");
    const sensitivity = byId("doomTouchSensitivity");
    const leftHanded = byId("doomLeftHanded");
    const vibration = byId("doomVibration");
    if (opacity) opacity.value = String(touchPreferences.opacity);
    if (sensitivity) sensitivity.value = String(touchPreferences.sensitivity);
    if (leftHanded) leftHanded.checked = touchPreferences.leftHanded;
    if (vibration) vibration.checked = touchPreferences.vibration;
    const opacityValue = byId("doomTouchOpacityValue");
    const sensitivityValue = byId("doomTouchSensitivityValue");
    if (opacityValue) opacityValue.textContent = `${touchPreferences.opacity}%`;
    if (sensitivityValue) sensitivityValue.textContent = `${touchPreferences.sensitivity}%`;
  }

  function setTouchSettingsOpen(open) {
    const panel = byId("doomTouchSettings");
    const button = byId("doomTouchSettingsButton");
    if (!panel || !button) return;
    const finalOpen = Boolean(open && mobileInput);
    panel.hidden = !finalOpen;
    button.setAttribute("aria-expanded", finalOpen ? "true" : "false");
    if (finalOpen) panel.querySelector("input")?.focus?.({ preventScroll: true });
  }

  function shouldUseTouchControls() {
    const params = new URLSearchParams(location.search);
    if (params.get("desktop") === "1") return false;
    if (params.get("touch") === "1") return true;
    const maxTouchPoints = Number(navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0);
    const hasTouch = maxTouchPoints > 0 || "ontouchstart" in window;
    const coarsePointer = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
    const hoverless = Boolean(window.matchMedia?.("(hover: none)")?.matches);
    const uaMobile = Boolean(navigator.userAgentData?.mobile)
      || /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
    const viewportWidth = Math.min(window.innerWidth || Infinity, window.visualViewport?.width || Infinity);
    return Boolean(uaMobile || coarsePointer || (hasTouch && (hoverless || viewportWidth <= 1366)));
  }

  function gameViewVisible() {
    const shell = byId("doomGameShell");
    return Boolean(shell && !shell.hidden);
  }

  function syncTouchControls({ ready = playerReady } = {}) {
    const controls = byId("doomTouchControls");
    if (!controls) return;
    const visible = mobileInput && gameViewVisible();
    controls.hidden = !visible;
    controls.dataset.ready = ready ? "true" : "false";
    controls.setAttribute("aria-disabled", ready ? "false" : "true");
    const status = byId("doomTouchStatus");
    if (status && visible) status.textContent = ready
      ? "Controles virtuais prontos para jogar."
      : "Controles virtuais visíveis; aguardando o emulador.";
  }

  function applyInputMode() {
    mobileInput = shouldUseTouchControls();
    document.documentElement.dataset.doomInput = mobileInput ? "touch" : "keyboard";
    const preview = byId("doomInputPreview");
    if (preview) {
      preview.textContent = mobileInput
        ? "Um controle de jogo touch será exibido sobre a tela; nenhum teclado virtual será necessário."
        : "Clique no jogo para autorizar a captura do teclado.";
    }
    const mobileHelp = document.querySelector(".doom-mobile-help");
    if (mobileHelp) mobileHelp.hidden = !mobileInput;
    const desktopHelp = document.querySelector(".doom-desktop-help");
    if (desktopHelp) desktopHelp.hidden = mobileInput;
    const settingsButton = byId("doomTouchSettingsButton");
    if (settingsButton) settingsButton.hidden = !mobileInput;
    if (!mobileInput) setTouchSettingsOpen(false);
    applyTouchPreferences();
    syncTouchControls();
    updateLandscapeHint();
  }

  function setView(view) {
    const views = {
      terminal: byId("doomTerminal"),
      game: byId("doomGameShell"),
      productivity: byId("doomProductivity"),
    };
    Object.entries(views).forEach(([name, element]) => {
      if (element) element.hidden = name !== view;
    });
    byId("doomExperience")?.setAttribute("data-view", view);
    window.requestAnimationFrame(() => syncTouchControls({ ready: view === "game" && playerReady }));
  }

  function startSessionClock() {
    if (!sessionSegmentStartedAt) sessionSegmentStartedAt = performance.now();
  }

  function pauseSessionClock() {
    if (!sessionSegmentStartedAt) return;
    sessionElapsedMs += Math.max(0, performance.now() - sessionSegmentStartedAt);
    sessionSegmentStartedAt = 0;
  }

  function resetSessionClock() {
    sessionElapsedMs = 0;
    sessionSegmentStartedAt = 0;
  }

  function sessionDurationMs() {
    return sessionElapsedMs + (sessionSegmentStartedAt ? Math.max(0, performance.now() - sessionSegmentStartedAt) : 0);
  }

  function formatDuration(milliseconds = 0) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function playInterfaceTone() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const gain = context.createGain();
      const first = context.createOscillator();
      const second = context.createOscillator();
      const now = context.currentTime;
      first.type = "sine";
      second.type = "triangle";
      first.frequency.setValueAtTime(145, now);
      second.frequency.setValueAtTime(220, now + 0.055);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      first.connect(gain);
      second.connect(gain);
      gain.connect(context.destination);
      first.start(now);
      first.stop(now + 0.12);
      second.start(now + 0.055);
      second.stop(now + 0.19);
      window.setTimeout(() => context.close().catch(() => {}), 350);
    } catch (_) {}
  }

  async function deleteDatabase(name) {
    if (!window.indexedDB || !name) return;
    await new Promise(resolve => {
      try {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  async function clearLegacyDoomState() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key && LEGACY_PATTERN.test(key) && !/^hub/i.test(key)) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
      } catch (_) {}
    }

    const names = new Set([
      "emulators-ui-saves", "emulators-ui", "js-dos", "jsdos", "dosbox", "doom"
    ]);
    try {
      if (typeof indexedDB.databases === "function") {
        const databases = await indexedDB.databases();
        databases.forEach(database => {
          if (database?.name && LEGACY_PATTERN.test(database.name)) names.add(database.name);
        });
      }
    } catch (_) {}
    await Promise.all([...names].map(deleteDatabase));
  }

  function setStatus(title, detail, kind = "loading") {
    const status = byId("doomStatus");
    if (!status) return;
    status.className = `doom-status${kind === "error" ? " is-error" : ""}`;
    const nodes = [];
    if (kind === "loading") {
      const spinner = document.createElement("span");
      spinner.className = "doom-spinner";
      spinner.setAttribute("aria-hidden", "true");
      nodes.push(spinner);
    }
    const heading = document.createElement("strong");
    const description = document.createElement("small");
    heading.textContent = String(title || "");
    description.textContent = String(detail || "");
    nodes.push(heading, description);
    status.replaceChildren(...nodes);
  }

  function showLoading(message = "Preparando o emulador.") {
    setStatus("Carregando DOOM clássico…", message, "loading");
    syncTouchControls({ ready: false });
  }

  function setKeyboardMessage(message) {
    const status = byId("doomKeyboardStatus");
    if (status) status.textContent = message;
  }

  function showKeyboardGate(
    title = mobileInput ? "Toque para retomar" : "Clique para ativar o teclado",
    detail = mobileInput
      ? "O controle móvel volta a responder após este toque."
      : "O jogo só recebe comandos enquanto esta área estiver ativa."
  ) {
    const gate = byId("doomKeyboardGate");
    if (!gate) return;
    const strong = gate.querySelector("strong");
    const small = gate.querySelector("small");
    const icon = byId("doomControlGateIcon");
    if (strong) strong.textContent = title;
    if (small) small.textContent = detail;
    if (icon) icon.textContent = mobileInput ? "🎮" : "⌨";
    gate.hidden = false;
  }

  function hideKeyboardGate() {
    const gate = byId("doomKeyboardGate");
    if (gate) gate.hidden = true;
  }

  function showRecoveryToast(message = "Sessão do DOOM recuperada.") {
    const toast = byId("doomRecoveryToast");
    if (!toast) return;
    window.clearTimeout(recoveryToastTimer);
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    recoveryToastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => { toast.hidden = true; }, 180);
    }, 2600);
  }

  function markPlayerReady(generation = runGeneration) {
    if (generation !== runGeneration || playerReady) return;
    window.clearTimeout(startupTimer);
    playerReady = true;
    controlsActive = mobileInput;
    emulatorPaused = false;
    byId("doomStatus")?.classList.add("is-hidden");
    byId("doomStage")?.classList.remove("is-keyboard-active");
    byId("doomStage")?.classList.toggle("is-touch-active", mobileInput);
    syncTouchControls({ ready: true });
    if (mobileInput) {
      hideKeyboardGate();
      setKeyboardMessage("Controle touch ativo. Use o joystick e os botões de ação.");
      const status = byId("doomTouchStatus");
      if (status) status.textContent = "Controle touch pronto para jogar.";
      updateLandscapeHint();
    } else {
      setKeyboardMessage("Clique na área do jogo para ativar o teclado.");
      showKeyboardGate();
    }
    if (!currentStartRecovery) resetSessionClock();
    startSessionClock();
    if (currentStartRecovery) showRecoveryToast();
    currentStartRecovery = false;
    recoveryInProgress = false;
  }

  function showError(message = "Não foi possível iniciar o jogo.", detail = "Tente novamente. A nova tentativa limpará a sessão anterior do emulador.") {
    window.clearTimeout(startupTimer);
    playerReady = false;
    controlsActive = false;
    pauseSessionClock();
    hideKeyboardGate();
    syncTouchControls({ ready: false });
    const status = byId("doomStatus");
    if (!status) return;
    status.className = "doom-status is-error";
    const heading = document.createElement("strong");
    const description = document.createElement("small");
    const actions = document.createElement("div");
    const retry = document.createElement("button");
    const returnButton = document.createElement("button");
    heading.textContent = String(message || "Não foi possível iniciar o jogo.");
    description.textContent = String(detail || "Tente novamente.");
    actions.className = "doom-retry-actions";
    retry.id = "doomRetry";
    retry.className = "hub-button hub-button--secondary";
    retry.type = "button";
    retry.textContent = "Tentar novamente";
    returnButton.id = "doomErrorReturn";
    returnButton.className = "hub-button hub-button--ghost";
    returnButton.type = "button";
    returnButton.textContent = "Voltar ao HUB";
    actions.append(retry, returnButton);
    status.replaceChildren(heading, description, actions);
    retry.addEventListener("click", () => startDoom(true), { once: true });
    returnButton.addEventListener("click", returnToSearch, { once: true });
  }

  function recoverDoomSession(reason = "Falha inesperada do emulador.") {
    const gameVisible = byId("doomGameShell") && !byId("doomGameShell").hidden;
    if (!gameVisible || !playerReady || starting || stoppingPlayer || recoveryInProgress || recoveryAttempts >= 1) return false;
    recoveryAttempts += 1;
    recoveryInProgress = true;
    pauseSessionClock();
    releaseAllTouchControls();
    setStatus("Recuperando a sessão…", "O emulador foi interrompido e será reiniciado uma vez automaticamente.", "loading");
    console.warn("DOOM Easter Egg: recuperação automática.", reason);
    window.setTimeout(() => startDoom(true, { recovery: true }), 240);
    return true;
  }

  function loadStylesheet(urls) {
    return new Promise(resolve => {
      let index = 0;
      const tryNext = () => {
        if (index >= urls.length) return resolve(null);
        const href = urls[index++];
        const absoluteHref = new URL(href, location.href).href;
        const existing = [...document.querySelectorAll('link[data-doom-engine-style="true"]')]
          .find(link => link.href === absoluteHref);
        if (existing?.sheet) return resolve(href);
        existing?.remove();
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.doomEngineStyle = "true";
        const timeout = window.setTimeout(() => {
          link.onload = null;
          link.onerror = null;
          link.remove();
          tryNext();
        }, 10000);
        link.onload = () => {
          window.clearTimeout(timeout);
          resolve(href);
        };
        link.onerror = () => {
          window.clearTimeout(timeout);
          link.remove();
          tryNext();
        };
        document.head.append(link);
      };
      tryNext();
    });
  }

  function loadScript(urls, expectedGlobal = "Dos") {
    return new Promise((resolve, reject) => {
      let index = 0;
      const tryNext = () => {
        if (typeof window[expectedGlobal] === "function") {
          resolve({
            url: "already-loaded",
            pathPrefix: window.__hubDoomPathPrefix || REMOTE_V8.emulators,
            local: Boolean(window.__hubDoomLocalEngine),
          });
          return;
        }
        if (index >= urls.length) {
          reject(new Error("O emulador não pôde ser baixado."));
          return;
        }
        const entry = urls[index++];
        const script = document.createElement("script");
        script.src = entry.url;
        script.async = true;
        script.dataset.doomEngineScript = "true";
        const timeout = window.setTimeout(() => {
          script.onload = null;
          script.onerror = null;
          script.remove();
          tryNext();
        }, 15000);
        script.onload = () => {
          window.clearTimeout(timeout);
          if (typeof window[expectedGlobal] === "function") {
            window.__hubDoomPathPrefix = entry.pathPrefix || window.__hubDoomPathPrefix;
            window.__hubDoomLocalEngine = Boolean(entry.local);
            resolve(entry);
          } else {
            script.remove();
            tryNext();
          }
        };
        script.onerror = () => {
          window.clearTimeout(timeout);
          script.remove();
          tryNext();
        };
        document.head.append(script);
      };
      tryNext();
    });
  }

  async function localBundleExists() {
    try {
      const response = await fetch(LOCAL.bundle, { method: "HEAD", cache: "no-store" });
      if (response.ok) return true;
      if (![403, 405, 501].includes(response.status)) return false;
    } catch (_) {}

    try {
      const response = await fetch(LOCAL.bundle, {
        method: "GET",
        cache: "no-store",
        headers: { Range: "bytes=0-0" },
      });
      const available = response.ok || response.status === 206;
      try { await response.body?.cancel(); } catch (_) {}
      return available;
    } catch (_) {
      return false;
    }
  }

  async function stopCurrentPlayer() {
    stoppingPlayer = true;
    window.clearTimeout(startupTimer);
    releaseAllTouchControls();
    const cancel = startupCancel;
    startupCancel = null;
    try {
      try { cancel?.(); } catch (_) {}
      try {
        if (commandInterface?.exit) await commandInterface.exit();
      } catch (_) {}
      try {
        if (playerProps?.stop) await playerProps.stop();
      } catch (_) {}
      commandInterface = null;
      playerProps = null;
      activeEngine = "";
      playerReady = false;
      controlsActive = false;
      emulatorPaused = false;
      byId("doomStage")?.classList.remove("is-keyboard-active", "is-touch-active");
      hideKeyboardGate();
      syncTouchControls({ ready: false });
      const hint = byId("doomLandscapeHint");
      if (hint) hint.hidden = true;
      byId("doomPlayer")?.replaceChildren();
    } finally {
      stoppingPlayer = false;
    }
  }

  async function callFirstAvailable(candidates = []) {
    for (const [target, method, args = []] of candidates) {
      if (target && typeof target[method] === "function") {
        try {
          await target[method](...args);
          return true;
        } catch (_) {}
      }
    }
    return false;
  }

  function keyCodeForAction(action) {
    const table = activeEngine === "v6" ? V6_KEY_CODES : V8_KEY_CODES;
    return table[action];
  }

  function fallbackKeyboardEvent(keyCode, pressed) {
    const target = byId("doomPlayer")?.querySelector("canvas, [tabindex]") || byId("doomStage");
    if (!target) return false;
    const browserCode = BROWSER_KEY_CODES[keyCode] || keyCode;
    const [key, code] = BROWSER_KEY_NAMES[browserCode] || [String.fromCharCode(browserCode), `Key${String.fromCharCode(browserCode).toUpperCase()}`];
    try {
      const event = new KeyboardEvent(pressed ? "keydown" : "keyup", {
        bubbles: true,
        cancelable: true,
        key,
        code,
      });
      for (const property of ["keyCode", "which", "charCode"]) {
        try { Object.defineProperty(event, property, { configurable: true, get: () => browserCode }); } catch (_) {}
      }
      target.dispatchEvent(event);
      return true;
    } catch (_) {
      return false;
    }
  }

  function sendRawKeyEvent(keyCode, pressed) {
    if (!Number.isFinite(keyCode)) return false;
    try {
      if (typeof commandInterface?.sendKeyEvent === "function") {
        commandInterface.sendKeyEvent(keyCode, pressed);
        return true;
      }
      if (typeof commandInterface?.simulateKeyEvent === "function") {
        commandInterface.simulateKeyEvent(keyCode, pressed);
        return true;
      }
    } catch (_) {}
    return fallbackKeyboardEvent(keyCode, pressed);
  }

  function tapRawKey(keyCode) {
    if (!Number.isFinite(keyCode)) return;
    try {
      if (typeof commandInterface?.simulateKeyPress === "function") {
        commandInterface.simulateKeyPress(keyCode);
        return;
      }
    } catch (_) {}
    sendRawKeyEvent(keyCode, true);
    window.setTimeout(() => sendRawKeyEvent(keyCode, false), 90);
  }

  function sendActionEvent(action, pressed) {
    return sendRawKeyEvent(keyCodeForAction(action), pressed);
  }

  function holdAction(action, source) {
    if (!mobileInput || !playerReady || !controlsActive || !source) return;
    let sources = actionSources.get(action);
    if (!sources) {
      sources = new Set();
      actionSources.set(action, sources);
    }
    if (sources.has(source)) return;
    const firstSource = sources.size === 0;
    sources.add(source);
    if (firstSource) sendActionEvent(action, true);
  }

  function releaseAction(action, source) {
    const sources = actionSources.get(action);
    if (!sources) return;
    sources.delete(source);
    if (sources.size === 0) {
      actionSources.delete(action);
      sendActionEvent(action, false);
    }
  }

  function releaseAllTouchControls() {
    for (const action of [...actionSources.keys()]) {
      sendActionEvent(action, false);
    }
    actionSources.clear();
    joystickActions.clear();
    joystickPointerId = null;
    if (lookAction) releaseAction(lookAction, "look-zone");
    lookAction = "";
    lookPointerId = null;
    lookOriginX = 0;
    const knob = byId("doomJoystickKnob");
    if (knob) knob.style.transform = "translate3d(0, 0, 0)";
    document.querySelectorAll(".doom-touch-button.is-pressed").forEach(button => button.classList.remove("is-pressed"));
    byId("doomJoystick")?.classList.remove("is-active");
    byId("doomLookZone")?.classList.remove("is-active");
  }

  function tapAction(action) {
    if (!mobileInput || !playerReady || !controlsActive) return;
    const code = keyCodeForAction(action);
    tapRawKey(code);
    vibrate(12);
  }

  function vibrate(duration = 10) {
    if (!touchPreferences.vibration) return;
    try { navigator.vibrate?.(duration); } catch (_) {}
  }

  function setJoystickActions(nextActions) {
    for (const action of joystickActions) {
      if (!nextActions.has(action)) releaseAction(action, "joystick");
    }
    for (const action of nextActions) {
      if (!joystickActions.has(action)) holdAction(action, "joystick");
    }
    joystickActions = nextActions;
  }

  function updateJoystickFromPointer(event) {
    const joystick = byId("doomJoystick");
    const knob = byId("doomJoystickKnob");
    if (!joystick || !knob) return;
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const maxRadius = Math.max(1, Math.min(rect.width, rect.height) * 0.31);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxRadius ? maxRadius / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    knob.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    const sensitivity = touchPreferences.sensitivity / 100;
    const normalizedX = (x / maxRadius) * sensitivity;
    const normalizedY = (y / maxRadius) * sensitivity;
    const deadZone = clamp(0.3 / sensitivity, 0.18, 0.45);
    const next = new Set();
    if (normalizedY < -deadZone) next.add("up");
    if (normalizedY > deadZone) next.add("down");
    if (normalizedX < -deadZone) {
      next.add("strafe");
      next.add("left");
    }
    if (normalizedX > deadZone) {
      next.add("strafe");
      next.add("right");
    }
    setJoystickActions(next);
  }

  function resetJoystick(pointerId = null) {
    if (pointerId !== null && joystickPointerId !== pointerId) return;
    setJoystickActions(new Set());
    joystickPointerId = null;
    const joystick = byId("doomJoystick");
    const knob = byId("doomJoystickKnob");
    joystick?.classList.remove("is-active");
    if (knob) knob.style.transform = "translate3d(0, 0, 0)";
  }

  function setupJoystick() {
    const joystick = byId("doomJoystick");
    if (!joystick) return;
    joystick.addEventListener("pointerdown", event => {
      if (!mobileInput || !playerReady || !controlsActive || joystickPointerId !== null) return;
      event.preventDefault();
      joystickPointerId = event.pointerId;
      joystick.setPointerCapture?.(event.pointerId);
      joystick.classList.add("is-active");
      updateJoystickFromPointer(event);
      vibrate(8);
    });
    joystick.addEventListener("pointermove", event => {
      if (event.pointerId !== joystickPointerId) return;
      event.preventDefault();
      updateJoystickFromPointer(event);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      joystick.addEventListener(type, event => {
        if (event.pointerId !== joystickPointerId) return;
        event.preventDefault();
        resetJoystick(event.pointerId);
      });
    }
    joystick.addEventListener("contextmenu", event => event.preventDefault());
  }

  function setupHoldButtons() {
    document.querySelectorAll("[data-doom-hold]").forEach(button => {
      const action = button.dataset.doomHold;
      const sources = new Map();
      button.addEventListener("pointerdown", event => {
        if (!mobileInput || !playerReady || !controlsActive) return;
        event.preventDefault();
        const source = `button:${action}:${event.pointerId}`;
        sources.set(event.pointerId, source);
        button.setPointerCapture?.(event.pointerId);
        button.classList.add("is-pressed");
        holdAction(action, source);
        vibrate(action === "fire" ? 14 : 8);
      });
      const release = event => {
        const source = sources.get(event.pointerId);
        if (!source) return;
        event.preventDefault();
        sources.delete(event.pointerId);
        releaseAction(action, source);
        if (sources.size === 0) button.classList.remove("is-pressed");
      };
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
      button.addEventListener("contextmenu", event => event.preventDefault());
    });
  }

  function setupTapButtons() {
    document.querySelectorAll("[data-doom-tap]").forEach(button => {
      button.addEventListener("pointerdown", event => {
        if (!mobileInput || !playerReady || !controlsActive) return;
        event.preventDefault();
        button.classList.add("is-pressed");
        tapAction(button.dataset.doomTap);
      });
      const release = event => {
        event.preventDefault();
        button.classList.remove("is-pressed");
      };
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
      button.addEventListener("contextmenu", event => event.preventDefault());
    });

    byId("doomWeapon")?.addEventListener("pointerdown", event => {
      if (!mobileInput || !playerReady || !controlsActive) return;
      event.preventDefault();
      weaponSlot = weaponSlot >= 7 ? 1 : weaponSlot + 1;
      const output = byId("doomWeaponNumber");
      if (output) output.textContent = String(weaponSlot);
      tapRawKey(48 + weaponSlot);
      event.currentTarget.classList.add("is-pressed");
      vibrate(10);
    });
    const weapon = byId("doomWeapon");
    const releaseWeapon = event => {
      event.preventDefault();
      weapon?.classList.remove("is-pressed");
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) weapon?.addEventListener(type, releaseWeapon);
    weapon?.addEventListener("contextmenu", event => event.preventDefault());
  }

  function setLookAction(nextAction = "") {
    if (lookAction === nextAction) return;
    if (lookAction) releaseAction(lookAction, "look-zone");
    lookAction = nextAction;
    if (lookAction) holdAction(lookAction, "look-zone");
  }

  function setupLookZone() {
    const zone = byId("doomLookZone");
    if (!zone) return;
    zone.addEventListener("pointerdown", event => {
      if (!mobileInput || !playerReady || !controlsActive || lookPointerId !== null) return;
      if (event.target.closest("button")) return;
      event.preventDefault();
      lookPointerId = event.pointerId;
      lookOriginX = event.clientX;
      zone.setPointerCapture?.(event.pointerId);
      zone.classList.add("is-active");
    });
    zone.addEventListener("pointermove", event => {
      if (event.pointerId !== lookPointerId) return;
      event.preventDefault();
      const threshold = clamp(zone.getBoundingClientRect().width * .055 / (touchPreferences.sensitivity / 100), 12, 42);
      const delta = event.clientX - lookOriginX;
      setLookAction(delta < -threshold ? "left" : delta > threshold ? "right" : "");
    });
    const release = event => {
      if (event.pointerId !== lookPointerId) return;
      event.preventDefault();
      setLookAction("");
      lookPointerId = null;
      lookOriginX = 0;
      zone.classList.remove("is-active");
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) zone.addEventListener(type, release);
    zone.addEventListener("contextmenu", event => event.preventDefault());
  }

  function setupTouchControls() {
    setupJoystick();
    setupLookZone();
    setupHoldButtons();
    setupTapButtons();
  }

  function setupTouchPreferences() {
    loadTouchPreferences();
    applyTouchPreferences();
    byId("doomTouchSettingsButton")?.addEventListener("click", () => {
      const panel = byId("doomTouchSettings");
      setTouchSettingsOpen(Boolean(panel?.hidden));
    });
    byId("doomTouchSettingsClose")?.addEventListener("click", () => setTouchSettingsOpen(false));
    byId("doomTouchOpacity")?.addEventListener("input", event => {
      touchPreferences.opacity = clamp(event.currentTarget.value, 35, 100);
      applyTouchPreferences();
      saveTouchPreferences();
    });
    byId("doomTouchSensitivity")?.addEventListener("input", event => {
      touchPreferences.sensitivity = clamp(event.currentTarget.value, 60, 160);
      applyTouchPreferences();
      saveTouchPreferences();
    });
    byId("doomLeftHanded")?.addEventListener("change", event => {
      touchPreferences.leftHanded = Boolean(event.currentTarget.checked);
      releaseAllTouchControls();
      applyTouchPreferences();
      saveTouchPreferences();
    });
    byId("doomVibration")?.addEventListener("change", event => {
      touchPreferences.vibration = Boolean(event.currentTarget.checked);
      applyTouchPreferences();
      saveTouchPreferences();
    });
    byId("doomStage")?.addEventListener("touchmove", event => {
      const gameVisible = byId("doomGameShell") && !byId("doomGameShell").hidden;
      if (event.target?.closest?.("#doomTouchSettings")) return;
      if (mobileInput && gameVisible) event.preventDefault();
    }, { passive: false });
  }

  async function pauseEmulator() {
    if (!playerReady || emulatorPaused) return;
    await callFirstAvailable([
      [commandInterface, "pause"],
      [playerProps, "pause"],
      [playerProps, "setPaused", [true]],
    ]);
    emulatorPaused = true;
  }

  async function resumeEmulator() {
    if (!playerReady || !emulatorPaused) return;
    await callFirstAvailable([
      [commandInterface, "resume"],
      [playerProps, "resume"],
      [playerProps, "setPaused", [false]],
    ]);
    emulatorPaused = false;
  }

  async function activateKeyboard() {
    if (!playerReady) return;
    await resumeEmulator();
    controlsActive = true;
    startSessionClock();
    byId("doomStage")?.classList.toggle("is-keyboard-active", !mobileInput);
    byId("doomStage")?.classList.toggle("is-touch-active", mobileInput);
    hideKeyboardGate();
    if (mobileInput) {
      syncTouchControls({ ready: true });
      setKeyboardMessage("Controle touch ativo. Use o joystick e os botões de ação.");
      const status = byId("doomTouchStatus");
      if (status) status.textContent = "Controle touch retomado.";
      return;
    }
    setKeyboardMessage("Teclado ativo no jogo. Clique fora ou troque de aba para liberar e pausar.");
    const focusTarget = byId("doomPlayer")?.querySelector("canvas, [tabindex]") || byId("doomStage");
    focusTarget?.focus?.({ preventScroll: true });
  }

  async function deactivateKeyboard(reason = "Sessão pausada. Clique para retomar.") {
    if (!playerReady) return;
    setTouchSettingsOpen(false);
    releaseAllTouchControls();
    controlsActive = false;
    pauseSessionClock();
    byId("doomStage")?.classList.remove("is-keyboard-active", "is-touch-active");
    await pauseEmulator();
    setKeyboardMessage(reason);
    showKeyboardGate(
      "Sessão pausada",
      mobileInput
        ? "Toque aqui para reativar o gamepad móvel."
        : "Volte à página e clique aqui para retomar os controles."
    );
    const status = byId("doomTouchStatus");
    if (status && mobileInput) status.textContent = "Controle touch pausado.";
  }

  function cancelledError() {
    try { return new DOMException("Inicialização cancelada.", "AbortError"); }
    catch (_) {
      const error = new Error("Inicialização cancelada.");
      error.name = "AbortError";
      return error;
    }
  }

  async function startV8(bundleUrl, generation) {
    showLoading("Carregando o player web fixado na versão 8.4.1.");
    await loadStylesheet([LOCAL.css, REMOTE_V8.css, REMOTE_LATEST.css]);
    if (generation !== runGeneration) throw cancelledError();
    const engine = await loadScript([
      { url: LOCAL.script, pathPrefix: LOCAL.emulators, local: true },
      { url: REMOTE_V8.script, pathPrefix: REMOTE_V8.emulators, local: false },
      { url: REMOTE_LATEST.script, pathPrefix: REMOTE_LATEST.emulators, local: false },
    ]);
    if (generation !== runGeneration) throw cancelledError();

    if (typeof window.Dos !== "function") throw new Error("O emulador v8 não foi carregado.");

    const player = byId("doomPlayer");
    activeEngine = "v8";
    playerProps = window.Dos(player, {
      url: bundleUrl,
      pathPrefix: engine.pathPrefix,
      autoStart: true,
      autoSave: false,
      kiosk: mobileInput,
      thinSidebar: mobileInput,
      imageRendering: "pixelated",
      renderAspect: "Fit",
      onEvent: (event, ci) => {
        const eventName = typeof event === "string" ? event : String(event?.type || event?.name || "");
        if (eventName === "ci-ready" && generation === runGeneration) {
          commandInterface = ci || null;
          markPlayerReady(generation);
          return;
        }
        if (/^(?:error|crash)$/i.test(eventName) && generation === runGeneration && playerReady && !stoppingPlayer) {
          recoverDoomSession(`Evento do player: ${eventName}`);
        }
      },
    });
    playerProps?.setNoCloud?.(true);
    playerProps?.setAutoStart?.(true);
    playerProps?.setKiosk?.(mobileInput);
    playerProps?.setThinSidebar?.(mobileInput);

    await new Promise((resolve, reject) => {
      let settled = false;
      let observer = null;
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(startupTimer);
        observer?.disconnect();
        if (startupCancel === cancel) startupCancel = null;
        handler(value);
      };
      const cancel = () => finish(reject, cancelledError());
      startupCancel = cancel;
      startupTimer = window.setTimeout(() => {
        const canvas = player?.querySelector("canvas");
        if (canvas && generation === runGeneration) {
          markPlayerReady(generation);
          finish(resolve);
        } else {
          finish(reject, new Error("O player v8 não concluiu a inicialização."));
        }
      }, 35000);
      observer = new MutationObserver(() => {
        if (player?.querySelector("canvas") && generation === runGeneration) {
          markPlayerReady(generation);
          finish(resolve);
        }
      });
      observer.observe(player, { childList: true, subtree: true });
    });
  }

  async function startV6(bundleUrl, generation) {
    showLoading("Usando o modo de compatibilidade do emulador.");
    await stopCurrentPlayer();
    if (generation !== runGeneration) throw cancelledError();
    try { delete window.Dos; } catch (_) { window.Dos = undefined; }
    await loadScript([{ url: REMOTE_V6.script, local: false }]);
    if (generation !== runGeneration) throw cancelledError();
    if (typeof window.Dos !== "function") throw new Error("O modo de compatibilidade não foi carregado.");

    const player = byId("doomPlayer");
    const canvas = document.createElement("canvas");
    canvas.className = "doom-v6-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "DOOM clássico");
    player.replaceChildren(canvas);
    activeEngine = "v6";

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        if (startupCancel === cancel) startupCancel = null;
        handler(value);
      };
      const cancel = () => finish(reject, cancelledError());
      startupCancel = cancel;
      try {
        window.Dos(canvas, {
          wdosboxUrl: REMOTE_V6.wdosbox,
          onerror: message => {
            const error = new Error(String(message || "Falha no DOSBox."));
            if (playerReady && !stoppingPlayer && recoverDoomSession(error.message)) return;
            finish(reject, error);
          },
          onprogress: () => {},
        }).ready((fs, main) => {
          fs.extract(bundleUrl)
            .then(() => {
              if (generation !== runGeneration) throw cancelledError();
              return main(["-conf", ".jsdos/dosbox.conf"]);
            })
            .then(ci => {
              if (generation !== runGeneration) throw cancelledError();
              commandInterface = ci || null;
              markPlayerReady(generation);
              finish(resolve);
            })
            .catch(error => finish(reject, error));
        }).catch(error => finish(reject, error));
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function startDoom(forceReset = false, { recovery = false } = {}) {
    if (starting) return;
    const generation = ++runGeneration;
    starting = true;
    currentStartRecovery = Boolean(recovery);
    if (!recovery) recoveryAttempts = 0;
    setView("game");
    if (recovery) pauseSessionClock();
    else resetSessionClock();
    showLoading(recovery
      ? "Recriando o emulador sem perder o tempo da sessão."
      : (forceReset ? "Removendo dados antigos antes de reiniciar." : "Preparando uma sessão limpa do emulador."));

    try {
      await stopCurrentPlayer();
      if (generation !== runGeneration) return;
      syncTouchControls({ ready: false });
      await clearLegacyDoomState();
      if (generation !== runGeneration) return;
      const bundleUrl = (await localBundleExists()) ? LOCAL.bundle : REMOTE_V8.bundle;
      if (generation !== runGeneration) return;

      try {
        await startV8(bundleUrl, generation);
      } catch (v8Error) {
        if (generation !== runGeneration || v8Error?.name === "AbortError") return;
        console.warn("DOOM Easter Egg: v8 falhou, tentando compatibilidade 6.22.", v8Error);
        await startV6(bundleUrl, generation);
      }
    } catch (error) {
      if (generation !== runGeneration || error?.name === "AbortError") return;
      console.error("DOOM Easter Egg:", error);
      currentStartRecovery = false;
      recoveryInProgress = false;
      showError(
        error?.message || "Não foi possível iniciar o jogo.",
        recovery
          ? "A recuperação automática também falhou. Tente reiniciar manualmente."
          : "A página não recebeu um emulador válido. Tente novamente ou confira no console qual recurso foi bloqueado."
      );
    } finally {
      if (generation === runGeneration) starting = false;
    }
  }

  async function showProductivitySummary() {
    setTouchSettingsOpen(false);
    pauseSessionClock();
    const duration = sessionDurationMs();
    runGeneration += 1;
    starting = false;
    await stopCurrentPlayer();
    await exitFullscreenMode();
    const output = byId("doomSessionDuration");
    if (output) output.textContent = formatDuration(duration);
    setView("productivity");
    byId("doomProductivityTitle")?.focus?.({ preventScroll: true });
  }

  function ensureReturnContext() {
    try {
      if (sessionStorage.getItem(RETURN_CONTEXT_KEY)) return;
      sessionStorage.setItem(RETURN_CONTEXT_KEY, JSON.stringify({
        query: "doom",
        filters: { type: "all", docType: "all", correspondent: "all", format: "all" },
        scrollY: 0,
        createdAt: Date.now(),
      }));
    } catch (_) {}
  }

  function returnToSearch() {
    ensureReturnContext();
    location.assign("../../index.html?doomReturn=1#buscar");
  }

  function forgetSession() {
    try { sessionStorage.removeItem(RETURN_CONTEXT_KEY); } catch (_) {}
    location.assign("../../index.html#buscar");
  }

  function fullscreenActive() {
    return Boolean(document.fullscreenElement || softFullscreen);
  }

  function setSoftFullscreen(active) {
    softFullscreen = Boolean(active);
    byId("doomExperience")?.classList.toggle("is-soft-fullscreen", softFullscreen);
    document.body.classList.toggle("doom-soft-fullscreen", softFullscreen);
    updateFullscreenButton();
    updateLandscapeHint();
  }

  async function lockLandscapeOrientation() {
    if (!mobileInput || !screen.orientation?.lock) return false;
    try {
      await screen.orientation.lock("landscape");
      return true;
    } catch (_) {
      return false;
    }
  }

  async function enterFullscreenMode(preferLandscape = false) {
    const experience = byId("doomExperience");
    let enteredNative = Boolean(document.fullscreenElement);
    if (!enteredNative && experience?.requestFullscreen) {
      try {
        try {
          await experience.requestFullscreen({ navigationUI: "hide" });
        } catch (_) {
          await experience.requestFullscreen();
        }
        enteredNative = true;
        setSoftFullscreen(false);
      } catch (_) {}
    }
    if (!enteredNative) setSoftFullscreen(true);
    if (preferLandscape) await lockLandscapeOrientation();
    updateFullscreenButton();
    updateLandscapeHint();
    return fullscreenActive();
  }

  async function exitFullscreenMode() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (_) {}
    try { screen.orientation?.unlock?.(); } catch (_) {}
    setSoftFullscreen(false);
  }

  async function toggleFullscreen() {
    if (fullscreenActive()) {
      await exitFullscreenMode();
      return;
    }
    const active = await enterFullscreenMode(mobileInput);
    if (!active) byId("doomStage")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function updateFullscreenButton() {
    const button = byId("doomFullscreen");
    if (!button) return;
    const active = fullscreenActive();
    button.textContent = active ? "⛶ Sair da tela cheia" : "⛶ Tela cheia";
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function updateLandscapeHint() {
    const hint = byId("doomLandscapeHint");
    if (!hint) return;
    const gameVisible = byId("doomGameShell") && !byId("doomGameShell").hidden;
    const portrait = window.matchMedia?.("(orientation: portrait)")?.matches ?? (innerHeight > innerWidth);
    const stage = byId("doomStage")?.getBoundingClientRect();
    const stageRatio = stage?.height ? stage.width / stage.height : innerWidth / Math.max(1, innerHeight);
    const portraitActuallyCramped = portrait
      && innerWidth <= 820
      && innerHeight > innerWidth * 1.12
      && stageRatio < 1.15;
    hint.hidden = !mobileInput || !gameVisible || !playerReady || !portraitActuallyCramped || mobileHintDismissed;
  }

  function guardInactiveKeyboard(event) {
    if (mobileInput) return;
    const gameVisible = byId("doomGameShell") && !byId("doomGameShell").hidden;
    if (!gameVisible || !playerReady || controlsActive) return;
    const interactive = event.target?.closest?.("button, a, input, select, textarea, [contenteditable='true']");
    if (event.key === "Tab" || event.metaKey) return;
    if ((event.ctrlKey || event.altKey) && !["Control", "Alt", "AltGraph"].includes(event.key)) return;
    if (interactive && event.type === "keydown" && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      interactive.click?.();
      return;
    }
    event.stopImmediatePropagation();
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
  }

  function setupActions() {
    byId("doomStart")?.addEventListener("click", () => {
      playInterfaceTone();
      if (mobileInput) enterFullscreenMode(true);
      startDoom(false);
    });
    byId("doomStudyReturn")?.addEventListener("click", returnToSearch);
    byId("doomRestart")?.addEventListener("click", () => startDoom(true));
    byId("doomFullscreen")?.addEventListener("click", toggleFullscreen);
    byId("doomExit")?.addEventListener("click", showProductivitySummary);
    byId("doomKeyboardGate")?.addEventListener("click", activateKeyboard);
    byId("doomStage")?.addEventListener("pointerdown", event => {
      if (event.target.closest("button")) return;
      activateKeyboard();
    });
    document.addEventListener("pointerdown", event => {
      if (mobileInput || !controlsActive || event.target.closest("#doomStage")) return;
      deactivateKeyboard("Teclado liberado porque você clicou fora da área do jogo.");
    }, true);
    byId("doomBackToSearch")?.addEventListener("click", returnToSearch);
    byId("doomPlayAgain")?.addEventListener("click", () => {
      playInterfaceTone();
      startDoom(true);
    });
    byId("doomForget")?.addEventListener("click", forgetSession);
    byId("doomLandscape")?.addEventListener("click", () => enterFullscreenMode(true));
    byId("doomLandscapeDismiss")?.addEventListener("click", () => {
      mobileHintDismissed = true;
      updateLandscapeHint();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !byId("doomTouchSettings")?.hidden) {
        event.preventDefault();
        setTouchSettingsOpen(false);
      }
    });
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) setSoftFullscreen(false);
      updateFullscreenButton();
      updateLandscapeHint();
    });

    window.addEventListener("keydown", guardInactiveKeyboard, true);
    window.addEventListener("keyup", guardInactiveKeyboard, true);
    window.addEventListener("blur", () => {
      const gameVisible = byId("doomGameShell") && !byId("doomGameShell").hidden;
      if (gameVisible && playerReady) deactivateKeyboard("Sessão pausada porque a janela perdeu o foco.");
    });
    document.addEventListener("visibilitychange", () => {
      const gameVisible = byId("doomGameShell") && !byId("doomGameShell").hidden;
      if (document.hidden && gameVisible && playerReady) deactivateKeyboard("Sessão pausada porque a aba ficou em segundo plano.");
    });
    window.addEventListener("error", event => {
      const details = `${event.message || ""} ${event.filename || ""}`;
      if (/doom|js-?dos|dosbox|wasm|emulator/i.test(details)) recoverDoomSession(details);
    });
    window.addEventListener("unhandledrejection", event => {
      const details = String(event.reason?.message || event.reason || "");
      if (/doom|js-?dos|dosbox|wasm|emulator/i.test(details)) recoverDoomSession(details);
    });
    window.addEventListener("resize", () => {
      const previousMode = mobileInput;
      applyInputMode();
      if (previousMode !== mobileInput && playerReady) {
        releaseAllTouchControls();
        syncTouchControls({ ready: playerReady });
        controlsActive = mobileInput;
        byId("doomStage")?.classList.toggle("is-touch-active", mobileInput);
        byId("doomStage")?.classList.toggle("is-keyboard-active", !mobileInput && controlsActive);
        if (mobileInput) {
          hideKeyboardGate();
          setKeyboardMessage("Controle touch ativo. Use o joystick e os botões de ação.");
        } else {
          controlsActive = false;
          setKeyboardMessage("Clique na área do jogo para ativar o teclado.");
          showKeyboardGate();
        }
      }
      updateLandscapeHint();
    });
    window.addEventListener("orientationchange", updateLandscapeHint);
  }

  window.addEventListener("DOMContentLoaded", () => {
    setupTouchPreferences();
    applyInputMode();
    setView("terminal");
    setupActions();
    setupTouchControls();
    updateFullscreenButton();
  }, { once: true });

  window.addEventListener("pagehide", event => {
    pauseSessionClock();
    releaseAllTouchControls();
    if (event.persisted) {
      pauseEmulator();
      return;
    }
    stopCurrentPlayer();
  });

  window.addEventListener("pageshow", event => {
    if (!event.persisted) return;
    const gameVisible = byId("doomGameShell") && !byId("doomGameShell").hidden;
    if (!gameVisible || !playerReady) return;
    emulatorPaused = true;
    controlsActive = false;
    setTouchSettingsOpen(false);
    showKeyboardGate("Toque para retomar", "A sessão foi preservada pelo navegador e está pausada.");
  });
})();
