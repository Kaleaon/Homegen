/**
 * Onboarding Tour & Welcome Wizard Engine for Homegen
 * Renders SVG mask spotlights, dynamic focus rings, and accessible popover dialogs.
 */

export const STORAGE_KEY = 'homegen_onboarding_status';

export function getOnboardingStatus() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setOnboardingStatus(status) {
  try {
    localStorage.setItem(STORAGE_KEY, status);
  } catch {
    /* ignore storage write restriction */
  }
}

export function resetOnboardingStatus() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore storage restriction */
  }
}

export const TOUR_STEPS = [
  {
    id: 'build-palette',
    target: '#tabs',
    fallbackTarget: '#left',
    title: '1. Build & Catalog Palette',
    description:
      'Browse tabs for 2D room shapes, furniture items, wall & floor finishes, or pre-built room kits to add to your floor plan.',
    preferredPosition: 'right',
  },
  {
    id: 'canvas',
    target: '#plan',
    fallbackTarget: '#stage',
    title: '2. Interactive Canvas',
    description:
      'Click and drag on virtual grid paper to draw rooms and place items. Drag walls or corners to resize with magnetic grid snapping.',
    preferredPosition: 'bottom',
  },
  {
    id: 'view-controls',
    target: '#toolbar',
    fallbackTarget: '#stage',
    title: '3. View & Drafting Controls',
    description:
      'Switch between 2D drafting and 3D walkthrough rendering modes, select drafting tools, and adjust zoom levels.',
    preferredPosition: 'bottom',
  },
  {
    id: 'auto-comply',
    target: '#auto',
    fallbackTarget: 'header#top',
    title: '4. Automatic Code Compliance',
    description:
      'Real-time building code engine evaluates IRC and NEC requirements, automatically adding required outlets, doors, and alarms after edits.',
    preferredPosition: 'bottom',
  },
  {
    id: 'export',
    target: '#export-pdf',
    fallbackTarget: '#svg-btn',
    title: '5. Export & Vector PDF',
    description:
      'Export professional scaled vector PDFs, print sheets, SVG schedule blocks, blueprint tracing images, or photorealistic AI renderings.',
    preferredPosition: 'bottom',
  },
];

export class OnboardingTour {
  constructor(steps = TOUR_STEPS) {
    this.steps = steps;
    this.currentIndex = 0;
    this.active = false;
    this.overlayEl = null;
    this.popoverEl = null;
    this.svgEl = null;
    this.pathEl = null;
    this.ringEl = null;
    this.previousFocusEl = null;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.currentIndex = 0;
    this.previousFocusEl = document.activeElement;

    this.createDom();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('scroll', this.onResize, true);

    this.renderStep(this.currentIndex);
  }

  createDom() {
    let overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay';

    overlay.innerHTML = `
      <svg class="onboarding-svg" aria-hidden="true">
        <defs>
          <filter id="spotlight-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <path class="onboarding-mask-path" fill-rule="evenodd" d="" />
        <rect class="onboarding-focus-ring" rx="8" ry="8" />
      </svg>
      <div id="onboarding-popover" class="onboarding-popover k-overlay-dialog" role="dialog" aria-modal="true" aria-labelledby="spotlight-title" aria-describedby="spotlight-desc">
        <div class="spotlight-header">
          <span id="spotlight-step-badge" class="spotlight-badge">Step 1 of 5</span>
          <button type="button" class="spotlight-close" aria-label="Close tour">✕</button>
        </div>
        <h3 id="spotlight-title" class="spotlight-title"></h3>
        <p id="spotlight-desc" class="spotlight-desc"></p>
        <div class="spotlight-footer">
          <button type="button" class="spotlight-btn spotlight-btn-skip">Skip</button>
          <div class="spotlight-nav-btns">
            <button type="button" class="spotlight-btn spotlight-btn-back">Back</button>
            <button type="button" class="spotlight-btn spotlight-btn-next primary">Next</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    this.overlayEl = overlay;
    this.popoverEl = overlay.querySelector('#onboarding-popover');
    this.svgEl = overlay.querySelector('.onboarding-svg');
    this.pathEl = overlay.querySelector('.onboarding-mask-path');
    this.ringEl = overlay.querySelector('.onboarding-focus-ring');

    const closeBtn = overlay.querySelector('.spotlight-close');
    const skipBtn = overlay.querySelector('.spotlight-btn-skip');
    const backBtn = overlay.querySelector('.spotlight-btn-back');
    const nextBtn = overlay.querySelector('.spotlight-btn-next');

    closeBtn?.addEventListener('click', () => this.end('skipped'));
    skipBtn?.addEventListener('click', () => this.end('skipped'));
    backBtn?.addEventListener('click', () => this.prevStep());
    nextBtn?.addEventListener('click', () => this.nextStep());
  }

  getTargetElement(step) {
    let el = document.querySelector(step.target);
    if (!el && step.fallbackTarget) {
      el = document.querySelector(step.fallbackTarget);
    }
    if (!el && step.target === '#auto') {
      el = document.querySelector('header#top');
    }
    return el;
  }

  renderStep(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.currentIndex = index;
    const step = this.steps[index];

    let targetEl = this.getTargetElement(step);

    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    const badge = this.overlayEl?.querySelector('#spotlight-step-badge');
    const title = this.overlayEl?.querySelector('#spotlight-title');
    const desc = this.overlayEl?.querySelector('#spotlight-desc');
    const backBtn = this.overlayEl?.querySelector('.spotlight-btn-back');
    const nextBtn = this.overlayEl?.querySelector('.spotlight-btn-next');

    if (badge) badge.textContent = `Step ${index + 1} of ${this.steps.length}`;
    if (title) title.textContent = step.title;
    if (desc) desc.textContent = step.description;

    if (backBtn) {
      backBtn.disabled = index === 0;
      if (index === 0) backBtn.setAttribute('aria-disabled', 'true');
      else backBtn.removeAttribute('aria-disabled');
    }

    if (nextBtn) {
      const isLast = index === this.steps.length - 1;
      nextBtn.textContent = isLast ? 'Finish' : 'Next';
    }

    this.updatePosition();

    // Set focus to next button for accessibility
    setTimeout(() => {
      if (nextBtn) nextBtn.focus();
    }, 50);
  }

  updatePosition() {
    if (!this.active || !this.steps[this.currentIndex]) return;
    const step = this.steps[this.currentIndex];
    const targetEl = this.getTargetElement(step);

    const vpWidth = window.innerWidth || document.documentElement.clientWidth;
    const vpHeight = window.innerHeight || document.documentElement.clientHeight;

    let rect;
    if (targetEl) {
      const rawRect = targetEl.getBoundingClientRect();
      if (rawRect.width > 0 && rawRect.height > 0) {
        rect = rawRect;
      }
    }

    // Default rect if target not found or hidden
    if (!rect) {
      const w = 320;
      const h = 200;
      rect = {
        left: (vpWidth - w) / 2,
        top: (vpHeight - h) / 2,
        right: (vpWidth + w) / 2,
        bottom: (vpHeight + h) / 2,
        width: w,
        height: h,
      };
    }

    const pad = 8;
    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const w = Math.min(vpWidth - x, rect.width + pad * 2);
    const h = Math.min(vpHeight - y, rect.height + pad * 2);
    const r = 8;

    // SVG EvenOdd Mask Path: Screen Outer Rectangle + Target Hole
    const pathD = `
      M 0 0 H ${vpWidth} V ${vpHeight} H 0 Z
      M ${x + r} ${y}
      h ${w - r * 2}
      a ${r} ${r} 0 0 1 ${r} ${r}
      v ${h - r * 2}
      a ${r} ${r} 0 0 1 -${r} ${r}
      h -${w - r * 2}
      a ${r} ${r} 0 0 1 -${r} -${r}
      v -${h - r * 2}
      a ${r} ${r} 0 0 1 ${r} -${r}
      Z
    `.replace(/\s+/g, ' ');

    if (this.pathEl) this.pathEl.setAttribute('d', pathD);

    if (this.ringEl) {
      this.ringEl.setAttribute('x', String(x));
      this.ringEl.setAttribute('y', String(y));
      this.ringEl.setAttribute('width', String(w));
      this.ringEl.setAttribute('height', String(h));
    }

    // Position Popover Card near target
    if (this.popoverEl) {
      const popoverRect = this.popoverEl.getBoundingClientRect();
      const popWidth = popoverRect.width || 340;
      const popHeight = popoverRect.height || 220;

      let popLeft;
      let popTop;

      const prefPos = step.preferredPosition || 'bottom';

      if (prefPos === 'right' && x + w + popWidth + 20 <= vpWidth) {
        popLeft = x + w + 14;
        popTop = Math.max(14, Math.min(vpHeight - popHeight - 14, y + h / 2 - popHeight / 2));
      } else if (prefPos === 'left' && x - popWidth - 20 >= 0) {
        popLeft = x - popWidth - 14;
        popTop = Math.max(14, Math.min(vpHeight - popHeight - 14, y + h / 2 - popHeight / 2));
      } else if (prefPos === 'top' && y - popHeight - 20 >= 0) {
        popLeft = Math.max(14, Math.min(vpWidth - popWidth - 14, x + w / 2 - popWidth / 2));
        popTop = y - popHeight - 14;
      } else {
        // Default to bottom or centered fit
        if (y + h + popHeight + 20 <= vpHeight) {
          popLeft = Math.max(14, Math.min(vpWidth - popWidth - 14, x + w / 2 - popWidth / 2));
          popTop = y + h + 14;
        } else if (y - popHeight - 14 >= 0) {
          popLeft = Math.max(14, Math.min(vpWidth - popWidth - 14, x + w / 2 - popWidth / 2));
          popTop = y - popHeight - 14;
        } else {
          popLeft = Math.max(14, (vpWidth - popWidth) / 2);
          popTop = Math.max(14, (vpHeight - popHeight) / 2);
        }
      }

      if (this.popoverEl.style) {
        this.popoverEl.style.left = `${popLeft}px`;
        this.popoverEl.style.top = `${popTop}px`;
      }
    }
  }

  nextStep() {
    if (this.currentIndex >= this.steps.length - 1) {
      this.end('completed');
    } else {
      this.renderStep(this.currentIndex + 1);
    }
  }

  prevStep() {
    if (this.currentIndex > 0) {
      this.renderStep(this.currentIndex - 1);
    }
  }

  onKeyDown(e) {
    if (!this.active) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.end('skipped');
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.nextStep();
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.prevStep();
      return;
    }

    if (e.key === 'Tab') {
      this.trapFocus(e);
    }
  }

  trapFocus(e) {
    if (!this.popoverEl) return;
    const focusables = Array.from(
      this.popoverEl.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  onResize() {
    if (this.active) {
      this.updatePosition();
    }
  }

  end(status = 'completed') {
    if (!this.active) return;
    this.active = false;

    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onResize, true);

    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }

    setOnboardingStatus(status);

    if (this.previousFocusEl && typeof this.previousFocusEl.focus === 'function') {
      try {
        this.previousFocusEl.focus();
      } catch {
        /* ignore focus restore errors */
      }
    }
  }
}

export function checkOnboardingOnStartup(onShowWelcome) {
  const status = getOnboardingStatus();
  if (!status && typeof onShowWelcome === 'function') {
    onShowWelcome();
  }
}
