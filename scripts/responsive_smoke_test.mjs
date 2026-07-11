#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PORT = Number(process.env.HUB_TEST_PORT || 8765);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const pages = [
  { path: "/", name: "Página principal" },
  { path: "/apps/calendario/", name: "Calendário" },
  { path: "/apps/fluxogramas/", name: "Fluxogramas" },
  { path: "/apps/barema/", name: "Barema" },
];
const viewports = [
  { width: 390, height: 844, label: "celular" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 1440, height: 1000, label: "desktop" },
];

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "--directory", ROOT], {
  stdio: ["ignore", "pipe", "pipe"],
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(800) });
      if (response.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error("Servidor local não iniciou a tempo.");
}

const failures = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  for (const viewport of viewports) {
    for (const target of pages) {
      const page = await context.newPage();
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.goto(`${BASE_URL}${target.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        title: document.title,
      }));
      const overflow = Math.max(metrics.documentWidth, metrics.bodyWidth) - metrics.viewportWidth;
      if (overflow > 4) {
        failures.push(`${target.name} em ${viewport.label}: estouro horizontal de ${overflow}px.`);
      }
      if (!metrics.title.trim()) {
        failures.push(`${target.name} em ${viewport.label}: página sem título.`);
      }
      for (const message of pageErrors) {
        failures.push(`${target.name} em ${viewport.label}: erro JavaScript — ${message}`);
      }
      await page.close();
    }
  }
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error(`Teste responsivo falhou com ${failures.length} problema(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log("Teste responsivo concluído em 390 px, 768 px e 1440 px sem estouro horizontal ou erros de página.");
