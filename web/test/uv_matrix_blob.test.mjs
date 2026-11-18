import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import JSZip from '#jszip';

import {
  saveTextureBlob,
  saveTextureBlobsBatch,
  getTextureUrl,
  getAllTextureBlobs,
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
  it('saves and retrieves texture blobs via public entry points', async () => {
    const blobData = new Blob(['fake image data'], { type: 'image/png' });
    const id = 'tex_test_123';

    const savedId = await saveTextureBlob(id, blobData, { name: 'My Brick' });
    assert.equal(savedId, id);

    const textureUrl = await getTextureUrl(id);
    assert.ok(textureUrl);
    assert.match(textureUrl, /^blob:/);
    URL.revokeObjectURL(textureUrl);

    assert.equal(await getTextureUrl('nonexistent_tex_id'), null);
    assert.equal(await getTextureUrl(null), null);

    const textures = await getAllTextureBlobs();
    const stored = textures.find((t) => t.id === id);
    assert.ok(stored);
    assert.equal(stored.name, 'My Brick');
    assert.equal(stored.mimeType, 'image/png');
    assert.equal(stored.blob.type, 'image/png');
  });

  it('batch-saves multiple texture blobs synchronously into fallback memoryStore', async () => {
    const items = [
      {
        id: 'tex_batch_1',
        blob: new Blob(['brick bytes'], { type: 'image/png' }),
        metadata: { name: 'Red Brick' },
      },
      {
        id: 'tex_batch_2',
        blob: new Blob(['oak bytes'], { type: 'image/jpeg' }),
        name: 'White Oak',
        mimeType: 'image/jpeg',
      },
      {
        id: 'tex_batch_3',
        blob: new Blob(['marble bytes'], { type: 'image/webp' }),
        metadata: { name: 'Carrara Marble', mimeType: 'image/webp' },
      },
    ];

    // Verify synchronous fallback update when IndexedDB is unavailable
    const batchPromise = saveTextureBlobsBatch(items);
    const immediateById = new Map((await getAllTextureBlobs()).map((t) => [t.id, t]));
    assert.ok(immediateById.has('tex_batch_1'));
    assert.ok(immediateById.has('tex_batch_2'));
    assert.ok(immediateById.has('tex_batch_3'));

    const savedIds = await batchPromise;
    assert.deepEqual(savedIds, ['tex_batch_1', 'tex_batch_2', 'tex_batch_3']);

    const byId = new Map((await getAllTextureBlobs()).map((t) => [t.id, t]));
    assert.equal(byId.get('tex_batch_1').blob.type, 'image/png');
    assert.equal(byId.get('tex_batch_2').blob.type, 'image/jpeg');
    assert.equal(byId.get('tex_batch_3').blob.type, 'image/webp');
    assert.equal(byId.get('tex_batch_1').name, 'Red Brick');
    assert.equal(byId.get('tex_batch_2').name, 'White Oak');
    assert.equal(byId.get('tex_batch_3').name, 'Carrara Marble');

    // Empty batch is a safe no-op
    assert.deepEqual(await saveTextureBlobsBatch([]), []);
  });

  it('persists all batch items within a single IndexedDB readwrite transaction', async () => {
    const idbRecords = new Map();
    let transactionCount = 0;

    const mockDB = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      transaction(storeName, mode) {
        assert.equal(storeName, 'homegen_textures');
        assert.equal(mode, 'readwrite');
        transactionCount += 1;
        const tx = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore() {
            return {
              put(record) {
                idbRecords.set(record.id, record);
                return {};
              },
            };
          },
        };
        queueMicrotask(() => {
          if (tx.oncomplete) tx.oncomplete();
        });
        return tx;
      },
    };

    const prevWindow = globalThis.window;
    globalThis.window = {
      indexedDB: {
        open() {
          const req = { result: mockDB, onupgradeneeded: null, onsuccess: null, onerror: null };
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess();
          });
          return req;
        },
      },
    };

    try {
      const ids = await saveTextureBlobsBatch([
        { id: 'idb_1', blob: new Blob(['a'], { type: 'image/png' }), name: 'Tex A' },
        { id: 'idb_2', blob: new Blob(['b'], { type: 'image/jpeg' }), name: 'Tex B' },
        { id: 'idb_3', blob: new Blob(['c'], { type: 'image/webp' }), name: 'Tex C' },
      ]);

      assert.deepEqual(ids, ['idb_1', 'idb_2', 'idb_3']);
      assert.equal(transactionCount, 1, 'Expected exactly 1 readwrite transaction for batch');
      assert.equal(idbRecords.size, 3);
      assert.equal(idbRecords.get('idb_2').name, 'Tex B');
    } finally {
      if (prevWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = prevWindow;
      }
    }
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

    // Overwrite texture entry before import to verify ZIP extraction restores original asset
    await saveTextureBlob(texId, new Blob(['placeholder'], { type: 'image/png' }), {
      name: 'Placeholder',
    });

    // Import back from ZIP
    const importedState = await importProjectZip(zipBlob);
    assert.ok(importedState);
    assert.equal(importedState.rooms[0].walls.N, texId);

    const importedTextures = await getAllTextureBlobs();
    const restoredRecord = importedTextures.find((t) => t.id === texId);
    assert.ok(restoredRecord);
    assert.equal(restoredRecord.name, 'Herringbone Brick.jpg');
    assert.equal(restoredRecord.mimeType, 'image/jpeg');
    assert.equal(restoredRecord.blob.type, 'image/jpeg');
    assert.equal(await restoredRecord.blob.text(), 'fake binary image stream');

    const restoredUrl = await getTextureUrl(texId);
    assert.ok(restoredUrl);
    URL.revokeObjectURL(restoredUrl);
  });

  it('exports and imports archives containing multiple custom texture assets across formats', async () => {
    const state = newState();
    const room = createRoom(state, 'living', 0, 0, 180, 144);

    const assets = [
      {
        id: 'tex_multi_png',
        data: 'png-binary',
        type: 'image/png',
        name: 'Plaster.png',
        wall: 'N',
      },
      { id: 'tex_multi_jpg', data: 'jpg-binary', type: 'image/jpeg', name: 'Cedar.jpg', wall: 'E' },
      {
        id: 'tex_multi_webp',
        data: 'webp-binary',
        type: 'image/webp',
        name: 'Slate.webp',
        wall: 'S',
      },
      {
        id: 'tex_multi_svg',
        data: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        type: 'image/svg+xml',
        name: 'Pattern.svg',
        wall: 'W',
      },
    ];

    await saveTextureBlobsBatch(
      assets.map((a) => ({
        id: a.id,
        blob: new Blob([a.data], { type: a.type }),
        metadata: { name: a.name, mimeType: a.type },
      }))
    );

    for (const a of assets) {
      room.walls[a.wall] = a.id;
    }

    const zipBlob = await exportProjectZip(state);
    await saveTextureBlobsBatch(
      assets.map((a) => ({
        id: a.id,
        blob: new Blob(['stale-placeholder'], { type: 'application/octet-stream' }),
        metadata: { name: 'Stale', mimeType: 'application/octet-stream' },
      }))
    );

    const importedState = await importProjectZip(zipBlob);
    assert.ok(importedState);
    for (const a of assets) {
      assert.equal(importedState.rooms[0].walls[a.wall], a.id);
    }

    const importedList = await getAllTextureBlobs();
    const recordById = new Map(importedList.map((t) => [t.id, t]));

    for (const a of assets) {
      const record = recordById.get(a.id);
      assert.ok(record, `Missing texture record for ${a.id}`);
      assert.equal(record.name, a.name);
      assert.equal(record.mimeType, a.type);
      assert.ok(record.blob);
      assert.equal(record.blob.type, a.type);
      assert.equal(await record.blob.text(), a.data);
    }
  });

  it('handles empty textures folder and skips corrupted individual texture entries gracefully', async () => {
    const state = newState();
    createRoom(state, 'kitchen', 0, 0, 120, 120);

    // 1. Archive with an empty textures/ directory
    const countBeforeEmpty = (await getAllTextureBlobs()).length;
    const emptyTexZip = new JSZip();
    emptyTexZip.file('plan.json', serialize(state));
    emptyTexZip.folder('textures');
    const emptyZipBlob = await emptyTexZip.generateAsync({ type: 'blob' });

    const importedEmpty = await importProjectZip(emptyZipBlob);
    assert.equal(importedEmpty.rooms.length, 1);
    assert.equal((await getAllTextureBlobs()).length, countBeforeEmpty);

    // 2. Archive where one texture entry rejects during parallel extraction
    const mixedZip = new JSZip();
    mixedZip.file('plan.json', serialize(state));
    mixedZip.file('textures/tex_good.png', new Blob(['valid-png'], { type: 'image/png' }));
    mixedZip.file('textures/tex_corrupt.png', new Blob(['corrupt'], { type: 'image/png' }));
    const mixedBuffer = await mixedZip.generateAsync({ type: 'arraybuffer' });

    const origLoadAsync = JSZip.loadAsync.bind(JSZip);
    JSZip.loadAsync = async (src) => {
      const loaded = await origLoadAsync(src);
      const badEntry = loaded.file('textures/tex_corrupt.png');
      badEntry.async = async () => {
        throw new Error('Corrupted deflate stream');
      };
      return loaded;
    };

    try {
      const importedMixed = await importProjectZip(mixedBuffer);
      assert.equal(importedMixed.rooms.length, 1);
      const savedById = new Map((await getAllTextureBlobs()).map((t) => [t.id, t]));
      assert.ok(savedById.has('tex_good'));
      assert.equal(await savedById.get('tex_good').blob.text(), 'valid-png');
      assert.ok(!savedById.has('tex_corrupt'));
      assert.equal(await getTextureUrl('tex_corrupt'), null);
    } finally {
      JSZip.loadAsync = origLoadAsync;
    }
  });
});
