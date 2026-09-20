// ==UserScript==
// @name         Folder Open Tabs Selection Motion
// @description  Smoothly moves the selected-tab highlight in Zen's vertical sidebar.
// @version      0.2.3
// @lastUpdated  2026-09-20
// ==/UserScript==

(() => {
  const CONTROLLER_KEY = "__folderOpenTabsSelectionHighlightController";
  const HIGHLIGHT_ID = "folder-open-tabs-selection-highlight";
  const TARGET_ATTRIBUTE = "folder-open-tabs-selection-target";
  const DURATION = 360;
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

      if (!this.tabs || !this.tabContainer) {
        throw new Error("Vertical tab elements are unavailable.");
      }

      this.highlight = this.document.createElementNS(XHTML_NAMESPACE, "div");
      this.highlight.id = HIGHLIGHT_ID;
      this.highlight.hidden = true;
      this.highlight.setAttribute("aria-hidden", "true");
      (this.document.getElementById("TabsToolbar") ?? this.document.documentElement).prepend(this.highlight);

      this.onTabSelect = event => this.moveTo(event.target, true);
      this.onLayoutChange = () => this.startTracking();
      this.onMotionPreferenceChange = () => {
        if (this.reduceMotion.matches) {
          this.hide();
        } else {
          this.moveTo(this.window.gBrowser.selectedTab, false);
        }
      };

      this.tabContainer.addEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.addEventListener("scroll", this.onLayoutChange, true);
      this.tabContainer.addEventListener("transitionrun", this.onLayoutChange, true);
      this.tabContainer.addEventListener("animationstart", this.onLayoutChange, true);
      this.tabContainer.addEventListener("transitionend", this.onLayoutChange, true);
      this.tabContainer.addEventListener("animationend", this.onLayoutChange, true);
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
      this.moveTo(this.window.gBrowser.selectedTab, false);
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

    copyAppearance(background) {
      const source = this.window.getComputedStyle(background);
      const target = this.highlight.style;
      target.background = source.background;
      target.border = source.border;
      target.borderRadius = source.borderRadius;
      target.boxShadow = source.boxShadow;
      target.colorScheme = source.colorScheme;
      target.outline = source.outline;
      target.outlineOffset = source.outlineOffset;
      target.setProperty("corner-shape", source.getPropertyValue("corner-shape") || "round");
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

    moveTo(tab, animate) {
      if (this.reduceMotion.matches) {
        this.hide();
        return;
      }

      const background = this.getBackground(tab);
      const destination = this.getRect(background);
      if (!background || !destination) {
        this.hide();
        return;
      }

      const origin = this.highlight.hidden ? destination : this.getRect(this.highlight);
      this.animation?.cancel();
      this.animation = null;
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.currentTab = tab;
      this.copyAppearance(background);
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
      const destination = this.getRect(this.getBackground(this.currentTab));
      if (!destination) {
        this.hide();
        return false;
      }
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
      if (this.trackingFrame) {
        this.window.cancelAnimationFrame(this.trackingFrame);
      }
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.tabContainer.removeEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.removeEventListener("scroll", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("transitionrun", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("animationstart", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("transitionend", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("animationend", this.onLayoutChange, true);
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
