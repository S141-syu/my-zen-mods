import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
await writeFile(path.join(profile, 'chrome', 'folder-open-tabs.css'), await readFile(path.join(root, 'chrome.css')));
await writeFile(path.join(profile, 'chrome', 'userChrome.css'), await readFile(path.join(root, 'chrome', 'userChrome.css')));
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
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
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
  if (!socket) throw new Error('Isolated Zen Marionette did not start');
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
  await send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: false } } });
  await send('Marionette:SetContext', { value: 'chrome' });
  const run = async (script, args = []) => (await send('WebDriver:ExecuteScript', { script, args, newSandbox: false, sandbox: 'system' })).value;
  const state = () => run(`
    return window.__folderTest.tabs.map(t => {
      const box = t.getBoundingClientRect(), bg = getComputedStyle(t.querySelector('.tab-background'));
      return { height: box.height, opacity:getComputedStyle(t).opacity,
        selected:t.selected, pending:t.hasAttribute('pending'),
        outlined:t.matches('#tabbrowser-tabs zen-folder .tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing], [selected], [visuallyselected])'),
        outlineWidth:bg.outlineWidth, outlineOffset:bg.outlineOffset,
        background:bg.backgroundColor, internalVisible:t.visible, ariaHidden:t.getAttribute('aria-hidden') };
    });
  `);
  await sleep(3000);
  console.log(JSON.stringify(await run('return { version: Services.appinfo.version, folders: !!window.gZenFolders, workspaces: !!window.gZenWorkspaces, url: location.href };')));
  console.log(JSON.stringify(await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const tabs = ['Displayed', 'Loaded', 'Unloaded'].map(label => {
      const tab = gBrowser.addTab('about:blank', { triggeringPrincipal: principal, skipAnimation: true });
      gBrowser.setTabTitle(tab); tab.setAttribute('label', label); return tab;
    });
    const folder = gZenFolders.createFolder(tabs, { label: 'Test folder' });
    gBrowser.selectedTab = tabs[0];
    window.__folderTest = { tabs, folder };
    return { folderCreated: true };
  `)));
  await sleep(1000);
  console.log(JSON.stringify(await run(`
    const {tabs, folder} = window.__folderTest;
    gBrowser.discardBrowser(tabs[2], true);
    folder.collapsed = true;
    return tabs.map(t => ({label: t.label, pending:t.hasAttribute('pending'), discarded:t.hasAttribute('discarded')}));
  `)));
  await sleep(1000);
  let result = await state();
  assert(result[0].height > 0 && !result[0].outlined, 'Selected tab keeps the native appearance');
  assert(result[1].height > 0 && result[1].outlined, 'Loaded background tab remains outlined');
  assert.equal(result[1].outlineWidth, '1px');
  assert.equal(result[1].outlineOffset, '-1px', 'Outline is loaded through userChrome.css');
  assert.equal(result[2].height, 0, 'Unloaded tab is hidden when collapsed');
  const nativeVisibilityMismatch = !result[1].internalVisible && result[1].ariaHidden === 'true';
  console.log('PASS: collapsed selection / loaded / unloaded presentation');
  const screenshot = await send('WebDriver:TakeScreenshot', { full: true });
  await writeFile(path.join(root, 'tests', 'zen-smoke.png'), Buffer.from(screenshot.value, 'base64'));

  const clickPoint = await run(`
    const b=window.__folderTest.tabs[1].getBoundingClientRect();
    return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
  `);
  await send('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    {type:'pointerMove',duration:0,origin:'viewport', ...clickPoint}, {type:'pointerDown',button:0}, {type:'pointerUp',button:0},
  ] }] });
  await sleep(500);
  result = await state();
  assert(result[1].selected && !result[1].outlined, 'Mouse click selects the retained tab');
  assert(result[0].outlined, 'Previously selected tab gains an outline');
  console.log('PASS: actual mouse selection and outline transfer');

  await run('window.__folderTest.folder.collapsed=false;');
  await sleep(500);
  result=await state();
  assert(result[2].height>0 && !result[2].outlined, 'Expanded unloaded tab is visible without an outline');
  await run(`
    const {tabs,folder}=window.__folderTest;
    const nested=gZenFolders.createFolder([tabs[0]],{label:'Nested',insertBefore:folder.groupStartElement});
    window.__folderTest.nested=nested;
    const outside=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
    gBrowser.selectedTab=outside;
  `);
  await sleep(500);
  await run('window.__folderTest.nested.collapsed=true; window.__folderTest.folder.collapsed=true;');
  await sleep(600);
  result=await state();
  assert(result[0].height>0 && result[1].height>0, 'Loaded tabs survive nested collapse with selection outside');
  assert.equal(result[2].height,0);
  console.log('PASS: expand and nested collapse with selection outside');

  await run('gBrowser.discardBrowser(window.__folderTest.tabs[0],true);');
  await sleep(500);
  result=await state();
  assert.equal(result[0].height,0,'Newly unloaded tab disappears without reload');
  assert(result[1].height>0,'Other loaded tab remains');
  console.log('PASS: live unload update');
  await run('gBrowser.selectedTab=window.__folderTest.tabs[1];');
  await sleep(300);
  await writeFile(path.join(root,'tests','results.json'), JSON.stringify({version:'1.22.2b',loadMethod:'userChrome.css @import',presentationChecks:'passed',nativeVisibilityMismatch},null,2));
  console.log(`LIMITATION: CSS-only internal visibility mismatch = ${nativeVisibilityMismatch}`);
  await send('Marionette:Quit', { flags: ['eForceQuit'] });
} finally {
  socket?.destroy();
  browser.kill();
}
