export const SINGLE_KEY_SHORTCUTS_KEY = 'homegen_disable_single_key_shortcuts';

let memoryDisableSingleKeyShortcuts = false;
let hasMemoryShortcutOverride = false;

export function isSingleKeyShortcutDisabled() {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SINGLE_KEY_SHORTCUTS_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
      return hasMemoryShortcutOverride ? memoryDisableSingleKeyShortcuts : false;
    }
  } catch {
    /* Fall back to default active state (false) if localStorage access throws */
    return hasMemoryShortcutOverride ? memoryDisableSingleKeyShortcuts : false;
  }
  return hasMemoryShortcutOverride ? memoryDisableSingleKeyShortcuts : false;
}

export function writeSingleKeyShortcutDisabled(disabled) {
  const next = Boolean(disabled);
  memoryDisableSingleKeyShortcuts = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SINGLE_KEY_SHORTCUTS_KEY, String(next));
      hasMemoryShortcutOverride = false;
    } else {
      hasMemoryShortcutOverride = true;
    }
  } catch {
    /* Fall back to in-memory session state if localStorage write throws */
    hasMemoryShortcutOverride = true;
  }
  return next;
}
