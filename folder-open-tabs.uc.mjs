// ==UserScript==
// @name         Folder Open Tabs Motion
// @description  Adds smooth selection, page-depth, and tab close motion to Zen.
// @version      0.4.69
// @lastUpdated  2026-09-22
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
  const TAB_CLOSE_LAYOUT_DELAY = 90;
  const TAB_CLOSE_LAYOUT_DURATION = 160;
  const FOLDER_RETURN_DURATION = 560;
  const FOLDER_RETURN_FRAME_COUNT = 35;
  const FOLDER_RETURN_SPARK_DURATION = 320;
  const FOLDER_RETURN_SPARK_COUNT = 10;
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
      this.selectionSyncFrame = 0;
      this.selectionSyncAttempts = 0;
      this.selectionSyncAnimate = false;
      this.selectedAppearance = null;

      if (!this.tabs || !this.tabContainer) {
        throw new Error("Vertical tab elements are unavailable.");
      }

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
          this.hide();
        }
        this.returnTabToFolder(closingTab);
        this.dissolveTabLeftward(closingTab);
        this.scheduleSelectionSync(true);
      };
      this.onLayoutChange = () => {
        this.startTracking();
        this.scheduleSelectionSync(false);
      };
      this.onPointerOut = event => {
        const tab = event.target?.closest?.(".tabbrowser-tab");
        if (
          tab !== this.currentTab ||
          (event.relatedTarget instanceof this.window.Node && tab.contains(event.relatedTarget))
        ) {
          return;
        }
        this.window.requestAnimationFrame(() => {
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
          this.clearFolderReturnMotions();
          this.hide();
        } else {
          this.moveTo(this.window.gBrowser.selectedTab, false);
        }
      };

      this.tabContainer.addEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.addEventListener("TabClose", this.onTabClose);
      this.tabContainer.addEventListener("scroll", this.onLayoutChange, true);
      this.tabContainer.addEventListener("transitionrun", this.onLayoutChange, true);
      this.tabContainer.addEventListener("animationstart", this.onLayoutChange, true);
      this.tabContainer.addEventListener("transitionend", this.onLayoutChange, true);
      this.tabContainer.addEventListener("animationend", this.onLayoutChange, true);
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
      this.mutationObserver = new this.window.MutationObserver(this.onLayoutChange);
      this.mutationObserver.observe(this.tabs, {
        attributes: true,
        subtree: true,
        attributeFilter: ["collapsed", "hidden", "selected", "style", "visuallyselected"],
      });
      this.restoreFolderAnimationTiming = this.installFolderAnimationTiming();
      this.restoreExplicitUnloadAnimation = this.installExplicitUnloadAnimation();
      this.restoreDownloadsIconAnimation = this.installDownloadsIconAnimation();
      this.restoreNewTabFocusState = this.installNewTabFocusState();
      this.moveTo(this.window.gBrowser.selectedTab, false);
    }

    installNewTabFocusState() {
      const clearButtonState = button => {
        button.removeAttribute(NEW_TAB_FOCUSED_ATTRIBUTE);
        button.querySelectorAll?.(".toolbarbutton-icon").forEach(icon => {
          icon.removeAttribute(NEW_TAB_FOCUSED_ATTRIBUTE);
        });
      };
      const clearFocusedState = () => {
        this.document.querySelectorAll(NEW_TAB_BUTTON_SELECTOR).forEach(button => {
          clearButtonState(button);
        });
      };
      const setFocusedState = button => {
        clearFocusedState();
        button.setAttribute(NEW_TAB_FOCUSED_ATTRIBUTE, "true");
        button.querySelectorAll?.(".toolbarbutton-icon").forEach(icon => {
          icon.setAttribute(NEW_TAB_FOCUSED_ATTRIBUTE, "true");
        });
      };
      const findButton = event => {
        const composedButton = event.composedPath?.().find(target =>
          target?.matches?.(NEW_TAB_BUTTON_SELECTOR)
        );
        return composedButton ?? event.target?.closest?.(NEW_TAB_BUTTON_SELECTOR);
      };
      const onFocusIn = event => {
        const button = findButton(event);
        if (!button) {
          return;
        }
        setFocusedState(button);
      };
      const onFocusOut = event => {
        const button = findButton(event);
        const relatedTarget = event.relatedTarget;
        if (!button || button.id === "zen-create-new-button") {
          return;
        }
        if (relatedTarget instanceof this.window.Node && button.contains(relatedTarget)) {
          return;
        }
        clearButtonState(button);
      };
      const onClick = event => {
        const button = findButton(event);
        clearFocusedState();
        if (button) {
          setFocusedState(button);
        }
      };
      const onPointerDown = event => {
        const button = findButton(event);
        if (button) {
          setFocusedState(button);
        } else {
          clearFocusedState();
        }
      };
      const onWindowBlur = () => {
        clearFocusedState();
      };

      clearFocusedState();
      this.clearNewTabFocusState = clearFocusedState;
      this.document.addEventListener("focusin", onFocusIn, true);
      this.document.addEventListener("focusout", onFocusOut, true);
      this.document.addEventListener("click", onClick, true);
      this.document.addEventListener("pointerdown", onPointerDown, true);
      this.document.addEventListener("mousedown", onPointerDown, true);
      this.window.addEventListener("pointerdown", onPointerDown, true);
      this.window.addEventListener("mousedown", onPointerDown, true);
      this.window.addEventListener("blur", onWindowBlur);
      return () => {
        this.document.removeEventListener("focusin", onFocusIn, true);
        this.document.removeEventListener("focusout", onFocusOut, true);
        this.document.removeEventListener("click", onClick, true);
        this.document.removeEventListener("pointerdown", onPointerDown, true);
        this.document.removeEventListener("mousedown", onPointerDown, true);
        this.window.removeEventListener("pointerdown", onPointerDown, true);
        this.window.removeEventListener("mousedown", onPointerDown, true);
        this.window.removeEventListener("blur", onWindowBlur);
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
            controller.window.clearTimeout(returnTimer);
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
        returnTimer = controller.window.setTimeout(() => {
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
          const collapseMotion = methodName === "animateCollapse"
            ? controller.prepareFolderCollapseMotion(group)
            : null;
          const expandMotion = methodName === "animateExpand"
            ? controller.startFolderExpandMotion(group)
            : null;
          const followerStartHeight = methodName === "animateExpand"
            ? controller.captureFolderFollowerStartHeight(group)
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
          const retime = () =>
            controller.retimeFolderAnimations(group, animationsBefore);
          retime();
          controller.window.queueMicrotask(retime);
          controller.window.requestAnimationFrame(retime);
          controller.startFolderCollapseMotion(collapseMotion);
          if (methodName === "animateExpand") {
            controller.scheduleFolderFollowerMotion(group, followerStartHeight);
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
      this.window.setTimeout(() => {
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
        if (!group.isConnected || !group.collapsed) {
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
        this.window.setTimeout(normalize, FOLDER_TOGGLE_DURATION);
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
      if (!group) {
        return null;
      }
      const allTabsUnloaded = !group.querySelector(
        ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing])"
      );
      if (allTabsUnloaded && group.groupStartElement) {
        group.groupStartElement.style.setProperty(
          "margin-top",
          `-${FOLDER_COLLAPSED_GAP}px`
        );
      }
      const motion = this.folderExpandMotions.get(group);
      if (motion) {
        motion.count += 1;
      } else {
        this.folderExpandMotions.set(group, {
          count: 1,
          startedAt: this.window.performance.now(),
        });
      }
      group.setAttribute(FOLDER_EXPAND_MOTION_ATTRIBUTE, "true");
      return group;
    }

    finishFolderExpandMotion(group, result) {
      if (!group) {
        return;
      }
      const release = () => {
        const motion = this.folderExpandMotions.get(group);
        if (!motion) {
          return;
        }
        motion.count -= 1;
        if (motion.count > 0) {
          return;
        }
        const elapsed = this.window.performance.now() - motion.startedAt;
        if (elapsed < FOLDER_TOGGLE_DURATION) {
          this.window.setTimeout(release, FOLDER_TOGGLE_DURATION - elapsed);
          return;
        }
        this.folderExpandMotions.delete(group);
        group.removeAttribute(FOLDER_EXPAND_MOTION_ATTRIBUTE);
      };
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(release, release);
      } else {
        this.window.setTimeout(release, FOLDER_TOGGLE_DURATION);
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

      group.setAttribute(FOLDER_COLLAPSE_START_ATTRIBUTE, "true");
      group.getBoundingClientRect();
      return group;
    }

    startFolderCollapseMotion(group) {
      if (!group) {
        return;
      }
      this.window.requestAnimationFrame(() =>
        group.removeAttribute(FOLDER_COLLAPSE_START_ATTRIBUTE)
      );
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
        groupStart: group.groupStartElement,
        startHeight,
        startMarginTop: Number.parseFloat(
          this.window.getComputedStyle(group.groupStartElement).marginTop
        ) || 0,
        allTabsUnloaded,
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
      if (state.allTabsUnloaded) {
        const marginAnimation = state.groupStart
          .getAnimations()
          .find(animation =>
            animation.effect?.getKeyframes().some(frame => frame.marginTop != null)
          );
        const marginFrames = marginAnimation?.effect?.getKeyframes() ?? [];
        const targetMarginTop = Number.parseFloat(
          marginFrames.at(-1)?.marginTop
        );
        const marginTravel = targetMarginTop - state.startMarginTop;
        if (Number.isFinite(marginTravel) && Math.abs(marginTravel) > POSITION_EPSILON) {
          state.marginTravel = marginTravel;
          state.marginScale = Math.max(
            0,
            (Math.abs(marginTravel) - FOLDER_COLLAPSED_GAP) /
              Math.abs(marginTravel)
          );
        }
      }
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
          this.window.cancelAnimationFrame(state.frame);
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
          (state.group.collapsed && !state.marginTravel)
        ) {
          cleanup();
          return;
        }

        state.frames += 1;
        const currentHeight = state.group.getBoundingClientRect().height;
        const currentMarginTop = Number.parseFloat(
          this.window.getComputedStyle(state.groupStart).marginTop
        );
        const marginShift = Number.isFinite(currentMarginTop)
          ? currentMarginTop - state.startMarginTop
          : 0;
        const shift = state.marginTravel
          ? marginShift * state.marginScale
          : Number.isFinite(currentHeight)
            ? currentHeight - state.startHeight
            : 0;
        let maximumOffset = 0;

        state.items.forEach(item => {
          if (!item.element.isConnected) {
            return;
          }
          const visualTop = item.element.getBoundingClientRect().top;
          const naturalTop = visualTop - item.appliedOffset;
          const offset = item.startTop + shift - naturalTop;
          item.appliedOffset = offset;
          maximumOffset = Math.max(maximumOffset, Math.abs(offset));
          item.element.style.setProperty(
            "transform",
            `translateY(${offset}px)`,
            "important"
          );
        });

        const trackedPosition = state.marginTravel ? currentMarginTop : currentHeight;
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
        state.frame = this.window.requestAnimationFrame(track);
      };
      state.frame = this.window.requestAnimationFrame(track);
    }

    clearFolderFollowerMotions() {
      for (const motion of [...this.folderFollowerMotions]) {
        motion.cleanup?.();
      }
    }

    clearFolderExpandMotions() {
      for (const group of this.folderExpandMotions.keys()) {
        group.removeAttribute(FOLDER_EXPAND_MOTION_ATTRIBUTE);
      }
      this.folderExpandMotions.clear();
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
      if (!group?.getAnimations) {
        return;
      }

      const allTabsUnloaded = !group.querySelector(
        ".tabbrowser-tab:not([pending], [discarded], [zen-empty-tab], [hidden], [closing])"
      );
      const groupStart = group.groupStartElement;
      for (const animation of group.getAnimations({ subtree: true })) {
        if (animationsBefore.has(animation) || animation.id?.startsWith("folder-open-tabs-")) {
          continue;
        }
        const effect = animation.effect;
        const duration = effect?.getTiming().duration;
        if (!effect || !Number.isFinite(duration)) {
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
          duration: FOLDER_TOGGLE_DURATION,
          easing: FOLDER_TOGGLE_EASING,
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
      if (!appearance) {
        return;
      }
      const target = this.highlight.style;
      target.background = appearance.background;
      target.border = appearance.border;
      target.borderRadius = appearance.borderRadius;
      target.boxShadow = appearance.boxShadow;
      target.colorScheme = appearance.colorScheme;
      target.outline = appearance.outline;
      target.outlineOffset = appearance.outlineOffset;
      target.setProperty("corner-shape", appearance.cornerShape);
    }

    hasSettledSelection(tab) {
      return (
        tab === this.window.gBrowser.selectedTab &&
        (tab.selected || tab.hasAttribute("selected") || tab.hasAttribute("visuallyselected"))
      );
    }

    copyAppearance(background, tab) {
      const canCache = this.hasSettledSelection(tab) && !tab.matches(":hover");
      if (canCache || !this.selectedAppearance) {
        const appearance = this.readAppearance(background);
        if (canCache) {
          this.selectedAppearance = appearance;
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
        willChange: "left, top, width, height, opacity, filter",
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
            left: `${centerX - width / 2}px`,
            top: `${centerY - height / 2}px`,
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
        this.window.clearTimeout(cleanupTimer);
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
      cleanupTimer = this.window.setTimeout(
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
      if (!snapshot || !snapshot.tab?.isConnected || !snapshot.folder?.isConnected) {
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
        this.window.clearTimeout(cleanupTimer);
        returnAnimation.cancel();
        receiverAnimation.cancel();
        folderPresentation?.cleanup(completed);
        this.closeEffects.delete(effect);
        receiver.remove();
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.window.setTimeout(cleanup, FOLDER_RETURN_DURATION + 140);
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
        this.window.clearTimeout(cleanupTimer);
        animations.forEach(animation => animation.cancel());
        this.closeEffects.delete(effect);
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.window.setTimeout(
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
        this.window.clearTimeout(cleanupTimer);
        animations.forEach(animation => animation.cancel());
        this.closeEffects.delete(effect);
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.window.setTimeout(cleanup, CONTROL_BURST_DURATION + 120);
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
          };
        })
        .filter(item => {
          const rect = item.element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

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
          this.window.cancelAnimationFrame(controller.frame);
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
        const offsets = items.map(item => {
          if (!item.element.isConnected) {
            return item.appliedOffset;
          }
          const visualTop = item.element.getBoundingClientRect().top;
          const naturalTop = visualTop - item.appliedOffset;
          const offset = item.top - naturalTop;
          item.appliedOffset = offset;
          item.element.style.setProperty(
            "transform",
            `translateY(${offset}px)`,
            "important"
          );
          return offset;
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
        controller.frame = this.window.requestAnimationFrame(track);
      };
      controller.frame = this.window.requestAnimationFrame(track);
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
            { opacity: 0.88, transform: "translate(0, 0) rotate(0deg) scale(1)", filter: "blur(0px)" },
            {
              opacity: 0.68,
              transform: `translate(${driftX * 0.48}px, ${driftY * 0.48}px) rotate(${rotation * 0.48}deg) scale(0.78)`,
              filter: "blur(0.15px)",
              offset: 0.62,
            },
            {
              opacity: 0,
              transform: `translate(${driftX}px, ${driftY}px) rotate(${rotation}deg) scale(0.45)`,
              filter: "blur(0.45px)",
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
        this.window.clearTimeout(cleanupTimer);
        animations.forEach(animation => animation.cancel());
        this.closeEffects.delete(effect);
        effect.remove();
      };
      effect.__folderOpenTabsCleanup = cleanup;
      cleanupTimer = this.window.setTimeout(
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
      if (this.reduceMotion.matches) {
        return;
      }
      this.selectionSyncAnimate ||= animate;
      this.selectionSyncAttempts = Math.max(this.selectionSyncAttempts, 30);
      if (this.selectionSyncFrame) {
        return;
      }
      this.selectionSyncFrame = this.window.requestAnimationFrame(() =>
        this.reconcileSelection()
      );
    }

    reconcileSelection() {
      this.selectionSyncFrame = 0;
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
        this.selectionSyncFrame = this.window.requestAnimationFrame(() =>
          this.reconcileSelection()
        );
        return;
      }

      this.selectionSyncAnimate = false;
      this.hide();
    }

    moveTo(tab, animate) {
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

      const origin = this.highlight.hidden ? destination : this.getRect(this.highlight);
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
      this.stableFrames = 0;
      if (this.trackingFrame || this.highlight.hidden || this.reduceMotion.matches) {
        return;
      }
      this.trackingFrame = this.window.requestAnimationFrame(() => this.trackLayout());
    }

    trackLayout() {
      this.trackingFrame = 0;
      if (this.syncTarget()) {
        this.stableFrames = 0;
      } else {
        this.stableFrames += 1;
      }
      if (!this.highlight.hidden && (this.animation || this.stableFrames < STABLE_FRAME_LIMIT)) {
        this.trackingFrame = this.window.requestAnimationFrame(() => this.trackLayout());
      }
    }

    hide() {
      this.animation?.cancel();
      this.animation = null;
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.currentTab = null;
      this.targetRect = null;
      this.highlight.hidden = true;
    }

    destroy() {
      this.animation?.cancel();
      this.restoreFolderAnimationTiming?.();
      this.restoreExplicitUnloadAnimation?.();
      this.restoreDownloadsIconAnimation?.();
      this.restoreNewTabFocusState?.();
      this.cancelPageDepth();
      this.clearCloseEffects();
      this.clearCloseLayoutMotions();
      this.clearFolderFollowerMotions();
      this.clearFolderExpandMotions();
      this.clearFolderReturnMotions();
      if (this.selectionSyncFrame) {
        this.window.cancelAnimationFrame(this.selectionSyncFrame);
      }
      if (this.trackingFrame) {
        this.window.cancelAnimationFrame(this.trackingFrame);
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
      this.tabContainer.removeEventListener("transitionrun", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("animationstart", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("transitionend", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("animationend", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("pointerout", this.onPointerOut, true);
      this.window.removeEventListener("resize", this.onLayoutChange);
      this.reduceMotion.removeEventListener("change", this.onMotionPreferenceChange);
      this.resizeObserver.disconnect();
      this.mutationObserver.disconnect();
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
