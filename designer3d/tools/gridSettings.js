/**
 * @typedef {Object} GridSettings
 * @property {number} unitSize - Distance between major grid lines in scene units.
 * @property {number} angleSnapDegrees - Rotation snapping increment in degrees.
 * @property {number} magneticThreshold - Maximum distance where snap candidates are considered.
 * @property {number} edgeThreshold - Max distance used for edge snapping.
 * @property {number} midpointThreshold - Max distance used for midpoint snapping.
 * @property {number} perpendicularThreshold - Max distance used for perpendicular snapping.
 */

const DEFAULT_GRID_SETTINGS = Object.freeze({
  unitSize: 0.25,
  angleSnapDegrees: 15,
  magneticThreshold: 0.2,
  edgeThreshold: 0.2,
  midpointThreshold: 0.15,
  perpendicularThreshold: 0.15,
});

/**
 * Build and validate grid settings.
 * @param {Partial<GridSettings>} overrides
 * @returns {GridSettings}
 */
function createGridSettings(overrides = {}) {
  const settings = { ...DEFAULT_GRID_SETTINGS, ...overrides };

  for (const [name, value] of Object.entries(settings)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid grid setting '${name}': expected a finite positive number, got '${value}'.`);
    }
  }

  return settings;
}

/**
 * @param {number} value
 * @param {number} step
 */
function quantize(value, step) {
  return Math.round(value / step) * step;
}

module.exports = {
  DEFAULT_GRID_SETTINGS,
  createGridSettings,
  quantize,
};
