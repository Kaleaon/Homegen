import { SNAP_MODES } from './snapModes.mjs';

export const SNAP_TOGGLE_DEFINITIONS = [
  {
    id: SNAP_MODES.GRID,
    label: 'Grid Snap',
    description: 'Snap to major grid spacing.',
    category: 'basic',
  },
  {
    id: SNAP_MODES.EDGE,
    label: 'Edge Snap',
    description: 'Snap to nearest wall/room edge.',
    category: 'basic',
  },
  {
    id: SNAP_MODES.MIDPOINT,
    label: 'Midpoint Snap',
    description: 'Snap to edge midpoints for centered placement.',
    category: 'advanced',
  },
  {
    id: SNAP_MODES.PERPENDICULAR,
    label: 'Perpendicular Snap',
    description: 'Constrain direction to perpendicular relations from the previous point.',
    category: 'advanced',
  },
];

export function buildToggleViewModel(interactionLayer) {
  const state = interactionLayer.getSnapModeState();

  return SNAP_TOGGLE_DEFINITIONS.map((toggle) => ({
    ...toggle,
    enabled: Boolean(state[toggle.id]),
    onToggle: (enabled) => interactionLayer.toggleSnapMode(toggle.id, enabled),
  }));
}
