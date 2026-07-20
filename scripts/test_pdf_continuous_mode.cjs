#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const viewer = fs.readFileSync("document-viewer.html", "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(viewer.includes('id="viewMode"'), "Botão de modo contínuo ausente.");
assert(viewer.includes('id="continuousStack"'), "Pilha contínua ausente.");
assert(viewer.includes('function setViewMode'), "Troca de modo não está centralizada.");
assert(viewer.includes('function scrollToContinuousPage'), "Campo de página não navega no modo contínuo.");
assert(viewer.includes('function updateContinuousCurrentPage'), "Página atual não acompanha a rolagem contínua.");
assert(viewer.includes('CONTINUOUS_CONCURRENCY = 2'), "Renderização contínua não limita concorrência.");
assert(viewer.includes('CONTINUOUS_RENDER_LIMIT = 9'), "Renderização contínua não limita memória.");
assert(viewer.includes('entry.rendering = true'), "Fila pode iniciar a mesma página mais de uma vez.");
assert(viewer.includes('continuousObserver?.disconnect()'), "Observer contínuo não é liberado.");
assert(viewer.includes('cancelContinuousTasks({ clear: true })'), "Recursos contínuos não são liberados ao sair.");
assert(viewer.includes('next.searchParams.set("view", "continuous")'), "Modo contínuo não é preservado na URL.");
assert(viewer.includes('safeSet(VIEW_MODE_KEY, clean)'), "Preferência de visualização não é persistida com proteção.");
assert(viewer.includes('.viewer.continuous-mode .stage'), "CSS do modo contínuo ausente.");
assert(viewer.includes('touch-action:pan-y pinch-zoom'), "Rolagem natural no touch ausente.");

if (failures.length) {
  console.error(`PDF continuous mode test failed with ${failures.length} issue(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("PDF continuous mode regression test: OK");
