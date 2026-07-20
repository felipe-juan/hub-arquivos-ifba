#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");

const js = fs.readFileSync("apps/doom/doom.js", "utf8");
const css = fs.readFileSync("apps/doom/doom.css", "utf8");
const html = fs.readFileSync("apps/doom/index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const runtimeManifest = JSON.parse(fs.readFileSync("apps/doom/vendor/runtime-manifest.json", "utf8"));
const vendorScript = fs.readFileSync("scripts/vendor_doom_assets.sh", "utf8");
const coiCompat = fs.readFileSync("apps/doom/coi-serviceworker.js", "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Função não encontrada: ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Função incompleta: ${name}`);
}

const detection = extractFunction(js, "shouldUseTouchControls");
function detect({ search = "", userAgent = "", mobile = false, touchPoints = 0, coarse = false, hoverless = false, width = 390 } = {}) {
  const context = {
    URLSearchParams,
    location: { search },
    navigator: { maxTouchPoints: touchPoints, userAgent, userAgentData: { mobile } },
    window: {
      innerWidth: width,
      visualViewport: { width },
      matchMedia(query) {
        if (query === "(pointer: coarse)") return { matches: coarse };
        if (query === "(hover: none)") return { matches: hoverless };
        return { matches: false };
      },
    },
  };
  return vm.runInNewContext(`(${detection})();`, context);
}

const consumeGrant = extractFunction(js, "consumeHubLaunchGrant");
function grantAllowed({ from = "hub", token, stored = null, now } = {}) {
  const storage = new Map();
  if (stored) storage.set("hubDoomLaunchGrantV1", JSON.stringify(stored));
  const context = {
    URLSearchParams,
    location: { search: `?from=${encodeURIComponent(from)}&grant=${encodeURIComponent(token || "")}` },
    sessionStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      removeItem(key) { storage.delete(key); },
    },
    Date: { now: () => now },
    Number,
    JSON,
    String,
  };
  return vm.runInNewContext(`const LAUNCH_GRANT_KEY="hubDoomLaunchGrantV1"; const LAUNCH_GRANT_TTL_MS=60000; (${consumeGrant})();`, context);
}

assert(detect({ search: "?touch=1" }) === true, "?touch=1 deve forçar controles móveis.");
assert(detect({ search: "?desktop=1", mobile: true, touchPoints: 5, coarse: true }) === false, "?desktop=1 deve desativar controles móveis.");
assert(detect({ mobile: true }) === true, "userAgentData.mobile deve ativar controles móveis.");
assert(detect({ userAgent: "Mozilla/5.0 (Linux; Android 14; Mobile)", touchPoints: 5 }) === true, "Android móvel deve ativar controles móveis.");
assert(detect({ touchPoints: 5, coarse: true, width: 1024 }) === true, "Ponteiro coarse deve ativar controles móveis.");
assert(detect({ touchPoints: 0, coarse: false, hoverless: false, width: 1440 }) === false, "Desktop comum não deve receber o HUD touch.");

const issuedAt = 1_700_000_000_000;
const validToken = `${issuedAt.toString(36)}-abc123`;
assert(grantAllowed({ token: validToken, now: issuedAt + 5_000, stored: { source: "search-result", issuedAt, token: validToken } }) === true,
  "Grant recém-emitido pelo resultado da busca deve abrir o DOOM.");
assert(grantAllowed({ token: validToken, now: issuedAt + 61_000, stored: { source: "search-result", issuedAt, token: validToken } }) === false,
  "Grant expirado não deve abrir o DOOM diretamente.");
assert(grantAllowed({ token: validToken, from: "direct", now: issuedAt + 1_000 }) === false,
  "Acesso direto sem origem HUB deve voltar à pesquisa.");

for (const token of ["doomJoystick", "doomLookZone", "data-doom-hold=\"fire\"", "data-doom-hold=\"use\"", "data-doom-hold=\"run\"", "data-doom-tap=\"confirm\""]) {
  assert(html.includes(token), `Controle móvel ausente no HTML: ${token}`);
}
assert((html.match(/id="doomJoystick"/g) || []).length === 1, "O HUD deve possuir exatamente um joystick customizado.");
assert(js.includes('confirm: 257'), "O botão OK deve usar Enter no js-dos v8.");
assert(js.includes('confirm: 13'), "O botão OK deve usar Enter no modo compatível.");
assert(js.includes('jsdosConf:') && js.includes('layers: []'), "Controles virtuais nativos do bundle devem ser desativados.");
assert(js.includes('scaleControls: 0') && js.includes('setScaleControls?.(0)'), "Escala dos controles nativos deve permanecer zerada.");
assert(js.includes('kiosk: true') && js.includes('setKiosk?.(true)'), "Player deve usar kiosk para não duplicar interface móvel.");
assert(js.includes('playerReady || !commandInterface'), "HUD não deve ser liberado antes da Command Interface.");
assert(js.includes('window.emulatorsUi?.controls?.domToKeyCode'),
  "O roteador deve usar o conversor oficial de keyCode do js-dos quando disponível.");
assert(js.includes('syntheticKeyboardEvents.add(event)') && js.includes('syntheticKeyboardEvents.has(event)'),
  "Fallbacks DOM precisam ser marcados para não entrar em recursão no roteador.");
assert(js.includes('return fallbackKeyboardEvent(keyCode, pressed) || delivered;'),
  "Teclas precisam usar Command Interface e fallback DOM em paralelo.");
assert(js.includes('KeyW: Object.freeze(["up"])') && js.includes('KeyS: Object.freeze(["down"])'),
  "W/S exibidos precisam estar realmente mapeados no desktop.");
assert(js.includes('KeyA: Object.freeze(["strafe", "left"])') && js.includes('KeyD: Object.freeze(["strafe", "right"])'),
  "A/D devem oferecer deslocamento lateral moderno no desktop.");
assert(js.includes('ControlLeft: Object.freeze(["fire"])') && js.includes('ControlRight: Object.freeze(["fire"])'),
  "Ctrl esquerdo e direito precisam ser roteados explicitamente para atirar.");
assert(js.includes('Space: Object.freeze(["use"])'), "Espaço precisa ser roteado explicitamente para usar/abrir.");
assert(js.includes('if (holdActions.includes("fire")) pulseMenuConfirm();'),
  "Ctrl precisa confirmar o menu além de atirar.");
assert(js.includes('activateKeyboard({ focus: true, announce: false });'),
  "Desktop deve ativar WASD automaticamente quando a Command Interface ficar pronta.");
assert(js.includes('const mappedCommand = Boolean(DESKTOP_HOLD_ACTIONS[event.code] || DESKTOP_TAP_ACTIONS[event.code]);')
  && js.includes('activateKeyboard({ focus: true, announce: true });'),
  "A primeira tecla mapeada deve reativar o teclado sem exigir movimento do mouse.");
const activateKeyboardFn = extractFunction(js, "activateKeyboard");
assert(activateKeyboardFn.indexOf('controlsActive = true;') < activateKeyboardFn.indexOf('const resumePromise = resumeEmulator();'),
  "O roteador precisa ser ativado antes de aguardar a retomada do emulador.");
assert(js.includes('function focusGameInput()') && js.includes('window.requestAnimationFrame(focusGameInput);'),
  "Canvas deve receber foco imediatamente e novamente no frame seguinte.");
assert(js.includes('if (action === "fire") pulseMenuConfirm();'),
  "ATIRAR móvel precisa confirmar o menu além de atirar.");
assert(html.includes('<kbd>Espaço</kbd></span><span>Usar item / abrir porta</span>'),
  "Ajuda desktop deve informar claramente a tecla para usar/abrir.");
assert(html.includes('<kbd>Ctrl</kbd><b>ou</b><kbd>Mouse 1</kbd>') && html.includes('Atirar / confirmar'),
  "Ajuda desktop deve explicar que Ctrl e Mouse 1 atiram/confirmam.");
assert(js.includes('syncTouchControls({ ready: false });'), "HUD touch deve aparecer durante o carregamento.");
assert(js.includes('next.add("strafe")'), "Joystick móvel deve oferecer deslocamento lateral moderno.");
assert(js.includes('event.currentTarget.setPointerCapture?.(event.pointerId);'), "Botões touch não capturam o ponteiro e podem ficar presos ao deslizar.");
assert(js.includes('setupLookZone();'), "Área touch de visão deve ser inicializada.");
assert(js.includes('holdButtonSources.set(button, sources)') && js.includes('for (const sources of holdButtonSources.values()) sources.clear()'),
  "Ponteiros de botões mantidos durante blur/pausa precisam ser limpos.");
assert(js.includes('clearLaunchParameters();') && js.includes('url.searchParams.delete("grant")'),
  "Grant consumido deve ser removido da URL para impedir reabertura direta por recarga.");
assert(app.includes('hubDoomLaunchGrantV1') && js.includes('hubDoomLaunchGrantV1'), "Busca e app devem compartilhar o grant de abertura.");
assert(!app.includes('hubDoomDiscoveredV1') && !app.includes('discoveredBefore'), "Descoberta anterior não pode pular ou encurtar o fluxo do Easter Egg.");
assert(typeof runtimeManifest.localAssets === "boolean", "O manifesto precisa declarar localAssets como booleano.");
assert(js.includes('LOCAL.manifest') && js.includes('localRuntimeAvailable()'),
  "O loader deve decidir a fonte local por manifesto, sem sondar arquivos inexistentes.");
assert(js.includes('cdn.jsdelivr.net/npm/js-dos@8.4.1') && js.includes('unpkg.com/js-dos@8.4.1'),
  "O loader precisa oferecer CDNs npm independentes além do domínio oficial.");
assert(js.includes('https://v8.js-dos.com/v6.22/js-dos.js') && js.includes('legacyEngine.wdosbox'),
  "O fallback 6.22 precisa usar os endpoints oficiais atuais e o runtime correspondente.");
assert(vendorScript.includes('EMULATORS_VERSION="8.4.1"') && vendorScript.includes('npm pack'),
  "O instalador local precisa fixar js-dos e emulators na mesma versão.");
assert(!js.includes('method: "HEAD"') && !js.includes('headers: { Range: "bytes=0-0" }'),
  "O loader padrão não deve gerar 404 ao sondar bundle local ausente.");
assert(js.includes('workerThread: false') && js.includes('setWorkerThread?.(false)'),
  "Hospedagem estática padrão não deve depender de coi-serviceworker.js para Worker.");
assert(coiCompat.includes('workerThread:false') && coiCompat.includes('Compatibility no-op'),
  "Probe legado de coi-serviceworker.js precisa receber um fallback local inofensivo.");
assert(js.includes('window.emulators.pathPrefix = prefix'),
  "O caminho dos WASM remotos precisa ser aplicado explicitamente ao runtime global.");
assert(js.includes('resetStaleLocalEngine()') && js.includes('allowLocal: useLocalRuntime'),
  "Estado local antigo não pode contaminar uma inicialização remota.");
assert(vendorScript.includes('"localAssets": true') && vendorScript.includes('runtime-manifest.json'),
  "O instalador local deve habilitar o manifesto somente após validar os assets.");


const handleDesktopMappedKey = extractFunction(js, "handleDesktopMappedKey");
function simulateDesktopKey({ code, type = "keydown", repeat = false, metaKey = false } = {}) {
  const calls = [];
  const event = {
    code, type, repeat, metaKey,
    preventDefault() { calls.push("prevent"); },
    stopImmediatePropagation() { calls.push("stop"); },
  };
  const context = {
    event,
    mobileInput: false,
    playerReady: true,
    controlsActive: true,
    DESKTOP_HOLD_ACTIONS: {
      KeyW: Object.freeze(["up"]),
      KeyA: Object.freeze(["strafe", "left"]),
      KeyS: Object.freeze(["down"]),
      KeyD: Object.freeze(["strafe", "right"]),
      ControlLeft: Object.freeze(["fire"]),
      ControlRight: Object.freeze(["fire"]),
      Space: Object.freeze(["use"]),
    },
    DESKTOP_TAP_ACTIONS: { Enter: "confirm", NumpadEnter: "confirm", Escape: "menu" },
    desktopMappedKeys: new Map(),
    pulseMenuConfirm() { calls.push("confirm"); },
    holdAction(action, source) { calls.push(`hold:${action}:${source}`); },
    releaseAction(action, source) { calls.push(`release:${action}:${source}`); },
    tapRawKey(codeValue) { calls.push(`tap:${codeValue}`); },
    keyCodeForAction(action) { return action === "confirm" ? 257 : action === "menu" ? 256 : 0; },
  };
  const handled = vm.runInNewContext(`(${handleDesktopMappedKey})(event);`, context);
  return { handled, calls, mapped: context.desktopMappedKeys };
}

const ctrlDown = simulateDesktopKey({ code: "ControlLeft" });
assert(ctrlDown.handled === true && ctrlDown.calls.includes("confirm") && ctrlDown.calls.includes("hold:fire:desktop:ControlLeft"),
  "Ctrl precisa atirar e emitir confirmação do menu no primeiro keydown.");
assert(!ctrlDown.calls.includes("stop"),
  "O roteador não pode bloquear o evento físico antes do listener nativo do js-dos.");
const aDown = simulateDesktopKey({ code: "KeyA" });
assert(aDown.calls.includes("hold:strafe:desktop:KeyA") && aDown.calls.includes("hold:left:desktop:KeyA"),
  "A deve combinar strafe e esquerda para deslocamento lateral.");
const spaceDown = simulateDesktopKey({ code: "Space" });
assert(spaceDown.calls.includes("hold:use:desktop:Space"), "Espaço deve enviar a ação de usar/abrir.");
const enterDown = simulateDesktopKey({ code: "Enter" });
assert(enterDown.handled === true && !enterDown.calls.some(call => call.startsWith("tap:")),
  "Enter físico deve seguir ao listener nativo do js-dos sem pulso duplicado.");

const holdActionFn = extractFunction(js, "holdAction");
const releaseActionFn = extractFunction(js, "releaseAction");
const sourceCalls = [];
const sourceContext = {
  playerReady: true,
  controlsActive: true,
  actionSources: new Map(),
  sendActionEvent(action, pressed) { sourceCalls.push(`${action}:${pressed}`); },
};
vm.runInNewContext(`(${holdActionFn})("strafe", "desktop:A");`, sourceContext);
vm.runInNewContext(`(${holdActionFn})("strafe", "desktop:D");`, sourceContext);
vm.runInNewContext(`(${releaseActionFn})("strafe", "desktop:A");`, sourceContext);
vm.runInNewContext(`(${releaseActionFn})("strafe", "desktop:D");`, sourceContext);
assert(sourceCalls.join(",") === "strafe:true,strafe:false",
  "A/D simultâneos não podem soltar o strafe enquanto uma das teclas continuar pressionada.");

const statusZ = Number(css.match(/\.doom-status\{[^}]*z-index:(\d+)/)?.[1] || 0);
const controlsZ = Number(css.match(/\.doom-touch-controls\{[^}]*z-index:(\d+)/)?.[1] || 0);
const errorZ = Number(css.match(/\.doom-status\.is-error\{z-index:(\d+)/)?.[1] || 0);
const gateZ = Number(css.match(/\.doom-keyboard-gate\{[^}]*z-index:(\d+)/)?.[1] || 0);
assert(controlsZ > statusZ, "HUD touch deve ficar acima do estado normal de carregamento.");
assert(gateZ > controlsZ, "A camada de retomada deve ficar acima do HUD touch.");
assert(errorZ > controlsZ, "Mensagens de erro devem ficar acima do HUD touch.");
assert(css.includes('.doom-touch-controls[data-ready="false"]'), "HUD touch precisa indicar visualmente o estado de carregamento.");
assert(css.includes('.doom-touch-button--confirm'), "Botão OK precisa de estado visual próprio.");
assert(css.includes('#doomPlayer [class*="nipple"]'), "CSS precisa ocultar controles nativos residuais do js-dos.");
assert(css.includes('html[data-doom-handedness="left"] .doom-touch-utility{left:auto;right:calc(100% + 8px)}'),
  "Modo canhoto em paisagem não pode jogar MENU/ARMA para fora da tela.");

if (failures.length) {
  console.error(`Teste do controle móvel falhou com ${failures.length} problema(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("DOOM mobile controls regression test: OK");
