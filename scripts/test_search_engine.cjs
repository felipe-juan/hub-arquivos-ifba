#!/usr/bin/env node
"use strict";
const { HubSearchEngine } = require("../js/search-engine.js");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const filters = { type: "all", status: "all", docType: "all", correspondent: "all", format: "all" };
const doc = {
  id: "regulamento-matricula",
  title: "Resolução de Matrícula e Educação",
  summary: "Regras acadêmicas de matrícula.",
  tags: ["matrícula", "educação", "resolução"],
  status: "verified",
  documentType: "Regulamento",
  correspondent: "CORES",
  fileFormat: "PDF",
  sourceUrl: "documents/regulamento.pdf",
  chunks: [
    { id: "p2", page: "2", heading: "Segunda chamada", text: "Matrícula e segunda chamada de avaliações." },
    { id: "p6", page: "6", heading: "Prazo", text: "Prazo para solicitação de matrícula." },
    { id: "p7", page: "7", heading: "Exceções", text: "Casos excepcionais de matrícula e educação." },
  ],
};
const engine = new HubSearchEngine({
  documents: [doc], links: [], apps: [], answers: [],
  conceptMap: { matricula: ["matrícula", "registro acadêmico"], resolucao: ["resolução"] },
});

for (const query of ["matricula", "matrícula", "matriclua", "matricul"]) {
  const response = engine.search(query, filters);
  assert(response.results.length === 1, `${query}: deveria retornar um único documento.`);
  assert(response.results[0]?.id === doc.id, `${query}: retornou documento incorreto.`);
  assert(response.results[0]?.matchCount === 3, `${query}: deveria agrupar três trechos reais.`);
  assert(JSON.stringify(response.results[0]?.matchedPages) === JSON.stringify(["2", "6", "7"]), `${query}: páginas agrupadas incorretas.`);
}
for (const query of ["resolucao", "resolução", "educacao", "educação"]) {
  const response = engine.search(query, filters);
  assert(response.results[0]?.id === doc.id, `${query}: tolerância a acento/cedilha falhou.`);
}
const typo = engine.search("matriclua", filters);
assert(typo.correction?.changed === true, "Transposição inequívoca deveria ser anunciada como correção.");
assert(String(typo.effectiveQuery).toLowerCase().includes("matr"), "Consulta corrigida não foi devolvida.");
const advanced = engine.search('"matriclua"', filters);
assert(advanced.correction?.changed === false, "Busca entre aspas não deve ser reescrita silenciosamente.");

if (failures.length) {
  console.error(`Search engine regression test failed with ${failures.length} issue(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("Search engine regression test: OK");
