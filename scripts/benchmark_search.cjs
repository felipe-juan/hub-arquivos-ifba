#!/usr/bin/env node
"use strict";
const { performance } = require("node:perf_hooks");
const { HubSearchEngine } = require("../js/search-engine.js");
const args = new Set(process.argv.slice(2));
const categories = ["Regulamento", "Calendário", "PPC", "Portaria", "Resolução", "Manual"];
const topics = ["matrícula", "segunda chamada", "estágio", "assistência estudantil", "calendário acadêmico", "aproveitamento de estudos", "atividades complementares", "fluxograma curricular"];
const normalize = text => String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const documents = Array.from({ length: 320 }, (_, i) => {
  const topic = topics[i % topics.length];
  const kind = categories[i % categories.length];
  const title = `${kind} ${topic} ${2020 + (i % 7)}`;
  const summary = `Documento institucional sobre ${topic}, prazos, procedimentos e direitos dos estudantes.`;
  const tags = [topic, kind, "IFBA"];
  const chunks = Array.from({ length: 7 }, (_, page) => {
    const heading = `${kind} — ${topic}`;
    const text = `Página ${page + 1}. Informações sobre ${topic}. Solicitação, prazo, documentos necessários, atendimento institucional e orientações acadêmicas para estudantes do IFBA.`;
    return { id: `doc-${i}-p${page + 1}`, page: page + 1, heading, text, normalized: { heading: normalize(heading), text: normalize(text), tags: normalize(tags.join(" ")), all: normalize(`${heading} ${text} ${tags.join(" ")}`) } };
  });
  return {
    id: `doc-${i}`,
    title,
    summary,
    tags,
    status: i % 9 === 0 ? "review" : "verified",
    documentType: kind,
    correspondent: i % 3 === 0 ? "CORES" : "IFBA",
    fileFormat: "PDF",
    sourceUrl: `documents/doc-${i}.pdf`,
    normalized: { title: normalize(title), summary: normalize(summary), tags: normalize(tags.join(" ")), meta: normalize(`${kind} ${i % 3 === 0 ? "CORES" : "IFBA"} PDF verified`), all: normalize(`${title} ${summary} ${tags.join(" ")} ${kind} PDF`) },
    chunks
  };
});
const engine = new HubSearchEngine({ documents, links: [], apps: [], answers: [], conceptMap: { matricula: ["matrícula", "registro acadêmico"], estagio: ["estágio", "CAENS"] } });
const filters = { type: "all", status: "all", docType: "all", correspondent: "all", format: "all" };
const queries = ["matricula", "matriclua", "matricul", "segunda chamada", "estágio", "calendario academico", '"aproveitamento de estudos"', "portaria IFBA", "assistência -edital", "PPC OR fluxograma"];
for (let i = 0; i < 10; i += 1) engine.search(queries[i % queries.length], filters);
const samples = [];
for (let round = 0; round < 12; round += 1) {
  for (const query of queries) {
    const start = performance.now();
    engine.search(query, filters);
    samples.push(performance.now() - start);
  }
}
samples.sort((a, b) => a - b);
const percentile = p => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
const result = {
  documents: documents.length,
  chunks: documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
  samples: samples.length,
  medianMs: Number(percentile(.5).toFixed(3)),
  p95Ms: Number(percentile(.95).toFixed(3)),
  worstMs: Number(samples.at(-1).toFixed(3))
};
if (args.has("--json")) process.stdout.write(JSON.stringify(result));
else console.log(`Busca: mediana=${result.medianMs} ms, p95=${result.p95Ms} ms, pior=${result.worstMs} ms (${result.documents} documentos/${result.chunks} trechos).`);
