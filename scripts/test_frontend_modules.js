'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const dir = path.join(root, 'apps', 'assistente');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'app.css'), 'utf8');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const config = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'hub-assistente-release.json'), 'utf8'));
const appVersion = String(release.assistant);

const search = fs.readFileSync(path.join(root, 'sidebar', 'hub-search.js'), 'utf8');
const network = fs.readFileSync(path.join(root, 'sidebar', 'hub-network.js'), 'utf8');
const academicSearch = JSON.parse(fs.readFileSync(path.join(root, 'sidebar', 'hub-academic-search.json'), 'utf8'));
const offlineAcademic = JSON.parse(fs.readFileSync(path.join(dir, 'offline-academic.json'), 'utf8'));

for (const obsolete of ['api-client.js','history-store.js','offline-search.js','chat-controller.js','composer-controller.js','message-renderer.js','response-actions.js']) {
  assert.equal(fs.existsSync(path.join(dir, obsolete)), false, `módulo regressivo ainda presente: ${obsolete}`);
  assert.equal(html.includes(obsolete), false, `HTML ainda carrega módulo regressivo: ${obsolete}`);
}
for (const marker of [
  'async function send(text, { appendUser = true, bypassLocal = false } = {})',
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
assert.ok(app.includes("period=${encodeURIComponent(period)}"), 'Mais perguntadas deve enviar o período efetivamente capturado pela requisição');
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

for (const marker of ['Documentos', 'Apps', 'Professores', 'Disciplinas', 'Links', 'Perguntar ao Assistente', 'suggestionFor', 'boundedDistance', 'hubGlobalSearchInput']) {
  assert.ok(search.includes(marker), `busca global ausente: ${marker}`);
}
assert.ok(search.includes('tranacamento') && search.includes('trancamento'));
assert.ok(search.includes("searchParams.set('q'"));
assert.ok(network.includes('Offline · Conteúdo salvo até'));
assert.ok(network.includes('Conexão lenta · Conteúdo local disponível'));
assert.ok(network.includes("showToast('HUB atualizado'"));
assert.ok(Array.isArray(academicSearch.items) && academicSearch.items.some(item => item.kind === 'professor'));
assert.ok(academicSearch.items.some(item => item.kind === 'discipline'));
assert.ok(app.includes('O Assistente está temporariamente indisponível, mas documentos e ferramentas do HUB continuam funcionando.'));
assert.ok(app.includes("searchParams.get('q')"));
assert.ok(html.includes('../../sidebar/hub-search.js') && html.includes('../../sidebar/hub-network.js'));
assert.equal(html.includes('sidebar-quick-search.js'), false);

// v2.0.0 — qualidade percebida, offline acadêmico e histórico estruturado.
for (const marker of [
  'function syncActiveContextUi()', 'id="activeContextBar"', 'id="clearActiveContext"',
  'function patchStreamingMessage(message)', 'data-assistant-text',
  'function renameConversation(', 'function deleteConversation(', 'conversationHistorySearch',
  'function localAcademicAnswer(', 'function syncLocalAnswerWithServer(',
  'function renderInterrupted(message)', 'data-continue-interrupted',
  'DB_CONVERSATIONS', 'DB_MESSAGES', "database.createObjectStore(DB_MESSAGES, { keyPath:'id' })",
  'function openAssistantDialog(', 'function askAssistantText(', 'function confirmAssistantAction(',
  'function smartConversationTitle(', 'popular-trend'
]) assert.ok(app.includes(marker) || html.includes(marker), `contrato UX v2.0.0 ausente: ${marker}`);
assert.ok(html.includes('id="anonymousModeToggle"') && app.includes('toggleAnonymousMode') && app.includes("telemetryMode:'anonymous'"));
assert.equal(/\bprompt\s*\(/u.test(app), false, 'prompt() nativo não pode voltar');
assert.equal(/\bconfirm\s*\(/u.test(app), false, 'confirm() nativo não pode voltar');
assert.ok(config.includes('offlineAcademicPath'), 'configuração da base acadêmica offline ausente');
assert.ok(Array.isArray(offlineAcademic.professors) && offlineAcademic.professors.length >= 20, 'base acadêmica offline sem professores');
assert.ok(Array.isArray(offlineAcademic.scheduleEntries) && offlineAcademic.scheduleEntries.length >= 50, 'base acadêmica offline sem horários');
assert.ok(JSON.stringify(offlineAcademic.professorAliases || {}).toLowerCase().includes('leo'), 'alias leo ausente do offline acadêmico');
assert.ok(app.includes("timeZone:'America/Bahia'"), 'hoje/amanhã do motor offline deve usar o fuso da Bahia');
assert.ok(app.includes('const localFollowup = query.length <= 80'), 'follow-up local não reutiliza contexto ativo');
assert.ok(app.includes('state.localSyncQueue = state.localSyncQueue.then'), 'sincronização em segundo plano das respostas locais não está serializada');
assert.ok(app.includes('clearedDuringSync') && app.includes('await clearRemoteContext(conversation.sessionId)'), 'limpar contexto pode perder corrida para sincronização local');
assert.ok(app.includes("sync:true, subject:'Calendário acadêmico'"), 'calendário instantâneo deve preservar sincronização de contexto/métricas');
assert.ok(app.includes("calendario-academico-2026.png"), 'calendário offline perdeu a imagem local');
assert.ok(app.includes('hasIntegratedSource') && app.includes('sourceDetails'), 'fonte progressiva pode voltar a duplicar o componente consolidado');

assert.ok(search.includes("input.addEventListener('click'"), 'busca global deve abrir também por click sintético/acessível'); // ativação por click

// v2.0.2 — Mais perguntadas responsivo e semanticamente estável.
for (const marker of ['popular-rank','popular-item-content','popular-item-stats','popular-count','popular-item-chevron']) {
  assert.ok(app.includes(marker), `Mais perguntadas sem estrutura responsiva: ${marker}`);
}
for (const marker of ['@media (max-width: 680px)','grid-template-columns: 28px minmax(0, 1fr) 16px','font-variant-numeric: tabular-nums']) {
  assert.ok(css.includes(marker), `Mais perguntadas sem CSS responsivo: ${marker}`);
}
assert.equal(css.includes('.saved-item.popular-item {'), false, 'Mais perguntadas não pode herdar o reset visual dos botões internos de Favoritos');

// v2.0.4 — cards de conversa compactos e cabeçalho de populares consistente.
for (const marker of ['conversation-card-title-row','conversation-current-badge','conversation-card-preview','conversation-open-button','conversation-actions-menu','conversation-actions-popover']) {
  assert.ok(app.includes(marker), `Histórico sem componente esperado: ${marker}`);
}
for (const marker of ['.conversation-history-head { grid-template-columns:1fr','.conversation-history-search { width:100%','.conversation-card {','.conversation-card-preview {','.conversation-actions-popover {']) {
  assert.ok(css.includes(marker), `Histórico sem CSS responsivo: ${marker}`);
}
assert.ok(html.includes('🔥 Mais perguntadas hoje'), 'Mais perguntadas deve manter emoji no título inicial');
assert.ok(app.includes("'🔥 Mais perguntadas da semana'") && app.includes("'🔥 Mais perguntadas hoje'"), 'emoji deve persistir ao alternar Hoje/Semana');
assert.equal(app.includes('class="saved-item conversation-history-row"'), false, 'Conversas não devem herdar o layout genérico de saved-item');

console.log('Frontend Assistente: busca global, estados de erro, offline visível e contratos conversacionais aprovados.');
