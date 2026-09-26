import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
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
  const folderMotionState = () => run(`
    const folder = window.__folderTest.folder;
    return folder.getAnimations({ subtree: true }).map(animation => ({
      id: animation.id,
      name: animation.animationName,
      target: animation.effect?.target?.className?.baseVal ?? animation.effect?.target?.className,
      properties: Object.keys(animation.effect?.getKeyframes()[0] ?? {}),
      duration: animation.effect?.getTiming().duration,
      easing: animation.effect?.getTiming().easing,
      keyframeEasings: animation.effect?.getKeyframes().map(frame => frame.easing),
    }));
  `);
  const folderOpenPresentationState = () => run(`
    const folder = window.__folderTest.folder;
    const effect = document.querySelector('.folder-open-tabs-folder-open-effect');
    return {
      effectCount: document.querySelectorAll('.folder-open-tabs-folder-open-effect').length,
      iconCount: effect?.querySelectorAll('.folder-open-tabs-folder-open-icon').length ?? 0,
      iconAssetCount: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-open-icon')]
            .filter(icon => icon.querySelector(':scope > .folder-open-tabs-folder-open-source'))
            .length
        : 0,
      iconBackgroundColors: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-open-icon')]
            .map(icon => getComputedStyle(icon).backgroundColor)
        : [],
      iconFilters: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-open-icon')]
            .map(icon => getComputedStyle(icon).filter)
        : [],
      itemCount: folder.querySelectorAll('[folder-open-tabs-open-item]').length,
      motion: folder.hasAttribute('folder-open-tabs-open-motion'),
      rowAnimationCount: [...folder.querySelectorAll('[folder-open-tabs-open-item] > .tab-stack')]
        .flatMap(item => item.getAnimations())
        .filter(animation => animation.animationName === 'folder-open-tabs-folder-open-row-reveal')
        .length,
      rowDelays: [...folder.querySelectorAll('[folder-open-tabs-open-item] > .tab-stack')]
        .flatMap(item => item.getAnimations()).filter(animation => animation.animationName === 'folder-open-tabs-folder-open-row-reveal')
        .map(animation => animation.effect.getTiming().delay),
      opacities: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-open-icon')]
            .map(icon => Number.parseFloat(icon.style.opacity))
        : [],
    };
  `);
  const folderClosePresentationState = () => run(`
    const folder = window.__folderTest.folder;
    const effects = [...document.querySelectorAll('.folder-open-tabs-folder-close-effect')];
    const effect = effects.at(-1);
    return {
      effectCount: effects.length,
      iconCount: effect?.querySelectorAll('.folder-open-tabs-folder-close-icon').length ?? 0,
      iconAssetCount: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-close-icon')]
            .filter(icon => icon.querySelector(':scope > .folder-open-tabs-folder-open-source'))
            .length
        : 0,
      iconBackgroundColors: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-close-icon')]
            .map(icon => getComputedStyle(icon).backgroundColor)
        : [],
      iconFilters: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-close-icon')]
            .map(icon => getComputedStyle(icon).filter)
        : [],
      itemCount: folder.querySelectorAll('[folder-open-tabs-close-item]').length,
      motion: folder.hasAttribute('folder-open-tabs-close-motion'),
      opacities: effect
        ? [...effect.querySelectorAll('.folder-open-tabs-folder-close-icon')]
            .map(icon => Number.parseFloat(icon.style.opacity))
        : [],
    };
  `);
  const folderCloseCompletionState = () => run(`
    const folder = window.__folderTest.folder;
    const label = folder.querySelector(':scope > .tab-group-label-container');
    const animation = label?.getAnimations().find(
      item => item.id === 'folder-open-tabs-folder-close-completion'
    );
    return {
      animationCount: animation ? 1 : 0,
      duration: animation?.effect.getTiming().duration,
      looping: animation?.effect.getTiming().iterations === Infinity,
      playState: animation?.playState,
      transforms: animation?.effect.getKeyframes().map(frame => frame.transform) ?? [],
    };
  `);
  const folderCloseCompletionParticleState = () => run(`
    const effects = [
      ...document.querySelectorAll(
        '.folder-open-tabs-folder-close-completion-particle-effect'
      ),
    ];
    const effect = effects.at(-1);
    const particles = effect
      ? [...effect.querySelectorAll('.folder-open-tabs-folder-close-completion-particle')]
      : [];
    const animations = particles.flatMap(particle => particle.getAnimations());
    return {
      effectCount: effects.length,
      renderer: effect?.dataset.renderer,
      particleCount: particles.length,
      animationCount: animations.length,
      durations: animations.map(animation => animation.effect.getTiming().duration),
      shapes: particles.map(particle => ({
        width: particle.style.width,
        height: particle.style.height,
        borderRadius: particle.style.borderRadius,
      })),
      keyframes: animations[0]?.effect.getKeyframes().map(frame => frame.transform) ?? [],
    };
  `);
  const allUnloadedFolderMotionState = () => run(`
    const folder = window.__allUnloadedFolderTimingTest.folder;
    return folder.getAnimations({ subtree: true })
      .filter(animation => !animation.id?.startsWith('folder-open-tabs-') && animation.animationName !== 'folder-open-tabs-folder-open-row-reveal')
      .map(animation => ({
      target: animation.effect?.target?.className ?? animation.effect?.target?.localName,
      duration: animation.effect?.getTiming().duration,
      easing: animation.effect?.getTiming().easing,
      playState: animation.playState,
    }));
  `);
  const allUnloadedFolderVisualState = () => run(`
    const { folder, tabs } = window.__allUnloadedFolderTimingTest;
    const folderBox = folder.getBoundingClientRect();
    return {
      folderHeight: folderBox.height,
      tabHeights: tabs.map(tab => tab.getBoundingClientRect().height),
      tabOpacities: tabs.map(tab => Number(getComputedStyle(tab).opacity)),
      containerHidden: folder.groupContainer.hasAttribute('hidden'),
      groupStartMarginTop: getComputedStyle(folder.groupStartElement).marginTop,
      outsideTop: window.__allUnloadedFolderTimingTest.outside.getBoundingClientRect().top,
    };
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
      selectionHighlightHidden:
        document.getElementById('folder-open-tabs-selection-highlight')?.hidden ?? true,
      closingTabTargeted: window.__closeParticleTest.tab.hasAttribute('folder-open-tabs-selection-target'),
      highlightTracksFallback: document.getElementById('folder-open-tabs-selection-highlight')?.hidden ||
        (window.__folderOpenTabsSelectionHighlightController.currentTab === gBrowser.selectedTab &&
         gBrowser.selectedTab !== window.__closeParticleTest.tab),
      particleCount: particles.length,
      particleDurations: particleAnimations.map(animation => animation.effect.getTiming().duration),
      particleDelays: particleAnimations.map(animation => animation.effect.getTiming().delay),
      particleWave: particles.map((particle, index) => ({
        x: Number.parseFloat(particle.style.left),
        delay: particleAnimations[index]?.effect.getTiming().delay,
      })),
      activeParticleCount: particleAnimations.filter(
        animation => animation.playState === 'running' || animation.playState === 'pending'
      ).length,
      layoutAnimationCount: layoutAnimations.length,
      layoutDurations: layoutAnimations.map(animation => animation.effect.getTiming().duration),
      layoutDelays: layoutAnimations.map(animation => animation.effect.getTiming().delay),
      layoutEasings: layoutAnimations.map(animation => animation.effect.getTiming().easing),
      finalTranslateX: particleAnimations.map(animation => {
        const transform = animation.effect.getKeyframes().at(-1).transform;
        return new DOMMatrixReadOnly(transform).m41;
      }),
      finalTranslateY: particleAnimations.map(animation => {
        const transform = animation.effect.getKeyframes().at(-1).transform;
        return new DOMMatrixReadOnly(transform).m42;
      }),
    };
  `);
  const controlBurstState = () => run(`
    const effects = [...document.querySelectorAll('.folder-open-tabs-control-burst-effect')];
    const effect = effects.at(-1);
    const particles = effect
      ? [...effect.querySelectorAll('.folder-open-tabs-control-burst-particle')]
      : [];
    const animations = particles.flatMap(particle => particle.getAnimations());
    return {
      effectCount: effects.length,
      renderer: effect?.dataset.renderer,
      particleCount: particles.length,
      originX: Number.parseFloat(effect?.style.left ?? 'NaN'),
      originY: Number.parseFloat(effect?.style.top ?? 'NaN'),
      sizes: particles.map(particle => Number.parseFloat(particle.style.width)),
      radii: particles.map(particle => particle.style.borderRadius),
      durations: animations.map(animation => animation.effect.getTiming().duration),
      activeCount: animations.filter(animation =>
        animation.playState === 'running' || animation.playState === 'pending'
      ).length,
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
  const folderReturnState = () => run(`
    const effects = [...document.querySelectorAll('.folder-open-tabs-folder-return-effect')];
    const effect = effects.at(-1);
    const sparkEffects = [
      ...document.querySelectorAll('.folder-open-tabs-folder-return-spark-effect'),
    ];
    const spark = sparkEffects.at(-1);
    const sparkAnimations = spark
      ? [...spark.querySelectorAll('.folder-open-tabs-folder-return-spark')].flatMap(
          particle => particle.getAnimations()
        )
      : [];
    const folder = effect?.dataset.folderId
      ? document.getElementById(effect.dataset.folderId)
      : null;
    const folderIcon = folder?.querySelector(
      ':scope > .tab-group-label-container .tab-group-folder-icon svg'
    );
    const returningTab = window.__folderCloseReturnTest?.returningTab;
    const surface = effect?.querySelector('.folder-open-tabs-folder-return-surface');
    const target = document.querySelector('.folder-open-tabs-folder-return-target');
    const animation = effect?.getAnimations().find(
      item => item.id === 'folder-open-tabs-folder-return'
    );
    const targetAnimation = target?.getAnimations().find(
      item => item.id === 'folder-open-tabs-folder-return-target'
    );
    const finalTransform = animation?.effect.getKeyframes().at(-1).transform;
    const finalMatrix = finalTransform ? new DOMMatrixReadOnly(finalTransform) : null;
    return {
      effectCount: effects.length,
      targetCount: document.querySelectorAll('.folder-open-tabs-folder-return-target').length,
      renderer: effect?.dataset.renderer,
      folderId: effect?.dataset.folderId,
      folderReturnMotion: folder?.hasAttribute('folder-open-tabs-return-motion') ?? false,
      folderCollapsed: folder?.collapsed ?? null,
      folderIconState: folderIcon?.getAttribute('state'),
      folderIconActive: folderIcon?.getAttribute('active'),
      returningTabHeight: returningTab ? getComputedStyle(returningTab).height : null,
      returningTabOpacity: returningTab ? getComputedStyle(returningTab).opacity : null,
      surfaceOutlineWidth: surface ? getComputedStyle(surface).outlineWidth : null,
      label: effect?.querySelector('span:not(.folder-open-tabs-folder-return-surface)')?.textContent,
      duration: animation?.effect.getTiming().duration,
      easing: animation?.effect.getTiming().easing,
      offsets: animation?.effect.getKeyframes().map(frame => frame.computedOffset),
      finalTranslateX: finalMatrix?.m41,
      finalTranslateY: finalMatrix?.m42,
      finalScaleX: finalMatrix?.m11,
      finalScaleY: finalMatrix?.m22,
      targetDuration: targetAnimation?.effect.getTiming().duration,
      particleEffectCount: document.querySelectorAll('.folder-open-tabs-close-particle-effect').length,
      openUnloadEffectCount: document.querySelectorAll('.folder-open-tabs-open-unload-effect').length,
      controlBurstEffectCount: document.querySelectorAll('.folder-open-tabs-control-burst-effect').length,
      controlBurstParticleCount: document.querySelectorAll('.folder-open-tabs-control-burst-particle').length,
      completionSparkEffectCount: sparkEffects.length,
      completionSparkRenderer: spark?.dataset.renderer,
      completionSparkParticleCount: spark?.querySelectorAll('.folder-open-tabs-folder-return-spark').length ?? 0,
      completionSparkShapes: spark
        ? [...spark.querySelectorAll('.folder-open-tabs-folder-return-spark')].map(particle => ({
            width: particle.style.width,
            height: particle.style.height,
            borderRadius: particle.style.borderRadius,
          }))
        : [],
      completionSparkDurations: sparkAnimations.map(animation => animation.effect.getTiming().duration),
    };
  `);
  await sleep(3000);
  const testEnvironment = await run('return { version: Services.appinfo.version, buildID: Services.appinfo.appBuildID, channel: Services.prefs.getCharPref("app.update.channel"), os: Services.appinfo.OS, folders: !!window.gZenFolders, workspaces: !!window.gZenWorkspaces, url: location.href };');
  console.log(JSON.stringify(testEnvironment));
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
  const openingMotion = await folderMotionState();
  const openingPresentation = await folderOpenPresentationState();
  assert.equal(openingPresentation.effectCount, 1, 'Folder expansion starts the icon flyout layer');
  assert.equal(openingPresentation.motion, true, 'Folder expansion marks the open presentation state');
  assert.equal(openingPresentation.iconCount, openingPresentation.itemCount, 'Each visible folder item gets one flying icon');
  assert(
    openingPresentation.iconAssetCount > 0,
    'Flying icons reuse loaded source assets when tab icons exist'
  );
  assert(
    openingPresentation.iconBackgroundColors.every(color => color === 'rgba(0, 0, 0, 0)'),
    'Flying icons do not use an opaque placeholder background'
  );
  assert(
    openingPresentation.iconFilters.every(filter => filter === 'none'),
    'Flying icons do not use a glow filter'
  );
  assert(openingPresentation.iconCount >= 2, 'Folder expansion flies out multiple tab icons');
  assert(openingPresentation.rowAnimationCount >= 1, 'Folder rows reveal with the icon flyout');
  assert(
    openingPresentation.rowDelays.length >= 2 && openingPresentation.rowDelays[0] < openingPresentation.rowDelays[1],
    'Folder rows schedule their reveals from top to bottom with a stagger'
  );
  const openingToggleMotion = openingMotion.filter(animation => animation.duration === 280);
  assert(
    openingToggleMotion.length > 0,
    'Folder expansion uses the slower 280ms motion'
  );
  assert(
    openingMotion.every(animation => animation.id?.startsWith('folder-open-tabs-') || animation.duration !== 180),
    'Folder expansion does not retain Zen native 180ms timing'
  );
  assert(
    openingToggleMotion.every(animation =>
      animation.easing === 'ease-in-out' || animation.keyframeEasings?.includes('ease-in-out')
    ),
    'Folder expansion uses ease-in-out throughout'
  );
  assert(
    opening[0].height > 0 && opening[1].height > 0 && opening[1].opacity === '1',
    'Loaded tabs keep their natural size while the folder expands'
  );
  assert(
    opening[1].top >= opening[0].bottom - 0.5,
    'Loaded background tabs do not overlap the first tab while expanding'
  );
  await sleep(620);
  const finishedOpeningPresentation = await folderOpenPresentationState();
  assert.equal(finishedOpeningPresentation.effectCount, 0, 'Folder icon flyout finishes within a short interaction window');
  assert.equal(finishedOpeningPresentation.motion, false, 'Folder icon flyout cleans up its motion state');
  const expandedBeforeClosing = await state();
  await run('window.__folderTest.folder.collapsed=true;');
  await sleep(60);
  const closing = await state();
  const closingMotion = await folderMotionState();
  const closingPresentation = await folderClosePresentationState();
  const closingShake = await folderCloseCompletionState();
  assert.equal(closingPresentation.effectCount, 1, 'Folder collapse starts the icon return layer');
  assert.equal(closingPresentation.motion, true, 'Folder collapse marks the return presentation state');
  assert.equal(closingPresentation.iconCount, closingPresentation.itemCount, 'Each visible folder item gets one returning icon');
  assert(
    closingPresentation.iconAssetCount > 0,
    'Returning icons reuse loaded source assets when tab icons exist'
  );
  assert(
    closingPresentation.iconBackgroundColors.every(color => color === 'rgba(0, 0, 0, 0)'),
    'Returning icons do not use an opaque placeholder background'
  );
  assert(
    closingPresentation.iconFilters.every(filter => filter === 'none'),
    'Returning icons do not use a glow filter'
  );
  const closingToggleMotion = closingMotion.filter(animation => animation.duration === 280);
  assert(
    closingToggleMotion.length > 0,
    'Folder collapse uses the slower 280ms motion'
  );
  assert(
    closingMotion.every(animation => animation.id?.startsWith('folder-open-tabs-') || animation.duration !== 180),
    'Folder collapse does not retain Zen native 180ms timing'
  );
  assert(
    closingToggleMotion.every(animation =>
      animation.easing === 'ease-in-out' || animation.keyframeEasings?.includes('ease-in-out')
    ),
    'Folder collapse uses ease-in-out throughout'
  );
  assert(
    closing[1].height > 0 && closing[1].opacity === '1',
    'Loaded background tab remains visible during collapse'
  );
  assert(
    closing[2].height > 0 &&
      closing[2].height < expandedBeforeClosing[2].height &&
      closing[2].opacity > 0 &&
      closing[2].opacity < 1,
    'Unloaded tab remains in an intermediate state during selected-folder collapse'
  );
  assert.equal(closingShake.animationCount, 1, 'Folder shakes while icons are entering');
  assert.equal(closingShake.looping, true, 'Folder shake loops during icon storage');
  await sleep(360);
  const finishedClosingPresentation = await folderClosePresentationState();
  const closingCompletion = await folderCloseCompletionState();
  const closingCompletionParticles = await folderCloseCompletionParticleState();
  assert.equal(finishedClosingPresentation.effectCount, 0, 'Folder icon return finishes within a short interaction window');
  assert.equal(finishedClosingPresentation.motion, false, 'Folder icon return cleans up its motion state');
  assert.equal(closingCompletion.animationCount, 1, 'Folder close completion adds a folder nudge');
  assert.equal(closingCompletion.duration, 180, 'Folder close completion nudge stays short');
  assert(
    closingCompletion.transforms.some(transform => transform.includes('translate3d(-4px, -3px')),
    'Folder close completion starts with an upper-left nudge'
  );
  assert.equal(closingCompletionParticles.effectCount, 1, 'Folder close completion creates one fan particle overlay');
  assert.equal(closingCompletionParticles.renderer, 'folder-close-completion-fan');
  assert.equal(closingCompletionParticles.particleCount, 3, 'Folder close completion uses three fan particles');
  assert.equal(closingCompletionParticles.animationCount, 3);
  assert(
    closingCompletionParticles.shapes.every(
      ({ width, height, borderRadius }) => width !== height && borderRadius === '1px'
    ),
    'Folder close completion uses three rectangular particles'
  );
  assert(
    closingCompletionParticles.durations.every(duration => duration >= 260 && duration <= 278),
    'Folder close completion particles stay short'
  );
  assert(
    closingCompletionParticles.keyframes.some(transform => transform.includes('translate3d(-10px, -13px')),
    'Folder close completion fans particles upward and left'
  );
  await sleep(220);
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

  await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const outside = gBrowser.addTab('about:blank', { triggeringPrincipal: principal, skipAnimation: true });
    const tabs = Array.from({ length: 3 }, () =>
      gBrowser.addTab('about:blank', { triggeringPrincipal: principal, skipAnimation: true })
    );
    const folder = gZenFolders.createFolder(tabs, { label: 'All unloaded timing' });
    gBrowser.selectedTab = outside;
    tabs.forEach(tab => gBrowser.discardBrowser(tab, true));
    window.__allUnloadedFolderTimingTest = { outside, tabs, folder };
  `);
  await sleep(300);
  const allUnloadedExpandedStart = await allUnloadedFolderVisualState();
  const allUnloadedFolderClickPoint = await run(`
    const box = window.__allUnloadedFolderTimingTest.folder
      .querySelector('.tab-group-label-container')
      .getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
  `);
  const clickAllUnloadedFolder = pointerId => send('WebDriver:PerformActions', { actions: [{
    type: 'pointer',
    id: pointerId,
    parameters: { pointerType: 'mouse' },
    actions: [
      { type: 'pointerMove', duration: 0, origin: 'viewport', ...allUnloadedFolderClickPoint },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerUp', button: 0 },
    ],
  }] });
  await clickAllUnloadedFolder('all-unloaded-collapse-mouse');
  const allUnloadedCollapseSamples = [];
  for (const delay of [40, 120, 200, 260, 320]) {
    await sleep(delay - (allUnloadedCollapseSamples.at(-1)?.delay ?? 0));
    allUnloadedCollapseSamples.push({
      delay,
      visual: await allUnloadedFolderVisualState(),
      motion: await allUnloadedFolderMotionState(),
    });
  }
  const allUnloadedCollapseMid = allUnloadedCollapseSamples.find(sample => sample.delay === 120);
  const allUnloadedCollapsedEnd = allUnloadedCollapseSamples.at(-1);
  assert(
    allUnloadedCollapseSamples
      .filter(sample => sample.motion.length)
      .every(sample => sample.motion.every(animation => animation.duration === 280)),
    'Mouse collapse with no loaded tabs keeps every folder animation at 280ms'
  );
  assert(
    allUnloadedCollapseMid.visual.outsideTop < allUnloadedExpandedStart.outsideTop - 0.5 &&
      allUnloadedCollapseMid.visual.outsideTop > allUnloadedCollapsedEnd.visual.outsideTop + 0.5,
    'Following tabs remain between their endpoints halfway through an all-unloaded collapse'
  );
  await sleep(80);
  await clickAllUnloadedFolder('all-unloaded-expand-mouse');
  const allUnloadedExpandSamples = [];
  for (const delay of [40, 120, 200, 260, 320]) {
    await sleep(delay - (allUnloadedExpandSamples.at(-1)?.delay ?? 0));
    allUnloadedExpandSamples.push({
      delay,
      visual: await allUnloadedFolderVisualState(),
      motion: await allUnloadedFolderMotionState(),
    });
  }
  const allUnloadedExpandMid = allUnloadedExpandSamples.find(sample => sample.delay === 120);
  const allUnloadedExpandedEnd = allUnloadedExpandSamples.at(-1);
  assert.equal(
    allUnloadedCollapsedEnd.visual.groupStartMarginTop,
    '-4px',
    'All-unloaded collapse leaves the four-pixel spacer endpoint'
  );
  assert(
    allUnloadedExpandSamples[0].visual.outsideTop > allUnloadedCollapsedEnd.visual.outsideTop + 0.5 &&
      allUnloadedExpandSamples[0].visual.outsideTop < allUnloadedExpandedStart.outsideTop - 0.5,
    'All-unloaded expansion starts moving during the first sample'
  );
  assert(
    allUnloadedExpandSamples
      .filter(sample => sample.motion.length)
      .every(sample => sample.motion.every(animation => animation.duration === 280)),
    'Mouse expansion with no loaded tabs keeps every folder animation at 280ms'
  );
  assert(
    allUnloadedExpandMid.visual.outsideTop > allUnloadedCollapsedEnd.visual.outsideTop + 0.5 &&
      allUnloadedExpandMid.visual.outsideTop < allUnloadedExpandedEnd.visual.outsideTop - 0.5,
    'Following tabs remain between their endpoints halfway through an all-unloaded expansion'
  );
  await sleep(80);
  console.log('PASS: all-unloaded folder clicks keep the same continuous 280ms layout motion');

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
  await send('WebDriver:PerformActions', { actions: [{ type:'pointer', id:'mouse', parameters:{pointerType:'mouse'}, actions:[
    {type:'pointerMove',duration:0,origin:'viewport',x:1100,y:600},
  ] }] });
  await sleep(150);
  await run(`
    const background = gBrowser.selectedTab.querySelector(':scope > .tab-stack > .tab-background');
    window.__appearanceAudit = { background, original:background.style.getPropertyValue('background'),
      priority:background.style.getPropertyPriority('background') };
    background.style.setProperty('background','rgb(1, 2, 3)','important');
  `);
  await sleep(100);
  assert.equal(await run("return getComputedStyle(document.getElementById('folder-open-tabs-selection-highlight')).backgroundColor;"),
    'rgb(1, 2, 3)', 'Appearance cache updates after an external selected-background change');
  await run(`
    const {background,original,priority} = window.__appearanceAudit;
    original ? background.style.setProperty('background',original,priority) : background.style.removeProperty('background');
  `);
  await sleep(100);
  console.log('PASS: selected appearance cache follows external styles');
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
    gBrowser.selectedTab = tab;
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
  const closeControlBurst = await controlBurstState();
  assert.equal(closeControlBurst.effectCount, 1, 'Close-button click creates one control burst');
  assert.equal(closeControlBurst.renderer, 'control-burst');
  assert.equal(closeControlBurst.particleCount, 8, 'Control burst uses eight restrained squares');
  assert.equal(closeControlBurst.activeCount, 8);
  assert(closeControlBurst.sizes.every(size => size >= 2 && size <= 3));
  assert(closeControlBurst.radii.every(radius => radius === '0px'));
  assert(closeControlBurst.durations.every(duration => duration >= 260 && duration <= 288));
  assert(Math.abs(closeControlBurst.originX - closeParticlePoint.x) < 0.5);
  assert(Math.abs(closeControlBurst.originY - closeParticlePoint.y) < 0.5);
  const closeParticleDuringClose = await closeParticleState();
  console.log(JSON.stringify({closeParticleRenderer:closeParticleDuringClose.renderer}));
  assert.equal(closeParticleDuringClose.effectCount, 1, 'Ungrouped tab close creates one particle overlay');
  assert.equal(closeParticleDuringClose.renderer, 'particles-only');
  assert.equal(closeParticleDuringClose.ghostCount, 0, 'Closed tab ghost is never reconstructed');
  assert(!closeParticleDuringClose.closedTabConnected || closeParticleDuringClose.closedTabVisibility === 'hidden',
    'Closing tab is hidden or already removed');
  assert.equal(closeParticleDuringClose.closingTabTargeted, false, 'Closing tab releases its selection highlight');
  assert.equal(closeParticleDuringClose.highlightTracksFallback, true, 'Visible selection highlight belongs to the fallback tab');
  assert.equal(closeParticleDuringClose.particleCount, 60, 'Close effect uses 60 particles');
  assert.equal(closeParticleDuringClose.particleDurations.length, 60);
  assert(
    closeParticleDuringClose.particleDurations.every(duration => duration >= 225 && duration <= 295),
    'Particles use short varied durations'
  );
  assert(
    closeParticleDuringClose.particleDelays.every(delay => delay >= 0 && delay <= 220),
    'Particles use a restrained right-to-left dissolve wave'
  );
  assert(
    closeParticleDuringClose.finalTranslateX.every(
      translateX => translateX >= -4 && translateX <= -1.5
    ),
    'Particles drift slightly toward the upper-left'
  );
  assert(
    closeParticleDuringClose.finalTranslateY.every(
      translateY => translateY >= -4 && translateY <= -1.5
    ),
    'Particles keep a slight upward drift'
  );
  const leftmostCloseParticle = closeParticleDuringClose.particleWave.reduce(
    (leftmost, particle) => particle.x < leftmost.x ? particle : leftmost
  );
  const rightmostCloseParticle = closeParticleDuringClose.particleWave.reduce(
    (rightmost, particle) => particle.x > rightmost.x ? particle : rightmost
  );
  assert(
    rightmostCloseParticle.delay < leftmostCloseParticle.delay,
    'Close dissolve starts at the right edge and progresses left'
  );
  assert(
    leftmostCloseParticle.delay - rightmostCloseParticle.delay >= 150,
    'Close dissolve keeps a visible left-right timing difference'
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
    const returningTab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    const retainedTab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    const storedTab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    returningTab.setAttribute('label', 'Return to folder');
    retainedTab.setAttribute('label', 'Remain in folder');
    storedTab.setAttribute('label', 'Stored in folder');
    returningTab.querySelector('.tab-label').textContent = 'Returning tab';
    retainedTab.querySelector('.tab-label').textContent = 'Retained tab';
    const folder = gZenFolders.createFolder(
      [returningTab, retainedTab, storedTab],
      { label: 'Folder return target' }
    );
    gBrowser.selectedTab = window.__closeParticleTest.anchorTab;
    window.__folderCloseReturnTest = { returningTab, retainedTab, storedTab, folder };
  `);
  await sleep(150);
  await run(`
    const { storedTab, folder } = window.__folderCloseReturnTest;
    gBrowser.discardBrowser(storedTab, true);
    folder.collapsed = true;
  `);
  await sleep(500);
  const folderReturnGeometry = await run(`
    const { returningTab, folder } = window.__folderCloseReturnTest;
    const origin = returningTab.getBoundingClientRect();
    const label = folder.querySelector(':scope > .tab-group-label-container');
    const icon = label.querySelector('.tab-group-folder-icon');
    const iconBox = icon.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    const target = iconBox.width > 0 && iconBox.height > 0 ? iconBox : labelBox;
    return {
      translateX: target.left + target.width / 2 - (origin.left + origin.width / 2),
      translateY: target.top + target.height / 2 - (origin.top + origin.height / 2),
      folderId: folder.id,
      label: returningTab.querySelector('.tab-label')?.textContent,
    };
  `);
  const folderReturnClosePoint = await run(`
    const tab = window.__folderCloseReturnTest.returningTab;
    const button = tab.querySelector('.tab-close-button');
    const buttonBox = button?.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    return buttonBox?.width > 0
      ? {x:Math.round(buttonBox.x+buttonBox.width/2),y:Math.round(buttonBox.y+buttonBox.height/2)}
      : {x:Math.round(tabBox.right-12),y:Math.round(tabBox.y+tabBox.height/2)};
  `);
  await send('WebDriver:PerformActions', { actions: [{
    type: 'pointer',
    id: 'folder-return-close-mouse',
    parameters: { pointerType: 'mouse' },
    actions: [
      {type:'pointerMove',duration:0,origin:'viewport', ...folderReturnClosePoint},
      {type:'pointerDown',button:0},
      {type:'pointerUp',button:0},
    ],
  }] });
  await sleep(45);
  const folderReturnUnloadState = await run(`
    const { returningTab, folder } = window.__folderCloseReturnTest;
    return {
      connected: returningTab.isConnected,
      pending: returningTab.hasAttribute('pending'),
      collapsed: folder.collapsed,
    };
  `);
  assert.deepEqual(
    folderReturnUnloadState,
    { connected: true, pending: true, collapsed: true },
    'Collapsed folder close control unloads the tab without removing it'
  );
  const folderReturnDuringClose = await folderReturnState();
  assert.equal(folderReturnDuringClose.effectCount, 1, 'Collapsed folder tab creates one return overlay');
  assert.equal(folderReturnDuringClose.targetCount, 1, 'Folder icon creates one receiving pulse');
  assert.equal(folderReturnDuringClose.renderer, 'folder-return');
  assert.equal(folderReturnDuringClose.folderId, folderReturnGeometry.folderId);
  assert.equal(folderReturnDuringClose.folderReturnMotion, true, 'Folder opens during return motion');
  assert.equal(folderReturnDuringClose.folderCollapsed, true, 'Folder remains logically collapsed during return motion');
  assert.equal(folderReturnDuringClose.folderIconState, 'open', 'Folder icon uses the open appearance');
  assert.equal(folderReturnDuringClose.folderIconActive, 'false', 'Open folder icon hides the collapsed active dots');
  assert.equal(folderReturnDuringClose.returningTabHeight, '0px', 'Returning tab stays collapsed during return motion');
  assert.equal(folderReturnDuringClose.returningTabOpacity, '0', 'Returning tab stays hidden during return motion');
  assert.equal(folderReturnDuringClose.surfaceOutlineWidth, '1px', 'Return overlay preserves the loaded-tab outline');
  assert.equal(
    folderReturnDuringClose.label,
    folderReturnGeometry.label,
    'Return overlay preserves the rendered tab label'
  );
  assert.equal(folderReturnDuringClose.duration, 560);
  assert.equal(folderReturnDuringClose.targetDuration, 560);
  assert.equal(folderReturnDuringClose.easing, 'linear');
  assert.equal(folderReturnDuringClose.offsets.length, 35, 'Return motion uses near-frame curve samples');
  assert.equal(folderReturnDuringClose.offsets[0], 0);
  assert.equal(folderReturnDuringClose.offsets.at(-1), 1);
  assert(
    folderReturnDuringClose.offsets.every(
      (offset, index, offsets) => index === 0 || offset > offsets[index - 1]
    ),
    'Return motion progresses without stepped keyframe holds'
  );
  assert(
    Math.abs(folderReturnDuringClose.finalTranslateX - folderReturnGeometry.translateX) < 0.5 &&
      Math.abs(folderReturnDuringClose.finalTranslateY - folderReturnGeometry.translateY) < 0.5,
    'Closing tab converges on the folder icon'
  );
  assert(Math.abs(folderReturnDuringClose.finalScaleX - 0.12) < 0.001);
  assert(Math.abs(folderReturnDuringClose.finalScaleY - 0.04) < 0.001);
  assert.equal(folderReturnDuringClose.particleEffectCount, 0, 'Folder return does not create close particles');
  assert.equal(folderReturnDuringClose.completionSparkEffectCount, 0, 'Completion spark waits for storage to finish');
  assert.equal(folderReturnDuringClose.openUnloadEffectCount, 0, 'Collapsed folders do not use open-folder unload motion');
  assert.equal(folderReturnDuringClose.controlBurstEffectCount, 1, 'Collapsed-folder unload button bursts at the click point');
  assert.equal(folderReturnDuringClose.controlBurstParticleCount, 8);
  await sleep(650);
  const folderReturnAfterClose = await folderReturnState();
  assert.equal(folderReturnAfterClose.effectCount, 0, 'Folder return overlay finishes cleanly');
  assert.equal(folderReturnAfterClose.targetCount, 0, 'Folder receiving pulse finishes cleanly');
  assert.equal(folderReturnAfterClose.controlBurstEffectCount, 0, 'Unload control burst finishes cleanly');
  assert.equal(folderReturnAfterClose.completionSparkEffectCount, 1, 'Completion spark starts after storage finishes');
  assert.equal(folderReturnAfterClose.completionSparkRenderer, 'folder-return-completion-spark');
  assert.equal(folderReturnAfterClose.completionSparkParticleCount, 10);
  assert(
    folderReturnAfterClose.completionSparkShapes.every(
      ({ width, height, borderRadius }) => width !== height && borderRadius === '0.5px'
    ),
    'Completion spark uses rectangular confetti pieces'
  );
  assert(
    folderReturnAfterClose.completionSparkShapes.every(
      ({ width, height }) => Number.parseFloat(width) >= 3.8 && Number.parseFloat(height) >= 2
    ),
    'Completion spark uses visible confetti pieces'
  );
  assert(
    folderReturnAfterClose.completionSparkDurations.every(duration => duration >= 320 && duration <= 356),
    'Completion confetti uses a slower particle burst'
  );
  await sleep(300);
  const folderReturnAfterSpark = await folderReturnState();
  assert.equal(folderReturnAfterSpark.completionSparkEffectCount, 0, 'Completion spark finishes cleanly');
  const folderReturnFinalPresentation = await run(`
    const { folder } = window.__folderCloseReturnTest;
    const icon = folder.querySelector(':scope > .tab-group-label-container .tab-group-folder-icon svg');
    return {
      motion: folder.hasAttribute('folder-open-tabs-return-motion'),
      iconState: icon?.getAttribute('state'),
    };
  `);
  assert.equal(folderReturnFinalPresentation.motion, false, 'Folder return presentation cleans up');
  assert.equal(folderReturnFinalPresentation.iconState, 'close', 'Folder icon returns to the closed appearance');
  assert(
    await run('return window.__folderCloseReturnTest.retainedTab.isConnected;'),
    'Other folder tabs remain connected'
  );
  console.log('PASS: ungrouped tabs dissolve upward while following tabs compact after a short delay');
  console.log('PASS: loaded tabs in collapsed folders fold back into the folder icon');

  await run(`
    const openReturningTab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    const openRetainedTab = gBrowser.addTab('about:blank', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      skipAnimation: true,
    });
    const folder = gZenFolders.createFolder(
      [openReturningTab, openRetainedTab],
      { label: 'Open folder unload' }
    );
    folder.collapsed = false;
    gBrowser.selectedTab = openReturningTab;
    window.__openFolderUnloadTest = { openReturningTab, openRetainedTab, folder };
  `);
  await sleep(400);
  const openFolderUnloadPoint = await run(`
    const tab = window.__openFolderUnloadTest.openReturningTab;
    const box = tab.getBoundingClientRect();
    return { x: Math.round(box.right - 12), y: Math.round(box.top + box.height / 2) };
  `);
  await send('WebDriver:PerformActions', { actions: [{
    type: 'pointer',
    id: 'open-folder-unload-hover',
    parameters: { pointerType: 'mouse' },
    actions: [
      {type:'pointerMove',duration:0,origin:'viewport', ...openFolderUnloadPoint},
    ],
  }] });
  await sleep(150);
  const openFolderUnloadButtonPoint = await run(`
    const tab = window.__openFolderUnloadTest.openReturningTab;
    const controls = [...tab.querySelectorAll('.tab-reset-button, .tab-close-button')];
    const control = controls.find(item => item.getBoundingClientRect().width > 0);
    const box = control?.getBoundingClientRect() ?? tab.getBoundingClientRect();
    return {
      x: Math.round(control ? box.left + box.width / 2 : box.right - 12),
      y: Math.round(box.top + box.height / 2),
      className: control?.className ?? null,
    };
  `);
  await send('WebDriver:PerformActions', { actions: [{
    type: 'pointer',
    id: 'open-folder-unload-mouse',
    parameters: { pointerType: 'mouse' },
    actions: [
      {type:'pointerMove',duration:0,origin:'viewport',x:openFolderUnloadButtonPoint.x,y:openFolderUnloadButtonPoint.y},
      {type:'pointerDown',button:0},
      {type:'pointerUp',button:0},
    ],
  }] });
  const openFolderUnloadSamples = [];
  for (const delay of [0, 20, 40, 80, 140, 220, 300, 380, 460, 560]) {
    if (delay) await sleep(delay - (openFolderUnloadSamples.at(-1)?.delay ?? 0));
    openFolderUnloadSamples.push(await run(`
      const { openReturningTab: tab, folder } = window.__openFolderUnloadTest;
      const style = getComputedStyle(tab);
      const box = tab.getBoundingClientRect();
      const effect = document.querySelector('.folder-open-tabs-open-unload-effect');
      const rings = [...(effect?.querySelectorAll('.folder-open-tabs-open-unload-ring') ?? [])];
      const iconAnimations = [...tab.querySelectorAll('.tab-icon-image, .tab-throbber')]
        .flatMap(icon => icon.getAnimations());
      return {
        height: box.height,
        opacity: Number(style.opacity),
        display: style.display,
        pending: tab.hasAttribute('pending'),
        folderActive: tab.hasAttribute('folder-active'),
        inlineHeight: tab.style.height,
        inlineOpacity: tab.style.opacity,
        collapsed: folder.collapsed,
        effectCount: document.querySelectorAll('.folder-open-tabs-open-unload-effect').length,
        ringCount: rings.length,
        ringAnimationCount: rings.flatMap(ring => ring.getAnimations()).length,
        ringRadius: rings[0] ? getComputedStyle(rings[0]).borderRadius : null,
        controlBurstEffectCount: document.querySelectorAll('.folder-open-tabs-control-burst-effect').length,
        controlBurstParticleCount: document.querySelectorAll('.folder-open-tabs-control-burst-particle').length,
        iconShake: iconAnimations.some(animation =>
          animation.id === 'folder-open-tabs-open-unload-icon-shake' &&
          (animation.playState === 'running' || animation.playState === 'pending')
        ),
      };
    `).then(sample => ({ ...sample, delay })));
  }
  assert(
    openFolderUnloadSamples.some(sample => sample.pending),
    'Open-folder close control unloads the tab'
  );
  assert(
    openFolderUnloadSamples.every(sample =>
      sample.height >= 39.5 &&
      sample.opacity === 1 &&
      sample.display === 'flex' &&
      sample.collapsed === false
    ),
    'Unloading a tab in an open folder never collapses or fades its row'
  );
  assert(
    openFolderUnloadSamples.some(sample =>
      sample.pending &&
      sample.effectCount === 1 &&
      sample.ringCount === 1 &&
      sample.ringAnimationCount === 1 &&
      sample.ringRadius === '999px'
    ),
    'Open-folder unload contracts one fully rounded ring toward the favicon'
  );
  assert(
    openFolderUnloadSamples.some(sample => sample.effectCount === 0 && sample.iconShake),
    'Favicon shakes after the outline is fully absorbed'
  );
  assert(
    openFolderUnloadSamples.some(sample =>
      sample.pending &&
      sample.controlBurstEffectCount === 1 &&
      sample.controlBurstParticleCount === 8
    ),
    'Open-folder unload button bursts at the click point'
  );
  const openFolderUnloadFinal = openFolderUnloadSamples.at(-1);
  assert.equal(openFolderUnloadFinal.effectCount, 0, 'Outline absorption overlay finishes cleanly');
  assert.equal(openFolderUnloadFinal.iconShake, false, 'Favicon shake finishes cleanly');
  assert.equal(openFolderUnloadFinal.controlBurstEffectCount, 0, 'Open-folder control burst finishes cleanly');
  console.log('PASS: open-folder outline is absorbed into the favicon before its storage shake');

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
    const trailing = gBrowser.addTab('about:blank', { triggeringPrincipal: principal, skipAnimation: true });
    gBrowser.selectedTab = selectedBelow;
    gBrowser.discardBrowser(unloadedAbove, true);
    window.__layoutMotionTest = { unloadedAbove, selectedBelow, folder, trailing };
  `);
  await sleep(500);
  const expandedLayout = await selectionHighlightState();
  const expandedFollowers = await run(`
    const newTabButton = document.getElementById('tabs-newtab-button') ?? document.getElementById('new-tab-button');
    const newTabRect = newTabButton?.getBoundingClientRect();
    return {
      trailingTop: window.__layoutMotionTest.trailing.getBoundingClientRect().top,
      newTabTop: newTabRect?.top,
      newTabHeight: newTabRect?.height ?? 0,
    };
  `);
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
  const collapsedFollowers = await run(`
    const newTabButton = document.getElementById('tabs-newtab-button') ?? document.getElementById('new-tab-button');
    return {
      trailingTop: window.__layoutMotionTest.trailing.getBoundingClientRect().top,
      newTabTop: newTabButton?.getBoundingClientRect().top,
    };
  `);
  await run('window.__layoutMotionTest.folder.collapsed=false;');
  await sleep(70);
  const openingLayout = await selectionHighlightState();
  const openingFollowers = await run(`
    const newTabButton = document.getElementById('tabs-newtab-button') ?? document.getElementById('new-tab-button');
    return {
      trailingTop: window.__layoutMotionTest.trailing.getBoundingClientRect().top,
      newTabTop: newTabButton?.getBoundingClientRect().top,
    };
  `);
  assert(openingLayout.selectedTop > collapsedLayout.selectedTop, 'Selected tab moves downward while its folder opens');
  assert(
    Math.abs(openingLayout.top - openingLayout.selectedTop) < 0.75,
    'Selected highlight follows the tab during folder expansion'
  );
  assert(
    openingFollowers.trailingTop > collapsedFollowers.trailingTop + 0.5 &&
      openingFollowers.trailingTop < expandedFollowers.trailingTop - 0.5,
    'Normal tabs after a folder move continuously during expansion'
  );
  if (expandedFollowers.newTabHeight > 0) {
    assert(
      openingFollowers.newTabTop > collapsedFollowers.newTabTop + 0.5 &&
        openingFollowers.newTabTop < expandedFollowers.newTabTop - 0.5,
      'New tab button moves continuously during folder expansion'
    );
  }
  await sleep(500);
  const expandedAgainLayout = await selectionHighlightState();
  assert(
    Math.abs(expandedAgainLayout.top - expandedAgainLayout.selectedTop) < 0.5,
    'Selected highlight finishes on the moved tab'
  );
  console.log('PASS: selected highlight tracks folder layout motion');

  await run('window.resizeTo(900, 500);');
  await sleep(250);
  await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const fillers = Array.from({ length: 12 }, () => gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    }));
    const tabs = Array.from({ length: 3 }, (_, index) => {
      const tab = gBrowser.addTab('about:blank', {
        triggeringPrincipal: principal,
        skipAnimation: true,
        inBackground: true,
      });
      tab.setAttribute('label', \`Short folder \${index + 1}\`);
      return tab;
    });
    const folder = gZenFolders.createFolder(tabs, { label: 'Short folder' });
    const outside = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
    });
    outside.setAttribute('label', 'Selected outside short folder');
    gBrowser.selectedTab = outside;
    window.__shortFolderMotionTest = { fillers, tabs, folder, outside };
  `);
  await sleep(250);
  await run(`
    const { tabs, folder } = window.__shortFolderMotionTest;
    gBrowser.discardBrowser(tabs[2], true);
    folder.collapsed = true;
  `);
  await sleep(500);
  const shortFolderMotionState = () => run(`
    const { folder, outside, tabs } = window.__shortFolderMotionTest;
    const newTabButton = document.getElementById('tabs-newtab-button') ?? document.getElementById('new-tab-button');
    const scrollbox = gBrowser.tabContainer.arrowScrollbox?.scrollbox;
    const groupStart = folder.groupStartElement;
    return {
      collapsed: folder.collapsed,
      folderTop: folder.getBoundingClientRect().top,
      outsideTop: outside.getBoundingClientRect().top,
      newTabTop: newTabButton?.getBoundingClientRect().top,
      scrollTop: scrollbox?.scrollTop,
      overflowAnchor: scrollbox ? getComputedStyle(scrollbox).overflowAnchor : null,
      groupStartDisplay: getComputedStyle(groupStart).display,
      groupStartMarginTop: getComputedStyle(groupStart).marginTop,
      loadedHeights: tabs.slice(0, 2).map(tab => tab.getBoundingClientRect().height),
      followerMotionCount:
        window.__folderOpenTabsSelectionHighlightController.folderFollowerMotions.size,
    };
  `);
  const shortFolderCollapsed = await shortFolderMotionState();
  await run('window.__shortFolderMotionTest.folder.collapsed = false;');
  const shortFolderOpeningSamples = [];
  for (let index = 0; index < 8; index += 1) {
    await sleep(30);
    shortFolderOpeningSamples.push(await shortFolderMotionState());
  }
  await sleep(160);
  const shortFolderExpanded = await shortFolderMotionState();
  assert(shortFolderCollapsed.scrollTop > 0, 'Short-folder test runs inside a scrolled tab list');
  assert(
    shortFolderOpeningSamples.some(sample => sample.followerMotionCount > 0),
    'Folder expansion starts the height-based follower position controller'
  );
  assert(
    shortFolderOpeningSamples.some(sample => sample.overflowAnchor === 'none'),
    'Folder expansion temporarily disables scroll anchoring'
  );
  assert(
    shortFolderOpeningSamples.every(sample =>
      sample.groupStartDisplay === 'none' && sample.groupStartMarginTop === '0px'
    ),
    'Loaded-folder spacer stays disabled throughout expansion'
  );
  assert(
    shortFolderOpeningSamples.every(sample =>
      sample.loadedHeights.every(height => height > 0)
    ),
    'Loaded folder tabs remain visible on every expansion sample'
  );
  assert(
    shortFolderOpeningSamples.some(sample =>
      sample.outsideTop > shortFolderCollapsed.outsideTop + 0.5 &&
      sample.outsideTop < shortFolderExpanded.outsideTop - 0.5
    ),
    'Selected normal tab follows a short folder during expansion'
  );
  console.log('PASS: loaded tabs remain visible while a normal tab follows folder expansion');
  await run('window.resizeTo(1366, 768);');
  await sleep(250);

  await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const outside = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    });
    const loaded = Array.from({ length: 2 }, () => gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    }));
    const unloaded = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    });
    const folder = gZenFolders.createFolder([...loaded, unloaded], { label: 'Normal tab selected while closing' });
    window.__normalSelectedFolderTest = { outside, loaded, unloaded, folder };
  `);
  await sleep(100);
  await run(`
    const { outside, unloaded, folder } = window.__normalSelectedFolderTest;
    gBrowser.discardBrowser(unloaded, true);
    gBrowser.selectedTab = outside;
    folder.collapsed = true;
  `);
  await sleep(500);
  const normalSelectedFolderState = await run(`
    const { loaded, unloaded, folder } = window.__normalSelectedFolderTest;
    const groupStart = folder.groupStartElement;
    return {
      loadedHeights: loaded.map(tab => tab.getBoundingClientRect().height),
      loadedDisplays: loaded.map(tab => getComputedStyle(tab).display),
      unloadedHeight: unloaded.getBoundingClientRect().height,
      folderCollapsed: folder.collapsed,
      groupStartDisplay: getComputedStyle(groupStart).display,
      groupStartMarginTop: getComputedStyle(groupStart).marginTop,
    };
  `);
  assert.equal(normalSelectedFolderState.folderCollapsed, true, 'Folder remains collapsed while a normal tab is selected');
  assert(
    normalSelectedFolderState.loadedHeights.every(height => height > 0),
    'Loaded folder tabs stay visible when a normal tab is selected'
  );
  assert(
    normalSelectedFolderState.loadedDisplays.every(display => display === 'flex'),
    'Loaded folder tabs keep the retained display layout with a normal tab selected'
  );
  assert.equal(normalSelectedFolderState.unloadedHeight, 0, 'Unloaded folder tabs remain stored');
  assert.equal(normalSelectedFolderState.groupStartDisplay, 'none', 'Loaded folder spacer is removed with a normal tab selected');
  assert.equal(normalSelectedFolderState.groupStartMarginTop, '0px', 'Loaded folder spacer has no offset with a normal tab selected');
  console.log('PASS: loaded folder tabs survive collapse with a normal tab selected');

  await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const outside = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    });
    outside.setAttribute('label', 'Previous normal tab');
    const displayed = gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    });
    const retained = Array.from({ length: 2 }, () => gBrowser.addTab('about:blank', {
      triggeringPrincipal: principal,
      skipAnimation: true,
      inBackground: true,
    }));
    displayed.setAttribute('label', 'Displayed folder tab');
    retained.forEach((tab, index) => tab.setAttribute('label', 'Retained folder tab ' + (index + 1)));
    const folder = gZenFolders.createFolder([displayed, ...retained], { label: 'Close displayed folder tab' });
    window.__closeDisplayedFolderTabTest = { outside, displayed, retained, folder };
  `);
  await sleep(100);
  await run(`
    const { outside, displayed, folder } = window.__closeDisplayedFolderTabTest;
    displayed.owner = outside;
    gBrowser.selectedTab = displayed;
    folder.collapsed = true;
  `);
  await sleep(500);
  await run('gBrowser.removeTab(window.__closeDisplayedFolderTabTest.displayed, { animate: false });');
  await sleep(500);
  const retainedAfterDisplayedClose = await run(`
    const { outside, retained, folder } = window.__closeDisplayedFolderTabTest;
    const groupStart = folder.groupStartElement;
    const container = folder.groupContainer;
    return {
      selectedOutside: gBrowser.selectedTab === outside,
      folderCollapsed: folder.collapsed,
      retainedHeights: retained.map(tab => tab.getBoundingClientRect().height),
      retainedDisplays: retained.map(tab => getComputedStyle(tab).display),
      containerDisplay: getComputedStyle(container).display,
      containerHidden: container.hasAttribute('hidden'),
      groupStartDisplay: getComputedStyle(groupStart).display,
      groupStartMarginTop: getComputedStyle(groupStart).marginTop,
    };
  `);
  assert.equal(retainedAfterDisplayedClose.selectedOutside, true, 'Closing a displayed folder tab selects the previous normal tab');
  assert.equal(retainedAfterDisplayedClose.folderCollapsed, true, 'Folder remains collapsed after its displayed tab closes');
  assert(
    retainedAfterDisplayedClose.retainedHeights.every(height => height > 0),
    'Remaining loaded folder tabs stay visible after the displayed tab closes'
  );
  assert(
    retainedAfterDisplayedClose.retainedDisplays.every(display => display === 'flex'),
    'Remaining loaded folder tabs keep the retained display layout'
  );
  assert.equal(retainedAfterDisplayedClose.containerDisplay, 'flex', 'Collapsed folder container stays in layout');
  assert.equal(retainedAfterDisplayedClose.groupStartDisplay, 'none', 'Closed displayed tab spacer is removed');
  assert.equal(retainedAfterDisplayedClose.groupStartMarginTop, '0px', 'Closed displayed tab spacer no longer offsets retained tabs');
  console.log('PASS: remaining folder tabs survive closing the displayed tab');

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

  await run(`
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    window.__burstLimitTabs = Array.from({length:6}, () => gBrowser.addTab('about:blank', {
      triggeringPrincipal:principal, skipAnimation:true, inBackground:true,
    }));
  `);
  await sleep(150);
  const particleLimit = await run(`
    const c = window.__folderOpenTabsSelectionHighlightController;
    for (const tab of window.__burstLimitTabs) gBrowser.removeTab(tab,{animate:false});
    return {effects:c.closeParticleEffects.size, particles:document.querySelectorAll('.folder-open-tabs-close-particle').length};
  `);
  assert(particleLimit.effects <= 3 && particleLimit.particles <= 180, 'Rapid close caps simultaneous particle effects');
  await sleep(800);
  const unrelatedTiming = await run(`
    const folder = window.__folderTest.folder;
    const c = window.__folderOpenTabsSelectionHighlightController;
    const animation = folder.querySelector('.tab-group-label-container').animate(
      [{transform:'translateX(0px)'},{transform:'translateX(1px)'}],{duration:900});
    c.retimeFolderAnimations(folder,new Set());
    const duration = animation.effect.getTiming().duration;
    animation.cancel();
    return duration;
  `);
  assert.equal(unrelatedTiming,900,'Folder timing leaves unrelated anonymous transform animations intact');
  await run(`
    const c = window.__folderOpenTabsSelectionHighlightController;
    window.__lifecycleAudit = {c, lateTimer:false, lateFrame:false};
    c.setTimer(() => window.__lifecycleAudit.lateTimer = true,30);
    c.requestFrame(() => window.__lifecycleAudit.lateFrame = true);
    c.destroy();
    c.destroy();
  `);
  await sleep(100);
  const destroyedState = await run(`
    const {c,lateTimer,lateFrame} = window.__lifecycleAudit;
    return {lateTimer,lateFrame,timers:c.deferredTimers.size,frames:c.deferredFrames.size,
      connected:c.highlight.isConnected};
  `);
  assert.deepEqual(destroyedState,{lateTimer:false,lateFrame:false,timers:0,frames:0,connected:false},
    'Destroyed controller cancels pending work and tolerates repeated destruction');
  await run(selectionMotionScript);
  console.log('PASS: particle limits, timing isolation, and controller unload');

  await run('gBrowser.selectedTab=window.__folderTest.tabs[1];');
  await sleep(300);
  await writeFile(path.join(root,'tests','results.json'), `${JSON.stringify({...testEnvironment,loadMethod:'userChrome.css @import',presentationChecks:'passed',nativeVisibilityMismatch},null,2)}\n`);
  console.log(`LIMITATION: CSS-only internal visibility mismatch = ${nativeVisibilityMismatch}`);
  await quitBrowser();
  quitBrowser = null;
} finally {
  if (quitBrowser && browser.exitCode === null) {
    try { await quitBrowser(); } catch (error) { console.error(`Normal shutdown failed: ${error.message}`); }
  }
  socket?.destroy();
  if (browser.exitCode === null) {
    await Promise.race([new Promise(resolve => browser.once('exit', resolve)), sleep(3000)]);
  }
  if (browser.exitCode !== null && path.dirname(profile) === root && path.basename(profile).startsWith('.test-profile-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 500 });
  } else {
    console.error(`Isolated Zen is still running (PID ${browser.pid}); profile retained: ${profile}`);
  }
}
