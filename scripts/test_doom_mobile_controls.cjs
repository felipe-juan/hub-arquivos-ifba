#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");

const js = fs.readFileSync("apps/doom/doom.js", "utf8");
const css = fs.readFileSync("apps/doom/doom.css", "utf8");
const html = fs.readFileSync("apps/doom/index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
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
assert(js.includes('if (mobileInput) return false;'), "Eventos touch não devem fingir sucesso com KeyboardEvent sintético.");
assert(js.includes('KeyW: "up"') && js.includes('KeyA: "left"') && js.includes('KeyS: "down"') && js.includes('KeyD: "right"'),
  "WASD exibido precisa estar realmente mapeado no desktop.");
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
