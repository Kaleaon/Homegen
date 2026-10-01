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
