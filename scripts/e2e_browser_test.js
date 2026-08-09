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
  async eval(expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(`JS E2E: ${JSON.stringify(r.exceptionDetails)}`);return r.result?.value}
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
      await cdp.call('Page.enable');await cdp.call('Runtime.enable');await cdp.call('Page.navigate',{url:siteUrl+'/apps/assistente/?e2e=1'});await cdp.waitJs("document.readyState==='complete'&&!!document.querySelector('#messageInput')",10000);await cdp.eval('window.confirm=()=>true');
      await cdp.eval("document.querySelector('#messageInput').value='calendário';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessage').click()");
      await cdp.waitJs("document.querySelectorAll('.message-row.assistant:not(.typing-row)').length>0&&!document.querySelector('.typing-row')",18000);await cdp.waitJs("!!document.querySelector('[data-favorite-message]')",5000);
      await cdp.eval("document.querySelector('[data-favorite-message]').click()");await cdp.waitJs("document.querySelector('[data-favorite-message]').getAttribute('aria-pressed')==='true'",4000);
      if(!await cdp.eval("JSON.parse(localStorage.getItem('hubFavoritesV2')||'[]').length>0"))throw new Error('favorito global não persistiu');
      if(!await cdp.eval("Number(document.querySelector('#sidebarFavoritesCount')?.textContent||0)>=1"))throw new Error('sidebar não refletiu favorito global');
      await cdp.eval("document.querySelector('[data-pin-message]').click()");await cdp.waitJs("!document.querySelector('#pinnedAnswer').hidden",4000);
      const pdf=await cdp.eval("document.querySelector('.document-card .inline-open-button')?.href||''");if(!pdf||(!/\.pdf/i.test(pdf)&&!/document-viewer/i.test(pdf)))throw new Error(`Abrir PDF inválido: ${pdf}`);
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
      await cdp.eval("document.querySelector('#clearConversation')?.click()");await cdp.waitJs("document.querySelectorAll('#messages .message-row').length===0",8000);if(!await cdp.eval("JSON.parse(localStorage.getItem('hubFavoritesV2')||'[]').length>0"))throw new Error('limpar conversa apagou favoritos');if(!await cdp.eval("document.querySelector('#pinnedAnswer')?.hidden===true"))throw new Error('pin sobreviveu indevidamente à limpeza');
      console.log('E2E Chromium: OK — PDF, calendário, favorito global, pin/limpeza, tema, SUAP e sidebar mobile.');
    }finally{cdp.close()}
  }finally{if(configPath&&configBackup)try{fs.writeFileSync(configPath,configBackup)}catch{}for(const p of procs.reverse())await terminate(p);await sleep(250);cleanupTemp(temp)}
})().catch(err=>{console.error('E2E Chromium: FALHOU —',err.message);process.exit(1)});
