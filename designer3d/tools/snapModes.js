const SNAP_MODES = Object.freeze({
  GRID: 'grid',
  EDGE: 'edge',
  MIDPOINT: 'midpoint',
  PERPENDICULAR: 'perpendicular',
});

class SnapModeState {
  constructor(initialState = {}) {
    this.modes = {
      [SNAP_MODES.GRID]: true,
      [SNAP_MODES.EDGE]: true,
      [SNAP_MODES.MIDPOINT]: false,
      [SNAP_MODES.PERPENDICULAR]: false,
      ...initialState,
    };
  }

  toggle(mode, enabled) {
    if (!Object.values(SNAP_MODES).includes(mode)) {
      throw new Error(`Unknown snap mode '${mode}'`);
    }
    this.modes[mode] = typeof enabled === 'boolean' ? enabled : !this.modes[mode];
    return this.modes[mode];
  }

  isEnabled(mode) {
    return Boolean(this.modes[mode]);
  }

  toJSON() {
    return { ...this.modes };
  }
}

module.exports = {
  SNAP_MODES,
  SnapModeState,
};
