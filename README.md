# Homegen
Home design software

## Web designer (`web/`)

A dependency-free, browser-based home designer with Sims-style build/buy modes and automatic building-code compliance.

```
cd web && npm start        # http://localhost:8080
cd web && npm test         # code-engine tests (node:test, no installs needed)
```

- **Build**: drag out rooms (snap to a 6" grid and to neighbouring rooms), place doors and windows, drag corners to resize.
- **Buy**: 40+ furniture, fixtures and safety/electrical devices; items snap flush to walls, `R` rotates.
- **Paint**: 17 wallpapers/paints and 10 floors, per wall or whole room.
- **Kits**: complete room kits (bedroom, bath, kitchen, living, office, hall, laundry, stairs) and furniture sets.
- **Floors**: up to 4 levels (Floor tabs, `+ Floor`). Stairs must have a matching stair above/below (auto-created by *Fix automatically*), and every upper room needs a door path down to a ground-floor exit.
- **3D view**: orbit/zoom, full/cutaway/hidden walls, per-floor display, eye-level camera, lighting presets, optional free **HD textures** and **HDRI skies** streamed from Poly Haven (CC0). three.js is vendored in `web/vendor/three` (MIT), so 3D works offline apart from those optional streams.
- **Photoreal…**: exports a depth guide + auto-written prompt of the current room and sends them to free generators (AI Horde with depth ControlNet, Pollinations), or downloads them for ComfyUI/Automatic1111. See [`web/RESOURCES.md`](web/RESOURCES.md) for what was verified and the caveats.
- **Undo/redo, zoom/pan, save/open JSON, PNG export, code report (Markdown).**

### Automatic code compliance

Every edit goes through `commit()` in `web/js/codes.js`:

1. **Hard rules reject the edit** (with the reason shown): overlapping rooms, undersized habitable rooms/halls/stairs (IRC R304, R311), blocked door swings, furniture overlaps, toilet/lavatory clearances (R307.1), openings off the wall.
2. **Everything else is auto-fixed** when *Auto-comply* is on: egress/light/ventilation windows (R303, R310), required exits and door paths (R311), ceiling height (R305), smoke/CO alarms (R314/R315), lighting and switches, NEC 210.52 receptacle coverage, GFCI, bath exhaust fans, moisture-resistant bath/laundry finishes.
3. Whatever cannot be fixed (e.g. no toilet yet) is listed live in the compliance panel with the code reference.

This follows the 2021 IRC and NEC residential provisions plus a few items marked "Practice". It is a design aid, **not** a permit review: local amendments differ and your authority having jurisdiction has the final say.

## designer3d/tools interaction layer

`designer3d/tools/` now includes a modular interaction layer for precise placement:

- Grid settings model (`gridSettings.js`) with unit size, angle snapping, and magnetic thresholds.
- Transform gizmos (`transformGizmos.js`) for move/rotate/scale with snapping.
- Room drawing tool (`roomDrawingTool.js`) for snapped corners and closed-room validation.
- Collision + overlap validation (`collision.js`) and feedback payloads for ghost/invalid highlights.
- UI snap mode toggle view models (`uiSnapToggles.js`) for grid/edge/midpoint/perpendicular snap modes.

## Releases & Continuous Deployment

Release publishing is automated via GitHub Actions on semantic version git tags matching `v*.*.*` (for example, `v1.0.0`).

### Automated Workflow Pipeline

Pushing a version tag triggers `.github/workflows/release.yml`, which:

1. **Enforces Token Guardrails**: The workflow specifies `permissions: read-all` globally, restricting `contents: write` strictly to the release publishing job.
2. **Builds & Packages All Modules**:
   - Web application zipped into `homegen-web.zip`.
   - `designer3d/tools` library packaged via `npm pack` into `homegen-designer3d-tools-<version>.tgz`.
   - Android application compiled with Gradle (`:app:assembleRelease` and `:app:bundleRelease`) into APK and AAB packages.
3. **Generates SHA-256 Checksums**: Calculates SHA-256 checksums for all release binaries and saves them to `checksums.txt`.
4. **Publishes GitHub Release**: Publishes a release on GitHub containing all compiled packages and `checksums.txt` using `softprops/action-gh-release`.

### Creating a Release (Maintainers)

1. Create and push a release tag matching `v*.*.*`:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. Store any required signing keys securely in GitHub Repository Secrets (for example, `KEYSTORE_BASE64`, `KEY_ALIAS`, `KEY_PASSWORD`, `STORE_PASSWORD`). Never commit keys or secrets to workflow files or build configuration.

### Verifying Release Artifacts (Users)

Downstream users can verify package integrity after downloading release files alongside `checksums.txt`:

```bash
sha256sum -c checksums.txt
```

