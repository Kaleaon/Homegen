// 3D view: builds a three.js scene from the plan. Units are feet; plan x -> x, plan y -> z, up is +y.
import * as THREE from '#three';
import { OrbitControls } from '#three/addons/OrbitControls.js';
import { RoomEnvironment } from '#three/addons/RoomEnvironment.js';
import { HDRLoader } from '#three/addons/HDRLoader.js';
import {
  WT,
  WALLS,
  wallSeg,
  wallLength,
  wallNeighbors,
  interior,
  subtractInterval,
  lv,
} from './geometry.js';
import { OPENING_BY_ID, ITEM_BY_ID, WALL_BY_ID, FLOOR_BY_ID } from './catalog.js';
import { wallOpenings, openingInfo } from './codes.js';
import { tileCanvasFor } from './patterns.js';
import {
  HD_MATERIALS,
  HDRI_ENVS,
  polyHavenTextureUrls,
  polyHavenHdriUrl,
  MaterialPreloader,
} from './resources.js';
import { getCladdingMaterial, getPresetRevision, resolveWindowStyle } from './presetRegistry.js';
import { buildWindow3DMesh } from './windowBuilder.js';
import { getTextureUrl } from './textureStore.js';
import { getWallUV } from './model.js';
import { getToken, subscribe } from './kthemeTokens.js';
import { rateLimitedFetch } from './rateLimiter.js';

const S = 1 / 12;
const SLAB = 10; // floor structure thickness, inches

export function createScene3D(canvas, getState, getLevel, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.499;
  const world = new THREE.Group();
  scene.add(world);

  let cameraMode = 'orbit'; // 'orbit' | 'walk'
  let yaw = 0;
  let pitch = 0;
  const walkKeys = { forward: false, backward: false, left: false, right: false, sprint: false };
  let lastLoopTime = performance.now();

  function initWalkAnglesFromCamera() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    pitch = Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)));
    const cosPitch = Math.cos(pitch);
    if (Math.abs(cosPitch) > 0.001) {
      yaw = Math.atan2(dir.x, dir.z);
    } else {
      yaw = 0;
    }
    const maxPitch = (70 * Math.PI) / 180;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  }

  function updateCameraRotation() {
    const maxPitch = (70 * Math.PI) / 180;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    controls.target.copy(camera.position).add(dir);
    camera.lookAt(controls.target);
  }

  function getActiveFloorElevation() {
    const state = getState();
    const cur = getLevel();
    const elev = levelElevations(state);
    return elev[cur] !== undefined ? elev[cur] : 0;
  }

  function clampWalkPosition(pos) {
    const state = getState();
    const cur = getLevel();
    const curRooms = state.rooms.filter((r) => lv(r) === cur);
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    if (curRooms.length > 0) {
      for (const r of curRooms) {
        minX = Math.min(minX, r.x);
        maxX = Math.max(maxX, r.x + r.w);
        minZ = Math.min(minZ, r.y);
        maxZ = Math.max(maxZ, r.y + r.h);
      }
      const margin = 120; // 10 feet margin around active level rooms
      minX = (minX - margin) * S;
      maxX = (maxX + margin) * S;
      minZ = (minZ - margin) * S;
      maxZ = (maxZ + margin) * S;
    } else {
      minX = -100;
      maxX = 100;
      minZ = -100;
      maxZ = 100;
    }
    pos.x = Math.max(minX, Math.min(maxX, pos.x));
    pos.z = Math.max(minZ, Math.min(maxZ, pos.z));
  }

  function updateWalkMovement(dt, keys = walkKeys) {
    if (cameraMode !== 'walk') return;

    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let dx = 0;
    let dz = 0;

    if (keys.forward) {
      dx += fwdX;
      dz += fwdZ;
    }
    if (keys.backward) {
      dx -= fwdX;
      dz -= fwdZ;
    }
    if (keys.left) {
      dx -= rightX;
      dz -= rightZ;
    }
    if (keys.right) {
      dx += rightX;
      dz += rightZ;
    }

    const len = Math.hypot(dx, dz);
    if (len > 0) {
      const baseSpeed = keys.sprint ? 15.0 : 7.5;
      const speed = baseSpeed * dt;
      camera.position.x += (dx / len) * speed;
      camera.position.z += (dz / len) * speed;
      clampWalkPosition(camera.position);
    }

    // Height lock at (E + 64) * S relative to active floor
    const E = getActiveFloorElevation();
    camera.position.y = (E + 64) * S;

    updateCameraRotation();
  }

  function lookWalkBy(dx, dy) {
    if (cameraMode !== 'walk') return;
    const sensitivity = 0.003;
    yaw += dx * sensitivity;
    pitch -= dy * sensitivity;
    const maxPitch = (70 * Math.PI) / 180;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    updateCameraRotation();
    render();
  }

  function setCameraMode(mode, options = {}) {
    if (mode !== 'orbit' && mode !== 'walk') return;
    cameraMode = mode;
    if (cameraMode === 'walk') {
      controls.enabled = false;
      camera.fov = 70;
      camera.updateProjectionMatrix();

      const E = getActiveFloorElevation();
      const eyeHeight = (E + 64) * S;

      if (options.roomId) {
        api.eyeLevel(options.roomId);
      } else if (options.initPos) {
        camera.position.copy(options.initPos);
        camera.position.y = eyeHeight;
        initWalkAnglesFromCamera();
        updateCameraRotation();
      } else {
        camera.position.y = eyeHeight;
        initWalkAnglesFromCamera();
        updateCameraRotation();
      }
    } else {
      controls.enabled = true;
      camera.fov = 50;
      camera.updateProjectionMatrix();
      controls.update();
    }
    const notifyMode = callbacks.onCameraModeChange || api?.onCameraModeChange;
    notifyMode?.(cameraMode);
    render();
  }

  function toggleCameraMode() {
    setCameraMode(cameraMode === 'orbit' ? 'walk' : 'orbit');
  }
  const opts = {
    walls: 'full',
    levels: 'all',
    ceilings: false,
    hd: false,
    env: 'studio',
    sun: 0.65,
  };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = new Map();
  let sun;
  let ground;
  let active = false;
  let raf = 0;
  let framed = false;

  async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    if (id && typeof id.unref === 'function') id.unref();
    try {
      const res = await rateLimitedFetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP status ${res.status}`);
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  // ---------------------------------------------------------------- environment & lighting
  envCache.set('studio', pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  scene.environment = envCache.get('studio');
  scene.environmentIntensity = 0.9;
  const hemi = new THREE.HemisphereLight('#ffffff', '#8a8576', 0.55);
  scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff3df', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  function applyThemeColors() {
    if (opts.env === 'studio' && !(scene.background instanceof THREE.Texture)) {
      scene.background = new THREE.Color(getToken('--ktheme-tertiary', '#cfe0ee'));
    }
    if (hemi) {
      hemi.color.set(getToken('--ktheme-on-primary', '#ffffff'));
      hemi.groundColor.set(getToken('--ktheme-secondary', '#8a8576'));
    }
    if (sun) {
      sun.color.set(getToken('--ktheme-primary', '#fff3df'));
    }
    render();
  }

  applyThemeColors();
  const unsubscribe = subscribe(applyThemeColors);

  async function setEnv(id) {
    opts.env = id;
    if (id === 'studio') {
      scene.environment = envCache.get('studio');
      applyThemeColors();
      scene.environmentIntensity = 0.9;
      scene.backgroundBlurriness = 0;
      render();
      const notifyEnv = callbacks.onEnvChange || api?.onEnvChange;
      notifyEnv?.('studio');
      return;
    }
    const def = HDRI_ENVS.find((e) => e.id === id);
    if (!def) return;
    try {
      if (!envCache.has(id)) {
        let tex;
        try {
          const directRes = await fetchWithTimeout(polyHavenHdriUrl(def.id), 8000);
          tex = new HDRLoader().createDataTexture(await directRes.arrayBuffer());
        } catch (directErr) {
          console.warn(
            `Direct HDRI fetch failed for ${def.id}, falling back to metadata API`,
            directErr
          );
          const metaRes = await fetchWithTimeout(`https://api.polyhaven.com/files/${def.id}`, 8000);
          const meta = await metaRes.json();
          const hdrUrl = meta?.hdri?.['1k']?.hdr?.url;
          if (!hdrUrl)
            throw new Error('HDR URL missing in Poly Haven metadata', { cause: directErr });
          const hdrRes = await fetchWithTimeout(hdrUrl, 8000);
          tex = new HDRLoader().createDataTexture(await hdrRes.arrayBuffer());
        }
        tex.mapping = THREE.EquirectangularReflectionMapping;
        envCache.set(id, { env: pmrem.fromEquirectangular(tex).texture, bg: tex });
      }
      if (opts.env !== id) return;
      const e = envCache.get(id);
      scene.environment = e.env;
      scene.background = e.bg;
      scene.backgroundBlurriness = 0.05;
      scene.environmentIntensity = 1.1;
      render();
    } catch (err) {
      console.warn('HDRI unavailable, using built-in studio lighting', err);
      opts.env = 'studio';
      scene.environment = envCache.get('studio');
      applyThemeColors();
      scene.environmentIntensity = 0.9;
      scene.backgroundBlurriness = 0;
      render();
      const notifyErr = callbacks.onError || api?.onError;
      notifyErr?.('HDRI environment failed to load. Falling back to local studio lighting.');
      const notifyEnv = callbacks.onEnvChange || api?.onEnvChange;
      notifyEnv?.('studio');
    }
  }

  // ---------------------------------------------------------------- materials
  const texCache = new Map();
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const matCache = new Map();
  const plain = (color, rough = 0.85, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

  function proceduralTexture(finish, rx, ry) {
    const tileInches = finish.tileInches || 24;
    const key = `${finish.id}|${tileInches}|${rx.toFixed(2)}|${ry.toFixed(2)}`;
    if (texCache.has(key)) return texCache.get(key);
    const t = new THREE.CanvasTexture(tileCanvasFor(finish));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache.set(key, t);
    return t;
  }

  function customTexture(finish, rx, ry) {
    const tileInches = finish.tileInches || 24;
    const key = `${finish.id}|${tileInches}|${rx.toFixed(2)}|${ry.toFixed(2)}`;
    if (texCache.has(key)) return texCache.get(key);
    let t;
    if (finish.dataUrl) {
      t = loader.load(finish.dataUrl, () => {
        render();
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    } else {
      t = proceduralTexture(finish, rx, ry);
    }
    texCache.set(key, t);
    return t;
  }

  const preloader = new MaterialPreloader(loader);
  const hdBase = new Map(); // `${polyhavenId}:${map}` -> loaded base Texture (shared image)
  let textureErrorTimer = null;
  function handleTextureError() {
    opts.hd = false;
    const notifyHD = callbacks.onHDChange || api?.onHDChange;
    notifyHD?.(false);
    if (!textureErrorTimer) {
      textureErrorTimer = setTimeout(() => {
        textureErrorTimer = null;
      }, 1000);
      const notifyErr = callbacks.onError || api?.onError;
      notifyErr?.('HD texture loading failed. Falling back to local procedural textures.');
    }
  }

  function applyHD(mat, finishId, wInches, hInches) {
    if (!mat) return;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        if (m) applyHD(m, finishId, wInches, hInches);
      }
      return;
    }
    const hd = HD_MATERIALS[finishId];
    if (!hd) return;
    const urls = polyHavenTextureUrls(hd.id);
    const [rx, ry] = [wInches / hd.tile, hInches / hd.tile];
    for (const [slot, key, srgb] of [
      ['map', 'diff', true],
      ['normalMap', 'nor_gl', false],
      ['roughnessMap', 'rough', false],
    ]) {
      const id = `${hd.id}:${key}`;
      const use = (base) => {
        const t = base.clone();
        t.needsUpdate = true;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
        t.anisotropy = 8;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        mat[slot] = t;
        if (slot === 'map') mat.color.set('#ffffff');
        if (slot === 'roughnessMap') mat.roughness = 1;
        mat.needsUpdate = true;
        render();
      };
      if (hdBase.has(id)) {
        const b = hdBase.get(id);
        if (b.userData.status === 'loaded' && b.image) use(b);
        else if (b.userData.status === 'loading') b.userData.wait.push(use);
        continue;
      }
      const base = new THREE.Texture();
      base.userData = { wait: [use], status: 'loading' };
      hdBase.set(id, base);
      loader.load(
        urls[key],
        (tex) => {
          base.image = tex.image;
          base.needsUpdate = true;
          base.userData.status = 'loaded';
          const waiters = base.userData.wait || [];
          base.userData.wait = [];
          for (const f of waiters) f(base);
        },
        undefined,
        (err) => {
          base.userData.status = 'error';
          base.userData.wait = [];
          hdBase.delete(id);
          handleTextureError(err);
        }
      );
    }
  }

  function updateTextureMatrix(texture, uv, rx = 1, ry = 1) {
    if (!texture) return;
    const scaleU = (typeof uv?.scaleU === 'number' ? uv.scaleU : 1.0) * rx;
    const scaleV = (typeof uv?.scaleV === 'number' ? uv.scaleV : 1.0) * ry;
    const rotationDeg = typeof uv?.rotation === 'number' ? uv.rotation : 0;
    const offsetU = typeof uv?.offsetU === 'number' ? uv.offsetU : 0;
    const offsetV = typeof uv?.offsetV === 'number' ? uv.offsetV : 0;
    const rotRad = (rotationDeg * Math.PI) / 180;

    texture.matrixAutoUpdate = false;
    texture.matrix.setUvTransform(offsetU, offsetV, scaleU, scaleV, rotRad, 0.5, 0.5);
    texture.needsUpdate = true;
  }

  const customTextureCache = new Map();

  function finishMaterial(finish, wIn, hIn, finishId, rough, uv) {
    const m = plain('#ffffff', rough);
    const fin = finish || WALL_BY_ID.paint_white;
    const tileInches = fin?.tileInches || 24;
    const rx = wIn / tileInches;
    const ry = hIn / tileInches;

    if (finishId && (finishId.startsWith('tex_') || !WALL_BY_ID[finishId])) {
      m.color.set('#ffffff');
      getTextureUrl(finishId)
        .then((url) => {
          if (!url) {
            if (fin.pattern === 'solid') m.color.set(fin.c1);
            else if (fin.dataUrl || fin.pattern === 'custom') {
              const tex = customTexture(fin, rx, ry);
              if (uv) updateTextureMatrix(tex, uv, 1, 1);
              m.map = tex;
            } else {
              const tex = proceduralTexture(fin, rx, ry);
              if (uv) updateTextureMatrix(tex, uv, 1, 1);
              m.map = tex;
            }
            m.needsUpdate = true;
            render();
            return;
          }
          if (customTextureCache.has(finishId)) {
            const cachedTex = customTextureCache.get(finishId);
            const tex = cachedTex.clone();
            if (uv) updateTextureMatrix(tex, uv, rx, ry);
            m.map = tex;
            m.needsUpdate = true;
            render();
          } else {
            const loader = new THREE.TextureLoader();
            loader.load(
              url,
              (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.colorSpace = THREE.SRGBColorSpace;
                customTextureCache.set(finishId, tex);
                if (uv) updateTextureMatrix(tex, uv, rx, ry);
                m.map = tex;
                m.needsUpdate = true;
                render();
              },
              undefined,
              (err) => {
                console.warn(`Failed to load texture ${finishId}:`, err);
                if (fin.pattern === 'solid') m.color.set(fin.c1);
                else if (fin.dataUrl || fin.pattern === 'custom') {
                  const tex = customTexture(fin, rx, ry);
                  if (uv) updateTextureMatrix(tex, uv, 1, 1);
                  m.map = tex;
                } else {
                  const tex = proceduralTexture(fin, rx, ry);
                  if (uv) updateTextureMatrix(tex, uv, 1, 1);
                  m.map = tex;
                }
                m.needsUpdate = true;
                render();
              }
            );
          }
        })
        .catch((err) => {
          console.warn(`Error loading custom texture ${finishId}:`, err);
          if (fin.pattern === 'solid') m.color.set(fin.c1);
          else if (fin.dataUrl || fin.pattern === 'custom') {
            const tex = customTexture(fin, rx, ry);
            if (uv) updateTextureMatrix(tex, uv, 1, 1);
            m.map = tex;
          } else {
            const tex = proceduralTexture(fin, rx, ry);
            if (uv) updateTextureMatrix(tex, uv, 1, 1);
            m.map = tex;
          }
          m.needsUpdate = true;
          render();
        });
    } else if (fin.pattern === 'solid') {
      m.color.set(fin.c1);
    } else if (fin.dataUrl || fin.pattern === 'custom') {
      const tex = customTexture(fin, rx, ry);
      if (uv) updateTextureMatrix(tex, uv, 1, 1);
      m.map = tex;
    } else {
      const tex = proceduralTexture(fin, rx, ry);
      if (uv) updateTextureMatrix(tex, uv, 1, 1);
      m.map = tex;
    }
    if (opts.hd) applyHD(m, finishId, wIn, hIn);
    return m;
  }

  // ---------------------------------------------------------------- geometry helpers
  const boxMesh = (w, h, d, mat, castShadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), mat);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    return m;
  };
  const faceMats = (base, face, visible) => {
    const a = Array(6).fill(base);
    a[face] = visible;
    return a;
  };

  function addWallBox(group, room, wall, t0, t1, y0, y1, d0, d1, elev, mat, faceIdx) {
    const s = wallSeg(room, wall);
    const horizontal = s.dx === 1;
    const len = t1 - t0;
    const dep = d1 - d0;
    if (len <= 0.01 || y1 - y0 <= 0.01) return;
    const mats = faceIdx === undefined ? mat : faceMats(mat.base, faceIdx, mat.vis);
    const m = boxMesh(horizontal ? len : dep, y1 - y0, horizontal ? dep : len, mats);
    const along = (t0 + t1) / 2;
    const off = (d0 + d1) / 2;
    const cx = s.ax + s.dx * along + s.nx * off;
    const cy = s.ay + s.dy * along + s.ny * off;
    m.position.set(cx * S, (elev + (y0 + y1) / 2) * S, cy * S);
    group.add(m);
  }

  /** Cut a wall span [a,b] into solid pieces around openings; calls piece(t0,t1,y0,y1) for each solid block. */
  function cutPieces(a, b, cuts, H, piece) {
    const inside = cuts.filter((c) => c.to > a && c.from < b).sort((x, y) => x.from - y.from);
    let cur = a;
    for (const c of inside) {
      const f = Math.max(a, c.from);
      const t = Math.min(b, c.to);
      if (f > cur) piece(cur, f, 0, H);
      if (c.sill > 0) piece(f, t, 0, Math.min(H, c.sill));
      if (c.head < H) piece(f, t, Math.max(0, c.head), H);
      cur = Math.max(cur, t);
    }
    if (cur < b) piece(cur, b, 0, H);
  }

  // ---------------------------------------------------------------- scene build
  function levelElevations(state) {
    const n = state.levels || 1;
    const elev = [0];
    for (let l = 1; l < n; l++) {
      const rs = state.rooms.filter((r) => lv(r) === l - 1);
      elev.push(elev[l - 1] + (rs.length ? Math.max(...rs.map((r) => r.ceiling)) : 96) + SLAB);
    }
    return elev;
  }

  const entityMap = new Map();

  function disposeNode(node) {
    if (!node) return;
    if (node.parent) node.parent.remove(node);
    node.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) {
          o.material.forEach((m) => m && m.dispose());
        } else {
          o.material.dispose();
        }
      }
    });
  }

  // ---------------------------------------------------------------- scene build & reconciliation

  function reconcile() {
    const state = getState();
    const cur = getLevel();
    const elev = levelElevations(state);
    const rooms = state.rooms.filter((r) => (opts.levels === 'all' ? true : lv(r) <= cur));
    const activeKeys = new Set();
    const box = new THREE.Box3();

    for (const room of rooms) {
      const e = elev[lv(room)];
      const L = lv(room);
      const showWalls = opts.walls !== 'hidden';
      const wallH = opts.walls === 'cut' && L === cur ? Math.min(room.ceiling, 42) : room.ceiling;

      // Room container group (keyed by room.id)
      const roomId = room.id;
      activeKeys.add(roomId);
      let roomGroup = entityMap.get(roomId);
      if (!roomGroup) {
        roomGroup = new THREE.Group();
        roomGroup.userData = { id: roomId, entityType: 'room' };
        world.add(roomGroup);
        entityMap.set(roomId, roomGroup);
      }

      // Floor slab (keyed by `${room.id}:slab`)
      const slabKey = `${room.id}:slab`;
      activeKeys.add(slabKey);
      const ff = FLOOR_BY_ID[room.floor] || FLOOR_BY_ID.floor_oak;
      const slabSig = JSON.stringify({ w: room.w, h: room.h, floor: room.floor, hd: opts.hd });
      let slab = entityMap.get(slabKey);
      if (!slab || slab.userData.sig !== slabSig) {
        if (slab) disposeNode(slab);
        const fm = finishMaterial(ff, room.w, room.h, room.floor, 0.55);
        slab = boxMesh(room.w, SLAB, room.h, faceMats(plain('#b9b2a4', 0.95), 2, fm));
        slab.userData = { id: slabKey, entityType: 'slab', sig: slabSig };
        roomGroup.add(slab);
        entityMap.set(slabKey, slab);
      }
      slab.position.set((room.x + room.w / 2) * S, (e - SLAB / 2) * S, (room.y + room.h / 2) * S);
      box.expandByObject(slab);

      // Stairs (keyed by `${room.id}:stairs`)
      if (room.type === 'stairs') {
        const stairsKey = `${room.id}:stairs`;
        activeKeys.add(stairsKey);
        const stairsSig = JSON.stringify({
          w: room.w,
          h: room.h,
          ceiling: room.ceiling,
          x: room.x,
          y: room.y,
          e,
        });
        let stairsGroup = entityMap.get(stairsKey);
        if (!stairsGroup || stairsGroup.userData.sig !== stairsSig) {
          if (stairsGroup) disposeNode(stairsGroup);
          stairsGroup = new THREE.Group();
          addStairs(stairsGroup, room, e);
          stairsGroup.userData = { id: stairsKey, entityType: 'stairs', sig: stairsSig };
          roomGroup.add(stairsGroup);
          entityMap.set(stairsKey, stairsGroup);
        }
      }

      // Ceiling (keyed by `${room.id}:ceiling`)
      if (opts.ceilings) {
        const ceilKey = `${room.id}:ceiling`;
        activeKeys.add(ceilKey);
        const ceilSig = JSON.stringify({ w: room.w, h: room.h });
        let ceilMesh = entityMap.get(ceilKey);
        if (!ceilMesh || ceilMesh.userData.sig !== ceilSig) {
          if (ceilMesh) disposeNode(ceilMesh);
          ceilMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(room.w * S, room.h * S),
            plain('#f4f2ec', 0.95, { side: THREE.FrontSide })
          );
          ceilMesh.rotation.x = Math.PI / 2;
          ceilMesh.receiveShadow = true;
          ceilMesh.userData = { id: ceilKey, entityType: 'ceiling', sig: ceilSig };
          roomGroup.add(ceilMesh);
          entityMap.set(ceilKey, ceilMesh);
        }
        ceilMesh.position.set(
          (room.x + room.w / 2) * S,
          (e + room.ceiling) * S,
          (room.y + room.h / 2) * S
        );
      }

      // Walls & Openings (keyed by `${room.id}:wall:${wall}`)
      if (showWalls) {
        for (const wall of WALLS) {
          const wallKey = `${room.id}:wall:${wall}`;
          activeKeys.add(wallKey);
          const ops = wallOpenings(state, room, wall);
          const nbrs = wallNeighbors(state.rooms, room, wall);
          const winStyles = ops.map(({ o }) => {
            const isWindow = o.kind === 'window' || OPENING_BY_ID[o.type]?.kind === 'window';
            return isWindow ? resolveWindowStyle(o) : null;
          });
          const wallSig = JSON.stringify({
            rx: room.x,
            ry: room.y,
            rw: room.w,
            rh: room.h,
            ceiling: room.ceiling,
            finish: room.walls[wall],
            uv: getWallUV(room, wall),
            cladding: room.cladding || room.exteriorCladding,
            e,
            wallH,
            wallOpt: opts.walls,
            hd: opts.hd,
            cur,
            ops,
            winStyles,
            presetRev: getPresetRevision(),
            nbrs,
          });
          let wallGroup = entityMap.get(wallKey);
          if (!wallGroup || wallGroup.userData.sig !== wallSig) {
            if (wallGroup) disposeNode(wallGroup);
            wallGroup = new THREE.Group();
            buildWall(wallGroup, state, room, wall, e, wallH);
            wallGroup.userData = { id: wallKey, entityType: 'wall', sig: wallSig };
            roomGroup.add(wallGroup);
            entityMap.set(wallKey, wallGroup);
            for (const { o } of ops) {
              if (room.openings.includes(o)) activeKeys.add(o.id);
            }
          } else {
            for (const { o } of ops) {
              if (room.openings.includes(o)) activeKeys.add(o.id);
            }
          }
        }
      }

      // Items (keyed by `it.id`)
      for (const it of room.items) {
        const itemKey = it.id;
        activeKeys.add(itemKey);
        const def = ITEM_BY_ID[it.type];
        const structSig = JSON.stringify({
          type: it.type,
          hd: opts.hd,
          e,
          roomCeiling: room.ceiling,
        });
        let itemNode = entityMap.get(itemKey);

        if (!itemNode || itemNode.userData.structSig !== structSig) {
          if (itemNode) disposeNode(itemNode);
          itemNode = buildItem(it, room, e);
          if (itemNode) {
            itemNode.userData = { id: itemKey, entityType: 'item', structSig };
            roomGroup.add(itemNode);
            entityMap.set(itemKey, itemNode);
          }
        } else {
          if (def && def.mount === 'wall') {
            const s = wallSeg(room, it.wall);
            const t = it.offset;
            const y = def.shape === 'switch' ? 48 : 16;
            itemNode.position.set(
              (s.ax + s.dx * t + s.nx * (WT / 2 + 0.3)) * S,
              (e + y) * S,
              (s.ay + s.dy * t + s.ny * (WT / 2 + 0.3)) * S
            );
          } else if (def && def.mount === 'ceiling') {
            itemNode.position.set(it.x * S, (e + room.ceiling - 0.75) * S, it.y * S);
          } else if (itemNode) {
            itemNode.position.set(it.x * S, e * S, it.y * S);
            itemNode.rotation.y = (-(it.rot || 0) * Math.PI) / 180;
          }
        }
      }
    }

    // Dismount & dispose unreferenced entity nodes
    for (const [key, node] of entityMap.entries()) {
      if (!activeKeys.has(key)) {
        if (node.userData && node.userData.id === key) {
          disposeNode(node);
        }
        entityMap.delete(key);
      }
    }

    box.expandByScalar(0.5);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    if (!rooms.length) {
      size.set(20, 10, 20);
      ctr.set(10, 0, 10);
    }

    // Ground plane: update in place
    const gs = Math.max(size.x, size.z) * 6 + 60;
    if (!ground) {
      ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plain('#93a07f', 1));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
    }
    ground.scale.set(gs, gs, 1);
    ground.position.set(ctr.x, -(SLAB + 0.2) * S, ctr.z);

    // Sun light: update in place
    const r = Math.max(size.x, size.z) * 0.75 + 6;
    sun.position.set(ctr.x + r * 0.9, size.y + r * 1.4, ctr.z + r * 0.6);
    sun.target.position.copy(ctr);
    Object.assign(sun.shadow.camera, {
      left: -r,
      right: r,
      top: r,
      bottom: -r,
      near: 0.5,
      far: r * 5,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.intensity = 4 * opts.sun;

    scene.userData.center = ctr;
    scene.userData.size = size;
    if (!framed) {
      frame();
      framed = true;
    }
    render();
  }

  function frame() {
    const ctr = scene.userData.center || new THREE.Vector3();
    const size = scene.userData.size || new THREE.Vector3(20, 10, 20);
    const d = Math.max(size.x, size.z) * 1.15 + 8;
    controls.target.copy(ctr).setY(size.y * 0.25);
    camera.position.set(ctr.x + d * 0.55, size.y + d * 0.7, ctr.z + d * 0.85);
    controls.minDistance = 0.3;
    controls.maxDistance = d * 4;
    controls.update();
    render();
  }

  function buildWall(group, state, room, wall, e, H) {
    const len = wallLength(room, wall);
    const s = wallSeg(room, wall);
    const fin = WALL_BY_ID[room.walls[wall]] || WALL_BY_ID.paint_white;
    const wallUV = getWallUV(room, wall);
    const base = plain('#efece4', 0.9);
    const visMat = finishMaterial(fin, len, room.ceiling, room.walls[wall], 0.8, wallUV);
    // interior face index in BoxGeometry order [+x,-x,+y,-y,+z,-z]
    const face = s.nx === 1 ? 0 : s.nx === -1 ? 1 : s.ny === 1 ? 4 : 5;
    const outFace = s.nx === 1 ? 1 : s.nx === -1 ? 0 : s.ny === 1 ? 5 : 4;
    const ops = wallOpenings(state, room, wall);
    const cuts = ops.map(({ o, from, to }) => {
      const d = OPENING_BY_ID[o.type];
      return { from, to, sill: d.sill, head: d.sill + d.h, o, d };
    });
    const inner = { base, vis: visMat };
    cutPieces(0, len, cuts, H, (t0, t1, y0, y1) =>
      addWallBox(group, room, wall, t0, t1, y0, y1, 0, WT / 2, e, inner, face)
    );
    // exterior shell where nothing is behind the wall
    let ext = [[-WT / 2, len + WT / 2]];
    for (const n of wallNeighbors(state.rooms, room, wall))
      ext = subtractInterval(ext, [n.from, n.to]);
    let extFinId = room.cladding || room.exteriorCladding;
    if (!extFinId && room.walls[wall] && WALL_BY_ID[room.walls[wall]]?.exterior) {
      extFinId = room.walls[wall];
    }
    const extFin = getCladdingMaterial(extFinId);
    extFinId = extFin.id || extFinId || 'cladding_siding_white';

    const sidingMat = finishMaterial(extFin, len, room.ceiling, extFinId, 0.85);
    for (const [a, b] of ext)
      cutPieces(a, b, cuts, H, (t0, t1, y0, y1) =>
        addWallBox(
          group,
          room,
          wall,
          t0,
          t1,
          y0,
          y1,
          -WT / 2,
          0,
          e,
          { base: sidingMat, vis: sidingMat },
          outFace
        )
      );
    // fill the thin cut-through strip for openings between rooms is intentionally left open
    for (const { o, d } of cuts) {
      if (!room.openings.includes(o)) continue; // draw each opening once, from its owner
      const info = openingInfo(state, room, o);
      const og =
        d.kind === 'window'
          ? addWindow(group, room, wall, o, d, e)
          : addDoor(group, room, wall, o, d, e, info.kind === 'exterior');
      if (og) entityMap.set(o.id, og);
    }
  }

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#cfe7f3',
    roughness: 0.05,
    metalness: 0.1,
    transmission: 0.85,
    transparent: true,
    opacity: 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    ior: 1.52,
    reflectivity: 0.9,
    side: THREE.DoubleSide,
  });
  const defaultFrameMat = plain('#f3f1ea', 0.6);

  function getFrameMaterial(matType, colorHex) {
    const key = `frame:${matType}:${colorHex}`;
    if (matCache.has(key)) return matCache.get(key);
    let roughness = 0.5;
    let metalness = 0;
    if (matType === 'wood') {
      roughness = 0.7;
      metalness = 0;
    } else if (matType === 'aluminum') {
      roughness = 0.3;
      metalness = 0.6;
    } else if (matType === 'bronze') {
      roughness = 0.4;
      metalness = 0.5;
    } else if (matType === 'steel') {
      roughness = 0.2;
      metalness = 0.8;
    }
    const m = new THREE.MeshStandardMaterial({
      color: colorHex || '#ffffff',
      roughness,
      metalness,
    });
    matCache.set(key, m);
    return m;
  }

  function placeInWall(room, wall, t, y, depth, elev, mesh) {
    const s = wallSeg(room, wall);
    mesh.position.set(
      (s.ax + s.dx * t + s.nx * depth) * S,
      (elev + y) * S,
      (s.ay + s.dy * t + s.ny * depth) * S
    );
    return mesh;
  }
  function wallAlignedBox(room, wall, along, h, thick, mat) {
    const horizontal = wallSeg(room, wall).dx === 1;
    return boxMesh(horizontal ? along : thick, h, horizontal ? thick : along, mat);
  }
  function addWindow(group, room, wall, o, d, e) {
    const og = buildWindow3DMesh({
      room,
      wall,
      opening: o,
      definition: d,
      elevation: e,
      scale: S,
      wallThickness: WT,
      getFrameMaterial,
      glassMaterial: glassMat,
      wallAlignedBox,
      placeInWall,
    });
    group.add(og);
    return og;
  }
  const doorMat = plain('#a9825a', 0.55);
  function addDoor(group, room, wall, o, d, e, exterior) {
    const og = new THREE.Group();
    og.userData = { id: o.id, entityType: 'opening' };
    const s = wallSeg(room, wall);
    const dir = o.swing === 'out' ? -1 : 1;
    const head = wallAlignedBox(room, wall, o.width + 3, 2, WT + 1, defaultFrameMat);
    og.add(placeInWall(room, wall, o.offset + o.width / 2, d.h + 1, 0, e, head));
    if (exterior || d.pocket) {
      const slabDoor = wallAlignedBox(
        room,
        wall,
        o.width - 1,
        d.h - 1,
        1.75,
        d.glass ? glassMat : doorMat
      );
      og.add(placeInWall(room, wall, o.offset + o.width / 2, (d.h - 1) / 2, 0, e, slabDoor));
      group.add(og);
      return og;
    }
    const ang = (80 * Math.PI) / 180;
    const sn = { x: s.nx * dir, y: s.ny * dir };
    const leaf = boxMesh(o.width - 1, d.h - 1, 1.75, doorMat);
    const pivot = new THREE.Group();
    const hx = s.ax + s.dx * o.offset;
    const hy = s.ay + s.dy * o.offset;
    pivot.position.set(hx * S, (e + (d.h - 1) / 2) * S, hy * S);
    leaf.position.set(((o.width - 1) / 2) * S, 0, 0);
    pivot.add(leaf);
    const alongAng = Math.atan2(s.dy, s.dx);
    const normAng = Math.atan2(sn.y, sn.x);
    let delta = normAng - alongAng;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    pivot.rotation.y = -(alongAng + Math.sign(delta) * ang);
    og.add(pivot);
    group.add(og);
    return og;
  }

  function addStairs(group, room, e) {
    const ir = interior(room);
    const vertical = ir.h >= ir.w;
    const n = Math.ceil((room.ceiling + SLAB) / 7.75);
    const rise = (room.ceiling + SLAB) / n;
    const mat = plain('#b99a73', 0.6);
    const run = (vertical ? ir.h : ir.w) / n;
    for (let k = 0; k < n - 1; k++) {
      const step = boxMesh(vertical ? ir.w : run, rise * (k + 1), vertical ? run : ir.h, mat);
      const along = (k + 0.5) * run;
      step.position.set(
        (ir.x + (vertical ? ir.w / 2 : along)) * S,
        (e + (rise * (k + 1)) / 2) * S,
        (ir.y + (vertical ? along : ir.h / 2)) * S
      );
      group.add(step);
    }
  }

  // ---------------------------------------------------------------- items
  function buildItem(it, room, e) {
    const def = ITEM_BY_ID[it.type];
    const g = new THREE.Group();
    const add = (w, h, d, color, x = 0, y = 0, z = 0, rough = 0.7, shadow = true) => {
      const m = boxMesh(w, h, d, plain(color, rough), shadow);
      m.position.set(x * S, (y + h / 2) * S, z * S);
      g.add(m);
      return m;
    };
    const cyl = (r, h, color, x = 0, y = 0, z = 0, seg = 20) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r * S, r * S, h * S, seg),
        plain(color, 0.6)
      );
      m.castShadow = m.receiveShadow = true;
      m.position.set(x * S, (y + h / 2) * S, z * S);
      g.add(m);
      return m;
    };

    if (def.mount === 'wall') {
      const s = wallSeg(room, it.wall);
      const t = it.offset;
      const y = def.shape === 'switch' ? 48 : 16;
      const m = wallAlignedBox(room, it.wall, 2.8, 4.5, 0.6, plain('#f5f3ee', 0.5));
      m.position.set(
        (s.ax + s.dx * t + s.nx * (WT / 2 + 0.3)) * S,
        (e + y) * S,
        (s.ay + s.dy * t + s.ny * (WT / 2 + 0.3)) * S
      );
      return m;
    }
    if (def.mount === 'ceiling') {
      const emissive = def.shape === 'light';
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry((def.w / 2) * S, (def.w / 2) * S, 1.5 * S, 24),
        new THREE.MeshStandardMaterial({
          color: def.shape === 'alarm' ? '#f4f4f0' : '#eeeeee',
          emissive: emissive ? '#ffe9b0' : '#000',
          emissiveIntensity: emissive ? 1.4 : 0,
          roughness: 0.5,
        })
      );
      m.position.set(it.x * S, (e + room.ceiling - 0.75) * S, it.y * S);
      return m;
    }
    const w = def.w;
    const d = def.d;
    const h = def.h;
    const c = def.color;
    switch (def.shape) {
      case 'bed':
        add(w, 12, d, '#7b5e43', 0, 0, 0);
        add(w - 2, 9, d - 6, '#efe9dc', 0, 12, 3, 0.95);
        add(w, 38, 3, '#6d5238', 0, 0, -d / 2 + 1.5);
        for (const k of w > 45 ? [-1, 1] : [0])
          add(w > 45 ? w / 2 - 5 : w - 8, 5, 14, '#ffffff', k * (w / 4), 21, -d / 2 + 12, 0.95);
        add(w - 4, 2, d * 0.62, c, 0, 21, d * 0.15, 0.9);
        break;
      case 'sofa':
        add(w, 14, d, c, 0, 0, 0, 0.9);
        add(w - 12, 6, d - 10, c, 0, 14, 4, 0.95);
        add(w, h - 6, 9, c, 0, 6, -d / 2 + 4.5, 0.9);
        add(7, 14, d - 6, c, -w / 2 + 3.5, 14, 2, 0.9);
        add(7, 14, d - 6, c, w / 2 - 3.5, 14, 2, 0.9);
        break;
      case 'table':
        add(w, 2, d, c, 0, h - 2, 0, 0.45);
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          add(3, h - 2, 3, c, sx * (w / 2 - 3), 0, sz * (d / 2 - 3), 0.5);
        break;
      case 'chair':
        add(w, 2, d, c, 0, 16, 0);
        add(w, 18, 2, c, 0, 18, -d / 2 + 1);
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          add(1.5, 16, 1.5, c, sx * (w / 2 - 2), 0, sz * (d / 2 - 2));
        break;
      case 'rug':
        add(w, 0.6, d, c, 0, 0, 0, 1, false);
        break;
      case 'plant':
        cyl(7, 12, '#9a5b3c');
        {
          const f = new THREE.Mesh(new THREE.SphereGeometry(12 * S, 16, 12), plain('#4f8a4f', 0.9));
          f.position.set(0, 26 * S, 0);
          f.castShadow = true;
          g.add(f);
        }
        break;
      case 'round':
        cyl(w / 2, h, c, 0, 0, 0, 28);
        break;
      case 'toilet':
        add(w - 4, 28, 8, '#f4f6f6', 0, 0, -d / 2 + 4, 0.25);
        {
          const b = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.5 * S, w * 0.42 * S, 15 * S, 24),
            plain('#f4f6f6', 0.2)
          );
          b.scale.z = 1.25;
          b.position.set(0, 8 * S, 3 * S);
          b.castShadow = true;
          g.add(b);
        }
        break;
      case 'tub':
        add(w, h, d, '#f4f6f6', 0, 0, 0, 0.25);
        add(w - 6, 1, d - 6, '#cfe6f0', 0, h - 0.5, 0, 0.1);
        break;
      case 'shower':
        add(w, 3, d, '#e8eef0', 0, 0, 0, 0.3);
        {
          const gl = boxMesh(w, 72, 0.4, glassMat, false);
          gl.position.set(0, 39 * S, (d / 2) * S);
          g.add(gl);
          const g2 = boxMesh(0.4, 72, d, glassMat, false);
          g2.position.set((w / 2) * S, 39 * S, 0);
          g.add(g2);
        }
        break;
      case 'sink':
        add(w, h, d, '#e9eaec', 0, 0, 0, 0.35);
        add(w * 0.6, 0.6, d * 0.55, '#8fa7b3', 0, h - 0.2, 2, 0.15);
        break;
      case 'range':
        add(w, h, d, '#8f9599', 0, 0, 0, 0.35);
        for (const [bx, bz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          cyl(3.8, 0.8, '#2a2a2a', bx * w * 0.22, h, bz * d * 0.2);
        break;
      case 'fridge':
        add(w, h, d, '#d4d9dc', 0, 0, 0, 0.3);
        add(1, h * 0.35, 1.5, '#8e949a', w / 2 - 4, h * 0.55, d / 2 + 0.5);
        break;
      case 'shelf':
        add(w, h, d, c, 0, 0, 0, 0.6);
        for (let k = 1; k < 5; k++) add(w - 2, 0.8, d - 1, '#6e5237', 0, (h * k) / 5, 0.5);
        break;
      default:
        add(w, h, d, c, 0, 0, 0, 0.55);
    }
    g.position.set(it.x * S, e * S, it.y * S);
    g.rotation.y = (-(it.rot || 0) * Math.PI) / 180;
    return g;
  }

  // ---------------------------------------------------------------- loop & API
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  function render() {
    renderer.render(scene, camera);
  }
  function loop() {
    if (!active) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastLoopTime) / 1000);
    lastLoopTime = now;

    if (cameraMode === 'walk') {
      updateWalkMovement(dt, walkKeys);
    } else {
      controls.update();
    }
    render();
    raf = requestAnimationFrame(loop);
  }
  controls.addEventListener('change', render);
  new ResizeObserver(resize).observe(canvas);

  const api = {
    opts,
    entityMap,
    hdBase,
    preloader,
    async preloadMaterials(finishIds) {
      return preloader.preload(finishIds || Object.keys(HD_MATERIALS));
    },
    scene,
    callbacks,
    walkKeys,
    getCameraMode: () => cameraMode,
    setCameraMode,
    toggleCameraMode,
    lookWalkBy,
    updateWalkMovement,
    onError: callbacks.onError,
    onEnvChange: callbacks.onEnvChange,
    onHDChange: callbacks.onHDChange,
    onCameraModeChange: callbacks.onCameraModeChange,
    show() {
      active = true;
      resize();
      reconcile();
      cancelAnimationFrame(raf);
      lastLoopTime = performance.now();
      loop();
    },
    hide() {
      active = false;
      cancelAnimationFrame(raf);
    },
    isActive: () => active,
    update() {
      if (!active) return;
      reconcile();
    },
    rebuild: reconcile,
    frame,
    setEnv,
    setOption(k, v) {
      opts[k] = v;
      if (k === 'sun') {
        sun.intensity = 4 * v;
        render();
      } else {
        if (k === 'hd' && v) {
          preloader.preload(Object.keys(HD_MATERIALS));
        }
        reconcile();
      }
    },
    orbitBy(deltaAzimuth, deltaPolar) {
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += deltaAzimuth;
      spherical.phi = Math.max(0.01, Math.min(Math.PI * 0.499, spherical.phi + deltaPolar));
      offset.setFromSpherical(spherical);
      camera.position.addVectors(controls.target, offset);
      controls.update();
      render();
    },
    panBy(deltaX, deltaY) {
      const vX = new THREE.Vector3();
      const vY = new THREE.Vector3();
      camera.matrix.extractBasis(vX, vY, new THREE.Vector3());
      const dist = Math.max(1, camera.position.distanceTo(controls.target));
      const factor = dist * 0.04;
      const pan = vX.multiplyScalar(deltaX * factor).add(vY.multiplyScalar(deltaY * factor));
      camera.position.add(pan);
      controls.target.add(pan);
      controls.update();
      render();
    },
    zoomBy(factor) {
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      offset.multiplyScalar(factor);
      camera.position.addVectors(controls.target, offset);
      controls.update();
      render();
    },
    /** Stand inside a room at eye height looking along its longest axis. */
    eyeLevel(roomId) {
      const state = getState();
      const room =
        state.rooms.find((r) => r.id === roomId) || state.rooms.find((r) => lv(r) === getLevel());
      if (!room) return false;
      const e = levelElevations(state)[lv(room)];
      const ir = interior(room);
      const long = ir.w >= ir.h;
      const cx = ir.x + ir.w / 2;
      const cy = ir.y + ir.h / 2;
      const px = long ? ir.x + 14 : cx;
      const pz = long ? cy : ir.y + 14;

      cameraMode = 'walk';
      controls.enabled = false;
      camera.fov = 70;
      camera.updateProjectionMatrix();
      camera.position.set(px * S, (e + 64) * S, pz * S);

      const targetX = (long ? cx + 40 : cx) * S;
      const targetZ = (long ? cy : cy + 40) * S;

      const dirX = targetX - camera.position.x;
      const dirZ = targetZ - camera.position.z;
      yaw = Math.atan2(dirX, dirZ);
      pitch = 0;
      updateCameraRotation();

      const notifyMode = callbacks.onCameraModeChange || api?.onCameraModeChange;
      notifyMode?.(cameraMode);

      render();
      return true;
    },
    resetCamera() {
      cameraMode = 'orbit';
      controls.enabled = true;
      camera.fov = 50;
      camera.updateProjectionMatrix();
      frame();
      const notifyMode = callbacks.onCameraModeChange || api?.onCameraModeChange;
      notifyMode?.(cameraMode);
    },
    /** Capture 'beauty' (what you see) or 'depth' (near = white, a ControlNet depth guide) as a PNG data URL. */
    capture(mode = 'beauty', width = 1024) {
      const r = canvas.getBoundingClientRect();
      const height = Math.round((width * r.height) / r.width);
      const prevSize = renderer.getSize(new THREE.Vector2());
      const prevPR = renderer.getPixelRatio();
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const bg = scene.background;
      const env = scene.environment;
      const gnd = ground.visible;
      if (mode === 'depth') {
        const box = new THREE.Box3().setFromObject(world);
        const far = Math.min(
          30,
          Math.max(
            12,
            camera.position.distanceTo(box.getCenter(new THREE.Vector3())) +
              box.getSize(new THREE.Vector3()).length() * 0.25
          )
        );
        const nearOld = camera.near;
        const farOld = camera.far;
        scene.background = new THREE.Color('#000000');
        ground.visible = false;
        scene.overrideMaterial = new THREE.ShaderMaterial({
          uniforms: { uNear: { value: 0.5 }, uFar: { value: far } },
          vertexShader:
            'varying float vZ; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }',
          fragmentShader:
            'uniform float uNear; uniform float uFar; varying float vZ; void main(){ float d = clamp((vZ - uNear) / (uFar - uNear), 0.0, 1.0); gl_FragColor = vec4(vec3(1.0 - d), 1.0); }',
        });
        glassMat.visible = false;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.render(scene, camera);
        const url = canvas.toDataURL('image/png');
        scene.overrideMaterial = null;
        glassMat.visible = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        camera.near = nearOld;
        camera.far = farOld;
        scene.background = bg;
        scene.environment = env;
        ground.visible = gnd;
        renderer.setPixelRatio(prevPR);
        renderer.setSize(prevSize.x, prevSize.y, false);
        camera.aspect = prevSize.x / prevSize.y;
        camera.updateProjectionMatrix();
        render();
        return url;
      }
      render();
      const url = canvas.toDataURL('image/png');
      renderer.setPixelRatio(prevPR);
      renderer.setSize(prevSize.x, prevSize.y, false);
      camera.aspect = prevSize.x / prevSize.y;
      camera.updateProjectionMatrix();
      render();
      return url;
    },
    destroy() {
      active = false;
      cancelAnimationFrame(raf);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    },
  };
  return api;
}
