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
const selectionMotionScript = await readFile(path.join(root, 'folder-open-tabs.uc.mjs'), 'utf8');
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
      const closeButton = getComputedStyle(t.querySelector('.tab-close-button'));
      const resetButton = getComputedStyle(t.querySelector('.tab-reset-button'));
      return { top:box.top, bottom:box.bottom, height:box.height, opacity:getComputedStyle(t).opacity,
        selected:t.selected, pending:t.hasAttribute('pending'),
        outlined:t.matches('#tabbrowser-tabs zen-folder .tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing], [selected], [visuallyselected])'),
        outlineWidth:bg.outlineWidth, outlineOffset:bg.outlineOffset,
        closeButtonRadius:closeButton.borderRadius, resetButtonRadius:resetButton.borderRadius,
        background:bg.backgroundColor, internalVisible:t.visible, ariaHidden:t.getAttribute('aria-hidden') };
    });
  `);
  const selectionHighlightState = () => run(`
    const highlight = document.getElementById('folder-open-tabs-selection-highlight');
    const selected = document.querySelector('#tabbrowser-tabs .tabbrowser-tab[selected] > .tab-stack > .tab-background');
    const selectedTab = selected?.closest('.tabbrowser-tab');
    const highlightBox = highlight?.getBoundingClientRect();
    const selectedBox = selected?.getBoundingClientRect();
    const animation = highlight?.getAnimations()[0];
    const highlightStyle = highlight && getComputedStyle(highlight);
    const selectedStyle = selected && getComputedStyle(selected);
    return {
      top: highlightBox?.top,
      left: highlightBox?.left,
      width: highlightBox?.width,
      height: highlightBox?.height,
      selectedTop: selectedBox?.top,
      selectedLeft: selectedBox?.left,
      selectedWidth: selectedBox?.width,
      selectedHeight: selectedBox?.height,
      targetMarked: selectedTab?.hasAttribute('folder-open-tabs-selection-target'),
      selectedHovered: selectedTab?.matches(':hover'),
      highlightBackground: highlightStyle?.background,
      highlightBorder: highlightStyle?.border,
      highlightBoxShadow: highlightStyle?.boxShadow,
      selectedBackground: selectedStyle?.background,
      selectedBorder: selectedStyle?.border,
      selectedBoxShadow: selectedStyle?.boxShadow,
      animationDuration: animation?.effect.getTiming().duration,
      animationKeyframes: animation?.effect.getKeyframes().map(frame => ({
        offset: frame.computedOffset,
        transform: frame.transform,
        easing: frame.easing,
      })),
    };
  `);
  const pageDepthState = () => run(`
    const browser = gBrowser.selectedBrowser;
    const animation = browser?.getAnimations().find(item => item.id === 'folder-open-tabs-page-depth');
    const computedScale = browser ? getComputedStyle(browser).scale : null;
    return {
      scale: computedScale === 'none' ? 1 : Number(computedScale),
      duration: animation?.effect.getTiming().duration,
      easing: animation?.effect.getTiming().easing,
      keyframes: animation?.effect.getKeyframes().map(frame => ({
        offset: frame.computedOffset,
        scale: Number(frame.scale),
      })),
    };
  `);
  const closeParticleState = () => run(`
    const effects = [...document.querySelectorAll('.folder-open-tabs-close-particle-effect')];
    const effect = effects.at(-1);
    const particles = effect
      ? [...effect.querySelectorAll('.folder-open-tabs-close-particle')]
      : [];
    const particleAnimations = particles.map(particle =>
      particle.getAnimations().find(item => item.id === 'folder-open-tabs-close-particle')
    );
    const layoutAnimations = [
      ...document.querySelectorAll('#tabbrowser-tabs .tabbrowser-tab, #tabbrowser-tabs zen-folder'),
    ].flatMap(element =>
      element.getAnimations().filter(item => item.id === 'folder-open-tabs-close-layout')
    );
    return {
      effectCount: effects.length,
      renderer: effect?.dataset.renderer,
      ghostCount: effect?.querySelectorAll('.folder-open-tabs-close-particle-ghost').length ?? 0,
      closedTabConnected: window.__closeParticleTest?.tab?.isConnected ?? false,
      closedTabVisibility: window.__closeParticleTest?.tab
        ? getComputedStyle(window.__closeParticleTest.tab).visibility
        : null,
      particleCount: particles.length,
      particleDurations: particleAnimations.map(animation => animation.effect.getTiming().duration),
      particleDelays: particleAnimations.map(animation => animation.effect.getTiming().delay),
      activeParticleCount: particleAnimations.filter(
        animation => animation.playState === 'running' || animation.playState === 'pending'
      ).length,
      layoutAnimationCount: layoutAnimations.length,
      layoutDurations: layoutAnimations.map(animation => animation.effect.getTiming().duration),
      layoutDelays: layoutAnimations.map(animation => animation.effect.getTiming().delay),
      layoutEasings: layoutAnimations.map(animation => animation.effect.getTiming().easing),
      finalTranslateY: particleAnimations.map(animation => {
        const transform = animation.effect.getKeyframes().at(-1).transform;
        return new DOMMatrixReadOnly(transform).m42;
      }),
    };
  `);
  const closeLayoutState = () => run(`
    const animations = [
      ...document.querySelectorAll('#tabbrowser-tabs .tabbrowser-tab, #tabbrowser-tabs zen-folder'),
    ].flatMap(element =>
      element.getAnimations().filter(item => item.id === 'folder-open-tabs-close-layout')
    );
    return {
      top: window.__closeParticleTest.followingTab.getBoundingClientRect().top,
      animationCount: animations.length,
      durations: animations.map(animation => animation.effect.getTiming().duration),
      delays: animations.map(animation => animation.effect.getTiming().delay),
      easings: animations.map(animation => animation.effect.getTiming().easing),
    };
  `);
  await sleep(3000);
  console.log(JSON.stringify(await run('return { version: Services.appinfo.version, folders: !!window.gZenFolders, workspaces: !!window.gZenWorkspaces, url: location.href };')));
  await run(selectionMotionScript);
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
  await run('window.__folderTest.folder.collapsed=false;');
  await sleep(40);
  const opening = await state();
  assert(
    opening[0].height > 0 && opening[1].height > 0 && opening[1].opacity === '1',
    'Loaded tabs keep their natural size while the folder expands'
  );
  assert(
    opening[1].top >= opening[0].bottom - 0.5,
    'Loaded background tabs do not overlap the first tab while expanding'
  );
  await sleep(460);
  const expandedBeforeClosing = await state();
  await run('window.__folderTest.folder.collapsed=true;');
  await sleep(60);
  const closing = await state();
  assert(
    closing[1].height > 0 && closing[1].opacity === '1',
    'Loaded background tab remains visible during collapse'
  );
  assert(
    closing[2].height < expandedBeforeClosing[2].height || closing[2].opacity < 0.99,
    'Unloaded tab participates in the closing animation'
  );
  await sleep(500);
  let result = await state();
  assert(result[0].height > 0 && !result[0].outlined, 'Selected tab keeps the native appearance');
  assert(result[1].height > 0 && result[1].outlined, 'Loaded background tab remains outlined');
  assert.equal(result[1].outlineWidth, '1px');
  assert.equal(result[1].outlineOffset, '-1px', 'Outline is loaded through userChrome.css');
  assert.equal(result[1].closeButtonRadius, '8px', 'Close button uses a rounded-square radius');
  assert.equal(result[1].resetButtonRadius, '8px', 'Unload button uses a rounded-square radius');
  assert.equal(
    await run("return getComputedStyle(window.__folderTest.folder.resetButton).borderRadius;"),
    '8px',
    'Folder unload button uses the same rounded-square radius'
  );
  assert.equal(result[2].height, 0, 'Unloaded tab is hidden when collapsed');
  const nativeVisibilityMismatch = !result[1].internalVisible && result[1].ariaHidden === 'true';
  console.log('PASS: collapsed selection / loaded / unloaded presentation');
  const screenshot = await send('WebDriver:TakeScreenshot', { full: true });
  await writeFile(path.join(root, 'tests', 'zen-smoke.png'), Buffer.from(screenshot.value, 'base64'));

  const clickPoint = await run(`
    const b=window.__folderTest.tabs[1].getBoundingClientRect();
    return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
  `);
  const highlightBeforeMove = await selectionHighlightState();
  await run(`
    window.__folderTest.tabs[1].querySelector('.tab-background').style.background =
      'rgba(255, 0, 0, 0.05)';
  `);
  await send('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    {type:'pointerMove',duration:0,origin:'viewport', ...clickPoint}, {type:'pointerDown',button:0}, {type:'pointerUp',button:0},
  ] }] });
  await run(`
    window.__folderTest.tabs[1].querySelector('.tab-background').style.removeProperty('background');
  `);
  await sleep(35);
  const pageDepthDuringSelection = await pageDepthState();
  assert.equal(pageDepthDuringSelection.duration, 160, 'Selected page uses a short depth transition');
  assert.equal(pageDepthDuringSelection.easing, 'cubic-bezier(0.2, 0, 0, 1)');
  assert.deepEqual(pageDepthDuringSelection.keyframes, [
    { offset: 0, scale: 0.985 },
    { offset: 1, scale: 1 },
  ]);
  assert(
    pageDepthDuringSelection.scale > 0.985 && pageDepthDuringSelection.scale < 1,
    'Selected page moves forward from a slightly recessed scale'
  );
  await sleep(65);
  const highlightDuringMove = await selectionHighlightState();
  assert(highlightDuringMove.targetMarked, 'Selected tab delegates its background to the shared highlight');
  assert.equal(
    highlightDuringMove.highlightBackground,
    highlightBeforeMove.highlightBackground,
    'Hovered selection cannot replace the selected highlight with a transient hover appearance'
  );
  assert.equal(highlightDuringMove.animationDuration, 360);
  assert.deepEqual(highlightDuringMove.animationKeyframes.map(frame => frame.offset), [0, 0.68, 0.86, 1]);
  const motionDirection = Math.sign(highlightDuringMove.selectedTop - highlightBeforeMove.top);
  const translateY = frame => Number(/translate\([^,]+px, ([^)]+)px\)/.exec(frame.transform)?.[1]);
  const overshootOffset = translateY(highlightDuringMove.animationKeyframes[1]);
  const reboundOffset = translateY(highlightDuringMove.animationKeyframes[2]);
  const travelDistance = Math.abs(highlightDuringMove.selectedTop - highlightBeforeMove.top);
  const overshootRatio = Math.abs(overshootOffset) / travelDistance;
  const reboundRatio = Math.abs(reboundOffset) / travelDistance;
  assert(
    motionDirection * overshootOffset > 0,
    'Spring keyframe moves slightly beyond the destination'
  );
  assert(overshootRatio > 0.035 && overshootRatio < 0.045, 'Spring overshoot stays near four percent');
  assert(reboundRatio > 0.005 && reboundRatio < 0.01, 'Spring rebound stays below one percent');
  assert(
    highlightDuringMove.top > Math.min(highlightBeforeMove.top, highlightDuringMove.selectedTop) &&
      highlightDuringMove.top < Math.max(highlightBeforeMove.top, highlightDuringMove.selectedTop),
    'Selected highlight moves between tab rows during the ease-in-out transition'
  );
  await sleep(320);
  result = await state();
  assert(result[1].selected && !result[1].outlined, 'Mouse click selects the retained tab');
  assert(result[0].outlined, 'Previously selected tab gains an outline');
  const highlightAfterMove = await selectionHighlightState();
  assert(Math.abs(highlightAfterMove.top - highlightAfterMove.selectedTop) < 0.5, 'Selected highlight finishes on the new tab');
  assert.equal((await pageDepthState()).scale, 1, 'Selected page finishes at its natural scale');
  console.log('PASS: selected page gains depth without fading or delaying tab display');
  console.log('PASS: actual mouse selection and outline transfer');

  await run(`
    const anchorTab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    const tab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    const followingTab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    anchorTab.setAttribute('label', 'Close test anchor');
    tab.setAttribute('label', 'Particle close');
    followingTab.setAttribute('label', 'Following tab');
    gBrowser.moveTabTo(tab, anchorTab._tPos + 1);
    gBrowser.moveTabTo(followingTab, tab._tPos + 1);
    gBrowser.selectedTab = anchorTab;
    window.__closeParticleTest = { anchorTab, tab, followingTab };
  `);
  await sleep(450);
  const closeLayoutBefore = await run(`
    const {tab, followingTab} = window.__closeParticleTest;
    return {
      tabHeight: tab.getBoundingClientRect().height,
      followingTop: followingTab.getBoundingClientRect().top,
    };
  `);
  const closeParticlePoint = await run(`
    const tab = window.__closeParticleTest.tab;
    const button = tab.querySelector('.tab-close-button');
    const box = button?.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    return box?.width > 0
      ? {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)}
      : {x:Math.round(tabBox.right-12),y:Math.round(tabBox.y+tabBox.height/2)};
  `);
  await send('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'particle-close-mouse', parameters: { pointerType: 'mouse' }, actions: [
    {type:'pointerMove',duration:0,origin:'viewport', ...closeParticlePoint}, {type:'pointerDown',button:0}, {type:'pointerUp',button:0},
  ] }] });
  await sleep(45);
  const closeParticleDuringClose = await closeParticleState();
  console.log(JSON.stringify({closeParticleRenderer:closeParticleDuringClose.renderer}));
  assert.equal(closeParticleDuringClose.effectCount, 1, 'Ungrouped tab close creates one particle overlay');
  assert.equal(closeParticleDuringClose.renderer, 'particles-only');
  assert.equal(closeParticleDuringClose.ghostCount, 0, 'Closed tab ghost is never reconstructed');
  assert.equal(closeParticleDuringClose.closedTabVisibility, 'hidden', 'Closing tab stays hidden');
  assert.equal(closeParticleDuringClose.particleCount, 60, 'Close effect uses 60 particles');
  assert.equal(closeParticleDuringClose.particleDurations.length, 60);
  assert(
    closeParticleDuringClose.particleDurations.every(duration => duration >= 385 && duration <= 455),
    'Particles use short varied durations'
  );
  assert(
    closeParticleDuringClose.particleDelays.every(delay => delay >= 0 && delay <= 68),
    'Particles use a restrained upward dissolve wave'
  );
  assert(
    closeParticleDuringClose.finalTranslateY.every(translateY => translateY <= -7),
    'Every particle moves upward'
  );
  const closeLayoutHeld = await run(
    'return window.__closeParticleTest.followingTab.getBoundingClientRect().top;'
  );
  assert(
    Math.abs(closeLayoutHeld - closeLayoutBefore.followingTop) < 2,
    'Following tabs stay in place during the close hold'
  );
  const closeLayoutSamples = [];
  for (let index = 0; index < 20; index += 1) {
    await sleep(25);
    closeLayoutSamples.push({
      elapsed: 70 + index * 25,
      ...(await closeLayoutState()),
    });
  }
  const movedSamples = closeLayoutSamples.filter(
    sample => sample.top < closeLayoutBefore.followingTop - 0.75
  );
  assert(movedSamples.length > 0, 'Following tabs eventually move upward');
  assert(movedSamples[0].elapsed >= 120, 'Following tabs wait before moving upward');
  assert(
    closeLayoutSamples.every(
      (sample, index) => index === 0 || sample.top <= closeLayoutSamples[index - 1].top + 0.75
    ),
    'Following tabs move upward without reversing'
  );
  const observedLayoutState = closeLayoutSamples.find(
    sample => sample.animationCount > 0
  );
  assert(observedLayoutState, 'Delayed close layout animation is observed');
  assert(observedLayoutState.durations.every(duration => duration === 160));
  assert(observedLayoutState.delays.every(delay => delay === 90));
  assert(
    observedLayoutState.easings.every(
      easing => easing === 'cubic-bezier(0.4, 0, 0.2, 1)'
    )
  );
  assert(
    closeLayoutSamples.at(-1).top < closeLayoutBefore.followingTop - closeLayoutBefore.tabHeight / 2,
    'Following tabs finish near the compacted position'
  );
  const closeParticleAfterNativeClose = await closeParticleState();
  assert.equal(closeParticleAfterNativeClose.effectCount, 0, 'Close particle overlay finishes cleanly');

  await run(`
    const tab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    const folder = gZenFolders.createFolder([tab], { label: 'No close particles inside folder' });
    window.__folderCloseParticleTest = { tab, folder };
  `);
  await sleep(150);
  await run('gBrowser.removeTab(window.__folderCloseParticleTest.tab, { animate: false });');
  await sleep(45);
  assert.equal(
    (await closeParticleState()).effectCount,
    0,
    'Folder tab close does not create close particles'
  );
  console.log('PASS: ungrouped tabs dissolve upward while following tabs compact after a short delay');

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

  await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const unloadedAbove = gBrowser.addTab('about:blank', { triggeringPrincipal: principal, skipAnimation: true });
    const selectedBelow = gBrowser.addTab('about:blank', { triggeringPrincipal: principal, skipAnimation: true });
    const folder = gZenFolders.createFolder([unloadedAbove, selectedBelow], { label: 'Moving selection' });
    gBrowser.selectedTab = selectedBelow;
    gBrowser.discardBrowser(unloadedAbove, true);
    window.__layoutMotionTest = { unloadedAbove, selectedBelow, folder };
  `);
  await sleep(500);
  const expandedLayout = await selectionHighlightState();
  await run('window.__layoutMotionTest.folder.collapsed=true;');
  await sleep(70);
  const closingLayout = await selectionHighlightState();
  assert(closingLayout.selectedTop < expandedLayout.selectedTop, 'Selected tab moves upward while its folder closes');
  assert(
    Math.abs(closingLayout.top - closingLayout.selectedTop) < 0.75,
    'Selected highlight follows the tab during folder collapse'
  );
  await sleep(500);
  const collapsedLayout = await selectionHighlightState();
  await run('window.__layoutMotionTest.folder.collapsed=false;');
  await sleep(70);
  const openingLayout = await selectionHighlightState();
  assert(openingLayout.selectedTop > collapsedLayout.selectedTop, 'Selected tab moves downward while its folder opens');
  assert(
    Math.abs(openingLayout.top - openingLayout.selectedTop) < 0.75,
    'Selected highlight follows the tab during folder expansion'
  );
  await sleep(500);
  const expandedAgainLayout = await selectionHighlightState();
  assert(
    Math.abs(expandedAgainLayout.top - expandedAgainLayout.selectedTop) < 0.5,
    'Selected highlight finishes on the moved tab'
  );
  console.log('PASS: selected highlight tracks folder layout motion');

  await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const outside = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    });
    const first = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    });
    const last = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    });
    outside.setAttribute('label', 'Folder fallback');
    first.setAttribute('label', 'Folder closing first');
    last.setAttribute('label', 'Folder closing last');
    const folder = gZenFolders.createFolder([first, last], { label: 'Empty selection folder' });
    folder.collapsed = false;
    first.owner = outside;
    last.owner = outside;
    gBrowser.selectedTab = last;
    window.__emptyFolderSelectionTest = { outside, first, last, folder };
  `);
  await sleep(350);
  await run(`
    const {outside, first, last} = window.__emptyFolderSelectionTest;
    const fallbackBackground = outside.querySelector(':scope > .tab-stack > .tab-background');
    fallbackBackground.style.setProperty('display', 'none');
    setTimeout(() => fallbackBackground.style.removeProperty('display'), 80);
    gBrowser.removeTabs([first, last]);
  `);
  let fallbackMotion;
  for (let index = 0; index < 12; index += 1) {
    await sleep(25);
    fallbackMotion = await run(`
      const highlight = document.getElementById('folder-open-tabs-selection-highlight');
      const animation = highlight?.getAnimations()[0];
      const firstTransform = animation?.effect.getKeyframes()[0]?.transform;
      const firstMatrix = firstTransform ? new DOMMatrixReadOnly(firstTransform) : null;
      return {
        selectedIsOutside: gBrowser.selectedTab === window.__emptyFolderSelectionTest.outside,
        duration: animation?.effect.getTiming().duration,
        firstMotion: firstMatrix
          ? Math.abs(firstMatrix.e) + Math.abs(firstMatrix.f) + Math.abs(firstMatrix.a - 1) + Math.abs(firstMatrix.d - 1)
          : 0,
      };
    `);
    if (fallbackMotion.selectedIsOutside && fallbackMotion.duration === 360) {
      break;
    }
  }
  assert.equal(fallbackMotion.selectedIsOutside, true, 'Normal fallback tab becomes selected');
  assert.equal(fallbackMotion.duration, 360, 'Fallback highlight uses the selection motion');
  assert(
    fallbackMotion.firstMotion > 0.5,
    'Fallback highlight starts from the closed folder tab position'
  );
  await sleep(450);
  const emptyFolderSelection = await run(`
    const selected = gBrowser.selectedTab;
    const controller = window.__folderOpenTabsSelectionHighlightController;
    const highlight = document.getElementById('folder-open-tabs-selection-highlight');
    const selectedBox = selected?.querySelector(':scope > .tab-stack > .tab-background')?.getBoundingClientRect();
    const highlightBox = highlight?.getBoundingClientRect();
    return {
      selectedIsOutside: selected === window.__emptyFolderSelectionTest.outside,
      selectedInsideFolder: !!selected?.closest('zen-folder'),
      currentMatchesSelected: controller?.currentTab === selected,
      highlightHidden: !!highlight?.hidden,
      selectedMarked: selected?.hasAttribute('folder-open-tabs-selection-target'),
      topDifference: Math.abs((highlightBox?.top ?? 0) - (selectedBox?.top ?? 0)),
    };
  `);
  assert.equal(emptyFolderSelection.selectedIsOutside, true, 'Normal fallback tab stays selected');
  assert.equal(emptyFolderSelection.selectedInsideFolder, false, 'Selection leaves the emptied folder');
  assert.equal(emptyFolderSelection.currentMatchesSelected, true, 'Highlight retargets to the fallback tab');
  assert.equal(emptyFolderSelection.highlightHidden, false, 'Fallback highlight stays visible');
  assert.equal(emptyFolderSelection.selectedMarked, true, 'Fallback tab owns the shared highlight');
  assert(emptyFolderSelection.topDifference < 0.75, 'Fallback highlight reaches the selected tab');
  await run(`
    const controller = window.__folderOpenTabsSelectionHighlightController;
    controller.hide();
    gBrowser.selectedTab.style.setProperty('--folder-open-tabs-selection-probe', '1');
  `);
  await sleep(100);
  const recoveredEmptyFolderSelection = await selectionHighlightState();
  assert.equal(recoveredEmptyFolderSelection.targetMarked, true, 'Layout reconciliation restores the selected target');
  assert(
    Math.abs(recoveredEmptyFolderSelection.top - recoveredEmptyFolderSelection.selectedTop) < 0.75,
    'Layout reconciliation restores the selected highlight position'
  );
  await run(`
    gBrowser.selectedTab.style.removeProperty('--folder-open-tabs-selection-probe');
  `);
  const fallbackClickPoint = await run(`
    const tab = gBrowser.selectedTab;
    const box = tab.getBoundingClientRect();
    window.__fallbackTabClickCount = 0;
    tab.addEventListener('click', () => window.__fallbackTabClickCount += 1, { once: true });
    return {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)};
  `);
  await send('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'fallback-tab-mouse', parameters: { pointerType: 'mouse' }, actions: [
    {type:'pointerMove',duration:0,origin:'viewport', ...fallbackClickPoint}, {type:'pointerDown',button:0}, {type:'pointerUp',button:0},
  ] }] });
  assert.equal(
    await run('return window.__fallbackTabClickCount;'),
    1,
    'Fallback tab remains clickable after highlight recovery'
  );
  console.log('PASS: empty folder selection retargets the highlight');

  await run('gBrowser.selectedTab=window.__folderTest.tabs[1];');
  await sleep(300);
  await writeFile(path.join(root,'tests','results.json'), JSON.stringify({version:'1.22.2b',loadMethod:'userChrome.css @import',presentationChecks:'passed',nativeVisibilityMismatch},null,2));
  console.log(`LIMITATION: CSS-only internal visibility mismatch = ${nativeVisibilityMismatch}`);
  await send('Marionette:Quit', { flags: ['eForceQuit'] });
} finally {
  socket?.destroy();
  browser.kill();
}
