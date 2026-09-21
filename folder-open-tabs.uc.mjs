// ==UserScript==
// @name         Folder Open Tabs Motion
// @description  Adds smooth selection, page-depth, and ungrouped-tab close motion to Zen.
// @version      0.4.16
// @lastUpdated  2026-09-21
// ==/UserScript==

(() => {
  const CONTROLLER_KEY = "__folderOpenTabsSelectionHighlightController";
  const HIGHLIGHT_ID = "folder-open-tabs-selection-highlight";
  const TARGET_ATTRIBUTE = "folder-open-tabs-selection-target";
  const PAGE_DEPTH_ANIMATION_ID = "folder-open-tabs-page-depth";
  const FOLDER_COLLAPSE_START_ATTRIBUTE = "folder-open-tabs-collapse-start";
  const CLOSE_PARTICLE_EFFECT_CLASS = "folder-open-tabs-close-particle-effect";
  const CLOSE_PARTICLE_CLASS = "folder-open-tabs-close-particle";
  const FOLDER_TOGGLE_DURATION = 280;
  const NATIVE_FOLDER_TOGGLE_DURATION = 180;
  const FOLDER_TOGGLE_EASING = "ease-in-out";
  const DURATION = 360;
  const PAGE_DEPTH_DURATION = 160;
  const PAGE_DEPTH_START_SCALE = 0.985;
  const TAB_CLOSE_PARTICLE_DURATION = 420;
  const TAB_CLOSE_MAX_DELAY = 50;
  const TAB_CLOSE_PARTICLE_COUNT = 60;
  const TAB_CLOSE_LAYOUT_DELAY = 90;
  const TAB_CLOSE_LAYOUT_DURATION = 160;
  const OVERSHOOT = 1.04;
  const REBOUND = 0.992;
  const STABLE_FRAME_LIMIT = 8;
  const POSITION_EPSILON = 0.1;
  const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

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
        this.moveTo(event.target, true);
        this.animatePageDepth(event.target);
        this.scheduleSelectionSync(true);
      };
      this.onTabClose = event => {
        this.dissolveTabUpward(event.target);
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
      this.onMotionPreferenceChange = () => {
        if (this.reduceMotion.matches) {
          this.cancelPageDepth();
          this.clearCloseEffects();
          this.clearCloseLayoutMotions();
          this.clearFolderFollowerMotions();
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
      this.moveTo(this.window.gBrowser.selectedTab, false);
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
          const followerMotion = methodName === "animateExpand"
            ? controller.prepareFolderFollowerMotion(group)
            : null;
          const animationsBefore = new Set(
            group?.getAnimations?.({ subtree: true }) ?? []
          );
          const result = original.call(this, group, ...args);
          controller.retimeFolderAnimations(group, animationsBefore);
          controller.window.queueMicrotask(() =>
            controller.retimeFolderAnimations(group, animationsBefore)
          );
          controller.startFolderCollapseMotion(collapseMotion);
          controller.startFolderFollowerMotion(followerMotion);
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

    prepareFolderFollowerMotion(group) {
      if (this.reduceMotion.matches || !group?.groupStartElement) {
        return null;
      }

      const startHeight = group.getBoundingClientRect().height;
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
        if (state.cancelled || !state.group.isConnected || state.group.collapsed) {
          cleanup();
          return;
        }

        state.frames += 1;
        const currentHeight = state.group.getBoundingClientRect().height;
        const shift = Number.isFinite(currentHeight)
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

        const heightIsStable = Math.abs(currentHeight - state.lastHeight) <= POSITION_EPSILON;
        state.lastHeight = currentHeight;
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

    retimeFolderAnimations(group, animationsBefore) {
      if (!group?.getAnimations) {
        return;
      }

      for (const animation of group.getAnimations({ subtree: true })) {
        if (animationsBefore.has(animation) || animation.id?.startsWith("folder-open-tabs-")) {
          continue;
        }
        const effect = animation.effect;
        if (!effect || effect.getTiming().duration !== NATIVE_FOLDER_TOGGLE_DURATION) {
          continue;
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

    dissolveTabUpward(tab) {
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

        const verticalProgress = y / rect.height;
        const delay = (1 - verticalProgress) * TAB_CLOSE_MAX_DELAY + Math.random() * 18;
        const driftX = -2.5 + Math.random() * 5;
        const driftY = -(7 + Math.random() * 9);
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
      this.cancelPageDepth();
      this.clearCloseEffects();
      this.clearCloseLayoutMotions();
      this.clearFolderFollowerMotions();
      if (this.selectionSyncFrame) {
        this.window.cancelAnimationFrame(this.selectionSyncFrame);
      }
      if (this.trackingFrame) {
        this.window.cancelAnimationFrame(this.trackingFrame);
      }
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.tabContainer.removeEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.removeEventListener("TabClose", this.onTabClose);
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
