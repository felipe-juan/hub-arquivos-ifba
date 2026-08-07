'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootPath = path.resolve(process.argv[2] || '.');
const context = vm.createContext({
  window: { HUBAssistant: {} },
  globalThis: null,
  AbortController,
  setTimeout,
  clearTimeout,
  console
});
context.globalThis = context;
const source = fs.readFileSync(path.join(rootPath, 'apps/assistente/chat-controller.js'), 'utf8');
vm.runInContext(source, context, { filename: 'chat-controller.js' });
const { ChatController } = context.window.HUBAssistant.chat;

async function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async () => {
  const states = [];
  const controller = new ChatController({ timeoutMs: 60, onStateChange: active => states.push(Boolean(active)) });
  let staleSuccess = 0;
  let freshSuccess = 0;

  const first = controller.run(async signal => {
    await delay(45);
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return 'old';
  }, { onSuccess: () => { staleSuccess += 1; } });

  await delay(5);
  const second = controller.run(async signal => {
    await delay(5);
    assert.equal(signal.aborted, false);
    return 'new';
  }, { onSuccess: value => { assert.equal(value, 'new'); freshSuccess += 1; } });

  const [oldResult, newResult] = await Promise.all([first, second]);
  assert.equal(oldResult.ignored, true);
  assert.equal(newResult.ok, true);
  assert.equal(staleSuccess, 0);
  assert.equal(freshSuccess, 1);
  assert.equal(controller.sending, false);

  let timeoutReason = '';
  const timed = await controller.run(() => new Promise(() => {}), {
    onError: (_error, reason) => { timeoutReason = reason; }
  });
  assert.equal(timed.ok, false);
  assert.equal(timeoutReason, 'timeout');
  assert.equal(controller.sending, false);

  const manual = controller.run(() => new Promise(() => {}));
  await delay(5);
  assert.equal(controller.abort('user-stop'), true);
  const manualResult = await manual;
  assert.equal(manualResult.ignored, true);
  assert.equal(controller.sending, false);
  assert.ok(states.includes(true) && states.at(-1) === false);

  let capturedOptions = null;
  const apiContext = vm.createContext({
    window: { HUBAssistant: {} },
    globalThis: null,
    location: { href: 'https://hub.example/apps/assistente/', protocol: 'https:' },
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    fetch: (_url, options) => {
      capturedOptions = options;
      return new Promise(() => {});
    }
  });
  apiContext.globalThis = apiContext;
  vm.runInContext(fs.readFileSync(path.join(rootPath, 'apps/assistente/api-client.js'), 'utf8'), apiContext, { filename: 'api-client.js' });
  const api = apiContext.window.HUBAssistant.api.createApiClient({ apiBaseUrl: 'https://api.example', requestTimeoutMs: 1000 });
  const outerController = new AbortController();
  const started = Date.now();
  await assert.rejects(
    api.request('/api/assistant/message', { message: 'teste' }, { signal: outerController.signal, timeoutMs: 1000 }),
    error => error?.code === 'ASSISTANT_RESPONSE_TIMEOUT' && error?.reason === 'timeout'
  );
  assert.ok(Date.now() - started < 2500, 'timeout próprio do cliente não encerrou a requisição');
  assert.equal(capturedOptions.headers['content-type'], 'text/plain;charset=UTF-8');
  assert.equal(capturedOptions.mode, 'cors');
  assert.equal(capturedOptions.credentials, 'omit');

  console.log('Módulos do frontend: ciclo, timeout rígido, CORS simples e interrupção aprovados.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
