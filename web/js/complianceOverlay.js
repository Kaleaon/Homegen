// Spatial compliance adapter converting document state & rule reports into an overlay scene graph.
import {
  wallPoint,
  interior,
  footprint,
  fixtureZone,
  rectsOverlap,
  rectInside,
  floorAreaSqFt,
} from './geometry.js';
import { ROOM_TYPES, ITEM_BY_ID, OPENING_BY_ID, openingMetrics } from './catalog.js';
import { openingInfo } from './codes.js';

const fmt = (inches) =>
  `${Math.floor(inches / 12)}'${Math.round(inches % 12) ? ` ${Math.round(inches % 12)}"` : ' 0"'}`;

const SPATIAL_GRID_CELL_SIZE = 64;

function fnv1aHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function computeStateHash(state) {
  if (!state) return '';
  if (state._hash) return String(state._hash);
  if (state.hash) return String(state.hash);

  let str = `${state.version || 0}:${state.levels || 1}:${state.rooms?.length || 0};`;
  for (const r of state.rooms || []) {
    str += `${r.id}:${r.type}:${r.level || 0}:${r.x}:${r.y}:${r.w}:${r.h}:${r.ceiling}:${r.floor}:${r.cladding};`;
    if (r.items) {
      for (const i of r.items) {
        str += `${i.id}:${i.type}:${i.x}:${i.y}:${i.rot}:${i.wall}:${i.offset};`;
      }
    }
    if (r.openings) {
      for (const o of r.openings) {
        str += `${o.id}:${o.type}:${o.wall}:${o.offset}:${o.width}:${o.swing};`;
      }
    }
  }
  return fnv1aHash(str);
}

export class SpatialOverlayNode {
  constructor(id, type, bounds, data = {}) {
    this.id = id;
    this.type = type; // 'violation' | 'fixtureClearance' | 'egressReach' | 'constraintHandle' | 'dimensionLabel'
    this.bounds = bounds; // { x, y, w, h } or { x, y }
    this.data = data;
    this.visible = data.visible !== false;
  }
}

export class ComplianceOverlayScene {
  constructor(options = {}) {
    this.nodes = [];
    this.nodesById = new Map();
    this.roomIndex = new Map();
    this.itemIndex = new Map();
    this.openingIndex = new Map();
    this.spatialGrid = new Map();
    this.lastState = null;
    this.lastStateHash = null;
    this.options = options;
  }

  /**
   * Rebuilds index Maps (roomIndex, itemIndex, openingIndex) and 2D spatialGrid.
   */
  rebuildIndexes(state) {
    this.roomIndex.clear();
    this.itemIndex.clear();
    this.openingIndex.clear();
    this.spatialGrid.clear();

    if (!state || !Array.isArray(state.rooms)) return;

    for (const room of state.rooms) {
      const roomInterior = interior(room);
      const roomEntry = {
        room,
        interior: roomInterior,
        isSleeping: !!ROOM_TYPES[room.type]?.sleeping,
        isHabitable: !!ROOM_TYPES[room.type]?.habitable && room.type !== 'kitchen',
        minDim: Math.min(room.w, room.h),
        areaSqFt: floorAreaSqFt(room),
      };
      this.roomIndex.set(room.id, roomEntry);

      if (Array.isArray(room.items)) {
        for (const item of room.items) {
          const def = ITEM_BY_ID[item.type];
          let fp = null;
          if (def && def.mount === 'floor') {
            fp = footprint(item, def);
          }
          const itemEntry = {
            item,
            room,
            def,
            footprint: fp,
          };
          this.itemIndex.set(item.id, itemEntry);

          if (def && def.mount === 'floor' && !def.flat && fp) {
            const minCol = Math.floor(fp.x / SPATIAL_GRID_CELL_SIZE);
            const maxCol = Math.floor((fp.x + fp.w) / SPATIAL_GRID_CELL_SIZE);
            const minRow = Math.floor(fp.y / SPATIAL_GRID_CELL_SIZE);
            const maxRow = Math.floor((fp.y + fp.h) / SPATIAL_GRID_CELL_SIZE);

            for (let col = minCol; col <= maxCol; col++) {
              for (let row = minRow; row <= maxRow; row++) {
                const cellKey = `${col},${row}`;
                let bin = this.spatialGrid.get(cellKey);
                if (!bin) {
                  bin = [];
                  this.spatialGrid.set(cellKey, bin);
                }
                bin.push(itemEntry);
              }
            }
          }
        }
      }

      if (Array.isArray(room.openings)) {
        for (const opening of room.openings) {
          const def = OPENING_BY_ID[opening.type];
          const info = openingInfo(state, room, opening);
          const p0 = wallPoint(room, opening.wall, opening.offset, 0);
          const p1 = wallPoint(room, opening.wall, opening.offset + opening.width, 0);
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          const metrics = def ? openingMetrics(def) : null;

          const openingEntry = {
            opening,
            room,
            def,
            info,
            p0,
            p1,
            midX,
            midY,
            metrics,
          };
          this.openingIndex.set(opening.id, openingEntry);
        }
      }
    }
  }

  /**
   * Queries spatial grid for candidate floor items in grid bins overlapping `zone`.
   */
  querySpatialGrid(zone, roomId) {
    const minCol = Math.floor(zone.x / SPATIAL_GRID_CELL_SIZE);
    const maxCol = Math.floor((zone.x + zone.w) / SPATIAL_GRID_CELL_SIZE);
    const minRow = Math.floor(zone.y / SPATIAL_GRID_CELL_SIZE);
    const maxRow = Math.floor((zone.y + zone.h) / SPATIAL_GRID_CELL_SIZE);

    const seenItemIds = new Set();
    const candidates = [];

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const bin = this.spatialGrid.get(`${col},${row}`);
        if (bin) {
          for (const itemEntry of bin) {
            if (itemEntry.room.id === roomId && !seenItemIds.has(itemEntry.item.id)) {
              seenItemIds.add(itemEntry.item.id);
              candidates.push(itemEntry);
            }
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Updates the overlay scene graph from current state, report, and UI state options.
   * Pure adapter: does NOT modify state or doc.
   */
  update(state, report, options = {}) {
    if (!state) return this;
    const curLevel = options.curLevel ?? 0;
    const selection = options.selection || null;
    const drag = options.drag || null;

    const stateHash = options.stateHash ?? computeStateHash(state);
    if (state !== this.lastState || stateHash !== this.lastStateHash) {
      this.rebuildIndexes(state);
      this.lastState = state;
      this.lastStateHash = stateHash;
    }

    // Filter rooms for current level
    const levelRooms = (state.rooms || []).filter((r) => (r.level || 0) === curLevel);

    const nextNodes = [];
    const fixBadgeCounts = new Map();

    // 1. Compile violation nodes
    if (report && report.violations) {
      for (const v of report.violations) {
        let bounds = null;
        let targetId = v.itemId || v.openingId || v.roomId;
        if (v.itemId) {
          const itemEntry = this.itemIndex.get(v.itemId);
          if (itemEntry && (itemEntry.room.level || 0) === curLevel) {
            const it = itemEntry.item;
            const def = itemEntry.def;
            if (def) {
              if (def.mount === 'floor') {
                bounds = itemEntry.footprint || footprint(it, def);
              } else {
                bounds = { x: it.x - 12, y: it.y - 12, w: 24, h: 24 };
              }
            }
          }
        } else if (v.openingId) {
          const openingEntry = this.openingIndex.get(v.openingId);
          if (openingEntry && (openingEntry.room.level || 0) === curLevel) {
            const o = openingEntry.opening;
            const p = openingEntry.p0;
            bounds = { x: p.x - 12, y: p.y - 12, w: o.width + 24, h: 24 };
          }
        } else if (v.roomId) {
          const roomEntry = this.roomIndex.get(v.roomId);
          if (roomEntry && (roomEntry.room.level || 0) === curLevel) {
            const room = roomEntry.room;
            bounds = { x: room.x, y: room.y, w: room.w, h: room.h };
          }
        }

        if (bounds) {
          const isFixable = !!v.fixable;
          let fixButtonBounds = null;
          if (isFixable) {
            const btnW = 36;
            const btnH = 16;
            const key = `${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.w)},${Math.round(bounds.h)}`;
            const idx = fixBadgeCounts.get(key) || 0;
            fixBadgeCounts.set(key, idx + 1);

            const fx =
              bounds.w >= btnW + 8
                ? bounds.x + bounds.w - btnW - 4
                : bounds.x + (bounds.w - btnW) / 2;
            const fy =
              bounds.w >= btnW + 8
                ? bounds.y + 4 + idx * (btnH + 4)
                : bounds.y - btnH - 2 - idx * (btnH + 4);
            fixButtonBounds = { x: fx, y: fy, w: btnW, h: btnH };
          }
          nextNodes.push(
            new SpatialOverlayNode(`node:violation:${v.id}`, 'violation', bounds, {
              violation: v,
              severity: v.severity,
              message: v.msg,
              ref: v.ref,
              targetId,
              fixable: isFixable,
              fixButtonBounds,
            })
          );
        }
      }
    }

    // 2. Compile fixture clearance zone nodes
    for (const room of levelRooms) {
      const roomEntry = this.roomIndex.get(room.id);
      const ir = roomEntry ? roomEntry.interior : interior(room);

      for (const it of room.items) {
        const itemEntry = this.itemIndex.get(it.id);
        const def = itemEntry?.def || ITEM_BY_ID[it.type];
        if (!def) continue;

        if (
          def.clearance ||
          ['toilet', 'sink', 'tub', 'shower'].includes(def.shape) ||
          def.fixture
        ) {
          const zone = fixtureZone(it, def, 15, 21);
          const insideRoom = rectInside(zone, ir);

          const candidates = this.querySpatialGrid(zone, room.id);
          let overlapsOther = false;
          for (const candidate of candidates) {
            if (candidate.item.id === it.id) continue;
            const od = candidate.def;
            if (od && od.mount === 'floor' && !od.flat) {
              const candidateFp = candidate.footprint || footprint(candidate.item, od);
              if (rectsOverlap(zone, candidateFp)) {
                overlapsOther = true;
                break;
              }
            }
          }

          const isColliding = !insideRoom || overlapsOther;

          nextNodes.push(
            new SpatialOverlayNode(`node:clearance:${it.id}`, 'fixtureClearance', zone, {
              itemId: it.id,
              roomId: room.id,
              itemName: def.name,
              isColliding,
              fillColor: isColliding ? 'rgba(232, 64, 64, 0.25)' : 'rgba(42, 127, 255, 0.12)',
              borderColor: isColliding ? '#e84040' : '#2a7fff',
              label: `${def.name} Clearance`,
            })
          );
        }
      }
    }

    // 3. Compile egress reach nodes for sleeping room windows & exterior openings
    for (const room of levelRooms) {
      const roomEntry = this.roomIndex.get(room.id);
      const isSleeping = roomEntry ? roomEntry.isSleeping : !!ROOM_TYPES[room.type]?.sleeping;

      for (const o of room.openings) {
        const openingEntry = this.openingIndex.get(o.id);
        if (!openingEntry) continue;

        const def = openingEntry.def;
        if (!def) continue;

        const info = openingEntry.info;
        const isExterior = info.kind === 'exterior';

        if (def.kind === 'window' && (isSleeping || isExterior)) {
          const m = openingEntry.metrics;
          const midX = openingEntry.midX;
          const midY = openingEntry.midY;

          const satisfiesWidth = m.clearW >= 20;
          const satisfiesHeight = m.clearH >= 24;
          const satisfiesArea = m.clearW * m.clearH >= 5.7 * 144;
          const satisfiesSill = def.sill <= 44;

          const isEgressCompliant =
            isExterior && satisfiesWidth && satisfiesHeight && satisfiesArea && satisfiesSill;
          const areaSqFt = ((m.clearW * m.clearH) / 144).toFixed(1);

          let badgeText = isEgressCompliant ? `Egress OK (${areaSqFt} sf)` : `Egress non-compliant`;
          if (!isExterior) badgeText = 'Interior window';
          else if (!satisfiesSill) badgeText = `Sill ${def.sill}" > 44"`;
          else if (!satisfiesArea) badgeText = `Opening ${areaSqFt} sf < 5.7 sf`;

          nextNodes.push(
            new SpatialOverlayNode(
              `node:egress:${o.id}`,
              'egressReach',
              {
                x: midX - 30,
                y: midY - 12,
                w: 60,
                h: 24,
                anchorX: midX,
                anchorY: midY,
              },
              {
                openingId: o.id,
                roomId: room.id,
                isSleeping,
                isExterior,
                isEgressCompliant,
                badgeText,
                clearW: m.clearW,
                clearH: m.clearH,
                sill: def.sill,
                wall: o.wall,
              }
            )
          );
        }
      }
    }

    // 4. Compile constraint handle nodes & live dimension nodes
    const activeRoomId =
      selection && levelRooms.some((r) => r.id === selection)
        ? selection
        : drag && drag.id && levelRooms.some((r) => r.id === drag.id)
          ? drag.id
          : null;

    const activeRooms = activeRoomId ? levelRooms.filter((r) => r.id === activeRoomId) : levelRooms;

    for (const room of activeRooms) {
      const roomEntry = this.roomIndex.get(room.id);
      const isSelected = room.id === selection || (drag && drag.id === room.id);
      const minDim = roomEntry ? roomEntry.minDim : Math.min(room.w, room.h);
      const areaSqFt = roomEntry ? roomEntry.areaSqFt : floorAreaSqFt(room);
      const isHabitable = roomEntry
        ? roomEntry.isHabitable
        : !!ROOM_TYPES[room.type]?.habitable && room.type !== 'kitchen';

      let isValid = true;
      const dimViolations = [];
      if (minDim < 36) {
        isValid = false;
        dimViolations.push('Width/depth < 36"');
      }
      if (isHabitable && areaSqFt < 70) {
        isValid = false;
        dimViolations.push('Area < 70 sq ft');
      }
      if (isHabitable && minDim < 84) {
        isValid = false;
        dimViolations.push('Min dim < 7 ft');
      }

      // Corner handles
      const cornerCoords = [
        { id: 'nw', x: room.x, y: room.y, index: 0 },
        { id: 'ne', x: room.x + room.w, y: room.y, index: 1 },
        { id: 'sw', x: room.x, y: room.y + room.h, index: 2 },
        { id: 'se', x: room.x + room.w, y: room.y + room.h, index: 3 },
      ];

      for (const c of cornerCoords) {
        nextNodes.push(
          new SpatialOverlayNode(
            `node:handle:${room.id}:${c.id}`,
            'constraintHandle',
            {
              x: c.x,
              y: c.y,
              w: 8,
              h: 8,
            },
            {
              roomId: room.id,
              handleIndex: c.index,
              handleId: c.id,
              isSelected,
              isValid,
              color: isValid ? (isSelected ? '#2a7fff' : '#444444') : '#f87171',
            }
          )
        );
      }

      // Live dimension label node
      const dimText = `${fmt(room.w)} × ${fmt(room.h)}`;
      nextNodes.push(
        new SpatialOverlayNode(
          `node:dimension:${room.id}`,
          'dimensionLabel',
          {
            x: room.x + room.w / 2,
            y: room.y + room.h + 16,
            w: 100,
            h: 20,
          },
          {
            roomId: room.id,
            dimensionText: dimText,
            areaSqFt,
            isValid,
            isSelected,
            violations: dimViolations,
          }
        )
      );
    }

    // Replace current nodes map and list cleanly
    this.nodes = nextNodes;
    this.nodesById.clear();
    for (const node of nextNodes) {
      this.nodesById.set(node.id, node);
    }

    return this;
  }

  /**
   * Returns array of current overlay nodes.
   */
  getNodes() {
    return this.nodes;
  }

  /**
   * Returns overlay nodes filtered by type.
   */
  getNodesByType(type) {
    return this.nodes.filter((n) => n.type === type);
  }

  /**
   * Returns a specific node by ID.
   */
  getNodeById(id) {
    return this.nodesById.get(id) || null;
  }

  /**
   * Hit test point against interactive nodes (handles, badges, clearance nodes).
   */
  hitTest(point, view = { scale: 1 }) {
    if (!point) return null;
    const tol = 8 / view.scale;

    // Test constraint handles first
    for (const n of this.getNodesByType('constraintHandle')) {
      const dx = point.x - n.bounds.x;
      const dy = point.y - n.bounds.y;
      if (Math.hypot(dx, dy) <= tol + 4) return n;
    }

    // Test violation fix buttons (topmost first)
    const violationNodes = this.getNodesByType('violation');
    for (let i = violationNodes.length - 1; i >= 0; i--) {
      const n = violationNodes[i];
      const fb = n.data?.fixButtonBounds;
      if (
        fb &&
        point.x >= fb.x &&
        point.x <= fb.x + fb.w &&
        point.y >= fb.y &&
        point.y <= fb.y + fb.h
      ) {
        return n;
      }
    }

    // Test egress badges
    for (const n of this.getNodesByType('egressReach')) {
      const b = n.bounds;
      if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h)
        return n;
    }

    // Test fixture clearance
    for (const n of this.getNodesByType('fixtureClearance')) {
      const b = n.bounds;
      if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h)
        return n;
    }

    return null;
  }

  /**
   * Manually invalidate index cache.
   */
  invalidateCache() {
    this.lastState = null;
    this.lastStateHash = null;
    this.roomIndex.clear();
    this.itemIndex.clear();
    this.openingIndex.clear();
    this.spatialGrid.clear();
  }

  /**
   * Clean up resources / cached nodes.
   */
  dispose() {
    this.nodes = [];
    this.nodesById.clear();
    this.invalidateCache();
  }
}
