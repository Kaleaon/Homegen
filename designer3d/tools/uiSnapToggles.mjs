import { SNAP_MODES } from './snapModes.mjs';
import { DEFAULT_GRID_SETTINGS } from './gridSettings.mjs';

export const SNAP_TOGGLE_DEFINITIONS = [
  {
    id: SNAP_MODES.GRID,
    label: 'Grid Snap',
    description: 'Snap to major grid spacing.',
    category: 'basic',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
  {
    id: SNAP_MODES.EDGE,
    label: 'Edge Snap',
    description: 'Snap to nearest wall/room edge.',
    category: 'basic',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
  {
    id: SNAP_MODES.MIDPOINT,
    label: 'Midpoint Snap',
    description: 'Snap to edge midpoints for centered placement.',
    category: 'advanced',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
  {
    id: SNAP_MODES.PERPENDICULAR,
    label: 'Perpendicular Snap',
    description: 'Constrain direction to perpendicular relations from the previous point.',
    category: 'advanced',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
];

export function isValidGridIncrement(value) {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return false;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function buildToggleViewModel(interactionLayer) {
  const state = interactionLayer.getSnapModeState();

  return SNAP_TOGGLE_DEFINITIONS.map((toggle) => ({
    ...toggle,
    token: toggle.token || '--ktheme-accent',
    tokenHover: toggle.tokenHover || '--ktheme-accent-hover',
    enabled: Boolean(state[toggle.id]),
    onToggle: (enabled) => interactionLayer.toggleSnapMode(toggle.id, enabled),
  }));
}

export function buildGridSettingsViewModel(interactionLayer) {
  const gridSettings = interactionLayer?.gridSettings || DEFAULT_GRID_SETTINGS;

  const applyFieldUpdate = (field, rawValue) => {
    if (!isValidGridIncrement(rawValue)) {
      return null;
    }
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    return interactionLayer.setGridSettings({ [field]: numericValue });
  };

  const onUpdate = (partialSettings) => {
    if (!partialSettings || typeof partialSettings !== 'object') {
      return null;
    }
    const nextSettings = {};
    if ('unitSize' in partialSettings) {
      if (!isValidGridIncrement(partialSettings.unitSize)) {
        return null;
      }
      nextSettings.unitSize = Number(partialSettings.unitSize);
    }
    if ('angleSnapDegrees' in partialSettings) {
      if (!isValidGridIncrement(partialSettings.angleSnapDegrees)) {
        return null;
      }
      nextSettings.angleSnapDegrees = Number(partialSettings.angleSnapDegrees);
    }
    if (Object.keys(nextSettings).length === 0) {
      return null;
    }
    return interactionLayer.setGridSettings(nextSettings);
  };

  return {
    unitSize: gridSettings.unitSize,
    angleSnapDegrees: gridSettings.angleSnapDegrees,
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
    setUnitSize: (value) => applyFieldUpdate('unitSize', value),
    setAngleSnapDegrees: (value) => applyFieldUpdate('angleSnapDegrees', value),
    onUnitSizeChange: (value) => applyFieldUpdate('unitSize', value),
    onAngleSnapDegreesChange: (value) => applyFieldUpdate('angleSnapDegrees', value),
    onUpdate,
  };
}
