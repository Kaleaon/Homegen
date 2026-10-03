export const DEFAULT_GRID_SETTINGS = Object.freeze({
  unitSize: 0.25,
  angleSnapDegrees: 15,
  magneticThreshold: 0.2,
  edgeThreshold: 0.2,
  midpointThreshold: 0.15,
  perpendicularThreshold: 0.15,
});

export function createGridSettings(overrides = {}) {
  const settings = { ...DEFAULT_GRID_SETTINGS, ...overrides };

  for (const [name, value] of Object.entries(settings)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid grid setting '${name}': expected a finite positive number, got '${value}'.`);
    }
  }

  return settings;
}

export function quantize(value, step) {
  return Math.round(value / step) * step;
}
