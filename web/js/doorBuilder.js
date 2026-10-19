// Modular 3D door builder component for Homegen rendering engines.
import * as THREE from '#three';
import { resolveDoorStyle } from './presetRegistry.js';

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

  function createHardwareGroup(hwStyle, isRightHand = false) {
    const hwGroup = new THREE.Group();
    const plateGeom = new THREE.BoxGeometry(1.5 * (1 / 12), 6 * (1 / 12), 0.25 * (1 / 12));
    const plate = new THREE.Mesh(plateGeom, hwMat);
    plate.castShadow = true;
    hwGroup.add(plate);

    const dirMultiplier = isRightHand ? -1 : 1;

    if (hwStyle === 'knob') {
      const knobGeom = new THREE.SphereGeometry(1.2 * (1 / 12), 12, 12);
      const knobFront = new THREE.Mesh(knobGeom, hwMat);
      knobFront.position.set(0, 0, 1.2 * (1 / 12));
      knobFront.castShadow = true;
      hwGroup.add(knobFront);

      const knobBack = new THREE.Mesh(knobGeom, hwMat);
      knobBack.position.set(0, 0, -1.2 * (1 / 12));
      knobBack.castShadow = true;
      hwGroup.add(knobBack);
    } else {
      // Lever handle
      const stemGeom = new THREE.CylinderGeometry(
        0.3 * (1 / 12),
        0.3 * (1 / 12),
        1.5 * (1 / 12),
        8
      );
      const stemFront = new THREE.Mesh(stemGeom, hwMat);
      stemFront.rotation.x = Math.PI / 2;
      stemFront.position.set(0, 0, 0.75 * (1 / 12));
      hwGroup.add(stemFront);

      const handleBarGeom = new THREE.BoxGeometry(3.5 * (1 / 12), 0.6 * (1 / 12), 0.4 * (1 / 12));
      const leverFront = new THREE.Mesh(handleBarGeom, hwMat);
      leverFront.position.set(1.5 * (1 / 12) * dirMultiplier, 0, 1.5 * (1 / 12));
      leverFront.castShadow = true;
      hwGroup.add(leverFront);

      const stemBack = new THREE.Mesh(stemGeom, hwMat);
      stemBack.rotation.x = Math.PI / 2;
      stemBack.position.set(0, 0, -0.75 * (1 / 12));
      hwGroup.add(stemBack);

      const leverBack = new THREE.Mesh(handleBarGeom, hwMat);
      leverBack.position.set(1.5 * (1 / 12) * dirMultiplier, 0, -1.5 * (1 / 12));
      leverBack.castShadow = true;
      hwGroup.add(leverBack);
    }

    return hwGroup;
  }

  function createSingleLeafGroup(w, h, d, panelStyle, hwStyle, isRightHand = false) {
    const leafGroup = new THREE.Group();
    const S = 1 / 12;

    if (panelStyle === 'panel_2') {
      const stileW = 4.0;
      const railH = 5.0;
      const midRailH = 4.0;
      const panelRecessD = d * 0.4;

      // Base slab
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), leafMat);
      baseMesh.castShadow = true;
      baseMesh.position.set((w / 2) * S, (h / 2) * S, 0);
      leafGroup.add(baseMesh);

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
        pMesh.position.set((w / 2) * S, yCenter * S, 0);
        leafGroup.add(pMesh);
      }
    } else if (panelStyle === 'panel_6') {
      const stileW = 4.0;
      const midStileW = 3.0;
      const railH = 4.5;
      const midRailH = 3.5;
      const panelRecessD = d * 0.4;

      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), leafMat);
      baseMesh.castShadow = true;
      baseMesh.position.set((w / 2) * S, (h / 2) * S, 0);
      leafGroup.add(baseMesh);

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
          pMesh.position.set(cx * S, cy * S, 0);
          leafGroup.add(pMesh);
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
      leftStile.position.set((stileW / 2) * S, (h / 2) * S, 0);
      leftStile.castShadow = true;
      leafGroup.add(leftStile);

      const rightStile = new THREE.Mesh(new THREE.BoxGeometry(stileW * S, h * S, d * S), leafMat);
      rightStile.position.set((w - stileW / 2) * S, (h / 2) * S, 0);
      rightStile.castShadow = true;
      leafGroup.add(rightStile);

      // Rails
      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, topRailH * S, d * S),
        leafMat
      );
      topRail.position.set((w / 2) * S, (h - topRailH / 2) * S, 0);
      topRail.castShadow = true;
      leafGroup.add(topRail);

      const botRail = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, botRailH * S, d * S),
        leafMat
      );
      botRail.position.set((w / 2) * S, (botRailH / 2) * S, 0);
      botRail.castShadow = true;
      leafGroup.add(botRail);

      // Glass Pane
      const glassMesh = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, innerH * S, 0.3 * S),
        gMat
      );
      glassMesh.position.set((w / 2) * S, (botRailH + innerH / 2) * S, 0);
      leafGroup.add(glassMesh);

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
          vBar.position.set(vx * S, (botRailH + innerH / 2) * S, 0);
          leafGroup.add(vBar);
        }
      }

      if (rows > 1 && innerH > 0) {
        const rowStep = innerH / rows;
        for (let j = 1; j < rows; j++) {
          const vy = botRailH + j * rowStep;
          const hBar = new THREE.Mesh(new THREE.BoxGeometry(innerW * S, mw * S, md * S), leafMat);
          hBar.position.set((w / 2) * S, vy * S, 0);
          leafGroup.add(hBar);
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
      baseMesh.position.set((w / 2) * S, (h / 2) * S, 0);
      leafGroup.add(baseMesh);

      // Upper glass insert
      const topY = h - railH - topGlassH / 2;
      const glassMesh = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, topGlassH * S, 0.3 * S),
        gMat
      );
      glassMesh.position.set((w / 2) * S, topY * S, 0);
      leafGroup.add(glassMesh);

      // Lower recessed panel
      const botY = railH + botPanelH / 2;
      const pMesh = new THREE.Mesh(
        new THREE.BoxGeometry(innerW * S, botPanelH * S, d * 0.4 * S),
        leafMat
      );
      pMesh.position.set((w / 2) * S, botY * S, 0);
      leafGroup.add(pMesh);
    } else {
      // Flush slab default
      const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), leafMat);
      slabMesh.castShadow = true;
      slabMesh.position.set((w / 2) * S, (h / 2) * S, 0);
      leafGroup.add(slabMesh);
    }

    // Add hardware
    const hwGroup = createHardwareGroup(hwStyle, isRightHand);
    const hwX = isRightHand ? 2.5 : w - 2.5;
    hwGroup.position.set(hwX * S, 36 * S, 0);
    leafGroup.add(hwGroup);

    return leafGroup;
  }

  // Handle Pocket/Sliding vs Swing Doors
  if (definition.pocket || definition.slider || opening.pocket) {
    const slabDoor = createSingleLeafGroup(
      clearWidth,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle
    );
    og.add(placeInWall(room, wall, mid, clearHeight / 2, 0, elevation, slabDoor));
    return og;
  }

  // Swing Door Pivot Setup
  const s = wallSeg(room, wall);
  const dir = opening.swing === 'out' ? -1 : 1;
  const swingAng = (80 * Math.PI) / 180;
  const sn = { x: s.nx * dir, y: s.ny * dir };
  const alongAng = Math.atan2(s.dy, s.dx);
  const normAng = Math.atan2(sn.y, sn.x);
  let delta = normAng - alongAng;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const S = 1 / 12;

  if (isDouble) {
    // Left Leaf Pivot
    const pivotL = new THREE.Group();
    const hxL = s.ax + s.dx * (opening.offset + jambThickness);
    const hyL = s.ay + s.dy * (opening.offset + jambThickness);
    pivotL.position.set(hxL * S, elevation * S, hyL * S);

    const leafL = createSingleLeafGroup(
      singleLeafW,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle,
      false
    );
    pivotL.add(leafL);
    pivotL.rotation.y = -(alongAng + Math.sign(delta) * swingAng);
    og.add(pivotL);

    // Right Leaf Pivot
    const pivotR = new THREE.Group();
    const hxR = s.ax + s.dx * (opening.offset + opening.width - jambThickness);
    const hyR = s.ay + s.dy * (opening.offset + opening.width - jambThickness);
    pivotR.position.set(hxR * S, elevation * S, hyR * S);

    const leafR = createSingleLeafGroup(
      singleLeafW,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle,
      true
    );
    leafR.position.set(-singleLeafW * S, 0, 0);
    pivotR.add(leafR);
    pivotR.rotation.y = -(alongAng - Math.sign(delta) * swingAng);
    og.add(pivotR);
  } else {
    // Single Leaf Pivot
    const pivot = new THREE.Group();
    const hx = s.ax + s.dx * (opening.offset + jambThickness);
    const hy = s.ay + s.dy * (opening.offset + jambThickness);
    pivot.position.set(hx * S, elevation * S, hy * S);

    const leaf = createSingleLeafGroup(
      singleLeafW,
      clearHeight,
      leafDepth,
      style.panelStyle,
      style.hardwareStyle,
      false
    );
    pivot.add(leaf);
    pivot.rotation.y = -(alongAng + Math.sign(delta) * swingAng);
    og.add(pivot);
  }

  return og;
}

function wallSeg(room, wall) {
  const pts = room.points || [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ];
  let idx = 0;
  if (typeof wall === 'number') idx = wall;
  else if (wall === 'N') idx = 0;
  else if (wall === 'E') idx = 1;
  else if (wall === 'S') idx = 2;
  else if (wall === 'W') idx = 3;

  const a = pts[idx];
  const b = pts[(idx + 1) % pts.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    dx: dx / len,
    dy: dy / len,
    nx: -dy / len,
    ny: dx / len,
    len,
  };
}
