import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';

import {
  saveTextureBlob,
  getTextureBlob,
  listTextures,
  deleteTextureBlob,
  clearTextures,
} from '../js/textureStore.js';

import {
  newState,
  createRoom,
  getWallUV,
  setWallUV,
  applyWallUV,
  serialize,
  deserialize,
  DEFAULT_UV_TRANSFORM,
} from '../js/model.js';

import { exportProjectZip, importProjectZip } from '../js/archive.js';

describe('IndexedDB Blob Texture Store', () => {
  beforeEach(async () => {
    await clearTextures();
  });

  it('saves and retrieves texture blobs', async () => {
    const blobData = new Blob(['fake image data'], { type: 'image/png' });
    const id = 'tex_test_123';

    const savedId = await saveTextureBlob(id, blobData, { name: 'My Brick' });
    assert.equal(savedId, id);

    const retrievedBlob = await getTextureBlob(id);
    assert.ok(retrievedBlob);
    assert.equal(retrievedBlob.type, 'image/png');

    const textures = await listTextures();
    assert.equal(textures.length, 1);
    assert.equal(textures[0].id, id);
    assert.equal(textures[0].name, 'My Brick');
  });

  it('deletes stored texture blobs', async () => {
    const blobData = new Blob(['image data'], { type: 'image/png' });
    await saveTextureBlob('tex_del_1', blobData);

    let list = await listTextures();
    assert.equal(list.length, 1);

    await deleteTextureBlob('tex_del_1');
    list = await listTextures();
    assert.equal(list.length, 0);
  });
});

describe('Affine UV Transform Matrix Model', () => {
  it('initializes new room with default 3x3 UV transformation matrix per wall face', () => {
    const state = newState();
    const room = createRoom(state, 'living', 0, 0, 120, 120);

    assert.ok(room.wallUV);
    for (const wall of ['N', 'E', 'S', 'W']) {
      const uv = getWallUV(room, wall);
      assert.deepEqual(uv, DEFAULT_UV_TRANSFORM);
    }
  });

  it('updates UV transform parameters on a specific wall face', () => {
    const state = newState();
    const room = createRoom(state, 'bedroom', 0, 0, 144, 144);

    setWallUV(room, 'N', { scaleU: 2.5, scaleV: 1.5, rotation: 45, offsetU: 0.25, offsetV: -0.5 });
    const uvN = getWallUV(room, 'N');
    assert.equal(uvN.scaleU, 2.5);
    assert.equal(uvN.scaleV, 1.5);
    assert.equal(uvN.rotation, 45);
    assert.equal(uvN.offsetU, 0.25);
    assert.equal(uvN.offsetV, -0.5);

    // Other walls remain default
    const uvE = getWallUV(room, 'E');
    assert.deepEqual(uvE, DEFAULT_UV_TRANSFORM);
  });

  it('applies UV parameters across scopes (room, level, plan)', () => {
    const state = newState();
    const r1 = createRoom(state, 'living', 0, 0, 120, 120, { level: 0 });
    const r2 = createRoom(state, 'bedroom', 140, 0, 120, 120, { level: 0 });

    applyWallUV(state, { rotation: 90 }, { scope: 'room', room: r1 });
    assert.equal(getWallUV(r1, 'N').rotation, 90);
    assert.equal(getWallUV(r1, 'E').rotation, 90);
    assert.equal(getWallUV(r2, 'N').rotation, 0);

    applyWallUV(state, { scaleU: 3.0 }, { scope: 'plan' });
    assert.equal(getWallUV(r1, 'N').scaleU, 3.0);
    assert.equal(getWallUV(r2, 'S').scaleU, 3.0);
  });

  it('serializes and deserializes plan JSON maintaining UV matrices and backward compatibility', () => {
    const state = newState();
    const room = createRoom(state, 'kitchen', 0, 0, 120, 120);
    setWallUV(room, 'S', { scaleU: 4.0, rotation: 180 });

    const json = serialize(state);
    const restored = deserialize(json);

    const restoredRoom = restored.rooms[0];
    assert.equal(getWallUV(restoredRoom, 'S').scaleU, 4.0);
    assert.equal(getWallUV(restoredRoom, 'S').rotation, 180);

    // Backward compatibility test: JSON without wallUV field
    const legacyState = {
      version: 2,
      name: 'Legacy Home',
      rooms: [
        {
          id: 'r10',
          type: 'living',
          name: 'Living room',
          level: 0,
          x: 0,
          y: 0,
          w: 120,
          h: 120,
          ceiling: 96,
          walls: { N: 'paint_white', E: 'paint_white', S: 'paint_white', W: 'paint_white' },
        },
      ],
    };

    const legacyRestored = deserialize(JSON.stringify(legacyState));
    assert.ok(legacyRestored.rooms[0].wallUV);
    assert.deepEqual(getWallUV(legacyRestored.rooms[0], 'N'), DEFAULT_UV_TRANSFORM);
  });
});

describe('3D Shader UV Matrix Transforms', () => {
  it('constructs THREE.Matrix3 transform with setUvTransform and matrixAutoUpdate = false', () => {
    const texture = new THREE.Texture();
    const scaleU = 2.0;
    const scaleV = 3.0;
    const rotationDeg = 45;
    const offsetU = 0.5;
    const offsetV = -0.2;

    const rotRad = (rotationDeg * Math.PI) / 180;

    texture.matrixAutoUpdate = false;
    texture.matrix.setUvTransform(offsetU, offsetV, scaleU, scaleV, rotRad, 0.5, 0.5);

    assert.equal(texture.matrixAutoUpdate, false);
    assert.ok(texture.matrix instanceof THREE.Matrix3);

    // Matrix elements must not be identity
    const elements = texture.matrix.elements;
    assert.notDeepEqual(elements, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('Composite ZIP Export & Import Archiving', () => {
  beforeEach(async () => {
    await clearTextures();
  });

  it('packages plan JSON and IndexedDB texture assets into a ZIP file and imports them back', async () => {
    const state = newState();
    const room = createRoom(state, 'office', 0, 0, 144, 144);
    const texId = 'tex_herringbone_brick';

    const fakeImageBlob = new Blob(['fake binary image stream'], { type: 'image/jpeg' });
    await saveTextureBlob(texId, fakeImageBlob, { name: 'Herringbone Brick.jpg' });

    room.walls.N = texId;
    setWallUV(room, 'N', { scaleU: 2.0, scaleV: 2.0, rotation: 45, offsetU: 0.1, offsetV: 0.1 });

    // Export to ZIP
    const zipBlob = await exportProjectZip(state);
    assert.ok(zipBlob);
    assert.ok(zipBlob.size > 0);

    // Clear texture store to simulate new device/browser
    await clearTextures();
    assert.equal((await listTextures()).length, 0);

    // Import back from ZIP
    const importedState = await importProjectZip(zipBlob);
    assert.ok(importedState);
    assert.equal(importedState.rooms[0].walls.N, texId);

    const importedTextures = await listTextures();
    assert.equal(importedTextures.length, 1);
    assert.equal(importedTextures[0].id, texId);

    const restoredBlob = await getTextureBlob(texId);
    assert.ok(restoredBlob);
    assert.equal(restoredBlob.type, 'image/jpeg');
  });
});
