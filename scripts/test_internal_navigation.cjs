#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const data = fs.readFileSync(path.join(root, "data.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const experience = fs.readFileSync(path.join(root, "js/experience.js"), "utf8");
const quick = fs.readFileSync(path.join(root, "js/sidebar-quick-search.js"), "utf8");
const failures = [];

function assert(condition, message) { if (!condition) failures.push(message); }
function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const end = source.indexOf(`function ${nextName}`, start);
  if (end < 0) throw new Error(`Following function not found: ${nextName}`);
  return source.slice(start, end).trim();
}

const context = {};
vm.createContext(context);
vm.runInContext(`${extractFunction(app, "linkTargetAttrs", "thumbnailHtml")}; this.linkTargetAttrs = linkTargetAttrs;`, context);
assert(context.linkTargetAttrs({ url: "#media-final", newTab: true }) === "", "#media-final must not open in a new tab");
assert(context.linkTargetAttrs({ url: "#onde-resolvo", openMode: "new-tab" }) === "", "#onde-resolvo must not open in a new tab");
assert(context.linkTargetAttrs({ url: "https://example.org" }).includes('target="_blank"'), "External links should keep new-tab protection");

assert(!app.includes('linkTargetAttrs({ url: item.url, newTab: true })'), "Sidebar apps still force new-tab navigation");
assert(!app.includes('location.hash = "resolver"'), "Legacy #resolver target is still used directly");
assert(app.includes('"#resolver": "#onde-resolvo"'), "Legacy #resolver alias is missing");
assert(app.includes("setupInternalAnchorNavigation"), "Central internal-anchor router is missing");
assert(app.includes("routeHash"), "History state does not preserve the internal route hash");
assert(app.includes("sharedLinkRequestFromLocation"), "Shared document URL reader is missing");
assert(app.includes("handleSharedLink(sharedLinkRequest)"), "Shared document URLs are not handled during boot");
assert(experience.includes("HUB_NAVIGATE_TO_ANCHOR"), "Command palette does not use the internal router");
assert(quick.includes("HUB_NAVIGATE_TO_ANCHOR"), "Sidebar quick search does not use the internal router");

const ids = new Set([...html.matchAll(/\bid=["']([^"']+)/g)].map(match => match[1]));
for (const match of data.matchAll(/["']url["']\s*:\s*["'](#[^"']+)["']/g)) {
  const id = match[1].slice(1);
  assert(ids.has(id), `Catalog points to missing anchor: ${match[1]}`);
}

if (failures.length) {
  failures.forEach(message => console.error(`ERROR: ${message}`));
  process.exit(1);
}
console.log("Internal navigation regression test: OK");
