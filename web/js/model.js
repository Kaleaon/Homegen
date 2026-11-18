// Plan state, edit helpers, kit placement and persistence. State is plain JSON.
import {
  WT,
  GRID,
  EPS,
  WALLS,
  LEGACY_WALL_NAMES,
  resolveWallIndex,
  getWallBulge as geomGetWallBulge,
  snap,
  wallSeg,
  wallLength,
  interior,
  wallPoint,
  footprint,
  lv,
  getRoomPoints,
  getRoomBoundingBox,
  computeGeoBounds,
} from './geometry.js';
import { isRegisteredEPSG, normalizeCode, getEPSGDefinition } from './epsgRegistry.js';
import { ITEM_BY_ID, OPENING_BY_ID, ROOM_TYPES, ROOM_KIT_BY_ID } from './catalog.js';
import { registerCustomWallFinish } from './presetRegistry.js';
import { deserializeElevationGrid } from './elevationEngine.js';
import { formatFractionalInches } from './dimensionFormatter.js';

export function defaultBranding() {
  return {
    logoDataUrl: null,
    stamp: {
      shape: 'circle',
      titleText: 'APPROVED',
      subtitleText: 'ARCHITECTURAL PLAN',
      licenseText: '',
      dateText: '',
      borderColor: '#d32f2f',
      borderStyle: 'solid',
      textColor: '#d32f2f',
      opacity: 0.9,
      enabled: true,
    },
    watermark: {
      text: '',
      color: '#9e9e9e',
      opacity: 0.2,
      fontSize: 24,
      angle: -45,
      enabled: true,
    },
  };
}

export function defaultCRS() {
  return {
    epsg: 'EPSG:4326',
    proj4: '+proj=longlat +datum=WGS84 +no_defs +type=crs',
    wkt: 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
    origin: { longitude: -122.4194, latitude: 37.7749 },
    units: 'inches',
    geojson: {
      type: 'FeatureCollection',
      features: [],
    },
  };
}

export function isValidEPSGCode(code) {
  if (!code || typeof code !== 'string') return false;
  const normalized = normalizeCode(code);
  if (!/^EPSG:\d+$/.test(normalized)) return false;
  return isRegisteredEPSG(normalized);
}

export function normalizeEPSGCode(code) {
  if (code == null) return 'EPSG:4326';
  if (typeof code === 'number') return `EPSG:${code}`;
  const normalized = normalizeCode(String(code));
  if (/^EPSG:\d+$/.test(normalized)) return normalized;
  return 'EPSG:4326';
}

export function validateLogoSize(dataUrl, maxKb = 500) {
  if (!dataUrl) return true;
  const base64Str = dataUrl.split(',')[1] || dataUrl;
  const sizeInBytes = Math.ceil((base64Str.length * 3) / 4);
  const maxBytes = maxKb * 1024;
  if (sizeInBytes > maxBytes) {
    throw new Error(
      `Logo asset exceeds maximum allowed size of ${maxKb}KB (${Math.round(sizeInBytes / 1024)}KB)`
    );
  }
  return true;
}

function createMapPresetSvgDataUrl(name, primaryColor = '#e2e8f0', gridColor = '#cbd5e1') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${primaryColor}"/><path d="M0 100 H800 M0 200 H800 M0 300 H800 M0 400 H800 M0 500 H800 M100 0 V600 M200 0 V600 M300 0 V600 M400 0 V600 M500 0 V600 M600 0 V600 M700 0 V600" stroke="${gridColor}" stroke-width="1" stroke-dasharray="4 4"/><text x="400" y="300" font-family="sans-serif" font-size="22" font-weight="bold" fill="#475569" text-anchor="middle" dominant-baseline="middle">${name}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MAP_PRESETS = {
  openstreetmap: {
    id: 'openstreetmap',
    aliases: ['osm'],
    name: 'OpenStreetMap',
    provider: 'OpenStreetMap',
    attributionText: '© OpenStreetMap contributors',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    isGeospatial: true,
    description: 'Open community-mapped global topographic & road base layer',
    dataUrl: createMapPresetSvgDataUrl('OpenStreetMap', '#f1f5f9', '#cbd5e1'),
  },
  'carto-positron': {
    id: 'carto-positron',
    aliases: ['carto', 'positron'],
    name: 'CARTO Positron',
    provider: 'CARTO',
    attributionText: '© OpenStreetMap contributors, © CARTO',
    licenseUrl: 'https://carto.com/attributions',
    isGeospatial: true,
    description: 'Light-toned minimalist basemap designed for architectural overlays',
    dataUrl: createMapPresetSvgDataUrl('CARTO Positron', '#f8fafc', '#e2e8f0'),
  },
  'usgs-topo': {
    id: 'usgs-topo',
    aliases: ['usgs', 'usgs-quad'],
    name: 'USGS Topo',
    provider: 'USGS',
    attributionText: 'Map Data © USGS Topo / U.S. Geological Survey',
    licenseUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    isGeospatial: true,
    description: 'Official U.S. Geological Survey national topographic map quadrangle data',
    dataUrl: createMapPresetSvgDataUrl('USGS Topo', '#f0fdf4', '#bbf7d0'),
  },
  'copernicus-sentinel': {
    id: 'copernicus-sentinel',
    aliases: ['sentinel', 'copernicus'],
    name: 'Copernicus Sentinel',
    provider: 'Copernicus',
    attributionText: 'Imagery © Copernicus Sentinel Data',
    licenseUrl:
      'https://sentinels.copernicus.eu/documents/247904/685211/Sentinel_Data_Legal_Notice.pdf',
    isGeospatial: true,
    description: 'European Space Agency Earth observation satellite multispectral imagery',
    dataUrl: createMapPresetSvgDataUrl('Copernicus Sentinel', '#f0f9ff', '#bae6fd'),
  },
};

export const GEOSPATIAL_MAP_PRESETS = MAP_PRESETS;

export function getMapPreset(key) {
  if (!key || typeof key !== 'string') return null;
  const k = key.trim().toLowerCase();
  if (MAP_PRESETS[k]) return MAP_PRESETS[k];
  for (const preset of Object.values(MAP_PRESETS)) {
    if (preset.id === k || (preset.aliases && preset.aliases.includes(k))) {
      return preset;
    }
  }
  return null;
}

export function applyMapPreset(state, presetKeyOrObj, opts = {}) {
  if (!state) return null;
  const preset =
    typeof presetKeyOrObj === 'object' && presetKeyOrObj
      ? presetKeyOrObj
      : getMapPreset(presetKeyOrObj);

  if (!preset) {
    if (!presetKeyOrObj && state.background) {
      state.background.presetKey = null;
    }
    return state.background || null;
  }

  const existing = state.background || {};
  state.background = {
    dataUrl: existing.dataUrl || preset.dataUrl,
    x: existing.x ?? 0,
    y: existing.y ?? 0,
    scale: existing.scale ?? 1,
    opacity: existing.opacity ?? 0.5,
    visible: existing.visible ?? true,
    locked: existing.locked ?? false,
    width: existing.width || 800,
    height: existing.height || 600,
    attributionText: preset.attributionText,
    provider: preset.provider,
    licenseUrl: preset.licenseUrl,
    logoUrl: preset.logoUrl || null,
    isGeospatial: true,
    presetKey: preset.id,
    ...opts,
  };

  return state.background;
}

export const DEFAULT_STORY_HEIGHT = 106; // 96" ceiling + 10" slab
export const DEFAULT_CEILING_HEIGHT = 96;
export const DEFAULT_SLAB_THICKNESS = 10;

export function defaultLevelDescriptor(index = 0, name = null) {
  const isSub = index < 0;
  return {
    index,
    name: name || (isSub ? `Basement ${Math.abs(index)}` : `Floor ${index + 1}`),
    elevation: index * DEFAULT_STORY_HEIGHT,
    storyHeight: DEFAULT_STORY_HEIGHT,
    ceilingHeight: DEFAULT_CEILING_HEIGHT,
    slabThickness: DEFAULT_SLAB_THICKNESS,
    subterranean: isSub,
  };
}

export function getLevelMetadata(state, levelIndex = 0) {
  if (Array.isArray(state?.levelMetadata)) {
    const found = state.levelMetadata.find((m) => m && m.index === levelIndex);
    if (found) return found;
  }
  return defaultLevelDescriptor(levelIndex);
}

export function calculateLevelElevations(state) {
  const elev = [];
  const meta = state?.levelMetadata;
  if (Array.isArray(meta) && meta.length > 0) {
    for (const lvl of meta) {
      if (lvl && typeof lvl.index === 'number') {
        const e =
          typeof lvl.elevation === 'number' && !isNaN(lvl.elevation)
            ? lvl.elevation
            : lvl.index * DEFAULT_STORY_HEIGHT;
        elev[lvl.index] = e;
      }
    }
  } else {
    const n = Math.max(1, state?.levels || 1);
    elev[0] = 0;
    for (let l = 1; l < n; l++) {
      const rs = (state?.rooms || []).filter((r) => lv(r) === l - 1);
      const ceil = rs.length ? Math.max(...rs.map((r) => r.ceiling || 96)) : 96;
      elev[l] = elev[l - 1] + ceil + DEFAULT_SLAB_THICKNESS;
    }
    const minRoomLevel = Math.min(0, ...(state?.rooms || []).map((r) => lv(r)));
    for (let l = -1; l >= minRoomLevel; l--) {
      const rs = (state?.rooms || []).filter((r) => lv(r) === l);
      const ceil = rs.length ? Math.max(...rs.map((r) => r.ceiling || 96)) : 96;
      elev[l] = (elev[l + 1] !== undefined ? elev[l + 1] : 0) - (ceil + DEFAULT_SLAB_THICKNESS);
    }
  }
  return elev;
}

export function getLevelElevation(state, levelIndex = 0) {
  const elevs = calculateLevelElevations(state);
  if (elevs[levelIndex] !== undefined) return elevs[levelIndex];
  return levelIndex * DEFAULT_STORY_HEIGHT;
}

export function validateLevelHierarchy(metadataArray) {
  const errors = [];
  if (!Array.isArray(metadataArray) || metadataArray.length === 0) {
    return { valid: true, errors: [] };
  }

  const seenIndices = new Set();
  for (const lvl of metadataArray) {
    if (!lvl) continue;
    if (seenIndices.has(lvl.index)) {
      errors.push(`Duplicate level index ${lvl.index}.`);
    }
    seenIndices.add(lvl.index);
    if (typeof lvl.storyHeight === 'number' && lvl.storyHeight <= 0) {
      errors.push(`Level ${lvl.name || lvl.index} story height must be greater than 0.`);
    }
    const slab = lvl.slabThickness || DEFAULT_SLAB_THICKNESS;
    if (typeof lvl.ceilingHeight === 'number' && lvl.ceilingHeight <= 0) {
      errors.push(`Level ${lvl.name || lvl.index} ceiling height must be positive.`);
    }
    if (typeof lvl.storyHeight === 'number' && lvl.storyHeight < slab) {
      errors.push(
        `Level ${lvl.name || lvl.index} story height (${lvl.storyHeight}") cannot be less than slab thickness (${slab}").`
      );
    }
  }

  const sorted = [...metadataArray].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const slabCur = cur.slabThickness || DEFAULT_SLAB_THICKNESS;
    if (next.elevation < cur.elevation + slabCur) {
      errors.push(
        `Level ${next.name || next.index} overlaps with level ${cur.name || cur.index} (minimum separation ${slabCur}").`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function setLevelMetadata(state, metadataArray) {
  if (!state) return { valid: false, errors: ['Invalid state'] };
  const validation = validateLevelHierarchy(metadataArray);
  if (!validation.valid) {
    return validation;
  }
  state.levelMetadata = metadataArray.map((m) => ({ ...m }));
  state.levelMetadata.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const maxIdx = Math.max(0, ...state.levelMetadata.map((m) => m.index));
  state.levels = maxIdx + 1;
  return { valid: true, errors: [] };
}

export function formatElevationBadge(inches) {
  if (typeof inches !== 'number' || isNaN(inches)) return '+0\' 0"';
  const roundedSixteenths = Math.round(Math.abs(inches) * 16);
  const sign = inches < 0 && roundedSixteenths > 0 ? '-' : '+';
  const ft = Math.floor(roundedSixteenths / 192);
  const remSixteenths = roundedSixteenths % 192;
  const wholeInches = Math.floor(remSixteenths / 16);
  let num = remSixteenths % 16;
  let den = 16;
  while (num > 0 && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (num === 0) {
    return `${sign}${ft}' ${wholeInches}"`;
  }
  const inchPart = wholeInches > 0 ? `${wholeInches} ${num}/${den}` : `${num}/${den}`;
  return `${sign}${ft}' ${inchPart}"`;
}

export function newState() {
  return {
    version: 2,
    name: 'My home',
    nextId: 1,
    levels: 1,
    levelMetadata: [defaultLevelDescriptor(0, 'Floor 1')],
    rooms: [],
    background: null,
    site: null, // { crs: 'EPSG:4326', features: [], segments: [], layers: [] }
    elevationGrid: null,
    customFinishes: [],
    crs: defaultCRS(),
    settings: {
      branding: defaultBranding(),
    },
  };
}

export const clone = (s) => JSON.parse(JSON.stringify(s));

export function isRoomEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneWithSharing(state, prevState = null) {
  if (!state) return state;
  const clonedBase = clone(state);
  if (!prevState || !Array.isArray(prevState.rooms)) {
    return clonedBase;
  }

  const prevRoomMap = new Map();
  for (const r of prevState.rooms) {
    if (r && r.id != null) {
      prevRoomMap.set(r.id, r);
    }
  }

  clonedBase.rooms = (state.rooms || []).map((room) => {
    const prevRoom = prevRoomMap.get(room.id);
    if (prevRoom && isRoomEqual(room, prevRoom)) {
      return prevRoom;
    }
    return clone(room);
  });

  return clonedBase;
}

export function ensureRoomCopy(state, room) {
  if (!state || !Array.isArray(state.rooms) || !room || !room.id) {
    return room;
  }
  const idx = state.rooms.findIndex((r) => r.id === room.id);
  if (idx === -1) {
    return room;
  }
  return state.rooms[idx];
}

export const nid = (state, p) => `${p}${state.nextId++}`;

export const DEFAULT_UV_TRANSFORM = {
  scaleU: 1.0,
  scaleV: 1.0,
  rotation: 0,
  offsetU: 0,
  offsetV: 0,
};

export function createDefaultWallUV() {
  return {
    N: { ...DEFAULT_UV_TRANSFORM },
    E: { ...DEFAULT_UV_TRANSFORM },
    S: { ...DEFAULT_UV_TRANSFORM },
    W: { ...DEFAULT_UV_TRANSFORM },
  };
}

export function createMeshGraphFromPolygon(points, baseZ = 0, zOffsets = null) {
  const n = points ? points.length : 0;
  if (n === 0) {
    return {
      vertices: [],
      VertexZArray: [],
      triangles: [],
      edges: [],
    };
  }

  const VertexZArray = new Array(n);
  for (let i = 0; i < n; i++) {
    const offset = zOffsets && typeof zOffsets[i] === 'number' ? zOffsets[i] : 0;
    VertexZArray[i] = baseZ + offset;
  }

  const vertices = points.map((p, i) => ({
    x: p.x,
    y: p.y,
    z: VertexZArray[i],
  }));

  const triangles = [];
  if (n >= 3) {
    for (let i = 1; i < n - 1; i++) {
      triangles.push([0, i, i + 1]);
    }
  }

  const edges = [];
  for (let i = 0; i < n; i++) {
    edges.push({ v1: i, v2: (i + 1) % n });
  }

  return {
    vertices,
    VertexZArray,
    triangles,
    edges,
  };
}

export function updateMeshVertexZ(room, meshType, vertexIndex, newZ) {
  if (!room) return;
  const mesh = meshType === 'ceiling' ? room.ceilingMesh : room.floorMesh;
  if (!mesh || !mesh.VertexZArray || vertexIndex < 0 || vertexIndex >= mesh.VertexZArray.length) {
    return;
  }
  mesh.VertexZArray[vertexIndex] = newZ;
  if (mesh.vertices && mesh.vertices[vertexIndex]) {
    mesh.vertices[vertexIndex].z = newZ;
  }
}

export function migratePlanTo3DMeshGraph(state) {
  if (!state || !Array.isArray(state.rooms)) return state;
  for (const room of state.rooms) {
    const pts = getRoomPoints(room);
    if (!room.floorMesh || !Array.isArray(room.floorMesh.VertexZArray)) {
      const zOffsets = room.floorZOffsets || null;
      room.floorMesh = createMeshGraphFromPolygon(pts, 0, zOffsets);
    }
    if (!room.ceilingMesh || !Array.isArray(room.ceilingMesh.VertexZArray)) {
      const ceilingHeight = room.ceiling ?? 96;
      const zOffsets = room.ceilingZOffsets || null;
      room.ceilingMesh = createMeshGraphFromPolygon(pts, ceilingHeight, zOffsets);
    }
  }
  return state;
}

export function createRoom(state, type, x, y, w, h, opts = {}) {
  const points =
    opts.points || opts.corners || opts.vertices
      ? opts.points || opts.corners || opts.vertices
      : [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ];
  const bbox = getRoomBoundingBox(points);
  const room = {
    id: nid(state, 'r'),
    type,
    name: opts.name ?? ROOM_TYPES[type]?.name ?? 'Room',
    level: opts.level ?? 0,
    x: bbox.x,
    y: bbox.y,
    w: bbox.w,
    h: bbox.h,
    points,
    ceiling: opts.ceiling ?? 96,
    floor: opts.floor ?? 'floor_oak',
    cladding: opts.cladding ?? undefined,
    walls: {
      N: opts.wallFinish ?? 'paint_white',
      E: opts.wallFinish ?? 'paint_white',
      S: opts.wallFinish ?? 'paint_white',
      W: opts.wallFinish ?? 'paint_white',
      ...(opts.walls || {}),
    },
    wallUV: opts.wallUV ? JSON.parse(JSON.stringify(opts.wallUV)) : createDefaultWallUV(),
    ...(opts.wallAssemblyOverrides
      ? { wallAssemblyOverrides: JSON.parse(JSON.stringify(opts.wallAssemblyOverrides)) }
      : {}),
    floorMesh:
      opts.floorMesh ||
      createMeshGraphFromPolygon(points, 0, opts.floorZOffsets || opts.VertexZArray),
    ceilingMesh:
      opts.ceilingMesh ||
      createMeshGraphFromPolygon(points, opts.ceiling ?? 96, opts.ceilingZOffsets),
    openings: [],
    items: [],
  };
  if (opts.bulges) {
    if (Array.isArray(opts.bulges)) {
      if (points.length === 4) {
        room.bulges = {
          N: Number(opts.bulges[0]) || 0,
          E: Number(opts.bulges[1]) || 0,
          S: Number(opts.bulges[2]) || 0,
          W: Number(opts.bulges[3]) || 0,
        };
      } else {
        room.bulges = opts.bulges.map((b) => Number(b) || 0);
      }
    } else if (typeof opts.bulges === 'object') {
      room.bulges = { ...opts.bulges };
    }
  }
  state.rooms.push(room);
  return room;
}

export function addRoom(state, x, y, w, h, type = 'living', opts = {}) {
  if (typeof x === 'string') {
    return createRoom(state, x, y, w, h, type, opts);
  }
  return createRoom(state, type || 'living', x, y, w, h, opts);
}

export function addOpening(state, room, type, wall, offset, props = {}) {
  room = ensureRoomCopy(state, room);
  const def = OPENING_BY_ID[type] || {};
  const o = {
    id: nid(state, 'o'),
    type,
    kind: def.kind,
    wall,
    offset,
    width: def.w,
    swing: 'in',
    ...props,
  };
  if (def.presetKey && !o.presetKey) o.presetKey = def.presetKey;
  if (def.frameMaterial && !o.frameMaterial) o.frameMaterial = def.frameMaterial;
  if (def.frameColor && !o.frameColor) o.frameColor = def.frameColor;
  if (def.mullions && !o.mullions)
    o.mullions = typeof def.mullions === 'object' ? { ...def.mullions } : def.mullions;
  if (def.casing && !o.casing)
    o.casing = typeof def.casing === 'object' ? { ...def.casing } : def.casing;
  room.openings.push(o);
  return o;
}

/** Adds an item. Floor/ceiling items take x/y, wall items take wall+offset. */
export function addItem(state, room, type, props) {
  room = ensureRoomCopy(state, room);
  const def = ITEM_BY_ID[type];
  const item = { id: nid(state, 'i'), type, ...props };
  if (def.mount !== 'wall') item.rot = item.rot ?? 0;
  room.items.push(item);
  return item;
}

export function findOwner(state, id) {
  for (const room of state.rooms) {
    if (room.id === id) return { room, kind: 'room', obj: room };
    const o = room.openings.find((x) => x.id === id);
    if (o) return { room, kind: 'opening', obj: o };
    const i = room.items.find((x) => x.id === id);
    if (i) return { room, kind: 'item', obj: i };
  }
  return null;
}

export function removeById(state, id) {
  const hit = findOwner(state, id);
  if (!hit) return false;
  if (hit.kind === 'room') {
    state.rooms = state.rooms.filter((r) => r.id !== id);
  } else if (hit.kind === 'opening') {
    const r = ensureRoomCopy(state, hit.room);
    r.openings = r.openings.filter((x) => x.id !== id);
  } else {
    const r = ensureRoomCopy(state, hit.room);
    r.items = r.items.filter((x) => x.id !== id);
  }
  return true;
}

export function moveRoom(room, nx, ny, state = null) {
  if (state) room = ensureRoomCopy(state, room);
  const dx = nx - room.x;
  const dy = ny - room.y;
  room.x = nx;
  room.y = ny;
  const pts = getRoomPoints(room);
  room.points = pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  if (room.floorMesh && Array.isArray(room.floorMesh.vertices)) {
    for (const v of room.floorMesh.vertices) {
      v.x += dx;
      v.y += dy;
    }
  }
  if (room.ceilingMesh && Array.isArray(room.ceilingMesh.vertices)) {
    for (const v of room.ceilingMesh.vertices) {
      v.x += dx;
      v.y += dy;
    }
  }
  for (const it of room.items)
    if (it.x !== undefined) {
      it.x += dx;
      it.y += dy;
    }
}

export function resizeRoom(room, x, y, w, h, state = null) {
  if (state) room = ensureRoomCopy(state, room);
  room.x = x;
  room.y = y;
  room.w = w;
  room.h = h;
  room.points = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const floorZ = room.floorMesh?.VertexZArray || null;
  const ceilingZ = room.ceilingMesh?.VertexZArray || null;
  room.floorMesh = createMeshGraphFromPolygon(room.points, 0, floorZ);
  room.ceilingMesh = createMeshGraphFromPolygon(room.points, room.ceiling ?? 96, ceilingZ);
  for (const o of room.openings) {
    const len = wallLength(room, o.wall);
    o.offset = Math.max(0, Math.min(o.offset, len - o.width));
  }
}

export function updateRoomPoints(room, points, state = null) {
  if (state) room = ensureRoomCopy(state, room);
  room.points = points;
  const bbox = getRoomBoundingBox(points);
  room.x = bbox.x;
  room.y = bbox.y;
  room.w = bbox.w;
  room.h = bbox.h;
  const floorZ = room.floorMesh?.VertexZArray || null;
  const ceilingZ = room.ceilingMesh?.VertexZArray || null;
  room.floorMesh = createMeshGraphFromPolygon(room.points, 0, floorZ);
  room.ceilingMesh = createMeshGraphFromPolygon(room.points, room.ceiling ?? 96, ceilingZ);
  for (const o of room.openings) {
    const len = wallLength(room, o.wall);
    o.offset = Math.max(0, Math.min(o.offset, len - o.width));
  }
}

const wallDir = { N: 0, S: 180, E: 90, W: 270 }; // item rotation for a back against that wall

/** Position an item with its back on `wall`. along: 'start'|'center'|'end'|inches. Returns item props. */
export function backToWall(room, def, wall, along, off = 0) {
  const ir = interior(room);
  const rot = wallDir[wall];
  const swap = rot % 180 !== 0;
  const w = swap ? def.d : def.w;
  const d = swap ? def.w : def.d;
  const span = wall === 'N' || wall === 'S' ? ir.w : ir.h;
  const itemLen = wall === 'N' || wall === 'S' ? w : d;
  let c;
  if (along === 'start') c = itemLen / 2;
  else if (along === 'end') c = span - itemLen / 2;
  else if (along === 'center') c = span / 2;
  else c = along + itemLen / 2;
  c += off;
  if (wall === 'N') return { x: ir.x + c, y: ir.y + d / 2, rot };
  if (wall === 'S') return { x: ir.x + c, y: ir.y + ir.h - d / 2, rot };
  if (wall === 'W') return { x: ir.x + w / 2, y: ir.y + c, rot };
  return { x: ir.x + ir.w - w / 2, y: ir.y + c, rot };
}

export function placeFromSpec(state, room, spec) {
  const def = ITEM_BY_ID[spec.type];
  const ir = interior(room);
  if (spec.pos) {
    return addItem(state, room, spec.type, {
      x: ir.x + ir.w * spec.pos[0] + (spec.dx || 0),
      y: ir.y + ir.h * spec.pos[1] + (spec.dy || 0),
      rot: spec.rot || 0,
    });
  }
  return addItem(state, room, spec.type, backToWall(room, def, spec.wall, spec.along, spec.off));
}

/** Create a full room from a room kit at (x,y). Opening offsets are in wall coordinates. */
export function placeRoomKit(state, kitId, x, y, level = 0) {
  const kit = ROOM_KIT_BY_ID[kitId];
  const room = createRoom(state, kit.type, snap(x), snap(y), kit.w, kit.h, {
    floor: kit.floor,
    wallFinish: kit.wallFinish,
    level,
  });
  for (const o of kit.openings) addOpening(state, room, o.type, o.wall, o.offset);
  for (const spec of kit.items) placeFromSpec(state, room, spec);
  return room;
}

// ---- persistence ----
export function getWallBulge(room, wall) {
  return geomGetWallBulge(room, wall);
}

export function setWallBulge(room, wall, bulge, state = null) {
  if (!room || wall === undefined || wall === null) return 0;
  if (state) room = ensureRoomCopy(state, room);
  const pts = getRoomPoints(room);
  const idx = resolveWallIndex(wall) % pts.length;
  const cleanBulge = !Number.isFinite(bulge) || Math.abs(bulge) < 1e-12 ? 0 : bulge;

  if (Array.isArray(room.bulges)) {
    const next = Array.from({ length: pts.length }, (_, i) => Number(room.bulges[i]) || 0);
    next[idx] = cleanBulge;
    room.bulges = next;
  } else if (pts.length === 4) {
    const wallKey = LEGACY_WALL_NAMES[idx];
    room.bulges = {
      N: geomGetWallBulge(room, 'N'),
      E: geomGetWallBulge(room, 'E'),
      S: geomGetWallBulge(room, 'S'),
      W: geomGetWallBulge(room, 'W'),
      ...(room.bulges && typeof room.bulges === 'object' ? room.bulges : {}),
      [wallKey]: cleanBulge,
    };
  } else {
    const next = Array.from({ length: pts.length }, (_, i) => geomGetWallBulge(room, i));
    next[idx] = cleanBulge;
    room.bulges = next;
  }

  const rawPts = room.points || room.corners || room.vertices;
  if (Array.isArray(rawPts) && rawPts[idx] && typeof rawPts[idx].bulge === 'number') {
    rawPts[idx] = { ...rawPts[idx], bulge: cleanBulge };
  }
  return cleanBulge;
}

export function getWallUV(room, wall) {
  if (!room || !wall) return { ...DEFAULT_UV_TRANSFORM };
  room.wallUV ||= {};
  const uv = room.wallUV[wall] || {};
  return {
    scaleU: typeof uv.scaleU === 'number' ? uv.scaleU : 1.0,
    scaleV: typeof uv.scaleV === 'number' ? uv.scaleV : 1.0,
    rotation: typeof uv.rotation === 'number' ? uv.rotation : 0,
    offsetU: typeof uv.offsetU === 'number' ? uv.offsetU : 0,
    offsetV: typeof uv.offsetV === 'number' ? uv.offsetV : 0,
  };
}

export function setWallUV(room, wall, params = {}) {
  if (!room || !wall) return;
  room.wallUV ||= {};
  const current = getWallUV(room, wall);
  room.wallUV[wall] = {
    scaleU: typeof params.scaleU === 'number' ? params.scaleU : current.scaleU,
    scaleV: typeof params.scaleV === 'number' ? params.scaleV : current.scaleV,
    rotation: typeof params.rotation === 'number' ? params.rotation : current.rotation,
    offsetU: typeof params.offsetU === 'number' ? params.offsetU : current.offsetU,
    offsetV: typeof params.offsetV === 'number' ? params.offsetV : current.offsetV,
  };
}

export function applyWallUV(state, params, { scope = 'single', room, wall, level = 0 } = {}) {
  const applyToRoomWall = (r, w) => setWallUV(r, w, params);
  if (scope === 'plan') {
    for (const r of state.rooms) for (const w of WALLS) applyToRoomWall(r, w);
  } else if (scope === 'level') {
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level))
      for (const w of WALLS) applyToRoomWall(r, w);
  } else if (scope === 'room') {
    if (room) for (const w of WALLS) applyToRoomWall(room, w);
  } else {
    if (room && wall) applyToRoomWall(room, wall);
  }
}

export function applyWallFinish(state, finishId, { scope = 'single', room, wall, level = 0 } = {}) {
  if (scope === 'plan') {
    for (const r of state.rooms) for (const w of WALLS) r.walls[w] = finishId;
  } else if (scope === 'level') {
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level))
      for (const w of WALLS) r.walls[w] = finishId;
  } else if (scope === 'room') {
    if (room) for (const w of WALLS) room.walls[w] = finishId;
  } else {
    if (room && wall) room.walls[wall] = finishId;
  }
}

const WALL_ASSEMBLY_LAYER_BOUNDS = {
  gypsumThickness: { min: 0, max: 48 },
  studDepth: { min: 1.5, max: 48 },
  sheathingThickness: { min: 0, max: 48 },
  airGapThickness: { min: 0, max: 48 },
  claddingThickness: { min: 0, max: 48 },
};

export function clampWallAssemblyOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return {};
  const normalized = { ...overrides };
  if (normalized.gypsumThickness === undefined && normalized.layerThickness !== undefined) {
    normalized.gypsumThickness = normalized.layerThickness;
  }
  if (normalized.airGapThickness === undefined && normalized.claddingOffset !== undefined) {
    normalized.airGapThickness = normalized.claddingOffset;
  }
  const clamped = {};
  for (const [key, bounds] of Object.entries(WALL_ASSEMBLY_LAYER_BOUNDS)) {
    const raw = normalized[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) continue;
    clamped[key] = Math.min(bounds.max, Math.max(bounds.min, num));
  }
  return clamped;
}

export function getWallAssemblyOverrides(room, wall) {
  if (!room || wall == null || wall === '') return {};
  const existing = room.wallAssemblyOverrides?.[wall];
  if (!existing || typeof existing !== 'object') return {};
  return clampWallAssemblyOverrides(existing);
}

export function setWallAssemblyOverrides(room, wall, overrides) {
  if (!room || wall == null || wall === '') return;
  const isReset =
    overrides == null ||
    overrides.reset === true ||
    (typeof overrides === 'object' && Object.keys(overrides).length === 0);
  if (isReset) {
    if (room.wallAssemblyOverrides && typeof room.wallAssemblyOverrides === 'object') {
      delete room.wallAssemblyOverrides[wall];
    }
    return;
  }
  const sanitized = clampWallAssemblyOverrides(overrides);
  if (Object.keys(sanitized).length === 0) return;
  room.wallAssemblyOverrides ||= {};
  const current = getWallAssemblyOverrides(room, wall);
  room.wallAssemblyOverrides[wall] = {
    ...current,
    ...sanitized,
  };
}

export function applyWallAssemblyOverrides(
  state,
  overrides,
  { scope = 'single', room, wall, level = 0 } = {}
) {
  const getWallKeysForRoom = (r) => {
    const pts = getRoomPoints(r);
    return pts.length === 4 ? WALLS : [...WALLS, ...pts.map((_, i) => i)];
  };
  if (scope === 'plan') {
    if (!state || !Array.isArray(state.rooms)) return;
    for (const r of state.rooms) {
      const target = ensureRoomCopy(state, r);
      for (const w of getWallKeysForRoom(target)) setWallAssemblyOverrides(target, w, overrides);
    }
  } else if (scope === 'level') {
    if (!state || !Array.isArray(state.rooms)) return;
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level)) {
      const target = ensureRoomCopy(state, r);
      for (const w of getWallKeysForRoom(target)) setWallAssemblyOverrides(target, w, overrides);
    }
  } else if (scope === 'room') {
    const target = ensureRoomCopy(state, room);
    if (target) {
      for (const w of getWallKeysForRoom(target)) setWallAssemblyOverrides(target, w, overrides);
    }
  } else {
    const target = ensureRoomCopy(state, room);
    if (target && wall != null && wall !== '') {
      setWallAssemblyOverrides(target, wall, overrides);
    }
  }
}

export function applyFloorFinish(state, finishId, { scope = 'single', room, level = 0 } = {}) {
  if (scope === 'plan') {
    for (const r of state.rooms) r.floor = finishId;
  } else if (scope === 'level') {
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level)) r.floor = finishId;
  } else {
    if (room) room.floor = finishId;
  }
}

export function nearestWallOnLevel(state, p, level = 0, maxDist = 24, onlyRoom = null) {
  let best = null;
  const rooms = onlyRoom ? [onlyRoom] : state.rooms.filter((r) => (r.level || 0) === level);
  for (const room of rooms)
    for (const wall of WALLS) {
      const s = wallSeg(room, wall);
      const t = Math.max(0, Math.min(s.len, (p.x - s.ax) * s.dx + (p.y - s.ay) * s.dy));
      const cx = s.ax + s.dx * t;
      const cy = s.ay + s.dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      const inside =
        p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h ? 0 : 1;
      const score = d + inside * 0.3;
      if (d <= maxDist && (!best || score < best.score)) best = { room, wall, t, d, score };
    }
  return best;
}

export function roomAtOnLevel(state, p, level = 0) {
  return (
    state.rooms
      .filter(
        (r) =>
          (r.level || 0) === level &&
          p.x >= r.x - WT / 2 &&
          p.x <= r.x + r.w + WT / 2 &&
          p.y >= r.y - WT / 2 &&
          p.y <= r.y + r.h + WT / 2
      )
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null
  );
}

export function sampleFinishAt(state, p, level = 0, maxDist = 24) {
  const nw = nearestWallOnLevel(state, p, level, maxDist);
  if (nw) return { kind: 'wall', finishId: nw.room.walls[nw.wall], room: nw.room, wall: nw.wall };
  const r = roomAtOnLevel(state, p, level);
  if (r) return { kind: 'floor', finishId: r.floor, room: r };
  return null;
}

export function serialize(state) {
  return JSON.stringify(state, null, 1);
}
export function deserialize(text) {
  const s = JSON.parse(text);
  if (!s || !Array.isArray(s.rooms)) throw new Error('Not a Homegen plan');
  s.nextId = s.nextId || 1000;
  if (s.background) {
    if (s.background.attributionText !== undefined)
      s.background.attributionText = s.background.attributionText || null;
    if (s.background.provider !== undefined) s.background.provider = s.background.provider || null;
    if (s.background.licenseUrl !== undefined)
      s.background.licenseUrl = s.background.licenseUrl || null;
    if (s.background.logoUrl !== undefined) s.background.logoUrl = s.background.logoUrl || null;
    if (s.background.isGeospatial !== undefined)
      s.background.isGeospatial = !!s.background.isGeospatial;
    if (s.background.presetKey !== undefined)
      s.background.presetKey = s.background.presetKey || null;

    if (s.background.affineMatrix && Array.isArray(s.background.affineMatrix)) {
      s.background.x = s.background.affineMatrix[4];
      s.background.y = s.background.affineMatrix[5];
      s.background.scale = Math.hypot(s.background.affineMatrix[0], s.background.affineMatrix[1]);

      if (!s.background.geoBounds || typeof s.background.geoBounds !== 'object') {
        const w = s.background.width || 1000;
        const h = s.background.height || 1000;
        s.background.geoBounds = computeGeoBounds(
          s.background.affineMatrix,
          w,
          h,
          s.background.worldfileCRS || 'PLAN'
        );
      }
    }
  } else {
    s.background = null;
  }
  s.customFinishes = s.customFinishes || [];
  if (!s.crs || typeof s.crs !== 'object' || !isValidEPSGCode(s.crs.epsg)) {
    const fallback = defaultCRS();
    const existingCrs = s.crs && typeof s.crs === 'object' ? s.crs : {};
    const epsg = isValidEPSGCode(existingCrs.epsg)
      ? normalizeEPSGCode(existingCrs.epsg)
      : fallback.epsg;
    s.crs = {
      epsg,
      proj4: existingCrs.proj4 || fallback.proj4,
      wkt: existingCrs.wkt || fallback.wkt,
      origin: existingCrs.origin || fallback.origin,
      units: existingCrs.units || fallback.units,
      geojson: existingCrs.geojson || fallback.geojson,
    };
  } else {
    const fallback = defaultCRS();
    s.crs.epsg = normalizeEPSGCode(s.crs.epsg);
    s.crs.proj4 = s.crs.proj4 || getEPSGDefinition(s.crs.epsg) || fallback.proj4;
    s.crs.wkt = s.crs.wkt || fallback.wkt;
    s.crs.origin = s.crs.origin || fallback.origin;
    s.crs.units = s.crs.units || fallback.units;
    s.crs.geojson = s.crs.geojson || fallback.geojson;
  }
  s.settings ||= {};
  s.settings.branding = {
    logoDataUrl: s.settings.branding?.logoDataUrl || null,
    stamp: {
      shape: 'circle',
      titleText: 'APPROVED',
      subtitleText: 'ARCHITECTURAL PLAN',
      licenseText: '',
      dateText: '',
      borderColor: '#d32f2f',
      borderStyle: 'solid',
      textColor: '#d32f2f',
      opacity: 0.9,
      enabled: true,
      ...s.settings.branding?.stamp,
    },
    watermark: {
      text: '',
      color: '#9e9e9e',
      opacity: 0.2,
      fontSize: 24,
      angle: -45,
      enabled: true,
      ...s.settings.branding?.watermark,
    },
  };
  for (const r of s.rooms) {
    r.openings ||= [];
    r.items ||= [];
    if (r.level == null) r.level = 0;
    r.wallUV ||= {};
    const pts = getRoomPoints(r);
    r.points = pts;
    const bbox = getRoomBoundingBox(pts);
    r.x = bbox.x;
    r.y = bbox.y;
    r.w = bbox.w;
    r.h = bbox.h;
    for (const w of WALLS) {
      r.wallUV[w] = getWallUV(r, w);
    }
    if (r.wallAssemblyOverrides && typeof r.wallAssemblyOverrides === 'object') {
      const sanitizedOverrides = {};
      for (const [wKey, wOverrides] of Object.entries(r.wallAssemblyOverrides)) {
        const cleaned = clampWallAssemblyOverrides(wOverrides);
        if (Object.keys(cleaned).length > 0) {
          sanitizedOverrides[wKey] = cleaned;
        }
      }
      r.wallAssemblyOverrides = sanitizedOverrides;
    }
  }
  const maxRoomLevel = s.rooms.length
    ? Math.max(...s.rooms.map((r) => (r.level != null ? r.level : 0)))
    : 0;
  const minRoomLevel = s.rooms.length
    ? Math.min(...s.rooms.map((r) => (r.level != null ? r.level : 0)))
    : 0;
  s.levels = Math.max(s.levels || 1, maxRoomLevel + 1);

  if (!Array.isArray(s.levelMetadata) || s.levelMetadata.length === 0) {
    s.levelMetadata = [];
    const minL = Math.min(0, minRoomLevel);
    const maxL = Math.max((s.levels || 1) - 1, maxRoomLevel);
    for (let l = minL; l <= maxL; l++) {
      s.levelMetadata.push(defaultLevelDescriptor(l));
    }
  } else {
    for (const r of s.rooms) {
      const l = r.level != null ? r.level : 0;
      if (!s.levelMetadata.some((m) => m && m.index === l)) {
        s.levelMetadata.push(defaultLevelDescriptor(l));
      }
    }
    s.levelMetadata.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }
  s.elevationGrid = s.elevationGrid ? deserializeElevationGrid(s.elevationGrid) : null;
  for (const finish of s.customFinishes) {
    registerCustomWallFinish(finish, s);
  }
  migratePlanTo3DMeshGraph(s);
  return s;
}

const UNICODE_FRACTIONS = {
  '¼': ' 1/4',
  '½': ' 1/2',
  '¾': ' 3/4',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
  '⅛': ' 1/8',
  '⅜': ' 3/8',
  '⅝': ' 5/8',
  '⅞': ' 7/8',
};

const DISTANCE_NUM_PATTERN =
  '(?:\\d+\\s*(?:\\s+|-)\\s*\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|\\.\\d+)';
const FT_UNIT_PATTERN = "(?:'|feet(?![a-z])|foot(?![a-z])|ft(?:\\.(?!\\d))?(?![a-z]))";
const IN_UNIT_PATTERN = '(?:"|inches(?![a-z])|inch(?![a-z])|in(?:\\.(?!\\d))?(?![a-z]))';

const FT_IN_DISTANCE_RE = new RegExp(
  `^(${DISTANCE_NUM_PATTERN})\\s*${FT_UNIT_PATTERN}(?:\\s*(?:-\\s*)?(${DISTANCE_NUM_PATTERN})\\s*(?:${IN_UNIT_PATTERN})?\\s*)?$`
);
const IN_ONLY_DISTANCE_RE = new RegExp(`^(${DISTANCE_NUM_PATTERN})\\s*${IN_UNIT_PATTERN}$`);
const METRIC_DISTANCE_RE = new RegExp(
  `^(${DISTANCE_NUM_PATTERN})\\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?)$`
);
const UNITLESS_DISTANCE_RE = new RegExp(`^(${DISTANCE_NUM_PATTERN})$`);

function parseNumericToken(raw) {
  const s = raw.trim();
  const mixedMatch = s.match(/^(\d+)\s*(?:\s+|-)\s*(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) return NaN;
    return whole + num / den;
  }
  const fracMatch = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0) return NaN;
    return num / den;
  }
  const val = Number(s);
  return Number.isFinite(val) ? val : NaN;
}

export function parseDistanceInInches(str, options = {}) {
  const {
    defaultUnit = 'auto',
    allowZero = false,
    allowNegative = false,
  } = options && typeof options === 'object' ? options : {};

  if (str === null || str === undefined) return null;
  if (typeof str === 'number') {
    if (!Number.isFinite(str)) return null;
    if (str < 0 && !allowNegative) return null;
    if (str === 0) return allowZero ? 0 : null;
    const absNum = Math.abs(str);
    const sign = str < 0 ? -1 : 1;
    if (defaultUnit === 'in') return sign * absNum;
    if (defaultUnit === 'ft') return sign * absNum * 12;
    return sign * (absNum <= 50 ? absNum * 12 : absNum);
  }

  let normalized = String(str)
    .trim()
    .toLowerCase()
    .replace(/[’‘′]/g, "'")
    .replace(/[”“″]/g, '"')
    .replace(/''/g, '"')
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (ch) => UNICODE_FRACTIONS[ch] || ch)
    .trim();

  if (!normalized) return null;

  let isNegative = false;
  if (normalized.startsWith('-')) {
    if (!allowNegative) return null;
    isNegative = true;
    normalized = normalized.slice(1).trim();
  } else if (normalized.startsWith('+')) {
    normalized = normalized.slice(1).trim();
  }
  if (!normalized) return null;

  const applySign = (val) => {
    if (val === null || !Number.isFinite(val)) return null;
    if (val === 0) return allowZero ? 0 : null;
    return isNegative ? -val : val;
  };

  const metricMatch = normalized.match(METRIC_DISTANCE_RE);
  if (metricMatch) {
    const val = parseNumericToken(metricMatch[1]);
    if (isNaN(val)) return null;
    const unit = metricMatch[2];
    if (unit === 'mm' || unit.startsWith('millimet')) return applySign(val * 0.0393701);
    if (unit === 'cm' || unit.startsWith('centimet')) return applySign(val * 0.393701);
    return applySign(val * 39.3701);
  }

  const ftInMatch = normalized.match(FT_IN_DISTANCE_RE);
  if (ftInMatch) {
    const feet = parseNumericToken(ftInMatch[1]);
    const inches = ftInMatch[2] !== undefined ? parseNumericToken(ftInMatch[2]) : 0;
    if (isNaN(feet) || isNaN(inches)) return null;
    return applySign(feet * 12 + inches);
  }

  const inMatch = normalized.match(IN_ONLY_DISTANCE_RE);
  if (inMatch) {
    const inches = parseNumericToken(inMatch[1]);
    return isNaN(inches) ? null : applySign(inches);
  }

  const unitlessMatch = normalized.match(UNITLESS_DISTANCE_RE);
  if (unitlessMatch) {
    const num = parseNumericToken(unitlessMatch[1]);
    if (isNaN(num)) return null;
    if (num === 0) return allowZero ? 0 : null;
    if (defaultUnit === 'ft') return applySign(num * 12);
    if (defaultUnit === 'in') return applySign(num);
    if (normalized.includes('/')) return applySign(num);
    return applySign(num <= 50 ? num * 12 : num);
  }

  return null;
}

export function formatDistanceInInches(inches, options = {}) {
  const {
    zeroInchesSuffix = false,
    includeZeroInches = false,
    emptyOnInvalid = false,
  } = options && typeof options === 'object' ? options : {};
  if (
    inches === null ||
    inches === undefined ||
    typeof inches !== 'number' ||
    !Number.isFinite(inches)
  ) {
    return emptyOnInvalid ? '' : zeroInchesSuffix || includeZeroInches ? '0\' 0"' : '0"';
  }
  return formatFractionalInches(inches, {
    includeZeroInches: Boolean(zeroInchesSuffix || includeZeroInches),
  });
}

export function parseElevationInInches(str) {
  if (str === null || str === undefined) return null;
  str = String(str).trim().toLowerCase();
  if (!str) return null;
  if (str === '0' || str === '0"' || str === "0'") return 0;
  const isNegative = str.startsWith('-');
  if (isNegative) str = str.slice(1).trim();
  const val = parseDistanceInInches(str);
  if (val === null) {
    const num = parseFloat(str);
    if (!isNaN(num)) return isNegative ? -num : num;
    return null;
  }
  return isNegative ? -val : val;
}

export class History {
  constructor(state, label = 'Initial State') {
    this.stack = [
      {
        state: cloneWithSharing(state),
        label: label || 'Initial State',
        timestamp: Date.now(),
      },
    ];
    this.i = 0;
  }
  push(state, label = 'Action', timestamp = Date.now()) {
    this.stack = this.stack.slice(0, this.i + 1);
    const prev = this.stack[this.i]?.state;
    this.stack.push({
      state: cloneWithSharing(state, prev),
      label: label || 'Action',
      timestamp: timestamp || Date.now(),
    });
    this.i++;
    if (this.stack.length > 100) {
      this.stack.shift();
      this.i--;
    }
  }
  canUndo() {
    return this.i > 0;
  }
  canRedo() {
    return this.i < this.stack.length - 1;
  }
  undo() {
    return this.canUndo() ? clone(this.stack[--this.i].state) : null;
  }
  redo() {
    return this.canRedo() ? clone(this.stack[++this.i].state) : null;
  }
  peekUndoLabel() {
    return this.canUndo() ? this.stack[this.i].label : null;
  }
  peekRedoLabel() {
    return this.canRedo() ? this.stack[this.i + 1].label : null;
  }
  jumpTo(index) {
    if (typeof index !== 'number' || index < 0 || index >= this.stack.length) {
      return null;
    }
    this.i = index;
    return clone(this.stack[this.i].state);
  }
  getTimeline() {
    return this.stack.map((entry, idx) => ({
      index: idx,
      label: entry.label,
      timestamp: entry.timestamp,
      active: idx === this.i,
    }));
  }
}

export const ModelHistory = History;

export function getBounds(state, id) {
  const hit = findOwner(state, id);
  if (!hit) return null;
  const { room, kind, obj } = hit;
  if (kind === 'room') {
    return {
      id,
      kind,
      room,
      obj,
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      cx: obj.x + obj.w / 2,
      cy: obj.y + obj.h / 2,
    };
  }
  if (kind === 'item') {
    const def = ITEM_BY_ID[obj.type] || {};
    if (def.mount === 'floor') {
      const fp = footprint(obj, def);
      return {
        id,
        kind,
        room,
        obj,
        def,
        x: fp.x,
        y: fp.y,
        w: fp.w,
        h: fp.h,
        cx: obj.x !== undefined ? obj.x : fp.x + fp.w / 2,
        cy: obj.y !== undefined ? obj.y : fp.y + fp.h / 2,
      };
    }
    if (def.mount === 'ceiling') {
      const w = def.w || 12;
      const h = def.w || 12;
      return {
        id,
        kind,
        room,
        obj,
        def,
        x: obj.x - w / 2,
        y: obj.y - h / 2,
        w,
        h,
        cx: obj.x,
        cy: obj.y,
      };
    }
    if (def.mount === 'wall') {
      const p = wallPoint(room, obj.wall, obj.offset, 0);
      return {
        id,
        kind,
        room,
        obj,
        def,
        x: p.x - 4,
        y: p.y - 4,
        w: 8,
        h: 8,
        cx: p.x,
        cy: p.y,
      };
    }
  }
  if (kind === 'opening') {
    const p1 = wallPoint(room, obj.wall, obj.offset, 0);
    const p2 = wallPoint(room, obj.wall, obj.offset + obj.width, 0);
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const w = Math.max(4, maxX - minX);
    const h = Math.max(4, maxY - minY);
    return {
      id,
      kind,
      room,
      obj,
      x: minX,
      y: minY,
      w,
      h,
      cx: (p1.x + p2.x) / 2,
      cy: (p1.y + p2.y) / 2,
    };
  }
  return null;
}

export function setItemPosition(state, hit, targetCenterX, targetCenterY) {
  const { room, kind, obj } = hit;
  if (kind === 'room') {
    const newX = targetCenterX - obj.w / 2;
    const newY = targetCenterY - obj.h / 2;
    moveRoom(obj, newX, newY);
    return;
  }
  if (kind === 'item') {
    const def = ITEM_BY_ID[obj.type] || {};
    if (def.mount === 'floor' || def.mount === 'ceiling') {
      obj.x = targetCenterX;
      obj.y = targetCenterY;
      const targetRoom = roomAtOnLevel(
        state,
        { x: targetCenterX, y: targetCenterY },
        room.level || 0
      );
      if (targetRoom && targetRoom.id !== room.id) {
        room.items = room.items.filter((i) => i.id !== obj.id);
        targetRoom.items.push(obj);
      }
    } else if (def.mount === 'wall') {
      const len = wallLength(room, obj.wall);
      if (obj.wall === 'N' || obj.wall === 'S') {
        const localX = targetCenterX - room.x;
        obj.offset = Math.max(8, Math.min(len - 8, localX));
      } else {
        const localY = targetCenterY - room.y;
        obj.offset = Math.max(8, Math.min(len - 8, localY));
      }
    }
  }
  if (kind === 'opening') {
    const len = wallLength(room, obj.wall);
    if (obj.wall === 'N' || obj.wall === 'S') {
      const localX = targetCenterX - room.x - obj.width / 2;
      obj.offset = Math.max(0, Math.min(len - obj.width, localX));
    } else {
      const localY = targetCenterY - room.y - obj.width / 2;
      obj.offset = Math.max(0, Math.min(len - obj.width, localY));
    }
  }
}

export function alignItems(state, ids, alignment) {
  const idArray = Array.from(ids || []);
  const boundsList = idArray.map((id) => getBounds(state, id)).filter((b) => b !== null);

  if (boundsList.length < 2) return false;

  const minX = Math.min(...boundsList.map((b) => b.x));
  const maxX = Math.max(...boundsList.map((b) => b.x + b.w));
  const centerX = (minX + maxX) / 2;
  const minY = Math.min(...boundsList.map((b) => b.y));
  const maxY = Math.max(...boundsList.map((b) => b.y + b.h));
  const centerY = (minY + maxY) / 2;

  for (const b of boundsList) {
    const hit = findOwner(state, b.id);
    if (!hit) continue;

    let targetCX = b.cx;
    let targetCY = b.cy;

    switch (alignment) {
      case 'left':
        targetCX = minX + b.w / 2;
        break;
      case 'center':
        targetCX = centerX;
        break;
      case 'right':
        targetCX = maxX - b.w / 2;
        break;
      case 'top':
        targetCY = minY + b.h / 2;
        break;
      case 'middle':
        targetCY = centerY;
        break;
      case 'bottom':
        targetCY = maxY - b.h / 2;
        break;
      default:
        break;
    }

    setItemPosition(state, hit, targetCX, targetCY);
  }

  return true;
}

export function distributeItems(state, ids, direction, spacing = null, spacingType = 'center') {
  if (spacing !== null && typeof spacing === 'object') {
    const opts = spacing;
    spacingType = opts.spacingType ?? opts.type ?? opts.mode ?? 'center';
    spacing = opts.spacing ?? opts.distance ?? null;
  }

  let resolvedSpacing = null;
  if (typeof spacing === 'number') {
    resolvedSpacing = Number.isFinite(spacing) && spacing > 0 ? spacing : null;
  } else if (typeof spacing === 'string') {
    const parsed = parseDistanceInInches(spacing);
    resolvedSpacing =
      typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const idArray = Array.from(ids || []);
  const boundsList = idArray.map((id) => getBounds(state, id)).filter((b) => b !== null);

  const minCount = resolvedSpacing !== null ? 2 : 3;
  if (boundsList.length < minCount) return false;

  const isGap = spacingType === 'gap' || spacingType === 'edge' || spacingType === 'edge-to-edge';

  if (direction === 'horizontal') {
    if (resolvedSpacing !== null) {
      boundsList.sort((a, b) => (isGap ? a.x - b.x || a.w - b.w : a.cx - b.cx));
      const first = boundsList[0];
      let prevRight = first.x + first.w;
      for (let i = 1; i < boundsList.length; i++) {
        const b = boundsList[i];
        const hit = findOwner(state, b.id);
        const targetCX = isGap
          ? prevRight + resolvedSpacing + b.w / 2
          : first.cx + i * resolvedSpacing;
        if (hit) {
          setItemPosition(state, hit, targetCX, b.cy);
        }
        prevRight = isGap ? prevRight + resolvedSpacing + b.w : targetCX + b.w / 2;
      }
    } else {
      boundsList.sort((a, b) => a.x - b.x || a.w - b.w);
      const first = boundsList[0];
      const last = boundsList[boundsList.length - 1];
      const outerSpan = last.x + last.w - first.x;
      const totalWidth = boundsList.reduce((sum, b) => sum + b.w, 0);
      const gap = (outerSpan - totalWidth) / (boundsList.length - 1);

      let currentX = first.x + first.w + gap;
      for (let i = 1; i < boundsList.length - 1; i++) {
        const b = boundsList[i];
        const hit = findOwner(state, b.id);
        if (hit) {
          setItemPosition(state, hit, currentX + b.w / 2, b.cy);
        }
        currentX += b.w + gap;
      }
    }
  } else if (direction === 'vertical') {
    if (resolvedSpacing !== null) {
      boundsList.sort((a, b) => (isGap ? a.y - b.y || a.h - b.h : a.cy - b.cy));
      const first = boundsList[0];
      let prevBottom = first.y + first.h;
      for (let i = 1; i < boundsList.length; i++) {
        const b = boundsList[i];
        const hit = findOwner(state, b.id);
        const targetCY = isGap
          ? prevBottom + resolvedSpacing + b.h / 2
          : first.cy + i * resolvedSpacing;
        if (hit) {
          setItemPosition(state, hit, b.cx, targetCY);
        }
        prevBottom = isGap ? prevBottom + resolvedSpacing + b.h : targetCY + b.h / 2;
      }
    } else {
      boundsList.sort((a, b) => a.y - b.y || a.h - b.h);
      const first = boundsList[0];
      const last = boundsList[boundsList.length - 1];
      const outerSpan = last.y + last.h - first.y;
      const totalHeight = boundsList.reduce((sum, b) => sum + b.h, 0);
      const gap = (outerSpan - totalHeight) / (boundsList.length - 1);

      let currentY = first.y + first.h + gap;
      for (let i = 1; i < boundsList.length - 1; i++) {
        const b = boundsList[i];
        const hit = findOwner(state, b.id);
        if (hit) {
          setItemPosition(state, hit, b.cx, currentY + b.h / 2);
        }
        currentY += b.h + gap;
      }
    }
  } else {
    return false;
  }

  return true;
}

export function removeSet(state, ids) {
  const idArray = Array.from(ids || []);
  let removedCount = 0;
  for (const id of idArray) {
    if (removeById(state, id)) {
      removedCount++;
    }
  }
  return removedCount > 0;
}

export { WT, GRID, EPS, wallPoint, wallSeg };
