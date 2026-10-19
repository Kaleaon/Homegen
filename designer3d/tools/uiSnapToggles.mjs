import { SNAP_MODES } from './snapModes.mjs';

export const SNAP_TOGGLE_DEFINITIONS = [
  {
    id: SNAP_MODES.GRID,
    label: 'Grid Snap',
    description: 'Snap to major grid spacing.',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
  {
    id: SNAP_MODES.EDGE,
    label: 'Edge Snap',
    description: 'Snap to nearest wall/room edge.',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
  {
    id: SNAP_MODES.MIDPOINT,
    label: 'Midpoint Snap',
    description: 'Snap to edge midpoints for centered placement.',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
  {
    id: SNAP_MODES.PERPENDICULAR,
    label: 'Perpendicular Snap',
    description: 'Constrain direction to perpendicular relations from the previous point.',
    token: '--ktheme-accent',
    tokenHover: '--ktheme-accent-hover',
  },
];

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
