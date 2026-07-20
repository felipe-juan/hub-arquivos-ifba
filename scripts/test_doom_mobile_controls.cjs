#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");

const js = fs.readFileSync("apps/doom/doom.js", "utf8");
const css = fs.readFileSync("apps/doom/doom.css", "utf8");
const html = fs.readFileSync("apps/doom/index.html", "utf8");
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

assert(detect({ search: "?touch=1" }) === true, "?touch=1 deve forçar controles móveis.");
assert(detect({ search: "?desktop=1", mobile: true, touchPoints: 5, coarse: true }) === false, "?desktop=1 deve desativar controles móveis.");
assert(detect({ mobile: true }) === true, "userAgentData.mobile deve ativar controles móveis.");
assert(detect({ userAgent: "Mozilla/5.0 (Linux; Android 14; Mobile)", touchPoints: 5 }) === true, "Android móvel deve ativar controles móveis.");
assert(detect({ touchPoints: 5, coarse: true, width: 1024 }) === true, "Ponteiro coarse deve ativar controles móveis.");
assert(detect({ touchPoints: 0, coarse: false, hoverless: false, width: 1440 }) === false, "Desktop comum não deve receber o HUD touch.");

for (const token of ["doomJoystick", "doomLookZone", "data-doom-hold=\"fire\"", "data-doom-hold=\"use\"", "data-doom-hold=\"run\""]) {
  assert(html.includes(token), `Controle móvel ausente no HTML: ${token}`);
}
assert(js.includes('syncTouchControls({ ready: false });'), "HUD touch deve aparecer durante o carregamento.");
assert(js.includes('next.add("strafe")'), "Joystick móvel deve oferecer deslocamento lateral moderno.");
assert(js.includes('event.currentTarget.setPointerCapture?.(event.pointerId);'), "Botões touch não capturam o ponteiro e podem ficar presos ao deslizar.");
assert(js.includes('setupLookZone();'), "Área touch de visão deve ser inicializada.");
assert(js.includes('return fallbackKeyboardEvent(keyCode, pressed);'), "Entrada touch deve possuir fallback para eventos de teclado.");
assert(!/function sendRawKeyEvent[\s\S]{0,120}if \(!commandInterface/.test(js), "Fallback não pode depender da interface completa do js-dos.");

const statusZ = Number(css.match(/\.doom-status\{[^}]*z-index:(\d+)/)?.[1] || 0);
const controlsZ = Number(css.match(/\.doom-touch-controls\{[^}]*z-index:(\d+)/)?.[1] || 0);
const errorZ = Number(css.match(/\.doom-status\.is-error\{z-index:(\d+)/)?.[1] || 0);
const gateZ = Number(css.match(/\.doom-keyboard-gate\{[^}]*z-index:(\d+)/)?.[1] || 0);
assert(controlsZ > statusZ, "HUD touch deve ficar acima do estado normal de carregamento.");
assert(gateZ > controlsZ, "A camada de retomada deve ficar acima do HUD touch.");
assert(errorZ > controlsZ, "Mensagens de erro devem ficar acima do HUD touch.");
assert(css.includes('.doom-touch-controls[data-ready="false"]'), "HUD touch precisa indicar visualmente o estado de carregamento.");

if (failures.length) {
  console.error(`Teste do controle móvel falhou com ${failures.length} problema(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("DOOM mobile controls regression test: OK");
