/**
 * Ktheme Web Components Wrapper for UI Controls
 * Defines <k-button>, <k-tab>, <k-card>, <k-input>, <k-select>, <k-popover>, <k-kbd>
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
class KButton extends BaseElement {
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
        :host([disabled]) {
          pointer-events: none;
          cursor: default;
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
      if (this._btn && typeof this._btn.addEventListener === 'function') {
        this._btn.addEventListener('click', (e) => {
          if (this.disabled) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            return;
          }
          if (this.getAttribute('type') === 'submit') {
            const form = typeof this.closest === 'function' ? this.closest('form') : null;
            if (form) {
              const requiredInputs =
                typeof form.querySelectorAll === 'function'
                  ? form.querySelectorAll('k-input[required]')
                  : [];
              for (const ki of requiredInputs) {
                if (
                  ki._input &&
                  typeof ki._input.reportValidity === 'function' &&
                  !ki._input.reportValidity()
                ) {
                  return;
                }
              }
              if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
              } else if (typeof form.dispatchEvent === 'function') {
                const submitEvt = new Event('submit', { bubbles: true, cancelable: true });
                const notCancelled = form.dispatchEvent(submitEvt);
                if (notCancelled && form.getAttribute?.('method') === 'dialog') {
                  const dlg = typeof form.closest === 'function' ? form.closest('dialog') : null;
                  if (dlg && typeof dlg.close === 'function') {
                    dlg.close(this.getAttribute('value') || '');
                  }
                }
              }
            }
          }
        });
      }
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

  focus(options) {
    if (this._btn && typeof this._btn.focus === 'function') {
      this._btn.focus(options);
    } else if (typeof super.focus === 'function') {
      super.focus(options);
    }
  }

  blur() {
    if (this._btn && typeof this._btn.blur === 'function') {
      this._btn.blur();
    } else if (typeof super.blur === 'function') {
      super.blur();
    }
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
      'required',
      'autofocus',
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
        input[type="color"] {
          height: 30px;
          padding: 2px 4px;
          cursor: pointer;
        }
        input[type="range"] {
          padding: 4px 0;
          border: none;
          background: transparent;
          cursor: pointer;
          accent-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        input:hover,
        input:focus {
          border-color: var(--ktheme-accent, var(--accent, #2f6f5e));
        }
        :host(.invalid) input,
        :host(.error) input {
          border-color: var(--ktheme-critical, var(--err, #c43b3b));
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

      this._input.addEventListener('input', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (this._input.type !== 'file') {
          this.setAttribute('value', this._input.value);
        }
        this.dispatchEvent(
          new CustomEvent('input', {
            bubbles: true,
            composed: true,
            detail: { value: this._input.value },
          })
        );
      });

      this._input.addEventListener('change', () => {
        if (this._input.type !== 'file') {
          this.setAttribute('value', this._input.value);
        }
        this.dispatchEvent(
          new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: { value: this._input.value },
          })
        );
      });

      this._input.addEventListener('keydown', (e) => {
        if (e && e.key === 'Enter' && this._input.type !== 'file') {
          const form = typeof this.closest === 'function' ? this.closest('form') : null;
          if (form) {
            if (
              this._input.required &&
              typeof this._input.reportValidity === 'function' &&
              !this._input.reportValidity()
            ) {
              return;
            }
            if (typeof form.requestSubmit === 'function') {
              if (typeof e.preventDefault === 'function') e.preventDefault();
              form.requestSubmit();
            } else if (typeof form.dispatchEvent === 'function') {
              if (typeof e.preventDefault === 'function') e.preventDefault();
              const submitEvt = new Event('submit', { bubbles: true, cancelable: true });
              const notCancelled = form.dispatchEvent(submitEvt);
              if (notCancelled && form.getAttribute?.('method') === 'dialog') {
                const dlg = typeof form.closest === 'function' ? form.closest('dialog') : null;
                if (dlg && typeof dlg.close === 'function') dlg.close();
              }
            }
          }
        }
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
    if (this._input.type === 'file') {
      if (this.hasAttribute('value') && this.getAttribute('value') === '') {
        this._input.value = '';
      }
    } else if (this.hasAttribute('value') && this._input.value !== this.getAttribute('value')) {
      this._input.value = this.getAttribute('value');
    }
    this._input.disabled = this.hasAttribute('disabled');
    this._input.readOnly = this.hasAttribute('readonly');
    this._input.required = this.hasAttribute('required');
    this._input.autofocus = this.hasAttribute('autofocus');
  }

  get value() {
    return this._input ? this._input.value : this.getAttribute('value') || '';
  }

  set value(val) {
    const strVal = val == null ? '' : String(val);
    if (this._input && this._input.type === 'file') {
      if (strVal === '') {
        this.removeAttribute('value');
        this._input.value = '';
      }
      return;
    }
    this.setAttribute('value', strVal);
    if (this._input) {
      this._input.value = strVal;
    }
  }

  get files() {
    return this._input ? this._input.files : null;
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
class KTab extends BaseElement {
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

  focus(options) {
    if (this._btn && typeof this._btn.focus === 'function') {
      this._btn.focus(options);
    } else if (typeof super.focus === 'function') {
      super.focus(options);
    }
  }

  blur() {
    if (this._btn && typeof this._btn.blur === 'function') {
      this._btn.blur();
    } else if (typeof super.blur === 'function') {
      super.blur();
    }
  }
}

/**
 * <k-card>
 */
class KCard extends BaseElement {
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
      <select part="select"></select>
      <slot hidden></slot>
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
    if (!this._select || typeof this.querySelectorAll !== 'function') return;
    const lightOptions = Array.from(this.querySelectorAll('option'));
    const shadowOptions = Array.from(this._select.options || []);
    const same =
      lightOptions.length === shadowOptions.length &&
      lightOptions.every(
        (opt, idx) =>
          shadowOptions[idx] &&
          opt.value === shadowOptions[idx].value &&
          opt.textContent === shadowOptions[idx].textContent &&
          opt.disabled === shadowOptions[idx].disabled
      );
    if (!same) {
      const prevAttrVal = this.hasAttribute('value') ? this.getAttribute('value') : null;
      this._select.innerHTML = '';
      for (const opt of lightOptions) {
        const clone = opt.cloneNode(true);
        this._select.appendChild(clone);
      }
      const nextOptions = Array.from(this._select.options || []);
      if (prevAttrVal !== null && nextOptions.some((o) => o.value === prevAttrVal)) {
        this._select.value = prevAttrVal;
      } else if (prevAttrVal !== null && nextOptions.length > 0) {
        this.setAttribute('value', this._select.value);
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
      const opts = Array.from(this._select.options || []);
      if (opts.length === 0 || opts.some((o) => o.value === val)) {
        if (this._select.value !== val) {
          this._select.value = val;
        }
      }
    }
  }

  get value() {
    this._syncChildOptions();
    if (this._select && this._select.options && this._select.options.length > 0) {
      return this._select.value;
    }
    return this.getAttribute('value') || '';
  }

  set value(val) {
    const strVal = val == null ? '' : String(val);
    this.setAttribute('value', strVal);
    this._syncChildOptions();
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

/**
 * <k-popover>
 */
export class KPopover extends BaseElement {
  static get observedAttributes() {
    return ['open'];
  }

  constructor() {
    super();
    this._onDocumentClick = this._onDocumentClick.bind(this);
    this._onDocumentKeyDown = this._onDocumentKeyDown.bind(this);
    this._onTriggerClick = this._onTriggerClick.bind(this);

    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
      <style>
        ${KTHEME_STYLES}
        :host {
          display: inline-block;
          position: relative;
          box-sizing: border-box;
        }
        :host([hidden]) {
          display: none !important;
        }
        .popover-panel {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 1000;
          background: var(--ktheme-bg-surface, var(--panel, #fffdf9));
          border: 1px solid var(--ktheme-border, var(--line, #ded8cb));
          border-radius: var(--radius-sm, 6px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
          padding: 10px 12px;
          min-width: 220px;
          display: none;
          color: var(--ktheme-text, var(--ink, #2b2824));
          box-sizing: border-box;
        }
        :host([open]) .popover-panel {
          display: block;
        }
      </style>
      <div part="trigger" class="trigger-wrapper">
        <slot name="trigger"></slot>
      </div>
      <div part="panel" class="popover-panel" role="region" aria-label="Popover panel">
        <slot></slot>
      </div>
    `;
      this._triggerSlot = this.shadowRoot.querySelector('slot[name="trigger"]');
    }
  }

  connectedCallback() {
    if (this._triggerSlot) {
      this._triggerSlot.addEventListener('click', this._onTriggerClick);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this._onDocumentClick, true);
      document.addEventListener('keydown', this._onDocumentKeyDown, true);
    }
    this._syncAttributes();
  }

  disconnectedCallback() {
    if (this._triggerSlot) {
      this._triggerSlot.removeEventListener('click', this._onTriggerClick);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this._onDocumentClick, true);
      document.removeEventListener('keydown', this._onDocumentKeyDown, true);
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncAttributes();
  }

  _getTriggerElement() {
    if (this._triggerSlot && typeof this._triggerSlot.assignedElements === 'function') {
      const elems = this._triggerSlot.assignedElements({ flatten: true });
      if (elems && elems.length > 0) return elems[0];
    }
    if (typeof this.querySelector === 'function') {
      return this.querySelector('[slot="trigger"]') || this;
    }
    return this;
  }

  _syncAttributes() {
    const isOpen = this.hasAttribute('open');
    const trigger = this._getTriggerElement();
    if (trigger && typeof trigger.setAttribute === 'function') {
      trigger.setAttribute('aria-expanded', String(isOpen));
      trigger.setAttribute('aria-haspopup', 'true');
    }
    if (typeof this.setAttribute === 'function' && this !== trigger) {
      this.setAttribute('aria-expanded', String(isOpen));
      this.setAttribute('aria-haspopup', 'true');
    }
  }

  _onTriggerClick(e) {
    if (typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    const trigger = this._getTriggerElement();
    if (
      (typeof this.hasAttribute === 'function' && this.hasAttribute('disabled')) ||
      (trigger &&
        (trigger.disabled ||
          (typeof trigger.hasAttribute === 'function' && trigger.hasAttribute('disabled'))))
    ) {
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      return;
    }
    this.open = !this.open;
  }

  _onDocumentClick(e) {
    if (!this.open) return;
    if (typeof e.composedPath === 'function') {
      const path = e.composedPath();
      if (path && path.includes(this)) return;
    } else if (this.contains && this.contains(e.target)) {
      return;
    }
    this.open = false;
  }

  _onDocumentKeyDown(e) {
    if (!this.open) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.open = false;
      const trigger = this._getTriggerElement();
      if (trigger && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    }
  }

  get open() {
    return typeof this.hasAttribute === 'function' ? this.hasAttribute('open') : false;
  }

  set open(val) {
    const bool = Boolean(val);
    const wasOpen = this.open;
    reflectBooleanAttr(this, 'open', bool);
    this._syncAttributes();
    if (wasOpen !== bool && typeof this.dispatchEvent === 'function') {
      this.dispatchEvent(
        new CustomEvent('toggle', {
          bubbles: true,
          composed: true,
          detail: { open: bool },
        })
      );
    }
  }

  toggle() {
    this.open = !this.open;
  }
}

/**
 * <k-kbd>
 */
export class KKbd extends BaseElement {
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
          vertical-align: baseline;
        }
        :host([hidden]) {
          display: none !important;
        }
        kbd {
          display: inline-block;
          padding: 2px 6px;
          font-family: var(--font-family-mono);
          font-size: var(--font-size-xs, 11px);
          line-height: 1.2;
          color: var(--ktheme-text);
          background-color: var(--ktheme-bg-elevated);
          border: 1px solid var(--ktheme-border);
          border-radius: var(--radius-xs, 4px);
          box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.15);
          box-sizing: border-box;
        }
      </style>
      <kbd part="kbd"><slot></slot></kbd>
    `;
    }
  }
}

// Register Custom Elements
if (
  typeof customElements !== 'undefined' &&
  typeof customElements.get === 'function' &&
  typeof customElements.define === 'function'
) {
  if (!customElements.get('k-button')) customElements.define('k-button', KButton);
  if (!customElements.get('k-input')) customElements.define('k-input', KInput);
  if (!customElements.get('k-select')) customElements.define('k-select', KSelect);
  if (!customElements.get('k-tab')) customElements.define('k-tab', KTab);
  if (!customElements.get('k-card')) customElements.define('k-card', KCard);
  if (!customElements.get('k-popover')) customElements.define('k-popover', KPopover);
  if (!customElements.get('k-kbd')) customElements.define('k-kbd', KKbd);
}
