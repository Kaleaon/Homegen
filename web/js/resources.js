// Free resources for photoreal output. Everything here was checked against the live service/API on 2026-10-01;
// licences are as reported by the source (see RESOURCES.md). Re-check before commercial use.

/** Plan finish id -> Poly Haven (CC0) PBR texture. `tile` = inches covered by one texture repeat (approximate). */
export const HD_MATERIALS = {
  floor_oak: { id: 'plank_flooring', tile: 48 },
  floor_walnut: { id: 'dark_wooden_planks', tile: 48 },
  floor_herringbone: { id: 'herringbone_parquet', tile: 48 },
  floor_tile_gray: { id: 'grey_tiles', tile: 48 },
  floor_marble: { id: 'marble_tiles', tile: 48 },
  floor_vinyl: { id: 'laminate_floor_02', tile: 48 },
  floor_concrete: { id: 'concrete_floor_02', tile: 60 },
  wall_brick: { id: 'red_brick_03', tile: 48 },
  wall_tile_white: { id: 'long_white_tiles', tile: 36 },
};

export function polyHavenTextureUrls(id) {
  const base = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}`;
  return { diff: `${base}_diff_1k.jpg`, nor_gl: `${base}_nor_gl_1k.jpg`, rough: `${base}_rough_1k.jpg` };
}

/** Lighting environments. 'studio' is built in (works offline); the others stream a 1k HDRI from Poly Haven (CC0). */
export const HDRI_ENVS = [
  { id: 'studio', name: 'Studio (offline)' },
  { id: 'kloofendal_48d_partly_cloudy_puresky', name: 'Daylight sky (Poly Haven)' },
  { id: 'studio_small_03', name: 'Soft studio (Poly Haven)' },
];

export const FREE_RESOURCES = [
  { group: 'Image generation (free to use)', name: 'AI Horde', url: 'https://aihorde.net', note: 'Crowdsourced Stable Diffusion workers. Anonymous key works but queues are long (we saw ~10 min); a free registered key is much faster. Supports img2img and ControlNet depth, which this app uses.' },
  { group: 'Image generation (free to use)', name: 'Pollinations', url: 'https://pollinations.ai', note: 'Free text-to-image by URL, no key needed in our test. Prompt-only (no layout guidance), may be rate-limited or change terms.' },
  { group: 'Image generation (run it yourself)', name: 'FLUX.1 [schnell]', url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell', license: 'Apache-2.0', note: 'Open-weights text-to-image model; fast, commercial use allowed.' },
  { group: 'Image generation (run it yourself)', name: 'ControlNet v1.1 (depth, canny, …)', url: 'https://huggingface.co/lllyasviel/ControlNet-v1-1', license: 'CreativeML OpenRAIL', note: 'Lets Stable Diffusion follow the layout of the depth guide this app exports.' },
  { group: 'Image generation (run it yourself)', name: 'Stable Diffusion XL base 1.0', url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0', license: 'OpenRAIL++', note: 'Use with ComfyUI, Automatic1111 or Fooocus (all free) plus the exported guide images.' },
  { group: 'Textures, HDRIs & models', name: 'Poly Haven', url: 'https://polyhaven.com', license: 'CC0', note: '~860 PBR textures, ~1000 HDRIs, ~500 models. No key; its API sends CORS headers, so this app streams textures/HDRIs directly (HD textures + sky options in the 3D view).' },
  { group: 'Textures, HDRIs & models', name: 'ambientCG', url: 'https://ambientcg.com', license: 'CC0', note: '2000+ PBR materials. Its API has no CORS headers in our test, so it is download-only (use for local renders).' },
  { group: 'Path tracing', name: 'three-gpu-pathtracer', url: 'https://www.npmjs.com/package/three-gpu-pathtracer', license: 'MIT', note: 'Drop-in path-traced rendering for three.js scenes (not bundled here; the scene graph in js/scene3d.js is compatible).' },
];
