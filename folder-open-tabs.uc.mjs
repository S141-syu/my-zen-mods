// ==UserScript==
// @name         Folder Open Tabs Selection Motion
// @description  Smoothly moves the selected-tab highlight in Zen's vertical sidebar.
// @version      0.2.2
// @lastUpdated  2026-09-20
// ==/UserScript==

(() => {
  const CONTROLLER_KEY = "__folderOpenTabsSelectionHighlightController";
  const HIGHLIGHT_ID = "folder-open-tabs-selection-highlight";
  const TARGET_ATTRIBUTE = "folder-open-tabs-selection-target";
  const DURATION = 360;
  const OVERSHOOT = 1.04;
  const REBOUND = 0.992;
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
      this.onLayoutChange = () => this.scheduleSync();
      this.onMotionPreferenceChange = () => {
        if (this.reduceMotion.matches) {
          this.hide();
        } else {
          this.moveTo(this.window.gBrowser.selectedTab, false);
        }
      };

      this.tabContainer.addEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.addEventListener("scroll", this.onLayoutChange, true);
      this.tabContainer.addEventListener("transitionend", this.onLayoutChange, true);
      this.tabContainer.addEventListener("animationend", this.onLayoutChange, true);
      this.window.addEventListener("resize", this.onLayoutChange);
      this.reduceMotion.addEventListener("change", this.onMotionPreferenceChange);

      this.resizeObserver = new this.window.ResizeObserver(this.onLayoutChange);
      this.resizeObserver.observe(this.tabs);
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

    interpolateRect(origin, destination, progress) {
      return {
        top: origin.top + (destination.top - origin.top) * progress,
        left: origin.left + (destination.left - origin.left) * progress,
        width: origin.width + (destination.width - origin.width) * progress,
        height: origin.height + (destination.height - origin.height) * progress,
      };
    }

    keyframe(rect, offset, easing) {
      return {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
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

      if (!animate || !origin) {
        return;
      }

      const overshoot = this.interpolateRect(origin, destination, OVERSHOOT);
      const rebound = this.interpolateRect(origin, destination, REBOUND);
      const animation = this.highlight.animate(
        [
          this.keyframe(origin, 0, "cubic-bezier(0.22, 0.8, 0.36, 1)"),
          this.keyframe(overshoot, 0.68, "cubic-bezier(0.4, 0, 0.2, 1)"),
          this.keyframe(rebound, 0.86, "ease-out"),
          this.keyframe(destination, 1, "linear"),
        ],
        { duration: DURATION, fill: "both" }
      );
      this.animation = animation;

      animation.finished.then(
        () => {
          if (this.animation !== animation) {
            return;
          }
          const finalRect = this.getRect(this.getBackground(this.currentTab)) ?? destination;
          this.setRect(finalRect);
          animation.cancel();
          this.animation = null;
        },
        () => {}
      );
    }

    scheduleSync() {
      if (this.animation || this.syncFrame) {
        return;
      }
      this.syncFrame = this.window.requestAnimationFrame(() => {
        this.syncFrame = 0;
        this.moveTo(this.currentTab ?? this.window.gBrowser.selectedTab, false);
      });
    }

    hide() {
      this.animation?.cancel();
      this.animation = null;
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.currentTab = null;
      this.highlight.hidden = true;
    }

    destroy() {
      this.animation?.cancel();
      if (this.syncFrame) {
        this.window.cancelAnimationFrame(this.syncFrame);
      }
      this.currentTab?.removeAttribute(TARGET_ATTRIBUTE);
      this.tabContainer.removeEventListener("TabSelect", this.onTabSelect);
      this.tabContainer.removeEventListener("scroll", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("transitionend", this.onLayoutChange, true);
      this.tabContainer.removeEventListener("animationend", this.onLayoutChange, true);
      this.window.removeEventListener("resize", this.onLayoutChange);
      this.reduceMotion.removeEventListener("change", this.onMotionPreferenceChange);
      this.resizeObserver.disconnect();
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
