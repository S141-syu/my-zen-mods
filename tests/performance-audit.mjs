import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.env.FOLDER_OPEN_TABS_AUDIT_SOURCE ?? root);
const outputPath = path.resolve(process.env.FOLDER_OPEN_TABS_AUDIT_OUTPUT ?? path.join(root, 'tests', 'performance-audit-results.json'));
const profile = await mkdtemp(path.join(root, '.test-profile-'));
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const available = probe.address().port;
    probe.close(() => resolve(available));
  });
});
await mkdir(path.join(profile, 'chrome'));
await writeFile(path.join(profile, 'chrome', 'folder-open-tabs.css'), await readFile(path.join(sourceRoot, 'chrome.css')));
await writeFile(path.join(profile, 'chrome', 'userChrome.css'), await readFile(path.join(root, 'chrome', 'userChrome.css')));
const selectionMotionScript = await readFile(path.join(sourceRoot, 'folder-open-tabs.uc.mjs'), 'utf8');
await writeFile(path.join(profile, 'user.js'), [
  `user_pref("marionette.port", ${port});`,
  'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);',
  'user_pref("zen.welcome-screen.seen", true);',
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.startup.page", 0);',
  'user_pref("browser.sessionstore.resume_from_crash", false);',
].join('\n'));

const browser = spawn('C:/Program Files/Zen Browser/zen.exe', [
  '--headless', '--no-remote', '--profile', profile, '--marionette',
  '--remote-allow-system-access',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let startupError = '';
browser.stderr.on('data', data => { startupError = (startupError + data.toString()).slice(-4000); });
browser.on('error', error => { startupError = error.message; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let quitBrowser;
try {
  for (let i = 0; i < 60; i++) {
    socket = await new Promise(resolve => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => resolve(s));
      s.once('error', () => { s.destroy(); resolve(null); });
    });
    if (socket) break;
    await sleep(500);
  }
  if (!socket) throw new Error(`Isolated Zen Marionette did not start; exit=${browser.exitCode}; ${startupError}`);
  let buffer = Buffer.alloc(0), id = 0;
  const waiting = new Map();
  socket.on('data', data => {
    buffer = Buffer.concat([buffer, data]);
    for (;;) {
      const colon = buffer.indexOf(58);
      if (colon < 0) break;
      const length = Number(buffer.subarray(0, colon).toString());
      if (buffer.length < colon + 1 + length) break;
      const message = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length));
      buffer = buffer.subarray(colon + 1 + length);
      if (Array.isArray(message)) {
        const pending = waiting.get(message[1]);
        if (pending) {
          waiting.delete(message[1]);
          clearTimeout(pending.timer);
          message[2] ? pending.reject(new Error(JSON.stringify(message[2]))) : pending.resolve(message[3]);
        }
      }
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { waiting.delete(current); reject(new Error(`Timeout: ${method}`)); }, 20000);
    waiting.set(current, { resolve, reject, timer });
    const payload = JSON.stringify([0, current, method, params]);
    socket.write(`${Buffer.byteLength(payload)}:${payload}`);
  });
  quitBrowser = () => send('Marionette:Quit', { flags: ['eAttemptQuit'] });
  await send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: false } } });
  await send('Marionette:SetContext', { value: 'chrome' });
  const run = async (script, args = []) => (await send('WebDriver:ExecuteScript', { script, args, newSandbox: false, sandbox: 'system' })).value;
  await sleep(1500);
  await run(selectionMotionScript);
  const environment = await run(`return {
    version: Services.appinfo.version, buildID: Services.appinfo.appBuildID,
    channel: Services.prefs.getCharPref('app.update.channel'), os: Services.appinfo.OS,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    orientation: document.getElementById('tabbrowser-tabs').getAttribute('orient')
  };`);
  assert.equal(environment.orientation, 'vertical');
  assert.equal(environment.reducedMotion, false);
  const samples = [];
  await run(`
    const c = window.__folderOpenTabsSelectionHighlightController;
    window.__audit = {counts:{}, originalRect:Element.prototype.getBoundingClientRect,
      originalStyle:window.getComputedStyle, originals:{}};
    const a = window.__audit;
    a.bump = name => a.counts[name] = (a.counts[name] || 0) + 1;
    Element.prototype.getBoundingClientRect = function(...args) {
      a.bump('rect'); return a.originalRect.apply(this,args);
    };
    window.getComputedStyle = function(...args) {
      a.bump('computedStyle'); return a.originalStyle.apply(this,args);
    };
    for (const name of ['startTracking','scheduleSelectionSync','reconcileSelection',
      'trackLayout','readAppearance','applyAppearance','getFolderOpenTarget',
      'getFolderOpenVisualSource','retimeFolderAnimations','clearNewTabFocusState']) {
      const original = c[name];
      a.originals[name] = original;
      c[name] = function(...args) { a.bump(name); return original.apply(this,args); };
    }
    c.mutationObserver.disconnect();
    c.mutationObserver = new MutationObserver(records => {
      a.bump('observerCallbacks');
      a.counts.observerRecords = (a.counts.observerRecords || 0) + records.length;
      if (c.onMutations) c.onMutations(records);
      else c.onLayoutChange();
    });
    c.mutationObserver.observe(c.tabs,{attributes:true,attributeOldValue:true,childList:true,subtree:true,
      attributeFilter:['collapsed','hidden','selected','style','class','src','busy','pending','discarded','visuallyselected']});
  `);
  const reset = () => run('window.__audit.counts = {};');
  const collect = async label => {
    const counts = await run('return window.__audit.counts;');
    const sample = {label, counts};
    samples.push(sample);
    console.log(JSON.stringify(sample));
  };
  await sleep(800);
  await reset();
  await sleep(1000);
  await collect('idle-1000ms');
  await reset();
  await run(`
    const tab = gBrowser.selectedTab;
    tab.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));
    tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
  `);
  await sleep(50);
  await collect('one-pointerdown-plus-mousedown');
  for (const count of [20, 100]) {
    await run(`
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const tabs = Array.from({length:${count}},() => gBrowser.addTab('about:blank',{
        triggeringPrincipal:principal,skipAnimation:true,inBackground:true}));
      const folder = gZenFolders.createFolder(tabs,{label:'Audit ${count}'});
      const trailing = Array.from({length:20},() => gBrowser.addTab('about:blank',{
        triggeringPrincipal:principal,skipAnimation:true,inBackground:true}));
      gBrowser.selectedTab = trailing[0];
      window.__auditScenario = {tabs,folder,trailing};
    `);
    await sleep(500);
    await run(`
      const {tabs,folder} = window.__auditScenario;
      for (const tab of tabs.slice(1)) gBrowser.discardBrowser(tab,true);
      folder.collapsed = true;
    `);
    await sleep(800);
    await reset();
    await run('window.__auditScenario.folder.collapsed = false;');
    await sleep(1000);
    await collect('expand-' + count + '-tabs-20-followers-1000ms');
    await reset();
    await run('window.__auditScenario.folder.collapsed = true;');
    await sleep(1000);
    await collect('collapse-' + count + '-tabs-20-followers-1000ms');
    await reset();
    await run('gBrowser.removeTab(window.__auditScenario.trailing[0],{animate:false});');
    await sleep(1000);
    await collect('close-normal-tab-19-followers-1000ms');
    await run(`
      const {tabs,trailing} = window.__auditScenario;
      gBrowser.removeTabs([...tabs,...trailing].filter(tab => !tab.closing),{animate:false});
    `);
    await sleep(900);
  }
  const lifecycle = await run(`
    const c = window.__folderOpenTabsSelectionHighlightController;
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const tabs = Array.from({length:3},() => gBrowser.addTab('about:blank',{
      triggeringPrincipal:principal,skipAnimation:true,inBackground:true}));
    const folder = gZenFolders.createFolder(tabs,{label:'Lifecycle audit'});
    gBrowser.addTab('about:blank',{triggeringPrincipal:principal,skipAnimation:true});
    window.__auditLifecycle = {c,folder};
    c.scheduleFolderFollowerMotion(folder,Math.max(1,folder.getBoundingClientRect().height-40));
    c.destroy();
    return {before:c.folderFollowerMotions.size};
  `);
  await sleep(80);
  lifecycle.afterDestroy = await run(`
    const {c} = window.__auditLifecycle;
    return {followerMotions:c.folderFollowerMotions.size,
      detachedHighlight:!c.highlight.isConnected};
  `);
  await run('window.__auditLifecycle.c.clearFolderFollowerMotions();');
  console.log(JSON.stringify({lifecycle}));
  const report = {date:new Date().toISOString(), environment, sourceRoot,
    measurement:'Instrumented headless call counts; not CPU/GPU/frame-time measurements',
    samples,lifecycle};
  await writeFile(outputPath,
    JSON.stringify(report,null,2)+'\n');
  await quitBrowser();
  quitBrowser = null;
} catch (error) {
  await writeFile(outputPath,
    JSON.stringify({date:new Date().toISOString(),status:'failed',error:error.message,
      measurement:'No measurements completed',profile},null,2)+'\n');
  throw error;
} finally {
  if (quitBrowser && browser.exitCode === null) {
    try { await quitBrowser(); } catch (error) { console.error(`Normal shutdown failed: ${error.message}`); }
  }
  socket?.destroy();
  if (browser.exitCode === null) {
    await Promise.race([new Promise(resolve => browser.once('exit',resolve)),sleep(3000)]);
  }
  if (browser.exitCode !== null && path.dirname(profile) === root && path.basename(profile).startsWith('.test-profile-')) {
    await rm(profile, { recursive:true, force:true, maxRetries:4, retryDelay:500 });
  } else {
    console.error(`Isolated audit Zen is still running (PID ${browser.pid}, profile ${profile}); close it normally.`);
  }
}
