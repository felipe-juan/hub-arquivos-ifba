#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(html.includes('id="linksColumnsSelect"'), "Seletor de colunas dos Links não existe.");
assert(html.includes('id="linksColumnsLabel"'), "Seletor de colunas dos Links não possui rótulo acessível.");
assert(js.includes('linksColumnsQuick: "auto"'), "Estado independente da visualização rápida ausente.");
assert(js.includes('linksColumnsCards: "auto"'), "Estado independente da visualização detalhada ausente.");
assert(js.includes('function linksColumnsPreferenceKey'), "Persistência por visualização/dispositivo ausente.");
assert(js.includes('view === "cards" ? "Cards" : "Quick"'), "Preferências rápida e detalhada não estão separadas.");
assert(js.includes('grid.style.gridTemplateColumns = `repeat(${clean}, minmax(0, 1fr))`'), "Quantidade escolhida não é aplicada à grade.");
assert(js.includes('applyLinksColumns({ persist: true })'), "Mudança de colunas não é persistida.");
assert(js.includes('loadLinksColumnPreferences();'), "Preferências de colunas não são restauradas.");
assert(js.includes('linksDeviceBucket'), "Troca celular/desktop não restaura a preferência específica do dispositivo.");
assert(js.includes('cancelAnimationFrame(linksResizeFrame)'), "Resize dos Links não é agrupado por frame.");
assert(css.includes('.links-columns-control'), "Estilos do seletor de colunas ausentes.");

assert(html.includes('<span id="linksColumnsLabel">Colunas</span>'), "Rótulo do seletor deve ser apenas Colunas.");
assert(css.includes('grid-template-columns: max-content minmax(118px, 160px) max-content max-content'), "Controles de Links não permanecem na mesma fileira com seletor intrínseco no desktop.");
assert(html.includes('class="section content-section apps-section"'), "Seção de Apps não possui classe de layout dedicada.");
assert(css.includes('.apps-section .cards-grid'), "Grade de Apps não possui regra desktop dedicada.");
assert(css.includes('grid-template-columns: repeat(5, minmax(0, 1fr))'), "Os cinco Apps não são mantidos em uma única fileira no desktop.");

if (failures.length) {
  console.error(`Teste das colunas de Links falhou com ${failures.length} problema(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("Links columns regression test: OK");
