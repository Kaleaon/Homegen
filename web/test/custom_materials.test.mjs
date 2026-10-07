import test from 'node:test';
import assert from 'node:assert/strict';

import { WALL_FINISHES, WALL_BY_ID } from '../js/catalog.js';
import { registerCustomWallFinish } from '../js/presetRegistry.js';
import * as M from '../js/model.js';

test('registerCustomWallFinish appends to WALL_FINISHES and WALL_BY_ID', () => {
  const countBefore = WALL_FINISHES.length;
  const spec = {
    id: 'test_custom_wallpaper_1',
    name: 'Vintage Damask Wallpaper',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    tileInches: 48,
  };

  const registered = registerCustomWallFinish(spec);

  assert.equal(WALL_FINISHES.length, countBefore + 1);
  assert.equal(WALL_BY_ID['test_custom_wallpaper_1'], registered);
  assert.equal(registered.id, 'test_custom_wallpaper_1');
  assert.equal(registered.name, 'Vintage Damask Wallpaper');
  assert.equal(registered.tileInches, 48);
  assert.equal(registered.isCustom, true);
});

test('registerCustomWallFinish restricts tile density to valid presets (12, 24, 48, 96)', () => {
  const valid12 = registerCustomWallFinish({ id: 'test_tile_12', name: 'Tile 12', tileInches: 12 });
  assert.equal(valid12.tileInches, 12);

  const valid24 = registerCustomWallFinish({ id: 'test_tile_24', name: 'Tile 24', tileInches: 24 });
  assert.equal(valid24.tileInches, 24);

  const valid48 = registerCustomWallFinish({ id: 'test_tile_48', name: 'Tile 48', tileInches: 48 });
  assert.equal(valid48.tileInches, 48);

  const valid96 = registerCustomWallFinish({ id: 'test_tile_96', name: 'Tile 96', tileInches: 96 });
  assert.equal(valid96.tileInches, 96);

  const invalid30 = registerCustomWallFinish({
    id: 'test_tile_invalid',
    name: 'Tile 30',
    tileInches: 30,
  });
  assert.equal(invalid30.tileInches, 24, 'Invalid tile density must fallback to 24 inches');

  const invalidNull = registerCustomWallFinish({ id: 'test_tile_null', name: 'Tile Null' });
  assert.equal(invalidNull.tileInches, 24, 'Missing tile density must default to 24 inches');
});

test('Modifying tile density preset updates finish in WALL_BY_ID and syncs across all assigned walls', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 144, 144);

  const _mat = registerCustomWallFinish(
    {
      id: 'shared_custom_finish',
      name: 'Custom Oak Panel',
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      tileInches: 24,
    },
    state
  );

  // Assign finish ID string to room walls
  M.applyWallFinish(state, 'shared_custom_finish', { scope: 'room', room });

  // Schema check: room.walls contains standard finish string ID
  assert.equal(room.walls.N, 'shared_custom_finish');
  assert.equal(room.walls.E, 'shared_custom_finish');
  assert.equal(room.walls.S, 'shared_custom_finish');
  assert.equal(room.walls.W, 'shared_custom_finish');
  assert.equal(typeof room.walls.N, 'string');

  // Verify initial density
  assert.equal(WALL_BY_ID[room.walls.N].tileInches, 24);

  // Update tile density preset to 48"
  registerCustomWallFinish({ id: 'shared_custom_finish', tileInches: 48 }, state);

  // All walls sharing this finish ID now reference updated tileInches
  assert.equal(WALL_BY_ID[room.walls.N].tileInches, 48);
  assert.equal(WALL_BY_ID[room.walls.E].tileInches, 48);
  assert.equal(WALL_BY_ID[room.walls.S].tileInches, 48);
  assert.equal(WALL_BY_ID[room.walls.W].tileInches, 48);
});

test('Catalog memory lifecycle: customFinishes serialize in plan and re-register upon reload', () => {
  const state = M.newState();
  registerCustomWallFinish(
    {
      id: 'persisted_wallpaper',
      name: 'Persisted Floral Wallpaper',
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      tileInches: 12,
    },
    state
  );

  const json = M.serialize(state);
  assert.match(json, /persisted_wallpaper/);
  assert.match(json, /customFinishes/);

  // Simulate reloading into fresh session where catalog is cleared or reloaded
  delete WALL_BY_ID['persisted_wallpaper'];
  const idx = WALL_FINISHES.findIndex((f) => f.id === 'persisted_wallpaper');
  if (idx >= 0) WALL_FINISHES.splice(idx, 1);

  assert.equal(WALL_BY_ID['persisted_wallpaper'], undefined);

  // Deserializing plan re-registers custom finish into global material catalog
  const loadedState = M.deserialize(json);

  assert.notEqual(WALL_BY_ID['persisted_wallpaper'], undefined);
  assert.equal(WALL_BY_ID['persisted_wallpaper'].name, 'Persisted Floral Wallpaper');
  assert.equal(WALL_BY_ID['persisted_wallpaper'].tileInches, 12);
  assert.equal(loadedState.customFinishes.length, 1);
});
