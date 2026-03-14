# Homegen
Home design software

## designer3d/tools interaction layer

`designer3d/tools/` now includes a modular interaction layer for precise placement:

- Grid settings model (`gridSettings.js`) with unit size, angle snapping, and magnetic thresholds.
- Transform gizmos (`transformGizmos.js`) for move/rotate/scale with snapping.
- Room drawing tool (`roomDrawingTool.js`) for snapped corners and closed-room validation.
- Collision + overlap validation (`collision.js`) and feedback payloads for ghost/invalid highlights.
- UI snap mode toggle view models (`uiSnapToggles.js`) for grid/edge/midpoint/perpendicular snap modes.
