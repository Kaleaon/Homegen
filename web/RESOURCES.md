# Free resources for photoreal output

Checked against the live services on 2026-10-01. Terms change, so re-check before relying on any of them commercially.

## How the app uses them

| Feature (3D view) | Resource | Notes |
|---|---|---|
| **HD textures** checkbox | [Poly Haven](https://polyhaven.com) PBR textures (CC0) | 9 finishes map to real photo-scanned textures (diffuse, normal, roughness at 1k). Streamed on demand; falls back to the built-in procedural look offline. See `HD_MATERIALS` in `js/resources.js`. |
| **Sky** menu | Poly Haven HDRIs (CC0) | 1k `.hdr` files streamed for lighting and reflections. "Studio" is built in and works offline. |
| **Photoreal… → AI Horde** | [AI Horde](https://aihorde.net) | Sends a *depth ControlNet* guide rendered from your 3D view plus an auto-written prompt, so the picture follows your actual layout. |
| **Photoreal… → Pollinations** | [Pollinations](https://pollinations.ai) | Instant, no key, but prompt-only: it cannot see your layout. |
| **Download guides + prompt** | any local tool | Beauty PNG, depth PNG and prompt for ComfyUI / Automatic1111 / Fooocus. |

## What we verified

- **Poly Haven**: the API (`api.polyhaven.com`) and file CDN send `access-control-allow-origin: *`, need no key, and the site's licence page states CC0. All texture ids in `HD_MATERIALS` and the HDRIs in `HDRI_ENVS` returned valid files.
- **ambientCG**: CC0 per its licence page, 2000+ materials. Its API returned no CORS headers, so a browser app can't call it; use it as a download source for local renders.
- **AI Horde**: the anonymous key (`0000000000`) is accepted. The request schema supports `source_image` with `img2img` and `control_type: depth` with `image_is_control`. Our payload passed the service's `dry_run` validation. Anonymous requests are limited to ~576×576 of work (the app respects this) and the queue estimate was ~480 jobs / ~16 minutes when we tested (the actual job finished much sooner), so a free registered key is strongly recommended. An end-to-end anonymous run using a depth guide captured from this app's 3D view completed in about two minutes and returned a 576×448 image whose layout (sofa, windows, rug) followed the guide; colours and materials only loosely followed the prompt.
- **Pollinations**: an anonymous request for a 512×512 image returned a valid JPEG. It is text-only, may be rate-limited, and its terms have changed before.
- **FLUX.1 [schnell]**: Hugging Face model card is tagged `apache-2.0`.
- **ControlNet v1.1** is tagged `openrail`; **Stable Diffusion XL base 1.0** is tagged `openrail++`. Read the licence text for your use.
- **three-gpu-pathtracer** (MIT per npm) can path-trace the scene built in `js/scene3d.js` for even more realism; it is not bundled.

## Not verified (so not claimed)

- ComfyUI, Blender and the three.js GitHub repos could not be queried from this environment. They are widely used free tools, but check their licences yourself. three.js itself is vendored under its MIT licence (`vendor/three/LICENSE`).
- Hugging Face Inference and other hosted APIs need an account/token, so they are not wired in.

## Realistic expectations

AI images are interpretations: furniture details, window counts and proportions can drift even with a depth guide. They are for mood and material exploration, not construction documents.
