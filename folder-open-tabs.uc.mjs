// ==UserScript==
// @name         Folder Open Tabs Motion
// @description  Adds smooth folder-open, selection, page-depth, and tab close motion to Zen.
// @version      0.4.82
// @lastUpdated  2026-09-26
// ==/UserScript==

(() => {
  const CONTROLLER_KEY = "__folderOpenTabsSelectionHighlightController";
  const HIGHLIGHT_ID = "folder-open-tabs-selection-highlight";
  const TARGET_ATTRIBUTE = "folder-open-tabs-selection-target";
  const PAGE_DEPTH_ANIMATION_ID = "folder-open-tabs-page-depth";
  const FOLDER_COLLAPSE_START_ATTRIBUTE = "folder-open-tabs-collapse-start";
  const FOLDER_EXPAND_MOTION_ATTRIBUTE = "folder-open-tabs-expand-motion";
  const CLOSE_PARTICLE_EFFECT_CLASS = "folder-open-tabs-close-particle-effect";
  const CLOSE_PARTICLE_CLASS = "folder-open-tabs-close-particle";
  const FOLDER_RETURN_EFFECT_CLASS = "folder-open-tabs-folder-return-effect";
  const FOLDER_RETURN_SURFACE_CLASS = "folder-open-tabs-folder-return-surface";
  const FOLDER_RETURN_TARGET_CLASS = "folder-open-tabs-folder-return-target";
  const FOLDER_RETURN_SPARK_EFFECT_CLASS = "folder-open-tabs-folder-return-spark-effect";
  const FOLDER_RETURN_SPARK_PARTICLE_CLASS = "folder-open-tabs-folder-return-spark";
  const FOLDER_RETURN_MOTION_ATTRIBUTE = "folder-open-tabs-return-motion";
  const FOLDER_OPEN_EFFECT_CLASS = "folder-open-tabs-folder-open-effect";
  const FOLDER_OPEN_ICON_CLASS = "folder-open-tabs-folder-open-icon";
  const FOLDER_OPEN_MOTION_ATTRIBUTE = "folder-open-tabs-open-motion";
  const FOLDER_OPEN_ITEM_ATTRIBUTE = "folder-open-tabs-open-item";
  const FOLDER_CLOSE_EFFECT_CLASS = "folder-open-tabs-folder-close-effect";
  const FOLDER_CLOSE_ICON_CLASS = "folder-open-tabs-folder-close-icon";
  const FOLDER_CLOSE_MOTION_ATTRIBUTE = "folder-open-tabs-close-motion";
  const FOLDER_CLOSE_ITEM_ATTRIBUTE = "folder-open-tabs-close-item";
  const OPEN_UNLOAD_EFFECT_CLASS = "folder-open-tabs-open-unload-effect";
  const OPEN_UNLOAD_RING_CLASS = "folder-open-tabs-open-unload-ring";
  const CONTROL_BURST_EFFECT_CLASS = "folder-open-tabs-control-burst-effect";
  const CONTROL_BURST_PARTICLE_CLASS = "folder-open-tabs-control-burst-particle";
  const DOWNLOADS_CUSTOM_ICON_CLASS = "folder-open-tabs-download-icon";
  const DOWNLOADS_ARROW_CLASS = "folder-open-tabs-download-arrow";
  const DOWNLOADS_ARROW_SHAFT_CLASS = "folder-open-tabs-download-arrow-shaft";
  const DOWNLOADS_ARROW_HEAD_CLASS = "folder-open-tabs-download-arrow-head";
  const DOWNLOADS_TRAY_CLASS = "folder-open-tabs-download-tray";
  const DOWNLOADS_NATIVE_ICON_ATTRIBUTE = "folder-open-tabs-download-native-icon";
  const APP_MENU_FADE_ATTRIBUTE = "folder-open-tabs-menu-fade-in";
  const HISTORY_ARROW_MOTION_ATTRIBUTE = "folder-open-tabs-history-arrow-motion";
  const HISTORY_ARROW_MOTION_DURATION = 320;
  const NEW_TAB_BUTTON_SELECTOR =
    "#tabs-newtab-button, #vertical-tabs-newtab-button, #new-tab-button, #zen-create-new-button";
  const NEW_TAB_FOCUSED_ATTRIBUTE = "folder-open-tabs-new-tab-focused";
  const FOLDER_TOGGLE_DURATION = 280;
  const FOLDER_TOGGLE_EASING = "ease-in-out";
  const FOLDER_COLLAPSED_GAP = 4;
  const FOLDER_FOLLOWER_PREP_DELAY = 16;
  const DURATION = 360;
  const PAGE_DEPTH_DURATION = 160;
  const PAGE_DEPTH_START_SCALE = 0.985;
  const TAB_CLOSE_PARTICLE_DURATION = 260;
  const TAB_CLOSE_MAX_DELAY = 220;
  const TAB_CLOSE_PARTICLE_COUNT = 60;
  const MAX_CLOSE_PARTICLE_EFFECTS = 3;
  const TAB_CLOSE_LAYOUT_DELAY = 90;
  const TAB_CLOSE_LAYOUT_DURATION = 160;
  const FOLDER_RETURN_DURATION = 560;
  const FOLDER_RETURN_FRAME_COUNT = 35;
  const FOLDER_RETURN_SPARK_DURATION = 320;
  const FOLDER_RETURN_SPARK_COUNT = 10;
  const FOLDER_OPEN_DURATION = 420;
  const FOLDER_OPEN_STAGGER = 24;
  const FOLDER_OPEN_MAX_STAGGER = 132;
  const FOLDER_CLOSE_DURATION = 360;
  const FOLDER_CLOSE_STAGGER = 20;
  const FOLDER_CLOSE_MAX_STAGGER = 100;
  const FOLDER_CLOSE_COMPLETION_ANIMATION_ID =
    "folder-open-tabs-folder-close-completion";
  const FOLDER_CLOSE_COMPLETION_DURATION = 180;
  const FOLDER_CLOSE_COMPLETION_PARTICLE_EFFECT_CLASS =
    "folder-open-tabs-folder-close-completion-particle-effect";
  const FOLDER_CLOSE_COMPLETION_PARTICLE_CLASS =
    "folder-open-tabs-folder-close-completion-particle";
  const FOLDER_CLOSE_COMPLETION_PARTICLE_DURATION = 260;
  const FOLDER_CLOSE_COMPLETION_PARTICLE_COUNT = 3;
  const OPEN_UNLOAD_DURATION = 320;
  const OPEN_UNLOAD_SHAKE_DURATION = 190;
  const OPEN_UNLOAD_FRAME_COUNT = 21;
  const CONTROL_BURST_DURATION = 260;
  const OVERSHOOT = 1.04;
  const REBOUND = 0.992;
  const STABLE_FRAME_LIMIT = 8;
  const POSITION_EPSILON = 0.1;
  const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  class SelectionHighlightController {
    constructor(browserWindow) {
      this.window = browserWindow;
      this.document = browserWindow.document;
      this.tabs = this.document.getElementById("tabbrowser-tabs");
      this.tabContainer = browserWindow.gBrowser?.tabContainer;
      this.reduceMotion = browserWindow.matchMedia("(prefers-reduced-motion: reduce)");
      this.closeEffects = new Set();
      this.closeLayoutMotions = new Set();
      this.folderFollowerMotions = new Set();
      this.folderExpandMotions = new Map();
      this.folderReturnMotions = new Map();
      this.folderOpenMotions = new Set();
      this.folderCloseMotions = new Set();
      this.folderCloseCompletionAnimations = new Set();
      this.folderCloseCompletionEffects = new Set();
      this.selectionSyncFrame = 0;
      this.selectionSyncAttempts = 0;
      this.selectionSyncAnimate = false;
      this.selectedAppearance = null;
      this.appearanceDirty = true;
      this.appearanceTab = null;
      this.appliedAppearance = null;
      this.destroyed = false;
      this.deferredTimers = new Set();
      this.deferredFrames = new Set();
      this.motionStyles = new WeakMap();
      this.closeParticleEffects = new Set();
      this.collapseStarts = new Set();
      this.visualRevision = 0;

      if (!this.tabs || !this.tabContainer) {
        throw new Error("Vertical tab elements are unavailable.");
      }

      const motionStyle = this.window.getComputedStyle(this.document.documentElement);
      const duration = motionStyle.getPropertyValue('--folder-open-tabs-toggle-duration').trim();
      const milliseconds = Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
      this.folderToggleDuration = Number.isFinite(milliseconds) && milliseconds >= 0
        ? milliseconds : FOLDER_TOGGLE_DURATION;
      this.folderToggleEasing = motionStyle.getPropertyValue('--folder-open-tabs-toggle-easing').trim() || FOLDER_TOGGLE_EASING;

      this.highlight = this.document.createElementNS(XHTML_NAMESPACE, "div");
      this.highlight.id = HIGHLIGHT_ID;
      this.highlight.hidden = true;
      this.highlight.setAttribute("aria-hidden", "true");
      (this.document.getElementById("TabsToolbar") ?? this.document.documentElement).prepend(this.highlight);

      this.onTabSelect = event => {
        this.clearNewTabFocusState?.();
        this.moveTo(event.target, true);
        this.animatePageDepth(event.target);
        this.scheduleSelectionSync(true);
      };
      this.onTabClose = event => {
        const closingTab = event.target;
        if (
          closingTab === this.currentTab ||
          closingTab?.hasAttribute(TARGET_ATTRIBUTE)
        ) {
          const origin = this.getRect(this.highlight) ?? this.targetRect;
          this.hide();
          this.pendingSelectionOrigin = origin;
        }
        this.returnTabToFolder(closingTab);
        this.dissolveTabLeftward(closingTab);
        this.scheduleSelectionSync(true);
      };
      this.onLayoutChange = () => {
        if (this.destroyed || this.layoutChangeFrame) {
          return;
        }
        this.layoutChangeFrame = this.requestFrame(() => {
          this.layoutChangeFrame = 0;
          this.startTracking();
          if (this.highlight.hidden || this.currentTab !== this.window.gBrowser.selectedTab) {
            this.scheduleSelectionSync(false);
          }
        });
      };
      this.onLayoutAnimation = event => {
        if (event.target?.matches?.(
          '.tabbrowser-tab, zen-folder, .tab-group-container, .zen-tab-group-start, .tab-stack, .tab-background'
        ) && (!event.propertyName || /^(height|max-height|min-height|margin|transform|translate|--folder-open-tabs-unloaded-height)/.test(event.propertyName))) {
          this.onLayoutChange();
        }
      };
      this.onMutations = records => {
        let changed = false;
        for (const record of records) {
          const target = record.target;
          if (record.attributeName === 'style' &&
              this.motionStyles.get(target) === target.style.cssText &&
              this.withoutMotionStyle(record.oldValue) === this.withoutMotionStyle(target.style.cssText)) {
            continue;
          }
          changed = true;
          if (record.type === 'childList' || ['src', 'busy', 'pending', 'discarded'].includes(record.attributeName) ||
              target.matches?.('.tab-icon-image, .tab-icon, .tab-throbber')) {
            this.visualRevision += 1;
          }
          if (target === this.currentTab || this.currentTab?.contains(target) || target.contains?.(this.currentTab)) {
            this.appearanceDirty = true;
          }
        }
        if (changed) this.onLayoutChange();
      };
      this.onAppearanceChange = () => {
        this.appearanceDirty = true;
        this.onLayoutChange();
      };
      this.onPointerOut = event => {
        const tab = event.target?.closest?.(".tabbrowser-tab");
        if (
          tab !== this.currentTab ||
          (event.relatedTarget instanceof this.window.Node && tab.contains(event.relatedTarget))
        ) {
          return;
        }
        this.requestFrame(() => {
          if (tab === this.currentTab && !tab.matches(":hover")) {
            this.refreshAppearance();
          }
        });
      };
      this.onCloseControlPointerDown = event => {
        if (event.button !== 0 || this.reduceMotion.matches) {
          return;
        }
        const tab = event.target?.closest?.(".tabbrowser-tab");
        if (!tab) {
          return;
        }
        const tabRect = tab.getBoundingClientRect();
        const control = event.target?.closest?.(
          ".tab-close-button, .tab-reset-button"
        );
        if (!control && event.clientX < tabRect.right - 32) {
          return;
        }
        this.burstCloseControl(event.clientX, event.clientY);
      };
      this.onMotionPreferenceChange = () => {
        if (this.reduceMotion.matches) {
          this.cancelPageDepth();
          this.clearCloseEffects();
          this.clearCloseLayoutMotions();
          this.clearFolderFollowerMotions();
          this.clearFolderExpandMotions();
          this.clearFolderOpenMotions();
          this.clearFolderCloseMotions();
          this.clearFolderReturnMotions();
          this.hide();
        } else {
          this.moveTo(this.window.gBrowser.selectedTab, false);
        }
      };

      this.tabContainer.addEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.addEventListener("TabClose", this.onTabClose);
      this.tabContainer.addEventListener("scroll", this.onLayoutChange, true);
      this.tabContainer.addEventListener("transitionrun", this.onLayoutAnimation, true);
      this.tabContainer.addEventListener("animationstart", this.onLayoutAnimation, true);
      this.tabContainer.addEventListener("transitionend", this.onLayoutAnimation, true);
      this.tabContainer.addEventListener("animationend", this.onLayoutAnimation, true);
      this.tabContainer.addEventListener("pointerout", this.onPointerOut, true);
      this.tabContainer.addEventListener(
        "pointerdown",
        this.onCloseControlPointerDown,
        true
      );
      this.window.addEventListener("resize", this.onLayoutChange);
      this.reduceMotion.addEventListener("change", this.onMotionPreferenceChange);

      this.resizeObserver = new this.window.ResizeObserver(this.onLayoutChange);
      this.resizeObserver.observe(this.tabs);
      this.mutationObserver = new this.window.MutationObserver(this.onMutations);
      this.mutationObserver.observe(this.tabs, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        subtree: true,
        attributeFilter: ["collapsed", "hidden", "selected", "style", "class", "src", "busy", "pending", "discarded", "visuallyselected"],
      });
      this.appearanceObserver = new this.window.MutationObserver(this.onAppearanceChange);
      this.appearanceObserver.observe(this.document.documentElement, { attributes: true });
      this.colorScheme = browserWindow.matchMedia("(prefers-color-scheme: dark)");
      this.colorScheme.addEventListener("change", this.onAppearanceChange);
      this.restoreFolderAnimationTiming = this.installFolderAnimationTiming();
      this.restoreExplicitUnloadAnimation = this.installExplicitUnloadAnimation();
      this.restoreDownloadsIconAnimation = this.installDownloadsIconAnimation();
      this.restoreAppMenuAnimation = this.installAppMenuAnimation();
      this.restoreHistoryArrowAnimation = this.installHistoryArrowAnimation();
      this.restoreNewTabFocusState = this.installNewTabFocusState();
      this.moveTo(this.window.gBrowser.selectedTab, false);
    }

    requestFrame(callback) {
      if (this.destroyed) return 0;
      const frame = this.window.requestAnimationFrame(timestamp => {
        this.deferredFrames.delete(frame);
        if (!this.destroyed) callback(timestamp);
      });
      this.deferredFrames.add(frame);
      return frame;
    }

    cancelFrame(frame) {
      this.deferredFrames.delete(frame);
      this.window.cancelAnimationFrame(frame);
    }

    setTimer(callback, delay) {
      if (this.destroyed) return 0;
      const timer = this.window.setTimeout(() => {
        this.deferredTimers.delete(timer);
        if (!this.destroyed) callback();
      }, delay);
      this.deferredTimers.add(timer);
      return timer;
    }

    clearTimer(timer) {
      this.deferredTimers.delete(timer);
      this.window.clearTimeout(timer);
    }

    withoutMotionStyle(style) {
      return (style ?? '').split(';').map(value => value.trim())
        .filter(value => value && !/^(transform|will-change)\s*:/.test(value)).join(';');
    }

    writeMotionTransform(element, value) {
      element.style.setProperty('transform', value, 'important');
      this.motionStyles.set(element, element.style.cssText);
    }

    installNewTabFocusState() {
      let focusedButton = null;
      let focusedIcons = [];
      const clearFocusedState = () => {
        focusedButton?.removeAttribute(NEW_TAB_FOCUSED_ATTRIBUTE);
        focusedIcons.forEach(icon => icon.removeAttribute(NEW_TAB_FOCUSED_ATTRIBUTE));
        focusedButton = null;
        focusedIcons = [];
      };
      const setFocusedState = button => {
        if (button === focusedButton && button.hasAttribute(NEW_TAB_FOCUSED_ATTRIBUTE)) return;
        clearFocusedState();
        focusedButton = button;
        focusedIcons = [...button.querySelectorAll('.toolbarbutton-icon')];
        button.setAttribute(NEW_TAB_FOCUSED_ATTRIBUTE, 'true');
        focusedIcons.forEach(icon => icon.setAttribute(NEW_TAB_FOCUSED_ATTRIBUTE, 'true'));
      };
      const findButton = event => event.composedPath?.().find(target =>
        target?.matches?.(NEW_TAB_BUTTON_SELECTOR)
      ) ?? event.target?.closest?.(NEW_TAB_BUTTON_SELECTOR);
      const onFocusIn = event => {
        const button = findButton(event);
        if (button) setFocusedState(button);
      };
      const onFocusOut = event => {
        const button = findButton(event);
        if (!button || button.id === 'zen-create-new-button' || button !== focusedButton) return;
        if (event.relatedTarget instanceof this.window.Node && button.contains(event.relatedTarget)) return;
        clearFocusedState();
      };
      const onPointerDown = event => {
        const button = findButton(event);
        button ? setFocusedState(button) : clearFocusedState();
      };
      this.document.querySelectorAll(`[${NEW_TAB_FOCUSED_ATTRIBUTE}]`).forEach(element =>
        element.removeAttribute(NEW_TAB_FOCUSED_ATTRIBUTE)
      );
      this.clearNewTabFocusState = clearFocusedState;
      this.document.addEventListener('focusin', onFocusIn, true);
      this.document.addEventListener('focusout', onFocusOut, true);
      this.document.addEventListener('click', onPointerDown, true);
      this.window.addEventListener('pointerdown', onPointerDown, true);
      this.window.addEventListener('blur', clearFocusedState);
      return () => {
        this.document.removeEventListener('focusin', onFocusIn, true);
        this.document.removeEventListener('focusout', onFocusOut, true);
        this.document.removeEventListener('click', onPointerDown, true);
        this.window.removeEventListener('pointerdown', onPointerDown, true);
        this.window.removeEventListener('blur', clearFocusedState);
        clearFocusedState();
        this.clearNewTabFocusState = null;
      };
    }

    installDownloadsIconAnimation() {
      const button = this.document.getElementById("downloads-button");
      const nativeIcon = button?.querySelector("#downloads-indicator-icon") ??
        button?.querySelector(":scope > .toolbarbutton-icon");
      const anchor = nativeIcon?.parentElement;
      if (!button || !nativeIcon || !anchor) {
        return () => {};
      }

      const svg = this.document.createElementNS(SVG_NAMESPACE, "svg");
      svg.setAttribute("class", DOWNLOADS_CUSTOM_ICON_CLASS);
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");

      const tray = this.document.createElementNS(SVG_NAMESPACE, "path");
      tray.setAttribute("class", DOWNLOADS_TRAY_CLASS);
      tray.setAttribute(
        "d",
        "M2.5 10.5v2.3q0 .45.45.45h10.1q.45 0 .45-.45v-2.3"
      );
      tray.setAttribute("fill", "none");
      tray.setAttribute("stroke", "currentColor");
      tray.setAttribute("stroke-width", "1.25");
      tray.setAttribute("stroke-linecap", "round");
      tray.setAttribute("stroke-linejoin", "round");

      const arrowParts = [
        ["M8 1.75v7.5", DOWNLOADS_ARROW_SHAFT_CLASS],
        ["M5 6.25 8 9.25", DOWNLOADS_ARROW_HEAD_CLASS],
        ["M11 6.25 8 9.25", DOWNLOADS_ARROW_HEAD_CLASS],
      ].map(([pathData, partClass]) => {
        const part = this.document.createElementNS(SVG_NAMESPACE, "path");
        part.setAttribute(
          "class",
          `${DOWNLOADS_ARROW_CLASS} ${partClass}`
        );
        part.setAttribute("d", pathData);
        part.setAttribute("pathLength", "1");
        part.setAttribute("fill", "none");
        part.setAttribute("stroke", "currentColor");
        part.setAttribute("stroke-width", "1.25");
        part.setAttribute("stroke-linecap", "round");
        part.setAttribute("stroke-linejoin", "round");
        return part;
      });

      svg.append(tray, ...arrowParts);
      anchor.appendChild(svg);
      const hadNativeAttribute = nativeIcon.hasAttribute(
        DOWNLOADS_NATIVE_ICON_ATTRIBUTE
      );
      nativeIcon.setAttribute(DOWNLOADS_NATIVE_ICON_ATTRIBUTE, "true");

      return () => {
        if (!hadNativeAttribute) {
          nativeIcon.removeAttribute(DOWNLOADS_NATIVE_ICON_ATTRIBUTE);
        }
        svg.remove();
      };
    }

    installAppMenuAnimation() {
      const popup = this.document.getElementById("appMenu-popup");
      const fadeTarget = popup?.querySelector(":scope > #appMenu-multiView");
      if (!popup || !fadeTarget) {
        return () => {};
      }

      const onPopupShowing = () => {
        popup.removeAttribute(APP_MENU_FADE_ATTRIBUTE);
        if (this.reduceMotion.matches) {
          return;
        }
        void fadeTarget.getBoundingClientRect();
        popup.setAttribute(APP_MENU_FADE_ATTRIBUTE, "true");
      };
      const onPopupHidden = () => {
        popup.removeAttribute(APP_MENU_FADE_ATTRIBUTE);
      };

      popup.addEventListener("popupshowing", onPopupShowing);
      popup.addEventListener("popuphidden", onPopupHidden);
      return () => {
        popup.removeEventListener("popupshowing", onPopupShowing);
        popup.removeEventListener("popuphidden", onPopupHidden);
        popup.removeAttribute(APP_MENU_FADE_ATTRIBUTE);
      };
    }

    installHistoryArrowAnimation() {
      const buttons = [
        this.document.getElementById("back-button"),
        this.document.getElementById("forward-button"),
      ].filter(Boolean);
      if (buttons.length === 0) {
        return () => {};
      }

      const timers = new Map();
      const onHistoryButtonClick = event => {
        const target = event.target instanceof this.window.Element
          ? event.target
          : event.target?.parentElement;
        const button = target?.closest?.("#back-button, #forward-button");
        if (
          this.reduceMotion.matches ||
          !buttons.includes(button)
        ) {
          return;
        }

        const previousTimer = timers.get(button);
        if (previousTimer !== undefined) {
          this.clearTimer(previousTimer);
        }
        if (button.hasAttribute(HISTORY_ARROW_MOTION_ATTRIBUTE)) {
          button.removeAttribute(HISTORY_ARROW_MOTION_ATTRIBUTE);
          void button.getBoundingClientRect();
        }
        button.setAttribute(HISTORY_ARROW_MOTION_ATTRIBUTE, "true");
        const timer = this.setTimer(() => {
          button.removeAttribute(HISTORY_ARROW_MOTION_ATTRIBUTE);
          timers.delete(button);
        }, HISTORY_ARROW_MOTION_DURATION + 100);
        timers.set(button, timer);
      };

      this.document.addEventListener("click", onHistoryButtonClick, true);
      return () => {
        this.document.removeEventListener("click", onHistoryButtonClick, true);
        for (const [button, timer] of timers) {
          this.clearTimer(timer);
          button.removeAttribute(HISTORY_ARROW_MOTION_ATTRIBUTE);
        }
        timers.clear();
      };
    }

    installExplicitUnloadAnimation() {
      const browser = this.window.gBrowser;
      const original = browser?.explicitUnloadTabs;
      if (typeof original !== "function") {
        return () => {};
      }

      const hadOwnMethod = Object.prototype.hasOwnProperty.call(
        browser,
        "explicitUnloadTabs"
      );
      const controller = this;
      const wrapped = function (tabs, ...args) {
        if (controller.destroyed) return original.call(this, tabs, ...args);
        const tabList = Array.isArray(tabs) ? tabs : [tabs].filter(Boolean);
        const returnSnapshots = tabList
          .map(tab => controller.captureFolderReturnSnapshot(tab))
          .filter(Boolean);
        const motions = tabList
          .map(tab => controller.absorbOutlineIntoIcon(tab))
          .filter(Boolean);
        let returnTimer = null;
        const cleanup = () => {
          if (returnTimer !== null) {
            controller.clearTimer(returnTimer);
            returnTimer = null;
          }
          motions.forEach(motion => motion.cleanup());
        };
        let result;
        try {
          result = original.call(this, tabs, ...args);
        } catch (error) {
          cleanup();
          throw error;
        }
        returnTimer = controller.setTimer(() => {
          returnTimer = null;
          returnSnapshots.forEach(snapshot => {
            const motion = controller.returnTabToFolder(snapshot.tab, snapshot);
            if (motion) {
              motions.push(motion);
            }
          });
        }, 0);
        return Promise.resolve(result).then(
          successful => {
            if (!successful) {
              cleanup();
            }
            return successful;
          },
          error => {
            cleanup();
            throw error;
          }
        );
      };

      browser.explicitUnloadTabs = wrapped;
      return () => {
        if (browser.explicitUnloadTabs !== wrapped) {
          return;
        }
        if (hadOwnMethod) {
          browser.explicitUnloadTabs = original;
        } else {
          delete browser.explicitUnloadTabs;
        }
      };
    }

    installFolderAnimationTiming() {
      const folders = this.window.gZenFolders;
      if (!folders) {
        return () => {};
      }

      const restorers = ["animateCollapse", "animateExpand"].flatMap(methodName => {
        const original = folders[methodName];
        if (typeof original !== "function") {
          return [];
        }

        const hadOwnMethod = Object.prototype.hasOwnProperty.call(folders, methodName);
        const controller = this;
        const wrapped = function (group, ...args) {
          if (controller.destroyed) return original.call(this, group, ...args);
          const expandMotion = methodName === "animateExpand"
            ? controller.startFolderExpandMotion(group)
            : null;
          const followerStartHeight = methodName === "animateExpand"
            ? controller.captureFolderFollowerStartHeight(group)
            : null;
          const openPresentation = methodName === "animateExpand"
            ? controller.prepareFolderOpenPresentation(group)
            : null;
          const closePresentation = methodName === "animateCollapse"
            ? controller.prepareFolderClosePresentation(group)
            : null;
          const collapseMotion = methodName === "animateCollapse"
            ? controller.prepareFolderCollapseMotion(group)
            : null;
          const animationsBefore = new Set(
            group?.getAnimations?.({ subtree: true }) ?? []
          );
          let result;
          try {
            result = original.call(this, group, ...args);
          } catch (error) {
            controller.finishFolderExpandMotion(expandMotion);
            throw error;
          }
          controller.finishFolderExpandMotion(expandMotion, result);
          controller.finishFolderCollapseMotion(collapseMotion, result);
          controller.retimeFolderAnimations(group, animationsBefore);
          controller.startFolderCollapseMotion(collapseMotion);
          if (methodName === "animateExpand") {
            controller.startFolderOpenPresentation(openPresentation);
            controller.scheduleFolderFollowerMotion(group, followerStartHeight);
          } else {
            controller.startFolderClosePresentation(closePresentation);
          }
          return result;
        };

        folders[methodName] = wrapped;
        return [() => {
          if (folders[methodName] !== wrapped) {
            return;
          }
          if (hadOwnMethod) {
            folders[methodName] = original;
          } else {
            delete folders[methodName];
          }
        }];
      });

      return () => restorers.forEach(restore => restore());
    }

    scheduleFolderFollowerMotion(group, startHeight) {
      if (!Number.isFinite(startHeight) || startHeight <= 0) {
        return;
      }
      this.setTimer(() => {
        if (!group?.isConnected || group.collapsed) {
          return;
        }
        const motion = this.prepareFolderFollowerMotion(group, startHeight);
        this.startFolderFollowerMotion(motion);
      }, FOLDER_FOLLOWER_PREP_DELAY);
    }

    finishFolderCollapseMotion(group, result) {
      if (!group) {
        return;
      }
      const normalize = () => {
        if (this.destroyed || !group.isConnected || !group.collapsed) {
          return;
        }
        const allTabsUnloaded = !group.querySelector(
          ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing])"
        );
        if (!allTabsUnloaded || !group.groupStartElement) {
          return;
        }
        group.groupStartElement.style.setProperty(
          "margin-top",
          `-${FOLDER_COLLAPSED_GAP}px`
        );
      };
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(normalize, normalize);
      } else {
        this.setTimer(normalize, this.folderToggleDuration);
      }
    }

    captureFolderFollowerStartHeight(group) {
      if (this.reduceMotion.matches || !group?.groupStartElement) {
        return null;
      }
      const allTabsUnloaded = !group.querySelector(
        ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing])"
      );
      if (allTabsUnloaded) {
        return null;
      }
      const startHeight = group.getBoundingClientRect().height;
      return Number.isFinite(startHeight) && startHeight > 0 ? startHeight : null;
    }

    startFolderExpandMotion(group) {
      if (this.destroyed || !group) return null;
      if (!group.querySelector('.tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing])') && group.groupStartElement) {
        group.groupStartElement.style.setProperty('margin-top', `-${FOLDER_COLLAPSED_GAP}px`);
      }
      let motion = this.folderExpandMotions.get(group);
      if (!motion) {
        motion = { count: 0, releaseTimer: 0 };
        this.folderExpandMotions.set(group, motion);
      }
      this.clearTimer(motion.releaseTimer);
      motion.count += 1;
      motion.startedAt = this.window.performance.now();
      group.setAttribute(FOLDER_EXPAND_MOTION_ATTRIBUTE, 'true');
      return { group, motion };
    }

    finishFolderExpandMotion(token, result) {
      if (!token) return;
      const { group, motion } = token;
      const isCurrent = () => !this.destroyed && this.folderExpandMotions.get(group) === motion;
      const expire = () => {
        if (!isCurrent() || motion.count > 0) return;
        const remaining = this.folderToggleDuration - (this.window.performance.now() - motion.startedAt);
        if (remaining > 0) {
          motion.releaseTimer = this.setTimer(expire, remaining);
          return;
        }
        this.folderExpandMotions.delete(group);
        group.removeAttribute(FOLDER_EXPAND_MOTION_ATTRIBUTE);
      };
      let released = false;
      const release = () => {
        if (released || !isCurrent()) return;
        released = true;
        motion.count -= 1;
        expire();
      };
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(release, release);
      } else {
        release();
      }
    }

    prepareFolderCollapseMotion(group) {
      if (
        this.reduceMotion.matches ||
        !group?.collapsed ||
        !group.querySelector(
          ".tabbrowser-tab:is([pending], [discarded]):not([zen-empty-tab], [hidden], [closing])"
        )
      ) {
        return null;
      }

      this.collapseStarts.add(group);
      group.setAttribute(FOLDER_COLLAPSE_START_ATTRIBUTE, "true");
      group.getBoundingClientRect();
      return group;
    }

    startFolderCollapseMotion(group) {
      if (!group) {
        return;
      }
      this.requestFrame(() => {
        this.collapseStarts.delete(group);
        group.removeAttribute(FOLDER_COLLAPSE_START_ATTRIBUTE);
      });
    }

    prepareFolderFollowerMotion(group, startHeight = null) {
      if (this.reduceMotion.matches || !group?.groupStartElement) {
        return null;
      }

      const allTabsUnloaded = !group.querySelector(
        ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing])"
      );
      if (allTabsUnloaded) {
        return null;
      }
      if (!Number.isFinite(startHeight) || startHeight <= 0) {
        return null;
      }

      const followsGroup = element =>
        Boolean(
          group.compareDocumentPosition(element) &
            this.window.Node.DOCUMENT_POSITION_FOLLOWING
        );
      const isOutermostItem = element => {
        if (element.matches("zen-folder")) {
          return !element.parentElement?.closest("zen-folder");
        }
        return !element.closest("zen-folder");
      };
      const candidates = [
        ...this.tabs.querySelectorAll(".tabbrowser-tab, zen-folder"),
        ...this.document.querySelectorAll(
          "#tabs-newtab-button, #vertical-tabs-newtab-button"
        ),
      ];
      const items = [...new Set(candidates)]
        .filter(element =>
          element !== group &&
          !group.contains(element) &&
          followsGroup(element) &&
          isOutermostItem(element)
        )
        .flatMap(element => {
          const rect = element.getBoundingClientRect();
          const computed = this.window.getComputedStyle(element);
          if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            computed.visibility === "hidden" ||
            computed.transform !== "none"
          ) {
            return [];
          }
          return [{
            element,
            startTop: rect.top,
            appliedOffset: 0,
            originalTransform: element.style.getPropertyValue("transform"),
            originalTransformPriority: element.style.getPropertyPriority("transform"),
            originalWillChange: element.style.getPropertyValue("will-change"),
            originalWillChangePriority: element.style.getPropertyPriority("will-change"),
          }];
        });

      if (items.length === 0) {
        return null;
      }

      const scrollbox = this.tabContainer.arrowScrollbox?.scrollbox ?? null;
      return {
        group,
        startHeight,
        items,
        scrollbox,
        originalOverflowAnchor: scrollbox?.style.getPropertyValue("overflow-anchor") ?? "",
        originalOverflowAnchorPriority: scrollbox?.style.getPropertyPriority("overflow-anchor") ?? "",
      };
    }

    startFolderFollowerMotion(motion) {
      if (!motion) {
        return;
      }

      this.clearFolderFollowerMotions();
      const state = {
        ...motion,
        cancelled: false,
        frame: 0,
        frames: 0,
        stableFrames: 0,
        lastHeight: motion.startHeight,
      };
      this.folderFollowerMotions.add(state);

      if (state.scrollbox) {
        state.scrollbox.style.setProperty("overflow-anchor", "none", "important");
      }
      state.items.forEach(item =>
        item.element.style.setProperty("will-change", "transform", "important")
      );

      const restoreProperty = (element, property, value, priority) => {
        if (value) {
          element.style.setProperty(property, value, priority);
        } else {
          element.style.removeProperty(property);
        }
      };
      const cleanup = () => {
        if (state.cancelled) {
          return;
        }
        state.cancelled = true;
        if (state.frame) {
          this.cancelFrame(state.frame);
        }
        state.items.forEach(item => {
          restoreProperty(
            item.element,
            "transform",
            item.originalTransform,
            item.originalTransformPriority
          );
          restoreProperty(
            item.element,
            "will-change",
            item.originalWillChange,
            item.originalWillChangePriority
          );
        });
        if (state.scrollbox) {
          restoreProperty(
            state.scrollbox,
            "overflow-anchor",
            state.originalOverflowAnchor,
            state.originalOverflowAnchorPriority
          );
        }
        this.folderFollowerMotions.delete(state);
      };
      state.cleanup = cleanup;

      const track = () => {
        state.frame = 0;
        if (
          state.cancelled ||
          !state.group.isConnected ||
          state.group.collapsed
        ) {
          cleanup();
          return;
        }

        state.frames += 1;
        const currentHeight = state.group.getBoundingClientRect().height;
        const shift = Number.isFinite(currentHeight) ? currentHeight - state.startHeight : 0;
        let maximumOffset = 0;

        const offsets = state.items.map(item => item.element.isConnected
          ? item.startTop + shift - (item.element.getBoundingClientRect().top - item.appliedOffset)
          : item.appliedOffset);
        state.items.forEach((item, index) => {
          const offset = offsets[index];
          maximumOffset = Math.max(maximumOffset, Math.abs(offset));
          if (item.element.isConnected && Math.abs(offset - item.appliedOffset) > POSITION_EPSILON) {
            this.writeMotionTransform(item.element, `translateY(${offset}px)`);
            item.appliedOffset = offset;
          }
        });

        const trackedPosition = currentHeight;
        const heightIsStable =
          Math.abs(trackedPosition - state.lastHeight) <= POSITION_EPSILON;
        state.lastHeight = trackedPosition;
        state.stableFrames = state.frames >= 5 && heightIsStable && maximumOffset <= 0.5
          ? state.stableFrames + 1
          : 0;
        if (state.stableFrames >= 3 || state.frames >= 90) {
          cleanup();
          return;
        }
        state.frame = this.requestFrame(track);
      };
      state.frame = this.requestFrame(track);
    }

    clearFolderFollowerMotions() {
      for (const motion of [...this.folderFollowerMotions]) {
        motion.cleanup?.();
      }
    }

    clearFolderExpandMotions() {
      for (const [group, motion] of this.folderExpandMotions) {
        this.clearTimer(motion.releaseTimer);
        group.removeAttribute(FOLDER_EXPAND_MOTION_ATTRIBUTE);
      }
      this.folderExpandMotions.clear();
    }

    getFolderOpenFolderRect(group) {
      const label = group?.querySelector?.(":scope > .tab-group-label-container");
      const icon = label?.querySelector(":scope > .tab-group-folder-icon");
      const source = icon?.getBoundingClientRect() ?? label?.getBoundingClientRect();
      if (!source || source.width <= 0 || source.height <= 0) {
        return null;
      }
      return {
        top: source.top,
        left: source.left,
        width: source.width,
        height: source.height,
      };
    }

    getFolderOpenElements(group) {
      const container = group.groupContainer ??
        group.querySelector(":scope > .tab-group-container");
      return [...(container?.children ?? [])].filter(element =>
        element.matches?.(".tabbrowser-tab, zen-folder") &&
        !element.matches("[zen-empty-tab], [hidden], [closing]")
      );
    }

    prepareFolderOpenPresentation(group) {
      if (
        this.reduceMotion.matches ||
        this.tabs.getAttribute("orient") !== "vertical" ||
        !group?.isConnected
      ) {
        return null;
      }

      const sourceRect = this.getFolderOpenFolderRect(group);
      if (!sourceRect) {
        return null;
      }

      const elements = this.getFolderOpenElements(group);
      if (elements.length === 0) {
        return null;
      }

      return {
        group,
        sourceRect,
        elements,
      };
    }

    prepareFolderClosePresentation(group) {
      if (
        this.reduceMotion.matches ||
        this.tabs.getAttribute("orient") !== "vertical" ||
        !group?.isConnected
      ) {
        return null;
      }

      const destinationRect = this.getFolderOpenFolderRect(group);
      if (!destinationRect) {
        return null;
      }

      const items = this.getFolderOpenElements(group).flatMap(element => {
        const geometry = this.captureFolderOpenGeometry(element);
        const sourceRect = this.getFolderOpenTarget(element, geometry);
        return sourceRect ? [{ element, sourceRect, geometry }] : [];
      });
      if (items.length === 0) {
        return null;
      }

      return { group, destinationRect, items };
    }

    getFolderOpenVisualSource(element) {
      if (element?.matches?.('zen-folder')) {
        return element.querySelector(':scope > .tab-group-label-container .tab-group-folder-icon svg');
      }
      // Preserve image, icon, throbber preference while querying the DOM once.
      const candidates = [...(element?.querySelectorAll?.('.tab-icon-image, .tab-icon, .tab-throbber') ?? [])];
      candidates.sort((a, b) => {
        const rank = node => node.matches('.tab-icon-image') ? 0 : node.matches('.tab-icon') ? 1 : 2;
        return rank(a) - rank(b);
      });
      const states = candidates.map(candidate => {
        const style = this.window.getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return { candidate,
          asset: Boolean(candidate.getAttribute?.('src') || candidate.currentSrc || candidate.getAttribute?.('href') ||
            style.listStyleImage !== 'none' || style.backgroundImage !== 'none' || candidate.querySelector?.('img, image, svg')),
          visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
        };
      });
      return (states.find(state => state.asset && state.visible) ?? states.find(state => state.asset) ??
        states.find(state => state.visible))?.candidate ?? null;
    }

    getFolderOpenRowHeight(element) {
      const computed = this.window.getComputedStyle(element);
      const minHeight = Number.parseFloat(
        computed.getPropertyValue("--tab-min-height")
      );
      const margin = Number.parseFloat(
        computed.getPropertyValue("--tab-margin-block")
      );
      const fallback = (Number.isFinite(minHeight) ? minHeight : 32) +
        2 * (Number.isFinite(margin) ? margin : 4);
      const row = element.matches("zen-folder")
        ? element.querySelector(":scope > .tab-group-label-container")
        : element;
      const height = row?.getBoundingClientRect().height ?? 0;
      return Math.max(height, fallback);
    }

    captureFolderOpenGeometry(element) {
      return {
        visualSource: this.getFolderOpenVisualSource(element),
        revision: this.visualRevision,
        row: element.matches('zen-folder') ? element.querySelector(':scope > .tab-group-label-container') : element,
        rowHeight: this.getFolderOpenRowHeight(element),
      };
    }

    getFolderOpenTarget(element, geometry = null) {
      if (!element?.isConnected) {
        return null;
      }

      geometry ??= this.captureFolderOpenGeometry(element);
      if (geometry.revision !== this.visualRevision || (geometry.visualSource && !geometry.visualSource.isConnected)) {
        geometry.visualSource = this.getFolderOpenVisualSource(element);
        geometry.revision = this.visualRevision;
      }
      const visualSource = geometry.visualSource;
      const visualRect = visualSource?.getBoundingClientRect();
      if (
        visualRect &&
        visualRect.width > 0 &&
        visualRect.height > 0 &&
        Number.isFinite(visualRect.left) &&
        Number.isFinite(visualRect.top)
      ) {
        return {
          top: visualRect.top,
          left: visualRect.left,
          width: visualRect.width,
          height: visualRect.height,
        };
      }

      const row = geometry.row?.isConnected ? geometry.row : element.matches("zen-folder")
        ? element.querySelector(":scope > .tab-group-label-container")
        : element;
      geometry.row = row;
      const rowRect = row?.getBoundingClientRect();
      if (!rowRect || rowRect.width <= 0 || !Number.isFinite(rowRect.top)) {
        return null;
      }

      const size = element.matches("zen-folder") ? 22 : 16;
      const rowHeight = Math.max(rowRect.height, geometry.rowHeight);
      return {
        top: rowRect.top + Math.max(0, (rowHeight - size) / 2),
        left: rowRect.left + (element.matches("zen-folder") ? 5 : 10),
        width: size,
        height: size,
      };
    }

    createFolderOpenIcon(element, target, sourceRect, visualSource = this.getFolderOpenVisualSource(element)) {
      const visualStyle = visualSource
        ? this.window.getComputedStyle(visualSource)
        : this.window.getComputedStyle(element);
      const tabStyle = this.window.getComputedStyle(element);
      const image = visualStyle.listStyleImage !== "none"
        ? visualStyle.listStyleImage
        : visualStyle.backgroundImage !== "none"
          ? visualStyle.backgroundImage
          : null;
      const icon = this.document.createElementNS(XHTML_NAMESPACE, "span");
      icon.className = FOLDER_OPEN_ICON_CLASS;
      icon.setAttribute("aria-hidden", "true");
      const visualClone = visualSource?.cloneNode?.(true) ?? null;
      if (visualClone) {
        visualClone.classList?.add("folder-open-tabs-folder-open-source");
        visualClone.removeAttribute?.("id");
        visualClone.setAttribute?.("aria-hidden", "true");
        for (const [property, value] of [
          ["position", "absolute"],
          ["inset", "0"],
          ["display", "block"],
          ["width", "100%"],
          ["height", "100%"],
          ["min-width", "0"],
          ["min-height", "0"],
          ["max-width", "none"],
          ["max-height", "none"],
          ["box-sizing", "border-box"],
          ["visibility", "visible"],
          ["opacity", "1"],
          ["transform", "none"],
          ["filter", "none"],
          ["pointer-events", "none"],
          ["object-fit", "contain"],
        ]) {
          visualClone.style?.setProperty(property, value, "important");
        }
        if (image) {
          visualClone.style?.setProperty("background-image", image, "important");
        }
        if (visualClone.localName === "img") {
          const sourceUrl = visualSource.currentSrc || visualSource.getAttribute("src");
          if (sourceUrl && !visualClone.getAttribute("src")) {
            visualClone.setAttribute("src", sourceUrl);
          }
          visualClone.setAttribute("decoding", "sync");
          visualClone.setAttribute("loading", "eager");
        }
        icon.appendChild(visualClone);
      }
      const size = Math.max(12, Math.min(22, target.width || 16));
      const color = tabStyle.color || "currentColor";
      Object.assign(icon.style, {
        position: "fixed",
        top: `${sourceRect.top + sourceRect.height / 2 - size / 2}px`,
        left: `${sourceRect.left + sourceRect.width / 2 - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        boxSizing: "border-box",
        backgroundColor: "transparent",
        backgroundImage: image ?? "none",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
        border: visualStyle.border !== "none" ? visualStyle.border : "none",
        borderRadius: visualStyle.borderRadius || "4px",
        color,
        opacity: "0",
        pointerEvents: "none",
        transformOrigin: "center center",
        willChange: "transform, opacity",
        zIndex: "2147483646",
      });
      return { icon, size };
    }

    startFolderOpenPresentation(presentation) {
      if (
        !presentation ||
        this.reduceMotion.matches ||
        !presentation.group?.isConnected ||
        presentation.group.collapsed
      ) {
        return;
      }

      this.clearFolderOpenMotions();
      this.clearFolderCloseMotions();
      const { group, sourceRect } = presentation;
      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = FOLDER_OPEN_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      effect.dataset.renderer = "folder-open-flyout";
      effect.dataset.folderId = group.id;
      Object.assign(effect.style, {
        position: "fixed",
        inset: "0",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483646",
      });

      const items = presentation.elements.flatMap((element, index) => {
        const geometry = this.captureFolderOpenGeometry(element);
        const target = this.getFolderOpenTarget(element, geometry);
        if (!target) {
          return [];
        }
        const visual = this.createFolderOpenIcon(element, target, sourceRect, geometry.visualSource);
        const delay = Math.min(
          index * FOLDER_OPEN_STAGGER,
          FOLDER_OPEN_MAX_STAGGER
        );
        effect.appendChild(visual.icon);
        return [{
          element,
          icon: visual.icon,
          size: visual.size,
          delay,
          target,
          geometry,
        }];
      });

      if (items.length === 0) {
        effect.remove();
        return;
      }

      items.forEach(item => {
        item.element.setAttribute(FOLDER_OPEN_ITEM_ATTRIBUTE, 'true');
        item.element.style.setProperty('--folder-open-tabs-open-delay', `${item.delay}ms`);
      });
      group.setAttribute(FOLDER_OPEN_MOTION_ATTRIBUTE, "true");
      this.document.documentElement.appendChild(effect);
      const state = {
        group,
        effect,
        sourceRect,
        items,
        frame: 0,
        startedAt: null,
        cleaned: false,
      };
      this.folderOpenMotions.add(state);

      const smootherStep = progress =>
        progress * progress * progress * (progress * (progress * 6 - 15) + 10);
      const clamp = value => Math.max(0, Math.min(1, value));
      const cleanup = () => {
        if (state.cleaned) {
          return;
        }
        state.cleaned = true;
        if (state.frame) {
          this.cancelFrame(state.frame);
        }
        state.items.forEach(item => {
          item.element.removeAttribute(FOLDER_OPEN_ITEM_ATTRIBUTE);
          item.element.style.removeProperty("--folder-open-tabs-open-delay");
        });
        if (state.group.isConnected) {
          state.group.removeAttribute(FOLDER_OPEN_MOTION_ATTRIBUTE);
        }
        this.folderOpenMotions.delete(state);
        effect.remove();
      };
      state.cleanup = cleanup;
      effect.__folderOpenTabsCleanup = cleanup;

      const tick = timestamp => {
        state.frame = 0;
        if (
          state.cleaned ||
          !state.group.isConnected ||
          state.group.collapsed
        ) {
          cleanup();
          return;
        }
        state.startedAt ??= timestamp;
        const elapsed = timestamp - state.startedAt;
        let complete = true;
        const targets = state.items.map(item => {
          if (elapsed < item.delay || item.finished) return item.target;
          return this.getFolderOpenTarget(item.element, item.geometry) ?? item.target;
        });
        state.items.forEach((item, index) => {
          if (item.finished) return;
          const progress = clamp(
            (elapsed - item.delay) / FOLDER_OPEN_DURATION
          );
          if (progress <= 0) { complete = false; return; }
          const travel = smootherStep(progress);
          const target = targets[index];
          item.target = target;
          const sourceX = state.sourceRect.left + state.sourceRect.width / 2;
          const sourceY = state.sourceRect.top + state.sourceRect.height / 2;
          const targetX = target.left + target.width / 2;
          const targetY = target.top + target.height / 2;
          const arc = Math.sin(Math.PI * travel) *
            Math.min(10, Math.max(3, Math.abs(targetY - sourceY) * 0.08));
          const scaleProgress = smootherStep(clamp(progress * 1.2));
          const scale = 0.62 + 0.38 * scaleProgress;
          const opacity = progress <= 0.08 ? progress / 0.08 : 1;
          const translateX = targetX - sourceX;
          const translateY = targetY - sourceY - arc;
          item.icon.style.transform =
            `translate3d(${translateX * travel}px, ${translateY * travel}px, 0) scale(${scale})`;
          item.icon.style.opacity = `${opacity}`;
          item.finished = progress >= 1;
          if (!item.finished) complete = false;
        });

        if (complete) {
          cleanup();
          return;
        }
        state.frame = this.requestFrame(tick);
      };
      state.frame = this.requestFrame(tick);
    }

    clearFolderOpenMotions() {
      for (const state of [...this.folderOpenMotions]) {
        state.cleanup?.();
      }
    }

    startFolderClosePresentation(presentation) {
      if (
        !presentation ||
        this.reduceMotion.matches ||
        !presentation.group?.isConnected
      ) {
        return;
      }

      this.clearFolderOpenMotions();
      this.clearFolderCloseMotions();
      const { group, destinationRect } = presentation;
      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = FOLDER_CLOSE_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      effect.dataset.renderer = "folder-close-return";
      effect.dataset.folderId = group.id;
      Object.assign(effect.style, {
        position: "fixed",
        inset: "0",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483646",
      });

      const items = presentation.items.map(({ element, sourceRect, geometry }, index) => {
        const visual = this.createFolderOpenIcon(element, sourceRect, sourceRect, geometry.visualSource);
        visual.icon.className = FOLDER_CLOSE_ICON_CLASS;
        const delay = Math.min(
          index * FOLDER_CLOSE_STAGGER,
          FOLDER_CLOSE_MAX_STAGGER
        );
        effect.appendChild(visual.icon);
        return {
          element,
          icon: visual.icon,
          sourceRect,
          delay,
          size: visual.size,
        };
      });

      if (items.length === 0) {
        effect.remove();
        return;
      }

      items.forEach(item => item.element.setAttribute(FOLDER_CLOSE_ITEM_ATTRIBUTE, 'true'));
      group.setAttribute(FOLDER_CLOSE_MOTION_ATTRIBUTE, "true");
      this.document.documentElement.appendChild(effect);
      const state = {
        group,
        effect,
        destinationRect,
        items,
        frame: 0,
        startedAt: null,
        shakeStarted: false,
        waitingSince: this.window.performance.now(),
        cleaned: false,
      };
      this.folderCloseMotions.add(state);

      const smootherStep = progress =>
        progress * progress * progress * (progress * (progress * 6 - 15) + 10);
      const clamp = value => Math.max(0, Math.min(1, value));
      const cleanup = () => {
        if (state.cleaned) {
          return;
        }
        state.cleaned = true;
        if (state.frame) {
          this.cancelFrame(state.frame);
        }
        state.items.forEach(item =>
          item.element.removeAttribute(FOLDER_CLOSE_ITEM_ATTRIBUTE)
        );
        if (state.group.isConnected) {
          state.group.removeAttribute(FOLDER_CLOSE_MOTION_ATTRIBUTE);
        }
        this.folderCloseMotions.delete(state);
        state.nudgeAnimation?.cancel();
        effect.remove();
      };
      state.cleanup = cleanup;
      effect.__folderOpenTabsCleanup = cleanup;

      const tick = timestamp => {
        state.frame = 0;
        if (
          state.cleaned ||
          !state.group.isConnected
        ) {
          cleanup();
          return;
        }
        if (!state.group.collapsed) {
          if (state.startedAt !== null || timestamp - state.waitingSince > this.folderToggleDuration) {
            cleanup();
          } else {
            state.frame = this.requestFrame(tick);
          }
          return;
        }
        state.startedAt ??= timestamp;
        if (!state.shakeStarted) {
          state.shakeStarted = true;
          state.nudgeAnimation = this.nudgeFolderCloseCompletion(state.group, { loop: true });
        }
        const elapsed = timestamp - state.startedAt;
        const destination = this.getFolderOpenFolderRect(state.group) ??
          state.destinationRect;
        state.destinationRect = destination;
        let complete = true;
        state.items.forEach(item => {
          const progress = clamp(
            (elapsed - item.delay) / FOLDER_CLOSE_DURATION
          );
          const travel = smootherStep(progress);
          const sourceX = item.sourceRect.left + item.sourceRect.width / 2;
          const sourceY = item.sourceRect.top + item.sourceRect.height / 2;
          const targetX = destination.left + destination.width / 2;
          const targetY = destination.top + destination.height / 2;
          const arc = Math.sin(Math.PI * travel) *
            Math.min(8, Math.max(2, Math.abs(targetY - sourceY) * 0.06));
          const scale = 1 - 0.28 * travel;
          const opacity = progress >= 0.78
            ? 1 - (progress - 0.78) / 0.22
            : 1;
          const translateX = targetX - sourceX;
          const translateY = targetY - sourceY - arc;
          item.icon.style.transform =
            `translate3d(${translateX * travel}px, ${translateY * travel}px, 0) scale(${scale})`;
          item.icon.style.opacity = `${opacity}`;
          if (progress < 1) {
            complete = false;
          }
        });

        if (complete) {
          const completedDestination = state.destinationRect;
          cleanup();
          this.burstFolderCloseCompletionParticles(completedDestination);
          this.nudgeFolderCloseCompletion(state.group);
          return;
        }
        state.frame = this.requestFrame(tick);
      };
      state.frame = this.requestFrame(tick);
    }

    clearFolderCloseMotions() {
      for (const state of [...this.folderCloseMotions]) {
        state.cleanup?.();
      }
      this.clearFolderCloseCompletionAnimations();
      this.clearFolderCloseCompletionEffects();
    }

    nudgeFolderCloseCompletion(group, { loop = false } = {}) {
      if (
        this.reduceMotion.matches ||
        !group?.isConnected ||
        !group.collapsed
      ) {
        return;
      }

      const label = group.querySelector(
        ":scope > .tab-group-label-container"
      );
      if (!label?.animate) {
        return;
      }

      this.clearFolderCloseCompletionAnimations();
      const animation = label.animate(
        [
          { transform: "translate3d(0, 0, 0) rotate(0deg)", offset: 0 },
          {
            transform: "translate3d(-4px, -3px, 0) rotate(-1.2deg)",
            offset: 0.24,
          },
          {
            transform: "translate3d(1.8px, 1.2px, 0) rotate(0.65deg)",
            offset: 0.54,
          },
          {
            transform: "translate3d(-0.5px, -0.35px, 0) rotate(-0.18deg)",
            offset: 0.76,
          },
          { transform: "translate3d(0, 0, 0) rotate(0deg)", offset: 1 },
        ],
        {
          duration: FOLDER_CLOSE_COMPLETION_DURATION,
          easing: "cubic-bezier(0.22, 0.8, 0.36, 1)",
          fill: "both",
          iterations: loop ? Infinity : 1,
        }
      );
      animation.id = FOLDER_CLOSE_COMPLETION_ANIMATION_ID;
      this.folderCloseCompletionAnimations.add(animation);
      const release = () => {
        this.folderCloseCompletionAnimations.delete(animation);
        if (animation.playState !== "idle") {
          animation.cancel();
        }
      };
      animation.finished.then(release, () => {
        this.folderCloseCompletionAnimations.delete(animation);
      });
      return animation;
    }

    clearFolderCloseCompletionAnimations() {
      for (const animation of [...this.folderCloseCompletionAnimations]) {
        animation.cancel();
      }
      this.folderCloseCompletionAnimations.clear();
    }

    burstFolderCloseCompletionParticles(destinationRect) {
      if (
        this.reduceMotion.matches ||
        !destinationRect ||
        destinationRect.width <= 0 ||
        destinationRect.height <= 0
      ) {
        return null;
      }

      const vectors = [
        { x: -10, y: -13, width: 3.4, height: 7.2, rotation: -34 },
        { x: 0, y: -16, width: 3.2, height: 8.4, rotation: 0 },
        { x: 10, y: -13, width: 3.4, height: 7.2, rotation: 34 },
      ].slice(0, FOLDER_CLOSE_COMPLETION_PARTICLE_COUNT);
      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = FOLDER_CLOSE_COMPLETION_PARTICLE_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      effect.dataset.renderer = "folder-close-completion-fan";
      Object.assign(effect.style, {
        position: "fixed",
        left: `${destinationRect.left + destinationRect.width / 2}px`,
        top: `${destinationRect.top + 1}px`,
        width: "0px",
        height: "0px",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483647",
      });

      const animations = vectors.map((vector, index) => {
        const particle = this.document.createElementNS(XHTML_NAMESPACE, "span");
        particle.className = FOLDER_CLOSE_COMPLETION_PARTICLE_CLASS;
        Object.assign(particle.style, {
          position: "absolute",
          left: `${-vector.width / 2}px`,
          top: `${-vector.height / 2}px`,
          width: `${vector.width}px`,
          height: `${vector.height}px`,
          background: "rgba(255, 255, 255, 0.94)",
          borderRadius: "1px",
          pointerEvents: "none",
          transformOrigin: "center bottom",
          willChange: "transform, opacity",
        });
        effect.appendChild(particle);
        const animation = particle.animate(
          [
            {
              opacity: 0,
              transform: "translate3d(0, 1px, 0) rotate(0deg) scale(0.55, 0.72)",
            },
            {
              opacity: 0.98,
              transform: `translate3d(${vector.x * 0.22}px, ${vector.y * 0.22}px, 0) rotate(${vector.rotation * 0.3}deg) scale(1, 1)`,
              offset: 0.2,
            },
            {
              opacity: 0.9,
              transform: `translate3d(${vector.x * 0.72}px, ${vector.y * 0.72}px, 0) rotate(${vector.rotation * 0.8}deg) scale(0.86, 1.08)`,
              offset: 0.62,
            },
            {
              opacity: 0,
              transform: `translate3d(${vector.x}px, ${vector.y}px, 0) rotate(${vector.rotation}deg) scale(0.66, 0.82)`,
            },
          ],
          {
            duration: FOLDER_CLOSE_COMPLETION_PARTICLE_DURATION + (index % 2) * 18,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            fill: "both",
          }
        );
        animation.id = `folder-open-tabs-folder-close-completion-particle-${index}`;
        return animation;
      });

      this.document.documentElement.appendChild(effect);
      this.folderCloseCompletionEffects.add(effect);

      let cleanupTimer;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.clearTimer(cleanupTimer);
        animations.forEach(animation => animation.cancel());
        this.folderCloseCompletionEffects.delete(effect);
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.setTimer(
        cleanup,
        FOLDER_CLOSE_COMPLETION_PARTICLE_DURATION + 120
      );
      Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
      return { cleanup };
    }

    clearFolderCloseCompletionEffects() {
      for (const effect of [...this.folderCloseCompletionEffects]) {
        effect.__folderOpenTabsCleanup?.();
      }
      this.folderCloseCompletionEffects.clear();
    }

    startFolderReturnPresentation(folder, tab) {
      if (
        this.reduceMotion.matches ||
        !folder?.isConnected ||
        !folder.matches("zen-folder[collapsed]")
      ) {
        return null;
      }

      let state = this.folderReturnMotions.get(folder);
      if (!state) {
        const folderIcon = folder.querySelector(
          ":scope > .tab-group-label-container .tab-group-folder-icon svg"
        );
        const originalIconState = folderIcon?.getAttribute("state") ?? null;
        const originalIconActive = folderIcon?.getAttribute("active") ?? null;

        state = {
          folder,
          folderIcon,
          originalIconState,
          originalIconActive,
          count: 0,
          cleaned: false,
        };
        this.folderReturnMotions.set(folder, state);

        folder.setAttribute(FOLDER_RETURN_MOTION_ATTRIBUTE, "true");
        if (folderIcon) {
          folderIcon.setAttribute("state", "open");
          folderIcon.setAttribute("active", "false");
        }
      }

      state.count += 1;
      let released = false;
      const cleanup = (completed = false) => {
        if (released || state.cleaned) {
          return;
        }
        released = true;
        state.count -= 1;
        if (state.count > 0) {
          return;
        }
        this.finishFolderReturnPresentation(state, completed);
      };
      return { cleanup };
    }

    finishFolderReturnPresentation(state, completed = false) {
      if (!state || state.cleaned) {
        return;
      }
      state.cleaned = true;
      this.folderReturnMotions.delete(state.folder);

      const folder = state.folder;
      const isStillCollapsed = folder.isConnected && folder.collapsed;
      if (folder.isConnected) {
        folder.removeAttribute(FOLDER_RETURN_MOTION_ATTRIBUTE);
      }
      if (!isStillCollapsed) {
        return;
      }
      if (state.folderIcon?.isConnected) {
        if (state.originalIconState == null) {
          state.folderIcon.removeAttribute("state");
        } else if (state.folderIcon.getAttribute("state") === "open") {
          state.folderIcon.setAttribute("state", state.originalIconState);
        }
        if (state.originalIconActive == null) {
          state.folderIcon.removeAttribute("active");
        } else if (state.folderIcon.getAttribute("active") === "false") {
          state.folderIcon.setAttribute("active", state.originalIconActive);
        }
      }
      if (completed) {
        this.burstFolderReturnCompletion(folder);
      }
    }

    clearFolderReturnMotions() {
      for (const state of [...this.folderReturnMotions.values()]) {
        this.finishFolderReturnPresentation(state);
      }
    }

    retimeFolderAnimations(group, animationsBefore) {
      if (this.destroyed || !group?.getAnimations) {
        return;
      }

      const allTabsUnloaded = !group.querySelector(
        ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing])"
      );
      const groupStart = group.groupStartElement;
      for (const animation of group.getAnimations({ subtree: true })) {
        if (animationsBefore.has(animation) || animation.id || animation.animationName || animation.transitionProperty) {
          continue;
        }
        const effect = animation.effect;
        const duration = effect?.getTiming().duration;
        const target = effect?.target;
        const frames = effect?.getKeyframes() ?? [];
        const properties = new Set(frames.flatMap(frame => Object.keys(frame)).filter(key =>
          !['offset', 'computedOffset', 'easing', 'composite', 'simulateComputeValuesFailure'].includes(key)));
        if (!effect || !Number.isFinite(duration) ||
            !group.contains(target) ||
            !target?.matches?.('.tabbrowser-tab, zen-folder, .tab-group-label-container, .zen-tab-group-start') ||
            !properties.size || [...properties].some(property => !['opacity', 'height', 'minHeight', 'marginTop'].includes(property))) {
          continue;
        }
        if (
          group.collapsed &&
          allTabsUnloaded &&
          effect.target === groupStart &&
          typeof effect.setKeyframes === "function"
        ) {
          const keyframes = effect.getKeyframes();
          const startMarginTop = keyframes[0]?.marginTop;
          if (startMarginTop != null) {
            effect.setKeyframes([
              { marginTop: startMarginTop },
              { marginTop: `-${FOLDER_COLLAPSED_GAP}px` },
            ]);
          }
        }
        effect.updateTiming({
          duration: this.folderToggleDuration,
          easing: this.folderToggleEasing,
        });
      }
    }

    getBackground(tab) {
      if (!tab || tab.closing || this.tabs.getAttribute("orient") !== "vertical") {
        return null;
      }
      return tab.querySelector(":scope > .tab-stack > .tab-background");
    }

    getRect(background) {
      const rect = background?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }

    readAppearance(background) {
      const source = this.window.getComputedStyle(background);
      return {
        background: source.background,
        border: source.border,
        borderRadius: source.borderRadius,
        boxShadow: source.boxShadow,
        colorScheme: source.colorScheme,
        outline: source.outline,
        outlineOffset: source.outlineOffset,
        cornerShape: source.getPropertyValue("corner-shape") || "round",
      };
    }

    applyAppearance(appearance) {
      if (!appearance || appearance === this.appliedAppearance) return;
      const previous = this.appliedAppearance;
      for (const [property, value] of Object.entries(appearance)) {
        if (previous?.[property] === value) continue;
        if (property === 'cornerShape') this.highlight.style.setProperty('corner-shape', value);
        else this.highlight.style[property] = value;
      }
      this.appliedAppearance = appearance;
    }

    hasSettledSelection(tab) {
      return (
        tab === this.window.gBrowser.selectedTab &&
        (tab.selected || tab.hasAttribute("selected") || tab.hasAttribute("visuallyselected"))
      );
    }

    copyAppearance(background, tab) {
      const canCache = this.hasSettledSelection(tab) && !tab.matches(":hover");
      if ((canCache && (this.appearanceDirty || this.appearanceTab !== tab)) || !this.selectedAppearance) {
        const appearance = this.readAppearance(background);
        if (canCache) {
          this.selectedAppearance = appearance;
          this.appearanceTab = tab;
          this.appearanceDirty = false;
        }
        this.applyAppearance(this.selectedAppearance ?? appearance);
        return;
      }
      this.applyAppearance(this.selectedAppearance);
    }

    refreshAppearance() {
      const background = this.getBackground(this.currentTab);
      if (background && this.hasSettledSelection(this.currentTab) && !this.currentTab.matches(":hover")) {
        this.selectedAppearance = this.readAppearance(background);
        this.appearanceTab = this.currentTab;
        this.appearanceDirty = false;
        this.applyAppearance(this.selectedAppearance);
      }
    }

    setRect(rect) {
      Object.assign(this.highlight.style, {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }

    rectChanged(previous, current) {
      if (!previous) {
        return true;
      }
      return ["top", "left", "width", "height"].some(
        property => Math.abs(previous[property] - current[property]) > POSITION_EPSILON
      );
    }

    animatePageDepth(tab) {
      this.cancelPageDepth();
      if (this.reduceMotion.matches) {
        return;
      }

      const browser = tab?.linkedBrowser;
      if (!browser || browser !== this.window.gBrowser.selectedBrowser || typeof browser.animate !== "function") {
        return;
      }

      const animation = browser.animate(
        [
          {
            scale: PAGE_DEPTH_START_SCALE,
            transformOrigin: "center center",
          },
          {
            scale: 1,
            transformOrigin: "center center",
          },
        ],
        {
          duration: PAGE_DEPTH_DURATION,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          fill: "both",
        }
      );
      animation.id = PAGE_DEPTH_ANIMATION_ID;
      this.pageAnimation = animation;

      animation.finished.then(
        () => {
          if (this.pageAnimation !== animation) {
            return;
          }
          animation.cancel();
          this.pageAnimation = null;
        },
        () => {}
      );
    }

    cancelPageDepth() {
      this.pageAnimation?.cancel();
      this.pageAnimation = null;
    }

    absorbOutlineIntoIcon(tab) {
      const folder = tab?.closest?.("zen-folder");
      if (
        this.reduceMotion.matches ||
        !folder ||
        tab.closest("zen-folder[collapsed]") ||
        tab.matches("[pending], [discarded], [zen-empty-tab], [hidden], [closing]") ||
        this.tabs.getAttribute("orient") !== "vertical"
      ) {
        return null;
      }

      const background = tab.querySelector(":scope > .tab-stack > .tab-background");
      const icon = [...tab.querySelectorAll(".tab-icon-image, .tab-throbber")]
        .find(element => {
          const rect = element.getBoundingClientRect();
          const style = this.window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
        });
      const backgroundRect = background?.getBoundingClientRect();
      const iconRect = icon?.getBoundingClientRect();
      if (
        !backgroundRect ||
        backgroundRect.width <= 0 ||
        backgroundRect.height <= 0 ||
        !iconRect ||
        iconRect.width <= 0 ||
        iconRect.height <= 0
      ) {
        return null;
      }

      const backgroundStyle = this.window.getComputedStyle(background);
      const tabStyle = this.window.getComputedStyle(tab);
      const outlineWidth = Math.max(1, Number.parseFloat(backgroundStyle.outlineWidth) || 1.5);
      const outlineColor =
        backgroundStyle.outlineStyle !== "none" &&
        backgroundStyle.outlineColor !== "rgba(0, 0, 0, 0)"
          ? backgroundStyle.outlineColor
          : `color-mix(in srgb, ${tabStyle.color} 56%, transparent)`;
      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = OPEN_UNLOAD_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      effect.dataset.renderer = "outline-absorption";
      effect.dataset.folderId = folder.id;
      Object.assign(effect.style, {
        position: "fixed",
        top: `${backgroundRect.top}px`,
        left: `${backgroundRect.left}px`,
        width: `${backgroundRect.width}px`,
        height: `${backgroundRect.height}px`,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483646",
      });

      const ring = this.document.createElementNS(XHTML_NAMESPACE, "span");
      ring.className = OPEN_UNLOAD_RING_CLASS;
      Object.assign(ring.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${backgroundRect.width}px`,
        height: `${backgroundRect.height}px`,
        boxSizing: "border-box",
        border: `${outlineWidth}px solid ${outlineColor}`,
        borderRadius: "999px",
        background: "transparent",
        boxShadow: `0 0 4px color-mix(in srgb, ${outlineColor} 62%, transparent)`,
        willChange: "transform, width, height, opacity, filter",
      });
      effect.appendChild(ring);
      this.document.documentElement.appendChild(effect);

      const destinationX = iconRect.left + iconRect.width / 2 - backgroundRect.left;
      const destinationY = iconRect.top + iconRect.height / 2 - backgroundRect.top;
      const finalDiameter = Math.max(4, Math.min(7, iconRect.width * 0.4));
      const smootherStep = progress =>
        progress * progress * progress * (progress * (progress * 6 - 15) + 10);
      const ringKeyframes = Array.from(
        { length: OPEN_UNLOAD_FRAME_COUNT },
        (_, index) => {
          const progress = index / (OPEN_UNLOAD_FRAME_COUNT - 1);
          const travel = smootherStep(progress);
          const width = backgroundRect.width + (finalDiameter - backgroundRect.width) * travel;
          const height = backgroundRect.height + (finalDiameter - backgroundRect.height) * travel;
          const centerX = backgroundRect.width / 2 +
            (destinationX - backgroundRect.width / 2) * travel;
          const centerY = backgroundRect.height / 2 +
            (destinationY - backgroundRect.height / 2) * travel;
          const fade = progress <= 0.76
            ? 0
            : smootherStep((progress - 0.76) / 0.24);
          return {
            transform: `translate(${centerX - width / 2}px, ${centerY - height / 2}px)`,
            width: `${width}px`,
            height: `${height}px`,
            opacity: 1 - fade,
            filter: `blur(${0.55 * travel}px)`,
            offset: progress,
          };
        }
      );
      const ringAnimation = ring.animate(ringKeyframes, {
        duration: OPEN_UNLOAD_DURATION,
        easing: "linear",
        fill: "both",
      });
      ringAnimation.id = "folder-open-tabs-open-unload-ring";

      this.closeEffects.add(effect);
      let cleanupTimer;
      let iconAnimation = null;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.clearTimer(cleanupTimer);
        ringAnimation.cancel();
        iconAnimation?.cancel();
        this.closeEffects.delete(effect);
        effect.remove();
      };
      const shakeIcon = () => {
        if (cleaned) {
          return;
        }
        effect.remove();
        const visibleIcon = [...tab.querySelectorAll(".tab-icon-image, .tab-throbber")]
          .find(element => {
            const rect = element.getBoundingClientRect();
            const style = this.window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
          });
        if (!visibleIcon) {
          cleanup();
          return;
        }
        iconAnimation = visibleIcon.animate(
          [
            { transform: "translateX(0) rotate(0deg) scale(1)", offset: 0 },
            { transform: "translateX(-1.3px) rotate(-4deg) scale(0.96)", offset: 0.24 },
            { transform: "translateX(1.1px) rotate(3deg) scale(1.02)", offset: 0.5 },
            { transform: "translateX(-0.45px) rotate(-1.4deg) scale(0.99)", offset: 0.74 },
            { transform: "translateX(0) rotate(0deg) scale(1)", offset: 1 },
          ],
          {
            duration: OPEN_UNLOAD_SHAKE_DURATION,
            easing: "ease-out",
          }
        );
        iconAnimation.id = "folder-open-tabs-open-unload-icon-shake";
        iconAnimation.finished.then(cleanup, cleanup);
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.setTimer(
        cleanup,
        OPEN_UNLOAD_DURATION + OPEN_UNLOAD_SHAKE_DURATION + 180
      );
      ringAnimation.finished.then(shakeIcon, cleanup);
      return { cleanup };
    }

    captureFolderReturnSnapshot(tab) {
      const folder = tab?.closest?.("zen-folder[collapsed]");
      if (
        this.reduceMotion.matches ||
        !folder ||
        tab.matches("[pending], [discarded], [zen-empty-tab], [hidden]") ||
        this.tabs.getAttribute("orient") !== "vertical"
      ) {
        return null;
      }

      const copyRect = rect => rect && ({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      const folderLabel = folder.querySelector(":scope > .tab-group-label-container");
      const folderIcon = folderLabel?.querySelector(".tab-group-folder-icon");
      const tabRect = copyRect(tab.getBoundingClientRect());
      const folderLabelRect = copyRect(folderLabel?.getBoundingClientRect());
      const folderIconRect = copyRect(folderIcon?.getBoundingClientRect());
      const destinationRect = folderIconRect?.width > 0 && folderIconRect?.height > 0
        ? folderIconRect
        : folderLabelRect;
      if (
        !tabRect ||
        tabRect.width <= 0 ||
        tabRect.height <= 0 ||
        !folderLabelRect ||
        !destinationRect ||
        destinationRect.width <= 0 ||
        destinationRect.height <= 0
      ) {
        return null;
      }

      const backgroundSource =
        tab === this.currentTab && !this.highlight.hidden
          ? this.highlight
          : tab.querySelector(":scope > .tab-stack > .tab-background");
      const backgroundRect = copyRect(backgroundSource?.getBoundingClientRect());
      const backgroundComputedStyle = backgroundSource
        ? this.window.getComputedStyle(backgroundSource)
        : null;
      const backgroundStyle = backgroundComputedStyle && {
        background: backgroundComputedStyle.background,
        border: backgroundComputedStyle.border,
        borderRadius: backgroundComputedStyle.borderRadius,
        boxShadow: backgroundComputedStyle.boxShadow,
        colorScheme: backgroundComputedStyle.colorScheme,
        outline: backgroundComputedStyle.outline,
        outlineOffset: backgroundComputedStyle.outlineOffset,
        opacity: backgroundComputedStyle.opacity,
        cornerShape: backgroundComputedStyle.getPropertyValue("corner-shape"),
      };
      const labelSource = tab.querySelector(".tab-label");
      const labelRect = copyRect(labelSource?.getBoundingClientRect());
      const labelComputedStyle = labelSource
        ? this.window.getComputedStyle(labelSource)
        : null;
      const labelStyle = labelComputedStyle && {
        color: labelComputedStyle.color,
        font: labelComputedStyle.font,
        lineHeight: labelComputedStyle.lineHeight,
        opacity: labelComputedStyle.opacity,
        textAlign: labelComputedStyle.textAlign,
        textShadow: labelComputedStyle.textShadow,
      };
      const iconSource = [...tab.querySelectorAll(".tab-icon-image, .tab-throbber")]
        .find(element => {
          const rect = element.getBoundingClientRect();
          const style = this.window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
        });
      const iconRect = copyRect(iconSource?.getBoundingClientRect());
      const iconComputedStyle = iconSource
        ? this.window.getComputedStyle(iconSource)
        : null;
      const iconStyle = iconComputedStyle && {
        backgroundColor: iconComputedStyle.backgroundColor,
        backgroundImage: iconComputedStyle.backgroundImage,
        listStyleImage: iconComputedStyle.getPropertyValue("list-style-image"),
        borderRadius: iconComputedStyle.borderRadius,
        opacity: iconComputedStyle.opacity,
      };
      return {
        tab,
        folder,
        tabRect,
        folderLabelRect,
        destinationRect,
        backgroundRect,
        backgroundStyle,
        labelRect,
        labelStyle,
        labelText: labelSource?.textContent ?? "",
        iconRect,
        iconStyle,
        tabColor: this.window.getComputedStyle(tab).color,
      };
    }

    returnTabToFolder(tab, snapshot = null) {
      snapshot ??= this.captureFolderReturnSnapshot(tab);
      if (this.destroyed || this.reduceMotion.matches || !snapshot || !snapshot.tab?.isConnected || !snapshot.folder?.isConnected) {
        return null;
      }

      const {
        folder,
        tabRect,
        folderLabelRect,
        destinationRect,
        backgroundRect,
        backgroundStyle,
        labelRect,
        labelStyle,
        labelText,
        iconRect,
        iconStyle,
        tabColor,
      } = snapshot;
      const folderPresentation = this.startFolderReturnPresentation(folder, tab);
      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = FOLDER_RETURN_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      effect.dataset.renderer = "folder-return";
      effect.dataset.folderId = folder.id;
      Object.assign(effect.style, {
        position: "fixed",
        top: `${tabRect.top}px`,
        left: `${tabRect.left}px`,
        width: `${tabRect.width}px`,
        height: `${tabRect.height}px`,
        overflow: "visible",
        pointerEvents: "none",
        transformOrigin: "center center",
        willChange: "transform, opacity, filter",
        zIndex: "2147483646",
      });

      if (backgroundRect && backgroundStyle) {
        const surface = this.document.createElementNS(XHTML_NAMESPACE, "div");
        surface.className = FOLDER_RETURN_SURFACE_CLASS;
        Object.assign(surface.style, {
          position: "absolute",
          top: `${backgroundRect.top - tabRect.top}px`,
          left: `${backgroundRect.left - tabRect.left}px`,
          width: `${backgroundRect.width}px`,
          height: `${backgroundRect.height}px`,
          boxSizing: "border-box",
          background: backgroundStyle.background,
          border: backgroundStyle.border,
          borderRadius: backgroundStyle.borderRadius,
          boxShadow: backgroundStyle.boxShadow,
          colorScheme: backgroundStyle.colorScheme,
          outline: backgroundStyle.outline,
          outlineOffset: backgroundStyle.outlineOffset,
          opacity: backgroundStyle.opacity,
        });
        surface.style.setProperty(
          "corner-shape",
          backgroundStyle.cornerShape || "round"
        );
        effect.appendChild(surface);
      }

      if (labelRect && labelStyle && labelRect.width > 0 && labelRect.height > 0) {
        const label = this.document.createElementNS(XHTML_NAMESPACE, "span");
        label.textContent = labelText;
        Object.assign(label.style, {
          position: "absolute",
          top: `${labelRect.top - tabRect.top}px`,
          left: `${labelRect.left - tabRect.left}px`,
          width: `${labelRect.width}px`,
          height: `${labelRect.height}px`,
          overflow: "hidden",
          color: labelStyle.color,
          font: labelStyle.font,
          lineHeight: labelStyle.lineHeight,
          opacity: labelStyle.opacity,
          textAlign: labelStyle.textAlign,
          textOverflow: "ellipsis",
          textShadow: labelStyle.textShadow,
          whiteSpace: "nowrap",
        });
        effect.appendChild(label);
      }

      if (iconRect && iconStyle) {
        const icon = this.document.createElementNS(XHTML_NAMESPACE, "span");
        const listImage = iconStyle.listStyleImage;
        Object.assign(icon.style, {
          position: "absolute",
          top: `${iconRect.top - tabRect.top}px`,
          left: `${iconRect.left - tabRect.left}px`,
          width: `${iconRect.width}px`,
          height: `${iconRect.height}px`,
          backgroundColor: iconStyle.backgroundColor,
          backgroundImage: listImage && listImage !== "none"
            ? listImage
            : iconStyle.backgroundImage,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          borderRadius: iconStyle.borderRadius,
          opacity: iconStyle.opacity,
        });
        effect.appendChild(icon);
      }

      const receiver = this.document.createElementNS(XHTML_NAMESPACE, "div");
      receiver.className = FOLDER_RETURN_TARGET_CLASS;
      receiver.setAttribute("aria-hidden", "true");
      Object.assign(receiver.style, {
        position: "fixed",
        top: `${folderLabelRect.bottom - 3}px`,
        left: `${folderLabelRect.left + 12}px`,
        width: `${Math.max(12, folderLabelRect.width - 24)}px`,
        height: "3px",
        boxSizing: "border-box",
        background: `color-mix(in srgb, ${tabColor} 68%, transparent)`,
        borderRadius: "999px",
        boxShadow: `0 0 7px color-mix(in srgb, ${tabColor} 44%, transparent)`,
        opacity: "0",
        pointerEvents: "none",
        transformOrigin: "center center",
        zIndex: "2147483646",
      });
      this.document.documentElement.append(effect, receiver);

      const destinationX =
        destinationRect.left + destinationRect.width / 2 - (tabRect.left + tabRect.width / 2);
      const destinationY =
        destinationRect.top + destinationRect.height / 2 - (tabRect.top + tabRect.height / 2);
      const smootherStep = progress => progress * progress * (3 - 2 * progress);
      const cubicPoint = (start, control1, control2, end, progress) => {
        const inverse = 1 - progress;
        return inverse ** 3 * start +
          3 * inverse ** 2 * progress * control1 +
          3 * inverse * progress ** 2 * control2 +
          progress ** 3 * end;
      };
      const returnKeyframes = Array.from(
        { length: FOLDER_RETURN_FRAME_COUNT },
        (_, index) => {
          const progress = index / (FOLDER_RETURN_FRAME_COUNT - 1);
          const travel = smootherStep(progress);
          const x = cubicPoint(0, 8, destinationX * 0.62, destinationX, travel);
          const y = cubicPoint(0, destinationY * 0.1, destinationY * 0.86, destinationY, travel);
          const scaleX = 1 + (0.12 - 1) * travel;
          const scaleY = 1 + (0.04 - 1) * travel;
          const fadeProgress = progress <= 0.64
            ? 0
            : smootherStep((progress - 0.64) / 0.36);
          return {
            opacity: 1 - fadeProgress,
            transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`,
            filter: `blur(${0.8 * travel}px)`,
            offset: progress,
          };
        }
      );
      const returnAnimation = effect.animate(
        returnKeyframes,
        {
          duration: FOLDER_RETURN_DURATION,
          easing: "linear",
          fill: "both",
        }
      );
      returnAnimation.id = "folder-open-tabs-folder-return";
      const receiverKeyframes = Array.from(
        { length: FOLDER_RETURN_FRAME_COUNT },
        (_, index) => {
          const progress = index / (FOLDER_RETURN_FRAME_COUNT - 1);
          const arrival = Math.max(0, Math.min(1, (progress - 0.54) / 0.46));
          const pulse = Math.sin(Math.PI * arrival) ** 2;
          return {
            opacity: 0.78 * pulse,
            transform: `scaleX(${0.25 + 0.75 * pulse - 0.07 * smootherStep(progress)})`,
            offset: progress,
          };
        }
      );
      const receiverAnimation = receiver.animate(
        receiverKeyframes,
        {
          duration: FOLDER_RETURN_DURATION,
          easing: "linear",
          fill: "both",
        }
      );
      receiverAnimation.id = "folder-open-tabs-folder-return-target";

      this.closeEffects.add(effect);
      let cleanupTimer;
      let cleaned = false;
      const cleanup = (completed = false) => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.clearTimer(cleanupTimer);
        returnAnimation.cancel();
        receiverAnimation.cancel();
        folderPresentation?.cleanup(completed);
        this.closeEffects.delete(effect);
        receiver.remove();
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.setTimer(cleanup, FOLDER_RETURN_DURATION + 140);
      Promise.allSettled([returnAnimation.finished, receiverAnimation.finished]).then(() =>
        cleanup(true)
      );
      return { cleanup };
    }

    burstFolderReturnCompletion(folder) {
      if (this.reduceMotion.matches || !folder?.isConnected) {
        return null;
      }
      const icon = folder.querySelector(
        ":scope > .tab-group-label-container .tab-group-folder-icon"
      );
      const label = folder.querySelector(":scope > .tab-group-label-container");
      const iconRect = icon?.getBoundingClientRect();
      const labelRect = label?.getBoundingClientRect();
      const sourceRect = iconRect?.width > 0 && iconRect?.height > 0
        ? iconRect
        : labelRect;
      if (!sourceRect || sourceRect.width <= 0 || sourceRect.height <= 0) {
        return null;
      }

      const vectors = [
        { x: -15, y: -5, width: 5.4, height: 2.2, rotation: -52 },
        { x: -11, y: -14, width: 4.2, height: 2.8, rotation: 34 },
        { x: -4, y: -18, width: 5.1, height: 2.0, rotation: -18 },
        { x: 4, y: -17, width: 3.8, height: 2.6, rotation: 46 },
        { x: 13, y: -10, width: 5.7, height: 2.2, rotation: -28 },
        { x: 17, y: 1, width: 4.2, height: 2.4, rotation: 16 },
        { x: 13, y: 12, width: 5.1, height: 2.0, rotation: 61 },
        { x: 4, y: 17, width: 4.0, height: 2.7, rotation: -39 },
        { x: -7, y: 15, width: 5.7, height: 2.2, rotation: 25 },
        { x: -17, y: 7, width: 4.4, height: 2.5, rotation: -66 },
      ].slice(0, FOLDER_RETURN_SPARK_COUNT);
      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = FOLDER_RETURN_SPARK_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      effect.dataset.renderer = "folder-return-completion-spark";
      Object.assign(effect.style, {
        position: "fixed",
        left: `${sourceRect.left + sourceRect.width / 2}px`,
        top: `${sourceRect.top + sourceRect.height / 2}px`,
        width: "0px",
        height: "0px",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483647",
      });

      const animations = vectors.map((vector, index) => {
        const particle = this.document.createElementNS(XHTML_NAMESPACE, "span");
        particle.className = FOLDER_RETURN_SPARK_PARTICLE_CLASS;
        Object.assign(particle.style, {
          position: "absolute",
          left: `${-vector.width / 2}px`,
          top: `${-vector.height / 2}px`,
          width: `${vector.width}px`,
          height: `${vector.height}px`,
          background: "rgba(255, 255, 255, 0.98)",
          borderRadius: "0.5px",
          boxShadow: "0 0 3px rgba(255, 255, 255, 0.72)",
          pointerEvents: "none",
          transformOrigin: "center center",
          willChange: "transform, opacity",
        });
        effect.appendChild(particle);
        const animation = particle.animate(
          [
            {
              opacity: 0,
              transform: "translate3d(0, 0, 0) rotate(-12deg) scale(0.62, 0.62)",
            },
            {
              opacity: 1,
              transform: `translate3d(${vector.x * 0.28}px, ${vector.y * 0.28}px, 0) rotate(${vector.rotation * 0.25}deg) scale(1, 0.84)`,
              offset: 0.2,
            },
            {
              opacity: 0.96,
              transform: `translate3d(${vector.x * 0.72}px, ${vector.y * 0.72 + 2}px, 0) rotate(${vector.rotation * 0.72}deg) scale(0.86, 1.08)`,
              offset: 0.62,
            },
            {
              opacity: 0,
              transform: `translate3d(${vector.x}px, ${vector.y + 7}px, 0) rotate(${vector.rotation}deg) scale(0.74, 0.74)`,
            },
          ],
          {
            duration: FOLDER_RETURN_SPARK_DURATION + (index % 3) * 18,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            fill: "both",
          }
        );
        animation.id = `folder-open-tabs-folder-return-spark-${index}`;
        return animation;
      });
      this.document.documentElement.appendChild(effect);
      this.closeEffects.add(effect);

      let cleanupTimer;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.clearTimer(cleanupTimer);
        animations.forEach(animation => animation.cancel());
        this.closeEffects.delete(effect);
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.setTimer(
        cleanup,
        FOLDER_RETURN_SPARK_DURATION + 140
      );
      Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
      return { cleanup };
    }

    burstCloseControl(x, y) {
      const vectors = [
        { x: -10, y: -2, size: 2 },
        { x: -8, y: -8, size: 3 },
        { x: -2, y: -11, size: 2 },
        { x: 5, y: -9, size: 2.5 },
        { x: 10, y: -4, size: 2 },
        { x: 10, y: 3, size: 3 },
        { x: 5, y: 8, size: 2 },
        { x: -4, y: 9, size: 2.5 },
      ];
      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = CONTROL_BURST_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      effect.dataset.renderer = "control-burst";
      Object.assign(effect.style, {
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        width: "0px",
        height: "0px",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483647",
      });

      const animations = vectors.map((vector, index) => {
        const particle = this.document.createElementNS(XHTML_NAMESPACE, "span");
        particle.className = CONTROL_BURST_PARTICLE_CLASS;
        Object.assign(particle.style, {
          position: "absolute",
          left: `${-vector.size / 2}px`,
          top: `${-vector.size / 2}px`,
          width: `${vector.size}px`,
          height: `${vector.size}px`,
          background: "rgba(255, 255, 255, 0.92)",
          borderRadius: "0px",
          boxShadow: "0 0 2px rgba(255, 255, 255, 0.55)",
          pointerEvents: "none",
          willChange: "transform, opacity",
        });
        effect.appendChild(particle);
        const rotation = (index % 2 === 0 ? 1 : -1) * (38 + index * 7);
        const animation = particle.animate(
          [
            {
              opacity: 0.92,
              transform: "translate3d(0, 0, 0) rotate(0deg) scale(0.62)",
            },
            {
              opacity: 1,
              transform: `translate3d(${vector.x * 0.48}px, ${vector.y * 0.48 - 1}px, 0) rotate(${rotation * 0.42}deg) scale(1)`,
              offset: 0.38,
            },
            {
              opacity: 0,
              transform: `translate3d(${vector.x}px, ${vector.y + 2}px, 0) rotate(${rotation}deg) scale(0.52)`,
            },
          ],
          {
            duration: CONTROL_BURST_DURATION + (index % 3) * 14,
            easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
            fill: "both",
          }
        );
        animation.id = `folder-open-tabs-control-burst-${index}`;
        return animation;
      });
      this.document.documentElement.appendChild(effect);
      this.closeEffects.add(effect);

      let cleanupTimer;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.clearTimer(cleanupTimer);
        animations.forEach(animation => animation.cancel());
        this.closeEffects.delete(effect);
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.setTimer(cleanup, CONTROL_BURST_DURATION + 120);
      Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
      return { cleanup };
    }

    createCloseParticle(x, y, size, color) {
      const particle = this.document.createElementNS(XHTML_NAMESPACE, "span");
      particle.className = CLOSE_PARTICLE_CLASS;
      particle.setAttribute("aria-hidden", "true");
      Object.assign(particle.style, {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 1px ${color}`,
        pointerEvents: "none",
      });
      return particle;
    }

    holdFollowingTabs(tab) {
      const siblings = [...(tab.parentElement?.children ?? [])];
      const tabIndex = siblings.indexOf(tab);
      const items = siblings
        .slice(tabIndex + 1)
        .filter(element => element.matches?.(".tabbrowser-tab, zen-folder"))
        .map(element => {
          const rect = element.getBoundingClientRect();
          return {
            element,
            top: rect.top,
            appliedOffset: 0,
            originalTransform: element.style.getPropertyValue("transform"),
            originalPriority: element.style.getPropertyPriority("transform"),
            width: rect.width,
            height: rect.height,
          };
        })
        .filter(item => item.width > 0 && item.height > 0);

      if (items.length === 0) {
        return;
      }

      this.clearCloseLayoutMotions();
      const controller = {
        cancelled: false,
        frame: 0,
        animations: [],
      };
      this.closeLayoutMotions.add(controller);

      const restore = item => {
        if (item.originalTransform) {
          item.element.style.setProperty(
            "transform",
            item.originalTransform,
            item.originalPriority
          );
        } else {
          item.element.style.removeProperty("transform");
        }
      };

      const cleanup = () => {
        if (controller.cancelled) {
          return;
        }
        controller.cancelled = true;
        if (controller.frame) {
          this.cancelFrame(controller.frame);
        }
        controller.animations.forEach(animation => animation.cancel());
        items.forEach(restore);
        this.closeLayoutMotions.delete(controller);
      };
      controller.cleanup = cleanup;

      const animateIntoPlace = () => {
        controller.frame = 0;
        controller.animations = items.flatMap(item => {
          if (!item.element.isConnected || Math.abs(item.appliedOffset) <= POSITION_EPSILON) {
            restore(item);
            return [];
          }
          const offset = item.appliedOffset;
          item.element.style.removeProperty("transform");
          const animation = item.element.animate(
            [
              { transform: `translateY(${offset}px)` },
              { transform: "translateY(0px)" },
            ],
            {
              duration: TAB_CLOSE_LAYOUT_DURATION,
              delay: TAB_CLOSE_LAYOUT_DELAY,
              easing: "cubic-bezier(0.4, 0, 0.2, 1)",
              fill: "both",
            }
          );
          animation.id = "folder-open-tabs-close-layout";
          return [animation];
        });

        if (controller.animations.length === 0) {
          cleanup();
          return;
        }
        Promise.allSettled(controller.animations.map(animation => animation.finished)).then(
          cleanup
        );
      };

      let frames = 0;
      let stableFrames = 0;
      let movementSeen = false;
      let previousOffsets = items.map(() => 0);
      const track = () => {
        controller.frame = 0;
        if (controller.cancelled) {
          return;
        }

        frames += 1;
        const offsets = items.map(item => item.element.isConnected
          ? item.top - (item.element.getBoundingClientRect().top - item.appliedOffset)
          : item.appliedOffset);
        items.forEach((item, index) => {
          if (item.element.isConnected && Math.abs(offsets[index] - item.appliedOffset) > POSITION_EPSILON) {
            this.writeMotionTransform(item.element, `translateY(${offsets[index]}px)`);
            item.appliedOffset = offsets[index];
          }
        });

        const changed = offsets.some(
          (offset, index) => Math.abs(offset - previousOffsets[index]) > POSITION_EPSILON
        );
        movementSeen ||= offsets.some(offset => Math.abs(offset) > 0.5);
        stableFrames = movementSeen && !changed ? stableFrames + 1 : 0;
        previousOffsets = offsets;

        if (movementSeen && stableFrames >= 3) {
          animateIntoPlace();
          return;
        }
        if (frames >= 45) {
          movementSeen ? animateIntoPlace() : cleanup();
          return;
        }
        controller.frame = this.requestFrame(track);
      };
      controller.frame = this.requestFrame(track);
    }

    dissolveTabLeftward(tab) {
      if (
        this.reduceMotion.matches ||
        !tab ||
        tab.closest("zen-folder") ||
        this.tabs.getAttribute("orient") !== "vertical"
      ) {
        return;
      }

      const rect = tab.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      this.holdFollowingTabs(tab);
      while (this.closeParticleEffects.size >= MAX_CLOSE_PARTICLE_EFFECTS) {
        this.closeParticleEffects.values().next().value.__folderOpenTabsCleanup();
      }

      const effect = this.document.createElementNS(XHTML_NAMESPACE, "div");
      effect.className = CLOSE_PARTICLE_EFFECT_CLASS;
      effect.setAttribute("aria-hidden", "true");
      Object.assign(effect.style, {
        position: "fixed",
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2147483646",
      });

      effect.dataset.renderer = "particles-only";
      this.closeParticleEffects.add(effect);
      this.document.documentElement.appendChild(effect);
      tab.style.setProperty("visibility", "hidden", "important");
      const animations = [];

      const tabColor = this.window.getComputedStyle(tab).color;
      const background = tab.querySelector(":scope > .tab-stack > .tab-background");
      const backgroundColor = this.window.getComputedStyle(background ?? tab).backgroundColor;
      const colors =
        backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)"
          ? [tabColor, tabColor, backgroundColor]
          : [tabColor];

      for (let index = 0; index < TAB_CLOSE_PARTICLE_COUNT; index += 1) {
        const size = 2.2 + Math.random() * 3;
        const x = Math.random() * Math.max(1, rect.width - size);
        const y = Math.random() * Math.max(1, rect.height - size);
        const particle = this.createCloseParticle(
          x,
          y,
          size,
          colors[Math.floor(Math.random() * colors.length)]
        );
        effect.appendChild(particle);

        // Dissolve from the close button on the right toward the left without making
        // the whole particle field appear to flow in one direction.
        const horizontalProgress = x / rect.width;
        const delay = (1 - horizontalProgress) * TAB_CLOSE_MAX_DELAY;
        const driftX = -(1.5 + Math.random() * 2.5);
        const driftY = -(1.5 + Math.random() * 2.5);
        const rotation = -10 + Math.random() * 20;
        const animation = particle.animate(
          [
            { opacity: 0.88, transform: "translate(0, 0) rotate(0deg) scale(1)" },
            {
              opacity: 0.68,
              transform: `translate(${driftX * 0.48}px, ${driftY * 0.48}px) rotate(${rotation * 0.48}deg) scale(0.78)`,
              offset: 0.62,
            },
            {
              opacity: 0,
              transform: `translate(${driftX}px, ${driftY}px) rotate(${rotation}deg) scale(0.45)`,
            },
          ],
          {
            duration: TAB_CLOSE_PARTICLE_DURATION - 35 + Math.random() * 70,
            delay,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            fill: "both",
          }
        );
        animation.id = "folder-open-tabs-close-particle";
        animations.push(animation);
      }

      this.closeEffects.add(effect);

      let cleanupTimer;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        this.clearTimer(cleanupTimer);
        animations.forEach(animation => animation.cancel());
        this.closeEffects.delete(effect);
        this.closeParticleEffects.delete(effect);
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.setTimer(
        cleanup,
        TAB_CLOSE_PARTICLE_DURATION + TAB_CLOSE_MAX_DELAY + 140
      );
      Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
    }

    clearCloseEffects() {
      for (const effect of [...this.closeEffects]) {
        effect.__folderOpenTabsCleanup?.();
      }
    }

    clearCloseLayoutMotions() {
      for (const controller of [...this.closeLayoutMotions]) {
        controller.cleanup?.();
      }
    }

    keyframe(origin, destination, progress, offset, easing) {
      const remaining = 1 - progress;
      const translateX = (origin.left - destination.left) * remaining;
      const translateY = (origin.top - destination.top) * remaining;
      const scaleX = 1 + (origin.width / destination.width - 1) * remaining;
      const scaleY = 1 + (origin.height / destination.height - 1) * remaining;
      return {
        transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
        offset,
        easing,
      };
    }

    scheduleSelectionSync(animate = true) {
      if (this.destroyed || this.reduceMotion.matches) {
        return;
      }
      this.selectionSyncAnimate ||= animate;
      this.selectionSyncAttempts = Math.max(this.selectionSyncAttempts, 30);
      if (this.selectionSyncFrame) {
        return;
      }
      this.selectionSyncFrame = this.requestFrame(() =>
        this.reconcileSelection()
      );
    }

    reconcileSelection() {
      this.selectionSyncFrame = 0;
      if (this.destroyed || this.reduceMotion.matches) return;
      const selected = this.window.gBrowser.selectedTab;
      const destination = this.getRect(this.getBackground(selected));

      if (selected && destination) {
        const animate = this.selectionSyncAnimate;
        this.selectionSyncAnimate = false;
        this.selectionSyncAttempts = 0;
        if (selected !== this.currentTab || this.highlight.hidden) {
          this.moveTo(selected, animate);
        } else {
          this.startTracking();
        }
        return;
      }

      this.selectionSyncAttempts -= 1;
      if (this.selectionSyncAttempts > 0) {
        this.selectionSyncFrame = this.requestFrame(() =>
          this.reconcileSelection()
        );
        return;
      }

      this.selectionSyncAnimate = false;
      this.hide();
    }

    moveTo(tab, animate) {
      if (this.destroyed) return;
      if (this.reduceMotion.matches) {
        this.hide();
        return;
      }

      const background = this.getBackground(tab);
      const destination = this.getRect(background);
      if (!background || !destination) {
        this.scheduleSelectionSync(animate);
        return;
      }

      const origin = this.highlight.hidden
        ? this.pendingSelectionOrigin ?? destination
        : this.getRect(this.highlight);
      this.pendingSelectionOrigin = null;
      this.animation?.cancel();
      this.animation = null;
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.currentTab = tab;
      this.copyAppearance(background, tab);
      tab.setAttribute(TARGET_ATTRIBUTE, "");
      this.highlight.hidden = false;
      this.setRect(destination);
      this.targetRect = destination;
      this.startTracking();

      if (!animate || !origin) {
        return;
      }

      const animation = this.highlight.animate(
        [
          this.keyframe(origin, destination, 0, 0, "cubic-bezier(0.22, 0.8, 0.36, 1)"),
          this.keyframe(origin, destination, OVERSHOOT, 0.68, "cubic-bezier(0.4, 0, 0.2, 1)"),
          this.keyframe(origin, destination, REBOUND, 0.86, "ease-out"),
          this.keyframe(origin, destination, 1, 1, "linear"),
        ],
        { duration: DURATION, fill: "both" }
      );
      this.animation = animation;

      animation.finished.then(
        () => {
          if (this.animation !== animation) {
            return;
          }
          this.syncTarget();
          animation.cancel();
          this.animation = null;
          this.startTracking();
        },
        () => {}
      );
    }

    syncTarget() {
      if (this.destroyed) return false;
      const background = this.getBackground(this.currentTab);
      const destination = this.getRect(background);
      if (!destination) {
        this.scheduleSelectionSync(false);
        return false;
      }
      this.copyAppearance(background, this.currentTab);
      const changed = this.rectChanged(this.targetRect, destination);
      if (changed) {
        this.setRect(destination);
        this.targetRect = destination;
      }
      return changed;
    }

    startTracking() {
      if (this.destroyed || this.trackingFrame || this.highlight.hidden || this.reduceMotion.matches) {
        return;
      }
      this.stableFrames = 0;
      this.trackingFrame = this.requestFrame(() => this.trackLayout());
    }

    trackLayout() {
      this.trackingFrame = 0;
      if (this.destroyed || this.reduceMotion.matches || this.highlight.hidden) return;
      if (this.syncTarget()) {
        this.stableFrames = 0;
      } else {
        this.stableFrames += 1;
      }
      if (
        !this.highlight.hidden &&
        (this.animation ||
          this.closeLayoutMotions.size > 0 ||
          this.folderFollowerMotions.size > 0 ||
          this.folderOpenMotions.size > 0 ||
          this.folderCloseMotions.size > 0 ||
          this.stableFrames < STABLE_FRAME_LIMIT)
      ) {
        this.trackingFrame = this.requestFrame(() => this.trackLayout());
      }
    }

    hide() {
      this.animation?.cancel();
      this.animation = null;
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.currentTab = null;
      this.targetRect = null;
      this.highlight.hidden = true;
      this.pendingSelectionOrigin = null;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.deferredTimers.forEach(timer => this.window.clearTimeout(timer));
      this.deferredFrames.forEach(frame => this.window.cancelAnimationFrame(frame));
      this.deferredTimers.clear();
      this.deferredFrames.clear();
      this.collapseStarts.forEach(group => group.removeAttribute(FOLDER_COLLAPSE_START_ATTRIBUTE));
      this.collapseStarts.clear();
      this.animation?.cancel();
      this.restoreFolderAnimationTiming?.();
      this.restoreExplicitUnloadAnimation?.();
      this.restoreDownloadsIconAnimation?.();
      this.restoreAppMenuAnimation?.();
      this.restoreHistoryArrowAnimation?.();
      this.restoreNewTabFocusState?.();
      this.cancelPageDepth();
      this.clearCloseEffects();
      this.clearCloseLayoutMotions();
      this.clearFolderFollowerMotions();
      this.clearFolderExpandMotions();
      this.clearFolderOpenMotions();
      this.clearFolderCloseMotions();
      this.clearFolderReturnMotions();
      if (this.selectionSyncFrame) {
        this.cancelFrame(this.selectionSyncFrame);
      }
      if (this.trackingFrame) {
        this.cancelFrame(this.trackingFrame);
      }
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.tabContainer.removeEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.removeEventListener("TabClose", this.onTabClose);
      this.tabContainer.removeEventListener(
        "pointerdown",
        this.onCloseControlPointerDown,
        true
      );
      this.tabContainer.removeEventListener("scroll", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("transitionrun", this.onLayoutAnimation, true);
      this.tabContainer.removeEventListener("animationstart", this.onLayoutAnimation, true);
      this.tabContainer.removeEventListener("transitionend", this.onLayoutAnimation, true);
      this.tabContainer.removeEventListener("animationend", this.onLayoutAnimation, true);
      this.tabContainer.removeEventListener("pointerout", this.onPointerOut, true);
      this.window.removeEventListener("resize", this.onLayoutChange);
      this.reduceMotion.removeEventListener("change", this.onMotionPreferenceChange);
      this.resizeObserver.disconnect();
      this.mutationObserver.disconnect();
      this.appearanceObserver.disconnect();
      this.colorScheme.removeEventListener('change', this.onAppearanceChange);
      this.highlight.remove();
    }
  }

  function initialize() {
    window[CONTROLLER_KEY]?.destroy();
    window[CONTROLLER_KEY] = new SelectionHighlightController(window);
  }

  function destroy() {
    window[CONTROLLER_KEY]?.destroy();
    delete window[CONTROLLER_KEY];
  }

  if (document.readyState === "complete") {
    initialize();
  } else {
    window.addEventListener("load", initialize, { once: true });
  }

  window.addEventListener("unload", destroy, { once: true });
  if (typeof window.addUnloadListener === "function") {
    window.addUnloadListener(destroy);
  }
})();
