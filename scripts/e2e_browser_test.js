#!/usr/bin/env node
'use strict';
const fs=require('node:fs'); const path=require('node:path'); const os=require('node:os'); const net=require('node:net'); const {spawn}=require('node:child_process');
function arg(name){const i=process.argv.indexOf(name);return i>=0?String(process.argv[i+1]||''):''}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function pickPort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
async function waitUrl(url,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){try{const r=await fetch(url,{cache:'no-store'});if(r.status<500)return true}catch{}await sleep(150)}return false}
function findChrome(){for(const p of [process.env.HUB_E2E_CHROMIUM,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].filter(Boolean)){if(fs.existsSync(p))return p}throw new Error('Chromium/Chrome não encontrado. Instale chromium ou defina HUB_E2E_CHROMIUM.')}
class CDP{
  constructor(url){this.url=url;this.id=0;this.pending=new Map()}
  async open(){this.ws=new WebSocket(this.url);this.ws.onmessage=e=>{const d=JSON.parse(String(e.data));if(d.id&&this.pending.has(d.id)){const {resolve,reject}=this.pending.get(d.id);this.pending.delete(d.id);d.error?reject(new Error(JSON.stringify(d.error))):resolve(d.result||{})}};await new Promise((res,rej)=>{this.ws.onopen=res;this.ws.onerror=rej})}
  call(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.pending.delete(id))reject(new Error(`CDP timeout: ${method}`))},8000)})}
  async eval(expression){try{new Function(String(expression))}catch(error){throw new Error(`JS E2E preflight inválido: ${error.message}; expressão=${String(expression).slice(0,240)}`)}const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(`JS E2E: ${JSON.stringify(r.exceptionDetails)}`);return r.result?.value}
  async waitJs(expression,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await this.eval(expression))return}catch{}await sleep(150)}throw new Error(`Timeout aguardando: ${expression}`)}
  close(){try{this.ws.close()}catch{}}
}
async function targets(port){return fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())}
async function terminate(proc){if(!proc)return;const waitExit=ms=>new Promise(resolve=>{if(proc.exitCode!==null||proc.signalCode){resolve(true);return}const done=()=>{clearTimeout(timer);resolve(true)};const timer=setTimeout(()=>{proc.off('exit',done);resolve(false)},ms);proc.once('exit',done)});try{proc.kill('SIGTERM')}catch{}if(await waitExit(1500))return;try{proc.kill('SIGKILL')}catch{}await waitExit(2000)}
function cleanupTemp(dir){if(!dir)return;for(let attempt=0;attempt<8;attempt++){try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});return}catch(error){if(!['ENOTEMPTY','EBUSY','EPERM','EACCES'].includes(error?.code)){console.warn(`E2E cleanup: aviso ao remover ${dir}: ${error.message}`);return}try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100*(attempt+1))}catch{}}}try{require('node:child_process').spawnSync('rm',['-rf','--',dir],{stdio:'ignore',timeout:5000})}catch{}if(fs.existsSync(dir))console.warn(`E2E cleanup: perfil temporário permaneceu em ${dir}; o teste funcional já havia concluído.`)}
(async()=>{
  let siteUrl=arg('--site-url').replace(/\/$/,''); let apiUrl=arg('--api-url').replace(/\/$/,'');
  const siteRoot=arg('--site-root'); const backendRoot=arg('--backend-root');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hub-e2e-')); const procs=[]; let configPath='',configBackup=null;
  try{
    if(!siteUrl){
      if(!siteRoot||!backendRoot)throw new Error('Use --site-url/--api-url ou --site-root/--backend-root.');
      const webPort=await pickPort(),apiPort=await pickPort(); siteUrl=`http://127.0.0.1:${webPort}`;apiUrl=`http://127.0.0.1:${apiPort}`;
      configPath=path.join(siteRoot,'apps/assistente/config.js');configBackup=fs.readFileSync(configPath);
      let cfg=configBackup.toString('utf8');const updated=cfg.replace(/apiBaseUrl:\s*"[^"]*"/,`apiBaseUrl: "${apiUrl}"`);if(updated===cfg)throw new Error('apiBaseUrl não encontrado para E2E');fs.writeFileSync(configPath,updated);
      fs.mkdirSync(path.join(temp,'data'),{recursive:true});
      const env={...process.env,DATA_DIR:path.join(temp,'data'),ASSISTANT_HOST:'127.0.0.1',ASSISTANT_PORT:String(apiPort),ASSISTANT_ALLOWED_ORIGINS:siteUrl,ASSISTANT_PUBLIC_BASE_URL:apiUrl,ASSISTANT_HUB_BASE_URL:siteUrl,ASSISTANT_DIAGNOSTICS_ENABLED:'0'};
      const api=spawn(process.execPath,['packages/web-assistant/src/index.js'],{cwd:backendRoot,env,stdio:'ignore'});procs.push(api);
      const web=spawn('python3',['-m','http.server',String(webPort),'--bind','127.0.0.1'],{cwd:siteRoot,stdio:'ignore'});procs.push(web);
      if(!await waitUrl(apiUrl+'/health',20000))throw new Error('API E2E não iniciou');if(!await waitUrl(siteUrl+'/apps/assistente/',10000))throw new Error('Site E2E não iniciou');
    }
    const port=await pickPort();const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-popup-blocking',`--remote-debugging-port=${port}`,'--remote-allow-origins=*',`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{stdio:'ignore'});procs.push(chrome);
    if(!await waitUrl(`http://127.0.0.1:${port}/json/version`,10000))throw new Error('Chromium E2E não iniciou');
    const page=(await targets(port)).find(t=>t.type==='page');const cdp=new CDP(page.webSocketDebuggerUrl);await cdp.open();
    try{
      await cdp.call('Page.enable');await cdp.call('Runtime.enable');await cdp.call('Network.enable');await cdp.call('Page.navigate',{url:siteUrl+'/apps/assistente/?e2e=1'});await cdp.waitJs("document.readyState==='complete'&&!!document.querySelector('#messageInput')",10000);
      // Busca global real: abre ao tocar, pesquisa enquanto digita, agrupa categorias e sugere correção.
      await cdp.eval("document.querySelector('#sidebarSearchInput')?.click()");
      try {
        await cdp.waitJs("!!document.querySelector('#hubGlobalSearchInput')&&!document.querySelector('#hubGlobalSearch').hidden",5000);
      } catch (error) {
        const searchState=await cdp.eval("({hubSearch:typeof window.HUB_SEARCH,sidebarInput:!!document.querySelector('#sidebarSearchInput'),bound:document.querySelector('#sidebarSearchForm')?.dataset.hubSearchBound||'',overlay:!!document.querySelector('#hubGlobalSearch'),hidden:document.querySelector('#hubGlobalSearch')?.hidden??null})");
        throw new Error(`busca global não abriu por click: ${JSON.stringify(searchState)}`);
      }
      await cdp.eval("(()=>{const input=document.querySelector('#hubGlobalSearchInput');if(!input)return false;input.value='calc';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      await cdp.waitJs("!!document.querySelector('[data-search-group=\"discipline\"]')&&!!document.querySelector('[data-search-group=\"app\"]')",6000);
      if(!await cdp.eval("[...document.querySelectorAll('[data-search-group=\"discipline\"] strong')].some(e=>/cálculo|calculo/i.test(e.textContent))"))throw new Error('busca global não encontrou disciplina de cálculo');
      if(!await cdp.eval("[...document.querySelectorAll('[data-search-group=\"app\"] strong')].some(e=>/média|media|final/i.test(e.textContent))"))throw new Error('busca global não encontrou Calculadora/Média Final');
      await cdp.eval("(()=>{const input=document.querySelector('#hubGlobalSearchInput');if(!input)return false;input.value='tracamento';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      await cdp.waitJs("!!document.querySelector('[data-search-suggestion=\"trancamento\"]')",6000);
      await cdp.eval("document.querySelector('[data-search-close]')?.click()");
      // Estado offline visível e retorno online com confirmação de atualização.
      await cdp.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
      await cdp.waitJs("document.documentElement.dataset.hubNetwork==='offline'",5000);
      if(!await cdp.eval("String(document.querySelector('#hubNetworkStatus')?.textContent||'').includes('Offline')"))throw new Error('estado Offline não ficou visível');
      // O motor acadêmico local deve responder de verdade sem rede e expor o contexto ativo.
      const offlineBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("(()=>{const input=document.querySelector('#messageInput');input.value='sala leo';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()})()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${offlineBefore}`,5000);
      if(!await cdp.eval("[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].some(e=>/Leonardo Barreto Campos/i.test(e.textContent)&&/Sala|Salas/i.test(e.textContent))"))throw new Error('motor acadêmico offline não respondeu sala leo');
      await cdp.waitJs("!document.querySelector('#activeContextBar').hidden&&/Leonardo/i.test(document.querySelector('#activeContextText')?.textContent||'')",4000);
      const contextMessageCount=await cdp.eval("document.querySelectorAll('#messages .message-row').length");
      await cdp.eval("document.querySelector('#clearActiveContext')?.click()");
      await cdp.waitJs("document.querySelector('#activeContextBar').hidden",4000);
      if(await cdp.eval("document.querySelectorAll('#messages .message-row').length")!==contextMessageCount)throw new Error('limpar contexto alterou a conversa');
      await cdp.call('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:5000000,uploadThroughput:2000000});
      await cdp.waitJs("document.documentElement.dataset.hubNetwork!=='offline'",6000);
      await cdp.waitJs("String(document.querySelector('#hubNetworkToast')?.textContent||'').includes('HUB atualizado')",6000);
      // O antigo modo de teste virou Modo anônimo e usa estado/ícone próprios.
      if(!await cdp.eval("!!document.querySelector('#anonymousModeToggle')&&!document.querySelector('#testModeToggle')"))throw new Error('Modo anônimo não substituiu o modo de teste');
      await cdp.eval("document.querySelector('#anonymousModeToggle').click()");
      await cdp.waitJs("document.querySelector('#anonymousModeToggle').getAttribute('aria-pressed')==='true'",3000);
      await cdp.eval("document.querySelector('#anonymousModeToggle').click()");
      await cdp.waitJs("document.querySelector('#anonymousModeToggle').getAttribute('aria-pressed')==='false'",3000);
      // Regressões críticas do frontend local: ele responde antes do backend,
      // então humor, Classroom e attachments precisam estar corretos já na
      // resposta instantânea e continuar corretos após a sincronização.
      let criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='como passar em calculo';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}`,5000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);return /Depende da sua religião/i.test(e?.textContent||'')&&!!e?.querySelector('.attachment-preview img[src*=\"d9luxe-cry.gif\"]')})()"))throw new Error('frontend local atropelou o card de humor de Cálculo ou perdeu o GIF');
      criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='sala de IHM';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}`,5000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);return /Interface Homem Máquina/i.test(e?.textContent||'')&&/lgfnaife/i.test(e?.textContent||'')})()"))throw new Error('frontend local não exibiu código Classroom de IHM na consulta de sala');
      criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='classroom de OSM';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}`,5000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);return /Organização, Sistemas e Métodos/i.test(e?.textContent||'')&&/vw5tlf7r/i.test(e?.textContent||'')})()"))throw new Error('frontend local não exibiu código Classroom de OSM');
      criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='código do classroom de contabilidade';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}`,5000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);return /Contabilidade Geral e Custos/i.test(e?.textContent||'')&&/fbrgcmkr/i.test(e?.textContent||'')})()"))throw new Error('frontend/API não exibiu código Classroom de Contabilidade');
      criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='quero trancar cálculo';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}&&!document.querySelector('.typing-row')`,10000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);const t=e?.textContent||'';return /trancar disciplina|Trancamento de Disciplina/i.test(t)&&t.includes('04/09/2026')&&!/Depende da sua religião/i.test(t)})()"))throw new Error('trancamento explícito foi atropelado por Cálculo no frontend/API');
      criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='barema antigo';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}&&!document.querySelector('.typing-row')`,10000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);return /2010.{0,5}2017|2010–2017/i.test(e?.textContent||'')})()"))throw new Error('atalho local de Barema atropelou o Barema antigo');
      criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='não consigo entrar no suap';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}&&!document.querySelector('.typing-row')`,10000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);return /Problema de acesso ao SUAP/i.test(e?.textContent||'')})()"))throw new Error('atalho local de SUAP atropelou o suporte de acesso');
      criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
      await cdp.eval("document.querySelector('#messageInput').value='aulas dia 4';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}&&!document.querySelector('.typing-row')`,10000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);const t=e?.textContent||'';return /Qual semestre você quer consultar/i.test(t)&&!/4º semestre/i.test(t)})()"))throw new Error('dia 4 foi confundido com 4º semestre no frontend/API');
      // Respostas fechadas criam uma fronteira real no histórico local: depois de
      // Auxílio, um follow-up não pode ressuscitar Cálculo de turnos anteriores.
      for(const q of ['sala de calculo','auxilio','e a sala?']){
        criticalBefore=await cdp.eval("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length");
        await cdp.eval(`(()=>{const input=document.querySelector('#messageInput');input.value=${JSON.stringify(q)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()})()`);
        await cdp.waitJs(`document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>${criticalBefore}&&!document.querySelector('.typing-row')`,10000);
      }
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);const t=e?.textContent||'';return !/Cálculo Diferencial|CDAC|H008|H202/i.test(t)&&/(contexto|disciplina|professor|referência|referencia)/i.test(t)})()"))throw new Error('frontend ressuscitou contexto antigo de Cálculo após Auxílio');
      await cdp.eval("document.querySelector('#messageInput').value='calendário';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>0&&!document.querySelector('.typing-row')",18000);await cdp.waitJs("!!document.querySelector('[data-favorite-message]')",5000);
      if(!await cdp.eval("(()=>{const e=[...document.querySelectorAll('.message-row.assistant:not(.typing-row)')].at(-1);return !!e?.querySelector('.attachment-preview img[src*=\"calendario-academico-2026.png\"]')})()"))throw new Error('calendário não exibiu a imagem attachment no frontend');
      await cdp.eval("document.querySelector('[data-favorite-message]').click()");await cdp.waitJs("document.querySelector('[data-favorite-message]').getAttribute('aria-pressed')==='true'",4000);
      if(!await cdp.eval("JSON.parse(localStorage.getItem('hubFavoritesV2')||'[]').length>0"))throw new Error('favorito global não persistiu');
      if(!await cdp.eval("Number(document.querySelector('#sidebarFavoritesCount')?.textContent||0)>=1"))throw new Error('sidebar não refletiu favorito global');
      await cdp.eval("document.querySelector('[data-pin-message]').click()");await cdp.waitJs("!document.querySelector('#pinnedAnswer').hidden",4000);
      const pdf=await cdp.eval("document.querySelector('.document-card .inline-open-button')?.href||''");if(!pdf||(!/\.pdf/i.test(pdf)&&!/document-viewer/i.test(pdf)))throw new Error(`Abrir PDF inválido: ${pdf}`);
      if(!await cdp.eval("[...document.querySelectorAll('.integrated-source')].some(e=>/Fonte verificada.*Calendário Acadêmico/i.test(e.textContent))"))throw new Error('fonte consolidada/verificada do calendário não apareceu');
      if(await cdp.eval("document.querySelectorAll('.knowledge-meta').length>0"))throw new Error('metadados de fonte duplicados fora do componente consolidado');
      const before=new Set((await targets(port)).map(t=>t.id));await cdp.eval("document.querySelector('.document-card .inline-open-button').click()");await sleep(600);const opened=(await targets(port)).filter(t=>!before.has(t.id));if(!opened.some(t=>/\.pdf|document-viewer/i.test(t.url||'')))throw new Error('clique Abrir PDF não abriu documento');
      await cdp.waitJs("[...document.querySelectorAll('.hub-action-link')].some(a=>/calend.rio/i.test(a.textContent))",5000).catch(()=>{});
      const calendar=await cdp.eval("[...document.querySelectorAll('.hub-action-link')].find(a=>/calend.rio/i.test(a.textContent))?.href||''");
      if(!calendar.includes('/apps/calendario/')){
        const found=await cdp.eval("[...document.querySelectorAll('.hub-action-link')].map(a=>({text:a.textContent.trim(),href:a.href}))");
        const components=await cdp.eval("[...document.querySelectorAll('[data-component]')].map(e=>e.getAttribute('data-component'))");
        throw new Error(`ação calendário inválida: ${calendar || '(ausente)'}; ações=${JSON.stringify(found)}; componentes=${JSON.stringify(components)}`);
      }
      await cdp.eval("document.querySelector('[data-theme-choice=\"light\"]')?.click()");await cdp.waitJs("document.documentElement.dataset.theme==='light'",4000);
      const suap=await cdp.eval("document.querySelector('#sidebarExternalLinks a[href*=\"suap.ifba.edu.br\"]')?.href||''");if(!suap.startsWith('https://suap.ifba.edu.br'))throw new Error(`SUAP inválido: ${suap}`);
      await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp.eval("document.querySelector('#mobileSidebarToggle')?.click()");await cdp.waitJs("document.body.classList.contains('mobile-sidebar-open')",4000);await cdp.call('Emulation.clearDeviceMetricsOverride');
      // A Home do Assistente é uma tela independente: abrir e voltar não apaga a conversa.
      const messageCountBeforeHome=await cdp.eval("document.querySelectorAll('#messages .message-row').length");
      await cdp.eval("document.querySelector('#homeViewButton')?.click()");
      await cdp.waitJs("!document.querySelector('#welcome').hidden&&document.querySelector('#messages').hidden&&!document.querySelector('#continueConversationCard').hidden",4000);
      await cdp.eval("document.querySelector('#continueConversationCard')?.click()");
      await cdp.waitJs("document.querySelector('#welcome').hidden&&!document.querySelector('#messages').hidden",4000);
      if(await cdp.eval("document.querySelectorAll('#messages .message-row').length")!==messageCountBeforeHome)throw new Error('Home alterou as mensagens da conversa');
      // Nova conversa preserva a anterior; o histórico pesquisa, renomeia e persiste em stores separados.
      await cdp.eval("document.querySelector('#newConversationButton')?.click()");
      await cdp.waitJs("!document.querySelector('#welcome').hidden&&document.querySelectorAll('#messages .message-row').length===0&&!document.querySelector('#conversationHistoryPanel').hidden",5000);
      await cdp.eval("(()=>{const input=document.querySelector('#conversationHistorySearch');input.value='calendário';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
      await cdp.waitJs("document.querySelectorAll('#conversationHistoryList [data-conversation-id]').length>=1",4000);
      await cdp.eval("document.querySelector('#conversationHistoryList [data-rename-conversation]')?.click()");
      await cdp.waitJs("!document.querySelector('#assistantDialog').hidden&&!document.querySelector('#assistantDialogInput').hidden",3000);
      await cdp.eval("(()=>{const input=document.querySelector('#assistantDialogInput');input.value='Calendário e sala do Leo';document.querySelector('#assistantDialogConfirm').click()})()");
      await cdp.waitJs("/Calendário e sala do Leo/i.test(document.querySelector('#conversationHistoryList')?.textContent||'')",4000);
      const stores=await cdp.eval("new Promise(resolve=>{const r=indexedDB.open('hubAssistantHistoryV1');r.onsuccess=()=>{resolve([...r.result.objectStoreNames]);r.result.close()};r.onerror=()=>resolve([])})");
      if(!stores.includes('conversations')||!stores.includes('messages'))throw new Error(`persistência estruturada ausente: ${JSON.stringify(stores)}`);
      await cdp.eval("document.querySelector('#conversationHistoryList [data-conversation-id]')?.click()");
      await cdp.waitJs("document.querySelector('#welcome').hidden&&document.querySelectorAll('#messages .message-row').length>0",5000);
      // Limpar conversa usa modal próprio (não confirm() nativo) e mantém favoritos globais.
      await cdp.eval("document.querySelector('#clearConversation')?.click()");
      await cdp.waitJs("!document.querySelector('#assistantDialog').hidden",3000);
      await cdp.eval("document.querySelector('#assistantDialogConfirm')?.click()");
      await cdp.waitJs("document.querySelectorAll('#messages .message-row').length===0",8000);if(!await cdp.eval("JSON.parse(localStorage.getItem('hubFavoritesV2')||'[]').length>0"))throw new Error('limpar conversa apagou favoritos');if(!await cdp.eval("document.querySelector('#pinnedAnswer')?.hidden===true"))throw new Error('pin sobreviveu indevidamente à limpeza');
      console.log('E2E Chromium: OK — contexto, offline acadêmico, modo anônimo, histórico estruturado, Home, busca global, fonte única, PDF, calendário, favoritos, pin/limpeza, tema, SUAP e sidebar mobile.');
    }finally{cdp.close()}
  }finally{if(configPath&&configBackup)try{fs.writeFileSync(configPath,configBackup)}catch{}for(const p of procs.reverse())await terminate(p);await sleep(250);cleanupTemp(temp)}
})().catch(err=>{console.error('E2E Chromium: FALHOU —',err.message);process.exit(1)});
