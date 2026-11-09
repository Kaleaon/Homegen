// Modular 3D door builder component for Homegen rendering engines.
import * as THREE from '#three';
import { resolveDoorStyle } from './presetRegistry.js';
import { wallSeg } from './geometry.js';

/**
 * Construct pre-composed 3D door geometries with frame jambs, casing trim profiles,
 * styled panel leaves, glass inserts, and metallic hardware handles according to active preset specifications.
 */
export function buildDoor3DMesh({
  room,
  wall,
  opening,
  definition,
  elevation,
  _scale = 1 / 12,
  wallThickness = 6,
  getFrameMaterial,
  getHardwareMaterial,
  glassMaterial,
  wallAlignedBox,
  placeInWall,
}) {
  const og = new THREE.Group();
  og.userData = { id: opening.id, entityType: 'opening' };

  const style = resolveDoorStyle(opening) || resolveDoorStyle(definition);

  const fMat = getFrameMaterial(style.frameMaterial, style.frameColor);
  const leafMat = getFrameMaterial(style.finishMaterial || 'wood', style.finishColor || '#a9825a');
  const hwMat = getHardwareMaterial(style.hardwareFinish || 'brushed_nickel');
  const gMat = glassMaterial;

  const mid = opening.offset + opening.width / 2;
  const doorH = definition.h || 80;
  const jambThickness = 1.2;

  // 1. Outer Frame Jambs & Stop Trim
  const headJamb = wallAlignedBox(room, wall, opening.width, jambThickness, wallThickness, fMat);
  og.add(placeInWall(room, wall, mid, doorH - jambThickness / 2, 0, elevation, headJamb));

  const sideJambH = doorH - jambThickness;
  const leftJamb = wallAlignedBox(room, wall, jambThickness, sideJambH, wallThickness, fMat);
  og.add(
    placeInWall(
      room,
      wall,
      opening.offset + jambThickness / 2,
      sideJambH / 2,
      0,
      elevation,
      leftJamb
    )
  );

  const rightJamb = wallAlignedBox(room, wall, jambThickness, sideJambH, wallThickness, fMat);
  og.add(
    placeInWall(
      room,
      wall,
      opening.offset + opening.width - jambThickness / 2,
      sideJambH / 2,
      0,
      elevation,
      rightJamb
    )
  );

  // Stop Trim
  const stopWidth = 0.5;
  const stopHead = wallAlignedBox(
    room,
    wall,
    opening.width - 2 * jambThickness,
    stopWidth,
    stopWidth,
    fMat
  );
  og.add(
    placeInWall(room, wall, mid, doorH - jambThickness - stopWidth / 2, 0, elevation, stopHead)
  );

  // 2. Casing Trim Profiles (Interior & Exterior)
  const casingW = style.casing?.width ?? 2.0;
  const casingD = style.casing?.depth ?? 0.75;

  if (casingW > 0) {
    const headTrim = wallAlignedBox(
      room,
      wall,
      opening.width + casingW * 2,
      casingW,
      wallThickness + casingD * 2,
      fMat
    );
    og.add(placeInWall(room, wall, mid, doorH + casingW / 2, 0, elevation, headTrim));

    for (const tt of [opening.offset - casingW / 2, opening.offset + opening.width + casingW / 2]) {
      const sideTrim = wallAlignedBox(
        room,
        wall,
        casingW,
        doorH,
        wallThickness + casingD * 2,
        fMat
      );
      og.add(placeInWall(room, wall, tt, doorH / 2, 0, elevation, sideTrim));
    }
  }

  // 3. Styled Door Leaf Geometry
  const clearWidth = opening.width - 2 * jambThickness;
  const clearHeight = doorH - jambThickness;
  const leafDepth = 1.75;
  const isDouble =
    definition.id === 'door_entry_double' || opening.width >= 54 || Boolean(definition.doubleDoor);

  const leafCount = isDouble ? 2 : 1;
  const singleLeafW = clearWidth / leafCount - (isDouble ? 0.25 : 0);

  function addHardware(target, hwStyle, isRightHand, hwX, xOffset = 0) {
    const S = 1 / 12;
    const plateGeom = new THREE.BoxGeometry(1.5 * S, 6 * S, 0.25 * S);
    const plate = new THREE.Mesh(plateGeom, hwMat);
    plate.castShadow = true;
    plate.position.set(hwX * S + xOffset, 36 * S, 0);
    target.add(plate);

    const dirMultiplier = isRightHand ? -1 : 1;

    if (hwStyle === 'knob') {
      const knobGeom = new THREE.SphereGeometry(1.2 * S, 12, 12);
      const knobFront = new THREE.Mesh(knobGeom, hwMat);
      knobFront.position.set(hwX * S + xOffset, 36 * S, 1.2 * S);
      knobFront.castShadow = true;
      target.add(knobFront);

      const knobBack = new THREE.Mesh(knobGeom, hwMat);
      knobBack.position.set(hwX * S + xOffset, 36 * S, -1.2 * S);
      knobBack.castShadow = true;
      target.add(knobBack);
    } else {
      // Lever handle
      const stemGeom = new THREE.CylinderGeometry(0.3 * S, 0.3 * S, 1.5 * S, 8);
      const stemFront = new THREE.Mesh(stemGeom, hwMat);
      stemFront.rotation.x = Math.PI / 2;
      stemFront.position.set(hwX * S + xOffset, 36 * S, 0.75 * S);
      target.add(stemFront);

      const handleBarGeom = new THREE.BoxGeometry(3.5 * S, 0.6 * S, 0.4 * S);
      const leverFront = new THREE.Mesh(handleBarGeom, hwMat);
      leverFront.position.set(hwX * S + xOffset + 1.5 * S * dirMultiplier, 36 * S, 1.5 * S);
      leverFront.castShadow = true;
      target.add(leverFront);

      const stemBack = new THREE.Mesh(stemGeom, hwMat);
      stemBack.rotation.x = Math.PI / 2;
      stemBack.position.set(hwX * S + xOffset, 36 * S, -0.75 * S);
      target.add(stemBack);

      const leverBack = new THREE.Mesh(handleBarGeom, hwMat);
      leverBack.position.set(hwX * S + xOffset + 1.5 * S * dirMultiplier, 36 * S, -1.5 * S);
      leverBack.castShadow = true;
      target.add(leverBack);
    }
  }

  function buildSingleLeaf(target, w, h, d, panelStyle, hwStyle, isRightHand = false, xOffset = 0) {
    const S = 1 / 12;

    if (panelStyle === 'panel_2') {
      const stileW = 4.0;
      const railH = 5.0;
      const midRailH = 4.0;
      const panelRecessD = d * 0.4;

      // Base slab
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), leafMat);
      baseMesh.castShadow = true;
      baseMesh.position.set((w / 2) * S + xOffset, (h / 2) * S, 0);
      target.add(baseMesh);

      // Top and bottom recessed panel cutouts
      const innerW = w - stileW * 2;
      const topPanelH = (h - railH * 2 - midRailH) * 0.6;
      const botPanelH = (h - railH * 2 - midRailH) * 0.4;

      const topY = h - railH - topPanelH / 2;
      const botY = railH + botPanelH / 2;

      for (const yCenter of [topY, botY]) {
        const pH = yCenter === topY ? topPanelH : botPanelH;
        const pMesh = new THREE.Mesh(
          new THREE.BoxGeometry(innerW * S, pH * S, panelRecessD * S),
          leafMat
        );
        pMesh.position.set((w / 2) * S + xOffset, yCenter * S, 0);
        target.add(pMesh);
      }
    } else if (panelStyle === 'panel_6') {
      const stileW = 4.0;
      const midStileW = 3.0;
      const railH = 4.5;
      const midRailH = 3.5;
      const panelRecessD = d * 0.4;

      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), leafMat);
      baseMesh.castShadow = true;
      baseMesh.position.set((w / 2) * S + xOffset, (h / 2) * S, 0);
      target.add(baseMesh);

      const panelW = (w - stileW * 2 - midStileW) / 2;
      const availH = h - railH * 2 - midRailH * 2;
      const rowH = availH / 3;

      const colCenters = [stileW + panelW / 2, w - stileW - panelW / 2];
      const rowCenters = [
        railH + rowH / 2,
        railH + rowH + midRailH + rowH / 2,
        railH + rowH * 2 + midRailH * 2 + rowH / 2,
      ];

      for (const cx of colCenters) {
        for (const cy of rowCenters) {
          const pMesh = new THREE.Mesh(
            new THREE.BoxGeometry(panelW * S, rowH * S, panelRecessD * S),
            leafMat
          );
          pMesh.position.set(cx * S + xOffset, cy * S, 0);
          target.add(pMesh);
        }
      }
    } else if (panelStyle === 'french') {
      const stileW = 4.5;
      const topRailH = 4.5;
      const botRailH = 8.0;

      const innerW = w - stileW * 2;
      const innerH = h - topRailH - botRailH;

      // Stiles
      const leftStile = new THREE.Mesh(new THREE.BoxGeometry(stileW * S, h * S, d * S), leafMat);
      leftStile.position.set((stileW / 2) * S + xOffset, (h / 2) * S, 0);
      leftStile.castShadow = true;
      target.add(leftStile);

      const rightStile = new THREE.Mesh(new THREE.BoxGeometry(stileW * S, h * S, d * S), leafMat);
      rightStile.position.set((w - stileW / 2) * S + xOffset, (h / 2) * S, 0);
      rightStile.castShadow = true;
      target.add(rightStile);

      // Rails
      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, topRailH * S, d * S),
        leafMat
      );
      topRail.position.set((w / 2) * S + xOffset, (h - topRailH / 2) * S, 0);
      topRail.castShadow = true;
      target.add(topRail);

      const botRail = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, botRailH * S, d * S),
        leafMat
      );
      botRail.position.set((w / 2) * S + xOffset, (botRailH / 2) * S, 0);
      botRail.castShadow = true;
      target.add(botRail);

      // Glass Pane
      const glassMesh = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, innerH * S, 0.3 * S),
        gMat
      );
      glassMesh.position.set((w / 2) * S + xOffset, (botRailH + innerH / 2) * S, 0);
      target.add(glassMesh);

      // Muntin Grid
      const cols = style.glass?.cols ?? 3;
      const rows = style.glass?.rows ?? 5;
      const mw = 0.75;
      const md = 0.8;

      if (cols > 1 && innerW > 0) {
        const colStep = innerW / cols;
        for (let i = 1; i < cols; i++) {
          const vx = stileW + i * colStep;
          const vBar = new THREE.Mesh(new THREE.BoxGeometry(mw * S, innerH * S, md * S), leafMat);
          vBar.position.set(vx * S + xOffset, (botRailH + innerH / 2) * S, 0);
          target.add(vBar);
        }
      }

      if (rows > 1 && innerH > 0) {
        const rowStep = innerH / rows;
        for (let j = 1; j < rows; j++) {
          const vy = botRailH + j * rowStep;
          const hBar = new THREE.Mesh(new THREE.BoxGeometry(innerW * S, mw * S, md * S), leafMat);
          hBar.position.set((w / 2) * S + xOffset, vy * S, 0);
          target.add(hBar);
        }
      }
    } else if (panelStyle === 'glass_top') {
      const stileW = 4.0;
      const railH = 4.5;
      const midRailH = 5.0;

      const innerW = w - stileW * 2;
      const topGlassH = (h - railH * 2 - midRailH) * 0.55;
      const botPanelH = (h - railH * 2 - midRailH) * 0.45;

      // Base slab for lower half
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), leafMat);
      baseMesh.castShadow = true;
      baseMesh.position.set((w / 2) * S + xOffset, (h / 2) * S, 0);
      target.add(baseMesh);

      // Upper glass insert
      const topY = h - railH - topGlassH / 2;
      const glassMesh = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, topGlassH * S, 0.3 * S),
        gMat
      );
      glassMesh.position.set((w / 2) * S + xOffset, topY * S, 0);
      target.add(glassMesh);

      // Lower recessed panel
      const botY = railH + botPanelH / 2;
      const pMesh = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, botPanelH * S, d * 0.4 * S),
        leafMat
      );
      pMesh.position.set((w / 2) * S + xOffset, botY * S, 0);
      target.add(pMesh);
    } else {
      // Flush slab default
      const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), leafMat);
      slabMesh.castShadow = true;
      slabMesh.position.set((w / 2) * S + xOffset, (h / 2) * S, 0);
      target.add(slabMesh);
    }

    // Add hardware
    const hwX = isRightHand ? 2.5 : w - 2.5;
    addHardware(target, hwStyle, isRightHand, hwX, xOffset);
  }

  // Handle Pocket/Sliding vs Swing Doors
  if (definition.pocket || definition.slider || opening.pocket) {
    const slabDoor = new THREE.Group();
    buildSingleLeaf(
      slabDoor,
      clearWidth,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle,
      false,
      0
    );
    og.add(placeInWall(room, wall, mid, clearHeight / 2, 0, elevation, slabDoor));
    return og;
  }

  // Swing Door Pivot Setup
  const s = wallSeg(room, wall);
  const dir = opening.swing === 'out' ? -1 : 1;
  const swingAng = (80 * Math.PI) / 180;
  const cross = s.dx * (s.ny * dir) - s.dy * (s.nx * dir);
  const swingSign = Math.sign(cross) || 1;
  const alongAng = Math.atan2(s.dy, s.dx);

  const S = 1 / 12;

  if (isDouble) {
    // Left Leaf Pivot
    const pivotL = new THREE.Group();
    const hxL = s.ax + s.dx * (opening.offset + jambThickness);
    const hyL = s.ay + s.dy * (opening.offset + jambThickness);
    pivotL.position.set(hxL * S, elevation * S, hyL * S);

    buildSingleLeaf(
      pivotL,
      singleLeafW,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle,
      false,
      0
    );
    pivotL.rotation.y = -(alongAng + swingSign * swingAng);
    og.add(pivotL);

    // Right Leaf Pivot
    const pivotR = new THREE.Group();
    const hxR = s.ax + s.dx * (opening.offset + opening.width - jambThickness);
    const hyR = s.ay + s.dy * (opening.offset + opening.width - jambThickness);
    pivotR.position.set(hxR * S, elevation * S, hyR * S);

    buildSingleLeaf(
      pivotR,
      singleLeafW,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle,
      true,
      -singleLeafW * S
    );
    pivotR.rotation.y = -(alongAng - swingSign * swingAng);
    og.add(pivotR);
  } else {
    // Single Leaf Pivot
    const pivot = new THREE.Group();
    const hx = s.ax + s.dx * (opening.offset + jambThickness);
    const hy = s.ay + s.dy * (opening.offset + jambThickness);
    pivot.position.set(hx * S, elevation * S, hy * S);

    buildSingleLeaf(
      pivot,
      singleLeafW,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle,
      false,
      0
    );
    pivot.rotation.y = -(alongAng + swingSign * swingAng);
    og.add(pivot);
  }

  return og;
}
