"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const webDir = path.join(repoRoot, "web");
const htmlPath = path.join(webDir, "index.html");
const overlaysCssPath = path.join(webDir, "css/overlays.css");
const appJsPath = path.join(webDir, "js/app.js");

function extractDialogBlock(html, dialogId) {
  const regex = new RegExp(`<dialog\\s+id="${dialogId}"[\\s\\S]*?<\\/dialog>`);
  const match = html.match(regex);
  return match ? match[0] : "";
}

function createMockNode(tagName, opts = {}) {
  const attrs = new Map(Object.entries(opts.attrs || {}));
  const classes = new Set(opts.classes || []);
  const listeners = new Map();
  const children = [];

  const node = {
    tagName: tagName.toUpperCase(),
    id: opts.id || "",
    textContent: opts.textContent || "",
    hidden: Boolean(opts.hidden),
    disabled: Boolean(opts.disabled),
    open: Boolean(opts.open),
    parentElement: null,
    ownerDocument: null,
    dataset: { ...(opts.dataset || {}) },
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        const next = force === undefined ? !classes.has(name) : Boolean(force);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k.startsWith("data-")) {
        const camel = k
          .slice(5)
          .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        node.dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) {
      attrs.delete(k);
    },
    hasAttribute(k) {
      return attrs.has(k);
    },
    appendChild(child) {
      child.parentElement = node;
      child.ownerDocument = node.ownerDocument;
      children.push(child);
      return child;
    },
    closest(selector) {
      if (selector === "[hidden]") {
        let cur = node;
        while (cur) {
          if (cur.hidden || (cur.hasAttribute && cur.hasAttribute("hidden")))
            return cur;
          cur = cur.parentElement;
        }
      }
      return null;
    },
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, once: Boolean(options && options.once) });
    },
    removeEventListener(type, fn) {
      if (!listeners.has(type)) return;
      listeners.set(
        type,
        listeners.get(type).filter((entry) => entry.fn !== fn),
      );
    },
    dispatchEvent(evt) {
      const entries = [...(listeners.get(evt.type) || [])];
      for (const entry of entries) {
        if (entry.once) node.removeEventListener(evt.type, entry.fn);
        entry.fn(evt);
      }
    },
    focus() {
      if (node.ownerDocument) node.ownerDocument.activeElement = node;
    },
    click() {
      let prevented = false;
      node.dispatchEvent({
        type: "click",
        currentTarget: node,
        target: node,
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
    showModal() {
      node.open = true;
      node.hidden = false;
      node.setAttribute("open", "");
    },
    close() {
      node.open = false;
      node.removeAttribute("open");
      node.dispatchEvent({ type: "close", target: node });
    },
    querySelectorAll(selector) {
      const results = [];
      const parts = selector.split(",").map((s) => s.trim());
      const matches = (el) =>
        parts.some((p) => {
          if (p === "button") return el.tagName === "BUTTON";
          if (p === "[href]") return el.hasAttribute("href");
          if (p === "[data-select-tier]")
            return el.hasAttribute("data-select-tier");
          if (p.startsWith("#")) return el.id === p.slice(1);
          if (p.startsWith(".")) return el.classList.contains(p.slice(1));
          return false;
        });
      const visit = (el) => {
        for (const child of el._children) {
          if (matches(child)) results.push(child);
          visit(child);
        }
      };
      visit(node);
      return results;
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] || null;
    },
    _children: children,
  };

  return node;
}

test("export modals in web/index.html render plan tier badges and upgrade trigger banners", () => {
  const html = fs.readFileSync(htmlPath, "utf8");

  for (const [id, headerTier, upgradeTier, exportType] of [
    ["pdf-export", "pro", "pro", "pdf"],
    ["csv-export", "plus", "plus", "csv"],
    ["dxf-export", "pro", "pro", "dxf"],
  ]) {
    const block = extractDialogBlock(html, id);
    assert.ok(block, `#${id} must exist in web/index.html`);
    assert.ok(
      block.includes(`plan-tier-badge plan-tier-${headerTier}`),
      `#${id} must render ${headerTier} plan tier badge`,
    );
    assert.ok(
      block.includes('class="upgrade-trigger-banner"'),
      `#${id} must render .upgrade-trigger-banner`,
    );
    assert.match(
      block,
      new RegExp(
        `class="upgrade-trigger-link"[^>]*data-upgrade-tier="${upgradeTier}"[^>]*data-export-type="${exportType}"`,
      ),
      `#${id} must render .upgrade-trigger-link paywall trigger`,
    );
  }
});

test("web/css/overlays.css defines tier badge and upgrade banner classes using Ktheme tokens", () => {
  const css = fs.readFileSync(overlaysCssPath, "utf8");

  assert.ok(css.includes(".plan-tier-badge"));
  assert.ok(css.includes(".plan-tier-pro"));
  assert.ok(css.includes(".plan-tier-plus"));
  assert.ok(css.includes(".upgrade-trigger-banner"));
  assert.ok(css.includes(".upgrade-trigger-link"));
  assert.ok(css.includes("--metallic-gold-base"));
  assert.ok(css.includes("--ktheme-accent"));
});

test("web/js/app.js initializes tier badges on modal open and triggers upgrade prompts on link click", async () => {
  const appModule = await import(pathToFileURL(appJsPath).href);
  const { initExportModalTierState, bindUpgradeTriggerLinks } = appModule;

  const docMock = {
    activeElement: null,
    _root: createMockNode("body"),
    querySelector(sel) {
      return this._root.querySelector(sel);
    },
    querySelectorAll(sel) {
      return this._root.querySelectorAll(sel);
    },
  };
  docMock._root.ownerDocument = docMock;

  const dxfModal = docMock._root.appendChild(
    createMockNode("dialog", { id: "dxf-export" }),
  );
  const proBadge = dxfModal.appendChild(
    createMockNode("span", {
      classes: ["plan-tier-badge", "plan-tier-pro"],
      dataset: { tier: "pro" },
      textContent: "Pro",
    }),
  );
  const banner = dxfModal.appendChild(
    createMockNode("div", {
      classes: ["upgrade-trigger-banner"],
      dataset: { requiredTier: "pro" },
    }),
  );
  const link = banner.appendChild(
    createMockNode("a", {
      classes: ["upgrade-trigger-link"],
      attrs: {
        href: "#upgrade-plan",
        "data-upgrade-tier": "pro",
        "data-export-type": "dxf",
      },
      textContent: "Upgrade to Pro",
    }),
  );

  const upgradeDlg = docMock._root.appendChild(
    createMockNode("dialog", { id: "dlg-plan-upgrade" }),
  );
  upgradeDlg.appendChild(createMockNode("button", { id: "upgrade-close" }));
  const contextEl = upgradeDlg.appendChild(
    createMockNode("p", { id: "upgrade-prompt-context" }),
  );

  initExportModalTierState(dxfModal, "free");
  assert.equal(proBadge.dataset.tierState, "locked");
  assert.equal(banner.hidden, false);

  bindUpgradeTriggerLinks(docMock);
  const prevented = link.click();
  assert.equal(prevented, true);
  assert.equal(upgradeDlg.open, true);
  assert.match(contextEl.textContent, /DXF/i);
});
