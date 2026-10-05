// Central Material & Preset Registry module for Homegen rendering engines.
import { WALL_FINISHES, WALL_BY_ID } from './catalog.js';

/**
 * Curated window style presets defining frame finish, color, mullion layout, trim casing, and finish.
 */
export const WINDOW_PRESETS = {
  modern_black: {
    key: 'modern_black',
    name: 'Modern Black',
    frameMaterial: 'aluminum',
    frameColor: '#1a1a1a',
    mullions: { cols: 1, rows: 1 },
    casing: { width: 1.5, depth: 0.5 },
    finish: 'satin',
  },
  colonial_white: {
    key: 'colonial_white',
    name: 'Colonial White',
    frameMaterial: 'vinyl',
    frameColor: '#ffffff',
    mullions: { cols: 3, rows: 2 }, // 3x2 grid = 6-Lite
    casing: { width: 2.5, depth: 1.0 },
    finish: 'gloss',
  },
  craftsman_wood: {
    key: 'craftsman_wood',
    name: 'Craftsman Wood',
    frameMaterial: 'wood',
    frameColor: '#4a3728',
    mullions: { cols: 2, rows: 3 },
    casing: { width: 3.5, depth: 1.2 },
    finish: 'matte',
  },
  industrial_bronze: {
    key: 'industrial_bronze',
    name: 'Industrial Bronze',
    frameMaterial: 'bronze',
    frameColor: '#3a2e2b',
    mullions: { cols: 2, rows: 2 },
    casing: { width: 2.0, depth: 0.75 },
    finish: 'metallic',
  },
  standard_default: {
    key: 'standard_default',
    name: 'Standard Default',
    frameMaterial: 'vinyl',
    frameColor: '#ffffff',
    mullions: { cols: 2, rows: 2 },
    casing: { width: 2.0, depth: 0.75 },
    finish: 'matte',
  },
};

/**
 * Exterior cladding material registry maps.
 */
export const CLADDING_PRESETS = {
  board_and_batten: {
    id: 'cladding_board_batten',
    name: 'Board & Batten',
    pattern: 'siding',
    c1: '#f0ece1',
    c2: '#d8d2c3',
    exterior: true,
    cladding: true,
  },
  wall_brick: {
    id: 'wall_brick',
    name: 'Exposed brick',
    pattern: 'brick',
    c1: '#b5604a',
    c2: '#d9c2b0',
    exterior: true,
    cladding: true,
  },
  cladding_siding_white: {
    id: 'cladding_siding_white',
    name: 'Vinyl siding (white)',
    pattern: 'siding',
    c1: '#d9d3c5',
    c2: '#c5bfb1',
    exterior: true,
    cladding: true,
  },
  cladding_siding_gray: {
    id: 'cladding_siding_gray',
    name: 'Horizontal siding (gray)',
    pattern: 'siding',
    c1: '#8a939e',
    c2: '#707882',
    exterior: true,
    cladding: true,
  },
  cladding_siding_blue: {
    id: 'cladding_siding_blue',
    name: 'Lap siding (blue)',
    pattern: 'siding',
    c1: '#4a6572',
    c2: '#344955',
    exterior: true,
    cladding: true,
  },
  cladding_stone: {
    id: 'cladding_stone',
    name: 'Stone veneer',
    pattern: 'stone',
    c1: '#8c857b',
    c2: '#6b655c',
    exterior: true,
    cladding: true,
  },
  cladding_stucco: {
    id: 'cladding_stucco',
    name: 'Stucco finish',
    pattern: 'solid',
    c1: '#e8e2d5',
    exterior: true,
    cladding: true,
  },
};

/**
 * Exterior building design presets linking cladding and window styles.
 */
export const BUILDING_PRESETS = {
  modern_farmhouse: {
    key: 'modern_farmhouse',
    name: 'Modern Farmhouse',
    claddingKey: 'cladding_board_batten',
    windowPresetKey: 'modern_black',
  },
  colonial_white: {
    key: 'colonial_white',
    name: 'Colonial White',
    claddingKey: 'cladding_siding_white',
    windowPresetKey: 'colonial_white',
  },
  craftsman: {
    key: 'craftsman',
    name: 'Craftsman',
    claddingKey: 'cladding_stone',
    windowPresetKey: 'craftsman_wood',
  },
  industrial: {
    key: 'industrial',
    name: 'Industrial',
    claddingKey: 'wall_brick',
    windowPresetKey: 'industrial_bronze',
  },
};

const registeredWindowPresets = new Map(Object.entries(WINDOW_PRESETS));
const registeredCladdingMaterials = new Map(Object.entries(CLADDING_PRESETS));

// Caches for memory accumulation prevention across plan updates
const presetMaterialCache = new Map();

/**
 * Retrieve window style preset by key, falling back safely to standard_default on invalid keys.
 */
export function getWindowPreset(presetKey) {
  if (presetKey && registeredWindowPresets.has(presetKey)) {
    return registeredWindowPresets.get(presetKey);
  }
  return WINDOW_PRESETS.standard_default;
}

/**
 * Register a new window style preset dynamically without modifying core scene loops.
 */
export function registerWindowPreset(key, presetSpec) {
  if (!key || typeof presetSpec !== 'object') return;
  const spec = {
    key,
    name: presetSpec.name || key,
    frameMaterial: presetSpec.frameMaterial || 'vinyl',
    frameColor: presetSpec.frameColor || '#ffffff',
    mullions: presetSpec.mullions ? { ...presetSpec.mullions } : { cols: 2, rows: 2 },
    casing: presetSpec.casing ? { ...presetSpec.casing } : { width: 2.0, depth: 0.75 },
    finish: presetSpec.finish || 'matte',
    ...presetSpec,
  };
  registeredWindowPresets.set(key, spec);
  return spec;
}

/**
 * Retrieve cladding material definition by key, falling back safely to cladding_siding_white.
 */
export function getCladdingMaterial(key) {
  if (key && registeredCladdingMaterials.has(key)) {
    return registeredCladdingMaterials.get(key);
  }
  if (key && WALL_BY_ID[key]) {
    return WALL_BY_ID[key];
  }
  return (
    CLADDING_PRESETS.cladding_siding_white ||
    WALL_BY_ID.cladding_siding_white || {
      id: 'cladding_siding_white',
      name: 'Vinyl siding',
      pattern: 'siding',
      c1: '#d9d3c5',
      c2: '#c5bfb1',
      exterior: true,
      cladding: true,
    }
  );
}

/**
 * Register a new exterior cladding material definition dynamically.
 */
export function registerCladdingMaterial(key, finishSpec) {
  if (!key || typeof finishSpec !== 'object') return;
  const spec = {
    id: finishSpec.id || key,
    name: finishSpec.name || key,
    pattern: finishSpec.pattern || 'siding',
    c1: finishSpec.c1 || '#d9d3c5',
    c2: finishSpec.c2,
    exterior: true,
    cladding: true,
    ...finishSpec,
  };
  registeredCladdingMaterials.set(key, spec);
  registeredCladdingMaterials.set(spec.id, spec);
  if (!WALL_BY_ID[spec.id]) {
    WALL_FINISHES.push(spec);
    WALL_BY_ID[spec.id] = spec;
  }
  return spec;
}

/**
 * Retrieve building design preset by key.
 */
export function getBuildingPreset(presetKey) {
  return BUILDING_PRESETS[presetKey] || BUILDING_PRESETS.colonial_white;
}

/**
 * Apply a building design preset to a room or plan state.
 */
export function applyBuildingPreset(state, presetKey, { room, level = 0, scope = 'plan' } = {}) {
  const bPreset = getBuildingPreset(presetKey);
  if (!bPreset) return;

  const targetRooms =
    scope === 'room' && room
      ? [room]
      : scope === 'level'
        ? state.rooms.filter((r) => (r.level || 0) === level)
        : state.rooms;

  for (const r of targetRooms) {
    r.cladding = bPreset.claddingKey;
    for (const o of r.openings) {
      if (o.kind === 'window') {
        o.presetKey = bPreset.windowPresetKey;
      }
    }
  }
}

/**
 * Resolve effective window style attributes for an opening or catalog definition,
 * merging preset specifications with any explicit instance property overrides.
 */
export function resolveWindowStyle(openingOrDef) {
  if (!openingOrDef) return { ...WINDOW_PRESETS.standard_default };

  const presetKey = openingOrDef.presetKey || openingOrDef.preset || null;
  const preset = getWindowPreset(presetKey);

  let frameMaterial = preset.frameMaterial;
  if (
    openingOrDef.frameMaterial &&
    openingOrDef.frameMaterial !== preset.frameMaterial &&
    openingOrDef.frameMaterial !== 'vinyl'
  ) {
    frameMaterial = openingOrDef.frameMaterial;
  }

  let frameColor = preset.frameColor;
  if (
    openingOrDef.frameColor &&
    openingOrDef.frameColor !== preset.frameColor &&
    openingOrDef.frameColor !== '#ffffff'
  ) {
    frameColor = openingOrDef.frameColor;
  }

  let mullions = preset.mullions;
  if (openingOrDef.mullions && typeof openingOrDef.mullions === 'object') {
    mullions = {
      cols: openingOrDef.mullions.cols ?? preset.mullions.cols,
      rows: openingOrDef.mullions.rows ?? preset.mullions.rows,
    };
  }

  let casing = preset.casing;
  if (openingOrDef.casing && typeof openingOrDef.casing === 'object') {
    casing = {
      width: openingOrDef.casing.width ?? preset.casing.width,
      depth: openingOrDef.casing.depth ?? preset.casing.depth,
    };
  }

  return {
    presetKey: preset.key,
    frameMaterial,
    frameColor,
    mullions,
    casing,
    finish: openingOrDef.finish || preset.finish,
  };
}

/**
 * Clear preset registry caches to prevent memory accumulation across plan updates.
 */
export function clearPresetCaches() {
  for (const mat of presetMaterialCache.values()) {
    if (mat && typeof mat.dispose === 'function') {
      mat.dispose();
    }
  }
  presetMaterialCache.clear();
}
