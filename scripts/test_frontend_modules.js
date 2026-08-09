'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const dir = path.join(root, 'apps', 'assistente');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'hub-assistente-release.json'), 'utf8'));
const appVersion = String(release.assistant);

for (const obsolete of ['api-client.js','history-store.js','offline-search.js','chat-controller.js','composer-controller.js','message-renderer.js','response-actions.js']) {
  assert.equal(fs.existsSync(path.join(dir, obsolete)), false, `módulo regressivo ainda presente: ${obsolete}`);
  assert.equal(html.includes(obsolete), false, `HTML ainda carrega módulo regressivo: ${obsolete}`);
}
for (const marker of [
  'async function send(text, { appendUser = true } = {})',
  'const active = beginMessageRequest()',
  "if (state.activeRequest) abortMessageRequest('superseded')",
  "const result = await requestStream(CONFIG.messagePath || '/api/assistant/message'",
  'if (state.activeRequest?.id !== active.id) return',
  'finishMessageRequest(active.id)',
  'function showTyping()',
  'function hideTyping()',
  'function stopCurrentResponse()',
  "if (state.activeRequest && !draft.trim()) stopCurrentResponse()",
]) assert.ok(app.includes(marker), `contrato monolítico ausente: ${marker}`);
assert.ok(html.includes(`config.js?v=${appVersion}`));
assert.ok(html.includes(`app.js?v=${appVersion}`));
assert.ok(html.includes('interactive-widget=resizes-content'));

assert.ok(html.includes('../../sidebar/hub-url-resolver.js'));
assert.ok(html.includes('../../sidebar/hub-user-state.js'));
assert.ok(app.includes("const FAVORITES_KEY = 'hubFavoritesV2'"));
assert.ok(app.includes("data-popular-period"));
assert.ok(app.includes("period=${encodeURIComponent(state.popularPeriod)}"));
assert.ok(app.includes('mailto:${email}'));
assert.ok(app.includes('visualViewport?.addEventListener(\'scroll\''));
for (const marker of [
  'application/x-ndjson', 'data-edit-message', 'data-regenerate-message', 'data-feedback-reason',
  'function renderSources(message)', 'function sourceHref(source = {})', 'pdf-page-preview', 'context-chip',
  'bestOfflineSnippet', 'function regenerateMessage(messageId)', 'function saveEditedMessage(messageId)'
]) assert.ok(app.includes(marker), `contrato UX 1.6.0 ausente: ${marker}`);

assert.ok(app.includes('if (!/^(?:https?:\\/\\/|mailto:)/i.test(raw)) return false'), 'opções numéricas não podem virar URL relativa');
assert.ok(app.includes('attachmentIsImage'), 'preview inline de imagem ausente');
assert.ok(app.includes('class="attachment-preview"'), 'markup de preview inline ausente');
console.log('Frontend Assistente 1.6.0: contrato de envio, streaming, edição, fontes e interrupção aprovado.');
