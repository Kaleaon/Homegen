// Modular 3D window builder component for Homegen rendering engines.
import * as THREE from '#three';
import { resolveWindowStyle } from './presetRegistry.js';

/**
 * Construct pre-composed 3D window geometries with frame materials, mullion grids,
 * and trim profiles according to active preset specifications.
 */
export function buildWindow3DMesh({
  room,
  wall,
  opening,
  definition,
  elevation,
  scale = 1 / 12,
  wallThickness = 6,
  getFrameMaterial,
  glassMaterial,
  wallAlignedBox,
  placeInWall,
}) {
  const og = new THREE.Group();
  og.userData = { id: opening.id, entityType: 'opening' };

  const mid = opening.offset + opening.width / 2;
  const yMid = definition.sill + definition.h / 2;

  // Resolve window style from preset registry (or custom instance overrides)
  const style = resolveWindowStyle(opening) || resolveWindowStyle(definition);
  const fMat = getFrameMaterial(style.frameMaterial, style.frameColor);

  // 1. Glass Pane
  const pane = wallAlignedBox(room, wall, opening.width, definition.h, 0.3, glassMaterial);
  pane.castShadow = false;
  og.add(placeInWall(room, wall, mid, yMid, 0, elevation, pane));

  // 2. Outer Frame Perimeter
  const fw = 1.6;
  const frameSpecs = [
    [opening.width, fw, definition.sill + fw / 2, mid],
    [opening.width, fw, definition.sill + definition.h - fw / 2, mid],
    [fw, definition.h, yMid, opening.offset + fw / 2],
    [fw, definition.h, yMid, opening.offset + opening.width - fw / 2],
  ];

  for (const [along, h, yy, tt] of frameSpecs) {
    const bar = wallAlignedBox(room, wall, along, h, 2.2, fMat);
    og.add(placeInWall(room, wall, tt, yy, 0, elevation, bar));
  }

  // 3. Style-specific Meeting Rails
  if (definition.style === 'hung') {
    const bar = wallAlignedBox(room, wall, opening.width, fw, 2.6, fMat);
    og.add(placeInWall(room, wall, mid, definition.sill + definition.h / 2, 0, elevation, bar));
  } else if (definition.style === 'slider') {
    const bar = wallAlignedBox(room, wall, fw, definition.h, 2.6, fMat);
    og.add(placeInWall(room, wall, mid, yMid, 0, elevation, bar));
  }

  // 4. Preset Mullion Muntin Grid
  const cols = style.mullions?.cols || 1;
  const rows = style.mullions?.rows || 1;
  const innerW = opening.width - 2 * fw;
  const innerH = definition.h - 2 * fw;
  const mw = 0.75;
  const md = 0.8;

  if (cols > 1 && innerW > 0) {
    const colStep = innerW / cols;
    for (let i = 1; i < cols; i++) {
      const xPos = opening.offset + fw + i * colStep;
      const vBar = wallAlignedBox(room, wall, mw, innerH, md, fMat);
      og.add(placeInWall(room, wall, xPos, yMid, 0, elevation, vBar));
    }
  }

  if (rows > 1 && innerH > 0) {
    const rowStep = innerH / rows;
    for (let j = 1; j < rows; j++) {
      const yPos = definition.sill + fw + j * rowStep;
      const hBar = wallAlignedBox(room, wall, innerW, mw, md, fMat);
      og.add(placeInWall(room, wall, mid, yPos, 0, elevation, hBar));
    }
  }

  // 5. Preset Trim Casing Profile
  const casingW = style.casing?.width ?? 2.0;
  const casingD = style.casing?.depth ?? 0.75;

  const sill = wallAlignedBox(
    room,
    wall,
    opening.width + casingW * 2,
    1.2,
    wallThickness + casingD * 2,
    fMat
  );
  og.add(placeInWall(room, wall, mid, definition.sill - 0.6, 0, elevation, sill));

  if (casingW > 0) {
    const headTrim = wallAlignedBox(
      room,
      wall,
      opening.width + casingW * 2,
      casingW,
      wallThickness + casingD * 2,
      fMat
    );
    og.add(
      placeInWall(
        room,
        wall,
        mid,
        definition.sill + definition.h + casingW / 2,
        0,
        elevation,
        headTrim
      )
    );

    for (const tt of [opening.offset - casingW / 2, opening.offset + opening.width + casingW / 2]) {
      const sideTrim = wallAlignedBox(
        room,
        wall,
        casingW,
        definition.h,
        wallThickness + casingD * 2,
        fMat
      );
      og.add(placeInWall(room, wall, tt, yMid, 0, elevation, sideTrim));
    }
  }

  return og;
}
