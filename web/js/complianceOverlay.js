// Spatial compliance adapter converting document state & rule reports into an overlay scene graph.
import {
  WT, WALLS, wallSeg, wallLength, wallPoint, interior, footprint, fixtureZone,
  rectsOverlap, rectInside, floorAreaSqFt,
} from './geometry.js';
import { ROOM_TYPES, ITEM_BY_ID, OPENING_BY_ID, openingMetrics } from './catalog.js';
import { openingInfo, daylight } from './codes.js';

const fmt = (inches) => `${Math.floor(inches / 12)}'${Math.round(inches % 12) ? ` ${Math.round(inches % 12)}"` : ' 0"'}`;

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
    this.lastStateHash = null;
    this.options = options;
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
    const hover = options.hover || null;

    // Filter rooms for current level
    const levelRooms = (state.rooms || []).filter((r) => (r.level || 0) === curLevel);

    const nextNodes = [];

    // 1. Compile violation nodes
    if (report && report.violations) {
      for (const v of report.violations) {
        let bounds = null;
        let targetId = v.itemId || v.openingId || v.roomId;
        if (v.itemId) {
          for (const room of levelRooms) {
            const it = room.items.find((i) => i.id === v.itemId);
            if (it) {
              const def = ITEM_BY_ID[it.type];
              if (def) {
                if (def.mount === 'floor') bounds = footprint(it, def);
                else bounds = { x: it.x - 12, y: it.y - 12, w: 24, h: 24 };
              }
              break;
            }
          }
        } else if (v.openingId) {
          for (const room of levelRooms) {
            const o = room.openings.find((op) => op.id === v.openingId);
            if (o) {
              const p = wallPoint(room, o.wall, o.offset, 0);
              bounds = { x: p.x - 12, y: p.y - 12, w: o.width + 24, h: 24 };
              break;
            }
          }
        } else if (v.roomId) {
          const room = levelRooms.find((r) => r.id === v.roomId);
          if (room) {
            bounds = { x: room.x, y: room.y, w: room.w, h: room.h };
          }
        }

        if (bounds) {
          nextNodes.push(new SpatialOverlayNode(`node:violation:${v.id}`, 'violation', bounds, {
            violation: v,
            severity: v.severity,
            message: v.msg,
            ref: v.ref,
            targetId,
          }));
        }
      }
    }

    // 2. Compile fixture clearance zone nodes
    for (const room of levelRooms) {
      const ir = interior(room);
      const floorItems = room.items.filter((i) => ITEM_BY_ID[i.type]?.mount === 'floor');

      for (const it of room.items) {
        const def = ITEM_BY_ID[it.type];
        if (!def) continue;

        if (def.clearance || ['toilet', 'sink', 'tub', 'shower'].includes(def.shape) || def.fixture) {
          const zone = fixtureZone(it, def, 15, 21);
          // Collision check: zone outside room interior OR overlapping other collidable floor items
          const insideRoom = rectInside(zone, ir);
          const overlapsOther = floorItems.some((other) => {
            if (other.id === it.id) return false;
            const od = ITEM_BY_ID[other.type];
            return od && od.mount === 'floor' && !od.flat && rectsOverlap(zone, footprint(other, od));
          });

          const isColliding = !insideRoom || overlapsOther;

          nextNodes.push(new SpatialOverlayNode(`node:clearance:${it.id}`, 'fixtureClearance', zone, {
            itemId: it.id,
            roomId: room.id,
            itemName: def.name,
            isColliding,
            fillColor: isColliding ? 'rgba(232, 64, 64, 0.25)' : 'rgba(42, 127, 255, 0.12)',
            borderColor: isColliding ? '#e84040' : '#2a7fff',
            label: `${def.name} Clearance`,
          }));
        }
      }
    }

    // 3. Compile egress reach nodes for sleeping room windows & exterior openings
    for (const room of levelRooms) {
      const isSleeping = !!ROOM_TYPES[room.type]?.sleeping;
      const dl = daylight(state, room);

      for (const o of room.openings) {
        const def = OPENING_BY_ID[o.type];
        if (!def) continue;

        const info = openingInfo(state, room, o);
        const isExterior = info.kind === 'exterior';

        if (def.kind === 'window' && (isSleeping || isExterior)) {
          const m = openingMetrics(def);
          const p0 = wallPoint(room, o.wall, o.offset, 0);
          const p1 = wallPoint(room, o.wall, o.offset + o.width, 0);
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;

          const satisfiesWidth = m.clearW >= 20;
          const satisfiesHeight = m.clearH >= 24;
          const satisfiesArea = m.clearW * m.clearH >= 5.7 * 144;
          const satisfiesSill = def.sill <= 44;

          const isEgressCompliant = isExterior && satisfiesWidth && satisfiesHeight && satisfiesArea && satisfiesSill;
          const areaSqFt = (m.clearW * m.clearH / 144).toFixed(1);

          let badgeText = isEgressCompliant ? `Egress OK (${areaSqFt} sf)` : `Egress non-compliant`;
          if (!isExterior) badgeText = 'Interior window';
          else if (!satisfiesSill) badgeText = `Sill ${def.sill}" > 44"`;
          else if (!satisfiesArea) badgeText = `Opening ${areaSqFt} sf < 5.7 sf`;

          nextNodes.push(new SpatialOverlayNode(`node:egress:${o.id}`, 'egressReach', {
            x: midX - 30, y: midY - 12, w: 60, h: 24, anchorX: midX, anchorY: midY,
          }, {
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
          }));
        }
      }
    }

    // 4. Compile constraint handle nodes & live dimension nodes
    const activeRoomId = selection && levelRooms.some((r) => r.id === selection)
      ? selection
      : (drag && drag.id && levelRooms.some((r) => r.id === drag.id) ? drag.id : null);

    const activeRooms = activeRoomId
      ? levelRooms.filter((r) => r.id === activeRoomId)
      : levelRooms;

    for (const room of activeRooms) {
      const isSelected = room.id === selection || (drag && drag.id === room.id);
      const minDim = Math.min(room.w, room.h);
      const areaSqFt = floorAreaSqFt(room);
      const isHabitable = !!ROOM_TYPES[room.type]?.habitable && room.type !== 'kitchen';

      let isValid = true;
      const dimViolations = [];
      if (minDim < 36) { isValid = false; dimViolations.push('Width/depth < 36"'); }
      if (isHabitable && areaSqFt < 70) { isValid = false; dimViolations.push('Area < 70 sq ft'); }
      if (isHabitable && minDim < 84) { isValid = false; dimViolations.push('Min dim < 7 ft'); }

      // Corner handles
      const cornerCoords = [
        { id: 'nw', x: room.x, y: room.y, index: 0 },
        { id: 'ne', x: room.x + room.w, y: room.y, index: 1 },
        { id: 'sw', x: room.x, y: room.y + room.h, index: 2 },
        { id: 'se', x: room.x + room.w, y: room.y + room.h, index: 3 },
      ];

      for (const c of cornerCoords) {
        nextNodes.push(new SpatialOverlayNode(`node:handle:${room.id}:${c.id}`, 'constraintHandle', {
          x: c.x, y: c.y, w: 8, h: 8,
        }, {
          roomId: room.id,
          handleIndex: c.index,
          handleId: c.id,
          isSelected,
          isValid,
          color: isValid ? (isSelected ? '#2a7fff' : '#444444') : '#f87171',
        }));
      }

      // Live dimension label node
      const dimText = `${fmt(room.w)} × ${fmt(room.h)}`;
      nextNodes.push(new SpatialOverlayNode(`node:dimension:${room.id}`, 'dimensionLabel', {
        x: room.x + room.w / 2,
        y: room.y + room.h + 16,
        w: 100,
        h: 20,
      }, {
        roomId: room.id,
        dimensionText: dimText,
        areaSqFt,
        isValid,
        isSelected,
        violations: dimViolations,
      }));
    }

    // Replace current nodes map and list cleanly
    this.dispose();
    this.nodes = nextNodes;
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

    // Test egress badges
    for (const n of this.getNodesByType('egressReach')) {
      const b = n.bounds;
      if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return n;
    }

    // Test fixture clearance
    for (const n of this.getNodesByType('fixtureClearance')) {
      const b = n.bounds;
      if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return n;
    }

    return null;
  }

  /**
   * Clean up resources / cached nodes.
   */
  dispose() {
    this.nodes = [];
    this.nodesById.clear();
  }
}
