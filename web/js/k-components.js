/**
 * Ktheme Web Components Wrapper for UI Controls
 * Defines <k-button>, <k-tab>, <k-card>, <k-input>, <k-select>
 */

const KTHEME_STYLES = `
  :host {
    --focus-ring-color: var(--ktheme-accent, var(--accent, #2f6f5e));
    --focus-ring-width: 2px;
    --focus-ring-offset: 2px;
  }
`;

function reflectBooleanAttr(elem, attrName, val) {
  if (val) {
    elem.setAttribute(attrName, '');
  } else {
    elem.removeAttribute(attrName);
  }
}

const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

/**
 * <k-button>
 */
export class KButton extends BaseElement {
  static get observedAttributes() {
    return ['disabled', 'primary', 'active', 'on', 'title', 'type'];
  }

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
      <style>
        ${KTHEME_STYLES}
        :host {
          display: inline-block;
          box-sizing: border-box;
        }
        :host([hidden]) {
          display: none !important;
        }
        button {
          font: inherit;
          color: var(--ktheme-text, var(--ink, #2b2824));
          background: var(--ktheme-bg-surface, var(--panel, #fffdf9));
          border: 1px solid var(--ktheme-border, var(--line, #ded8cb));
          border-radius: var(--radius-sm, 6px);
          padding: 5px 10px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        button:hover {
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        :host([primary]) button,
        :host([active]) button,
        :host([on]) button,
        button.primary,
        button.on {
          background: var(--ktheme-accent, var(--accent, #2f6f5e));
          color: var(--ktheme-accent-ink, var(--accent-ink, #ffffff));
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        :host([disabled]) button,
        button:disabled {
          opacity: 0.4;
          cursor: default;
          pointer-events: none;
        }
        :focus:not(:focus-visible),
        button:focus:not(:focus-visible) {
          outline: none;
        }
        :host(:focus-visible) button,
        button:focus-visible {
          outline: var(--focus-ring-width) solid var(--focus-ring-color);
          outline-offset: var(--focus-ring-offset);
          position: relative;
          z-index: 1;
        }
      </style>
      <button part="button" type="button"><slot></slot></button>
    `;
      this._btn = this.shadowRoot.querySelector('button');
    }
  }

  connectedCallback() {
    this._syncAttributes();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncAttributes();
  }

  _syncAttributes() {
    if (!this._btn) return;
    this._btn.disabled = this.hasAttribute('disabled');
    if (this.hasAttribute('title')) {
      this._btn.title = this.getAttribute('title');
    } else {
      this._btn.removeAttribute('title');
    }
    const isPrimary = this.hasAttribute('primary');
    const isActive =
      this.hasAttribute('active') ||
      this.hasAttribute('on') ||
      this.classList.contains('on') ||
      this.classList.contains('primary');
    this._btn.classList.toggle('primary', isPrimary);
    this._btn.classList.toggle('on', isActive);
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    reflectBooleanAttr(this, 'disabled', val);
    this._syncAttributes();
  }

  get primary() {
    return this.hasAttribute('primary');
  }

  set primary(val) {
    reflectBooleanAttr(this, 'primary', val);
    this._syncAttributes();
  }

  get active() {
    return this.hasAttribute('active') || this.hasAttribute('on');
  }

  set active(val) {
    reflectBooleanAttr(this, 'active', val);
    this._syncAttributes();
  }

  click() {
    if (this.disabled) return;
    if (this._btn) this._btn.click();
  }
}

/**
 * <k-input>
 */
export class KInput extends BaseElement {
  static get observedAttributes() {
    return [
      'value',
      'type',
      'placeholder',
      'disabled',
      'readonly',
      'min',
      'max',
      'step',
      'accept',
      'aria-label',
      'aria-labelledby',
    ];
  }

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
      <style>
        ${KTHEME_STYLES}
        :host {
          display: inline-block;
          box-sizing: border-box;
        }
        :host([hidden]) {
          display: none !important;
        }
        input {
          font: inherit;
          color: var(--ktheme-text, var(--ink, #2b2824));
          background: var(--ktheme-bg-surface, var(--panel, #fffdf9));
          border: 1px solid var(--ktheme-border, var(--line, #ded8cb));
          border-radius: var(--radius-sm, 6px);
          padding: 4px 8px;
          width: 100%;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s;
        }
        input:hover,
        input:focus {
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        :focus:not(:focus-visible),
        input:focus:not(:focus-visible) {
          outline: none;
        }
        :host(:focus-visible) input,
        input:focus-visible {
          outline: var(--focus-ring-width) solid var(--focus-ring-color);
          outline-offset: var(--focus-ring-offset);
          position: relative;
          z-index: 1;
        }
      </style>
      <input part="input" type="text" />
    `;
      this._input = this.shadowRoot.querySelector('input');

      this._input.addEventListener('input', () => {
        this.setAttribute('value', this._input.value);
        this.dispatchEvent(
          new CustomEvent('input', {
            bubbles: true,
            composed: true,
            detail: { value: this._input.value },
          })
        );
      });

      this._input.addEventListener('change', () => {
        this.setAttribute('value', this._input.value);
        this.dispatchEvent(
          new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { value: this._input.value },
          })
        );
      });
    }
  }

  connectedCallback() {
    this._syncAttributes();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncAttributes();
  }

  _syncAttributes() {
    if (!this._input) return;
    const attrs = [
      'type',
      'placeholder',
      'min',
      'max',
      'step',
      'accept',
      'aria-label',
      'aria-labelledby',
    ];
    for (const a of attrs) {
      if (this.hasAttribute(a)) {
        this._input.setAttribute(a, this.getAttribute(a));
      } else {
        this._input.removeAttribute(a);
      }
    }
    if (this.hasAttribute('value') && this._input.value !== this.getAttribute('value')) {
      this._input.value = this.getAttribute('value');
    }
    this._input.disabled = this.hasAttribute('disabled');
    this._input.readOnly = this.hasAttribute('readonly');
  }

  get value() {
    return this._input ? this._input.value : this.getAttribute('value') || '';
  }

  set value(val) {
    const strVal = val == null ? '' : String(val);
    this.setAttribute('value', strVal);
    if (this._input) {
      this._input.value = strVal;
    }
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    reflectBooleanAttr(this, 'disabled', val);
    this._syncAttributes();
  }

  focus(options) {
    if (this._input) {
      this._input.focus(options);
    } else if (typeof super.focus === 'function') {
      super.focus(options);
    }
  }

  blur() {
    if (this._input) {
      this._input.blur();
    } else if (typeof super.blur === 'function') {
      super.blur();
    }
  }

  select() {
    if (this._input && typeof this._input.select === 'function') {
      this._input.select();
    }
  }

  setSelectionRange(...args) {
    if (this._input && typeof this._input.setSelectionRange === 'function') {
      this._input.setSelectionRange(...args);
    }
  }

  get selectionStart() {
    return this._input ? this._input.selectionStart : 0;
  }

  get selectionEnd() {
    return this._input ? this._input.selectionEnd : 0;
  }
}

/**
 * <k-tab>
 */
export class KTab extends BaseElement {
  static get observedAttributes() {
    return ['active', 'selected', 'disabled', 'data-tab'];
  }

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
      <style>
        ${KTHEME_STYLES}
        :host {
          display: inline-block;
          box-sizing: border-box;
        }
        :host([hidden]) {
          display: none !important;
        }
        button {
          font: inherit;
          color: var(--ktheme-text-muted, var(--muted, #5f5950));
          background: var(--ktheme-bg-surface, var(--panel, #fffdf9));
          border: 1px solid var(--ktheme-border, var(--line, #ded8cb));
          border-radius: var(--radius-sm, 6px);
          padding: 6px 12px;
          cursor: pointer;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          transition: all 0.15s;
        }
        button:hover {
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
          color: var(--ktheme-text, var(--ink, #2b2824));
        }
        :host([active]) button,
        :host([selected]) button,
        :host(.on) button,
        button.on {
          background: var(--ktheme-accent, var(--accent, #2f6f5e));
          color: var(--ktheme-accent-ink, var(--accent-ink, #ffffff));
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        :host([disabled]) button,
        button:disabled {
          opacity: 0.4;
          cursor: default;
          pointer-events: none;
        }
        :focus:not(:focus-visible),
        button:focus:not(:focus-visible) {
          outline: none;
        }
        :host(:focus-visible) button,
        button:focus-visible {
          outline: var(--focus-ring-width) solid var(--focus-ring-color);
          outline-offset: var(--focus-ring-offset);
          position: relative;
          z-index: 1;
        }
      </style>
      <button part="tab" type="button"><slot></slot></button>
    `;
      this._btn = this.shadowRoot.querySelector('button');
    }
  }

  connectedCallback() {
    this._syncAttributes();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncAttributes();
  }

  _syncAttributes() {
    if (!this._btn) return;
    const isActive =
      this.hasAttribute('active') || this.hasAttribute('selected') || this.classList.contains('on');
    this._btn.classList.toggle('on', isActive);
    this._btn.disabled = this.hasAttribute('disabled');
  }

  get active() {
    return this.hasAttribute('active') || this.hasAttribute('selected');
  }

  set active(val) {
    reflectBooleanAttr(this, 'active', val);
    if (val) this.classList.add('on');
    else this.classList.remove('on');
    this._syncAttributes();
  }

  get selected() {
    return this.active;
  }

  set selected(val) {
    this.active = val;
  }

  click() {
    if (this.hasAttribute('disabled')) return;
    if (this._btn) this._btn.click();
  }
}

/**
 * <k-card>
 */
export class KCard extends BaseElement {
  static get observedAttributes() {
    return ['active', 'selected', 'primary', 'disabled'];
  }

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
      <style>
        ${KTHEME_STYLES}
        :host {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 6px;
          text-align: left;
          font-size: var(--font-size-sm, 12px);
          line-height: var(--line-height-tight, 1.25);
          background: var(--ktheme-bg-surface, var(--panel, #fffdf9));
          border: 1px solid var(--ktheme-border, var(--line, #ded8cb));
          border-radius: var(--radius-sm, 6px);
          cursor: pointer;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        :host(:hover) {
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        :host([active]),
        :host([selected]),
        :host([primary]),
        :host(.on) {
          box-shadow: 0 0 0 2px var(--ktheme-accent, var(--accent, #2f6f5e));
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        :host([disabled]) {
          opacity: 0.4;
          cursor: default;
          pointer-events: none;
        }
        :host(:focus-visible) {
          outline: var(--focus-ring-width) solid var(--focus-ring-color);
          outline-offset: var(--focus-ring-offset);
        }
        ::slotted(.sw) {
          height: 34px;
          border-radius: 4px;
          border: 1px solid rgba(0, 0, 0, 0.15);
        }
        ::slotted(small) {
          color: var(--ktheme-text-muted, var(--muted, #5f5950));
        }
      </style>
      <slot></slot>
    `;
    }
  }

  connectedCallback() {
    if (typeof this.hasAttribute === 'function' && !this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '0');
    }
    if (typeof this.addEventListener === 'function') {
      this.addEventListener('keydown', this._onKeyDown);
    }
  }

  disconnectedCallback() {
    if (typeof this.removeEventListener === 'function') {
      this.removeEventListener('keydown', this._onKeyDown);
    }
  }

  _onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.click();
    }
  }

  get active() {
    return this.hasAttribute('active') || this.hasAttribute('selected');
  }

  set active(val) {
    reflectBooleanAttr(this, 'active', val);
    if (val) this.classList.add('on');
    else this.classList.remove('on');
  }

  get selected() {
    return this.active;
  }

  set selected(val) {
    this.active = val;
  }
}

/**
 * <k-select>
 */
export class KSelect extends BaseElement {
  static get observedAttributes() {
    return ['value', 'disabled', 'aria-label', 'aria-labelledby', 'name'];
  }

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
      <style>
        ${KTHEME_STYLES}
        :host {
          display: inline-block;
          box-sizing: border-box;
          min-width: 24px;
          min-height: 24px;
        }
        :host([hidden]) {
          display: none !important;
        }
        select {
          font: inherit;
          color: var(--ktheme-text, var(--ink, #2b2824));
          background: var(--ktheme-bg-surface, var(--panel, #fffdf9));
          border: 1px solid var(--ktheme-border, var(--line, #ded8cb));
          border-radius: var(--radius-sm, 6px);
          padding: 4px 8px;
          width: 100%;
          min-height: 24px;
          min-width: 24px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
          cursor: pointer;
        }
        select:hover,
        select:focus {
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        :focus:not(:focus-visible),
        select:focus:not(:focus-visible) {
          outline: none;
        }
        :host(:focus-visible) select,
        select:focus-visible {
          outline: var(--focus-ring-width) solid var(--focus-ring-color);
          outline-offset: var(--focus-ring-offset);
          position: relative;
          z-index: 1;
        }
      </style>
      <select part="select"><slot></slot></select>
    `;
      this._select = this.shadowRoot.querySelector('select');
      this._slot = this.shadowRoot.querySelector('slot');

      const syncOptionsAndValue = () => {
        this._syncChildOptions();
        this._syncAttributes();
      };

      if (this._slot) {
        this._slot.addEventListener('slotchange', syncOptionsAndValue);
      }

      this._select.addEventListener('change', () => {
        this.setAttribute('value', this._select.value);
        this.dispatchEvent(
          new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { value: this._select.value },
          })
        );
      });
    }
  }

  connectedCallback() {
    this._syncChildOptions();
    this._syncAttributes();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncAttributes();
  }

  _syncChildOptions() {
    if (!this._select) return;
    const lightOptions = Array.from(this.querySelectorAll('option'));
    if (lightOptions.length > 0) {
      if (this._select.options.length !== lightOptions.length) {
        this._select.innerHTML = '';
        for (const opt of lightOptions) {
          const clone = opt.cloneNode(true);
          this._select.appendChild(clone);
        }
      }
    }
  }

  _syncAttributes() {
    if (!this._select) return;
    const attrs = ['aria-label', 'aria-labelledby', 'name'];
    for (const a of attrs) {
      if (this.hasAttribute(a)) {
        this._select.setAttribute(a, this.getAttribute(a));
      } else {
        this._select.removeAttribute(a);
      }
    }
    this._select.disabled = this.hasAttribute('disabled');
    if (this.hasAttribute('value')) {
      const val = this.getAttribute('value');
      if (this._select.value !== val) {
        this._select.value = val;
      }
    }
  }

  get value() {
    if (this._select && this._select.options.length > 0) {
      return this._select.value;
    }
    return this.getAttribute('value') || '';
  }

  set value(val) {
    const strVal = val == null ? '' : String(val);
    this.setAttribute('value', strVal);
    if (this._select) {
      this._select.value = strVal;
    }
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    reflectBooleanAttr(this, 'disabled', val);
    this._syncAttributes();
  }

  focus(options) {
    if (this._select) {
      this._select.focus(options);
    } else if (typeof super.focus === 'function') {
      super.focus(options);
    }
  }

  blur() {
    if (this._select) {
      this._select.blur();
    } else if (typeof super.blur === 'function') {
      super.blur();
    }
  }
}

// Register Custom Elements
if (typeof customElements !== 'undefined') {
  if (!customElements.get('k-button')) customElements.define('k-button', KButton);
  if (!customElements.get('k-input')) customElements.define('k-input', KInput);
  if (!customElements.get('k-select')) customElements.define('k-select', KSelect);
  if (!customElements.get('k-tab')) customElements.define('k-tab', KTab);
  if (!customElements.get('k-card')) customElements.define('k-card', KCard);
}
