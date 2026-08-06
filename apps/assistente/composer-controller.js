(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};

  class ComposerController {
    constructor({ workspaceSelector = '.assistant-workspace', areaId = 'composerArea', inputId = 'messageInput' } = {}) {
      this.workspaceSelector = workspaceSelector;
      this.areaId = areaId;
      this.inputId = inputId;
      this.workspace = null;
      this.area = null;
      this.observer = null;
      this.resizeObserver = null;
      this.viewportTimer = 0;
    }

    input() { return document.getElementById(this.inputId); }

    updateMetrics() {
      const area = this.area || document.getElementById(this.areaId);
      if (!area?.isConnected) return;
      const height = Math.max(58, Math.ceil(area.getBoundingClientRect().height || area.offsetHeight || 0));
      document.documentElement.style.setProperty('--assistant-composer-height', `${height}px`);
    }

    ensure() {
      const workspace = this.workspace || document.querySelector(this.workspaceSelector);
      const area = this.area || document.getElementById(this.areaId);
      if (!workspace || !area) return false;
      this.workspace = workspace;
      this.area = area;
      if (!area.isConnected || area.parentElement !== workspace) workspace.append(area);
      this.updateMetrics();
      return true;
    }

    resizeInput() {
      this.ensure();
      const input = this.input();
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = `${Math.min(180, input.scrollHeight)}px`;
      this.updateMetrics();
    }

    syncViewport() {
      const visualHeight = Number(globalThis.visualViewport?.height || 0);
      const visualTop = Number(globalThis.visualViewport?.offsetTop || 0);
      const layoutHeight = Number(globalThis.innerHeight || document.documentElement.clientHeight || 0);
      const height = Math.max(180, Math.round(visualHeight > 0 ? visualHeight : layoutHeight));
      document.documentElement.style.setProperty('--assistant-window-height', `${height}px`);
      document.documentElement.style.setProperty('--assistant-viewport-top', `${Math.max(0, Math.round(visualTop))}px`);
      document.body?.classList.toggle('assistant-compact-height', height < 300);
      this.ensure();
    }

    scheduleViewport(delay = 0) {
      clearTimeout(this.viewportTimer);
      this.viewportTimer = setTimeout(() => {
        this.syncViewport();
        requestAnimationFrame(() => this.updateMetrics());
      }, delay);
    }

    bind() {
      this.workspace = document.querySelector(this.workspaceSelector);
      this.area = document.getElementById(this.areaId);
      this.ensure();
      if (typeof MutationObserver === 'function' && this.workspace) {
        this.observer = new MutationObserver(records => {
          if (records.some(record => record.type === 'childList' && !this.area?.isConnected)) this.ensure();
        });
        this.observer.observe(this.workspace, { childList: true });
      }
      if (typeof ResizeObserver === 'function' && this.area) {
        this.resizeObserver = new ResizeObserver(() => this.updateMetrics());
        this.resizeObserver.observe(this.area);
      }
      this.syncViewport();
      globalThis.visualViewport?.addEventListener('resize', () => this.scheduleViewport(20));
      globalThis.addEventListener('resize', () => this.scheduleViewport(20));
      globalThis.addEventListener('orientationchange', () => this.scheduleViewport(140));
      window.addEventListener('pageshow', () => { this.ensure(); this.scheduleViewport(0); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.ensure(); this.scheduleViewport(0); } });
      document.addEventListener('focusin', event => { if (event.target === this.input()) this.ensure(); });
      document.addEventListener('focusout', () => setTimeout(() => this.ensure(), 80));
    }
  }

  root.composer = { ComposerController };
})();
