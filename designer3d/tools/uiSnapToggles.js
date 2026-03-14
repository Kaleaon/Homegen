const { SNAP_MODES } = require('./snapModes');

const SNAP_TOGGLE_DEFINITIONS = [
  { id: SNAP_MODES.GRID, label: 'Grid Snap', description: 'Snap to major grid spacing.' },
  { id: SNAP_MODES.EDGE, label: 'Edge Snap', description: 'Snap to nearest wall/room edge.' },
  { id: SNAP_MODES.MIDPOINT, label: 'Midpoint Snap', description: 'Snap to edge midpoints for centered placement.' },
  {
    id: SNAP_MODES.PERPENDICULAR,
    label: 'Perpendicular Snap',
    description: 'Constrain direction to perpendicular relations from the previous point.',
  },
];

function buildToggleViewModel(interactionLayer) {
  const state = interactionLayer.getSnapModeState();

  return SNAP_TOGGLE_DEFINITIONS.map((toggle) => ({
    ...toggle,
    enabled: Boolean(state[toggle.id]),
    onToggle: (enabled) => interactionLayer.toggleSnapMode(toggle.id, enabled),
  }));
}

module.exports = {
  SNAP_TOGGLE_DEFINITIONS,
  buildToggleViewModel,
};
