# Blueprint development: reference audit and work packages

## Goal and evidence

Make an approachable house editor produce dimensionally faithful drawings that
people can edit and hand to a building professional. This is the first foundation
change, not a completed construction-document system.

Audited 2026-10-26:

- Homegen baseline: `ae210d830314ff128d5baebdef78c9fff2cdeb6a`.
- Reference: [ch-bas/threejs-sims-house-builder](https://github.com/ch-bas/threejs-sims-house-builder),
  commit `280ec84c000a11ce4a673881f05e6e2aa4c6baee`.
- Source is available directly; no executable decompilation was needed. This is
  a Sims-like independent editor, not EA's Sims 4 implementation. Inspection does
  not establish how EA implements Build Mode.
- Reference license: MIT, copyright 2026 Bassem Chagra. This change uses architectural
  observations and original Homegen code; it does not vendor reference code or assets.
  Any future copied/adapted source must retain its MIT notice. Check assets separately.

## How the reference works

Paths below are relative to `components/room-organizer/` at the audited commit.

| Concern            | Inspected source                              | Mechanism and useful lesson                                                                                                                                                                                 |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Building model     | `lib/types.ts`                                | `RoomLayout` owns the building; `FloorLayout` holds floor-specific contents. Preserve identity and physical coordinates independently of the view.                                                          |
| Edit state         | `hooks/use-layout-store.ts`                   | Zustand selectors read a shared store; action methods dispatch to the existing `layoutReducer`. UI migration reuses mutation rules rather than rebuilding them in panels.                                   |
| Export geometry    | `lib/plan-export/plan-geometry.ts`            | Pure helpers split openings from furniture, calculate rotated corners, opening axes, bounds, stair outlines and dimension geometry. Exporters share those calculations.                                     |
| CAD                | `lib/plan-export/dxf.ts`                      | `layoutToDxf` exports a floor in metres at 1:1. `buildingToDxf` places floors side by side with a shared frame and 3 m gap. Its transform reverses plan Z into CAD Y.                                       |
| Print              | `lib/plan-export/print.ts`                    | Reserves margins and title space, considers paper/orientation, and chooses a standard denominator. All-floor printing uses a common frame/scale. Overflow is explicitly distinguished from to-scale output. |
| Export maintenance | `docs/design-notes.md`, vector export section | Explains shared bounds, constant paper annotations, schedules, and DXF structure/auditing. Keep export geometry testable without starting Three.js.                                                         |

Important limitation: the reference DXF emits the shell outline and interior wall
centrelines before opening symbols. Do not assume it provides complete physical
wall assemblies, shared-wall topology or construction-ready opening cuts simply
because it exports CAD. Borrow the separation of concerns and verify each geometry
operation against Homegen's requirements.

## Homegen findings and this change

Homegen already has polygon-room geometry, grid/snapping tools, JSON history,
calibrated background-image import, vector PDF, DXF and bill-of-material exports.
Its model uses **inches**, unlike the reference's metres: never transfer coordinates
without an explicit adapter (1 inch = 0.0254 m). Retain Homegen's model and adapt at
export boundaries rather than replacing the editor with the reference application.

PDF fixes in this branch:

1. Calculate denominator as `72 / pointsPerModelInch`. A 12-inch model ruler at
   1:48 is 18 points / 0.25 inches on paper. The former fit label incorrectly
   included an extra factor of 12.
2. Remove the minimum fit scale that allowed large footprints to overflow.
3. Use the union of selected floors for a shared origin/frame and fit scale.
4. Include outer wall half-thickness and reserve a paper annotation band.
5. Reject fixed scales that do not fit, with an actionable message in the existing
   PDF error handler. Do not silently shrink a drawing while keeping its scale label.

The standalone `web/js/planScale.js` calculation can support other sheet exporters.
Fit ratios are labelled approximate; users should choose a fixed architectural
scale when a standard measurable scale is required, and print at 100%.

The baseline also contained three exported `polygonCentroid` definitions in one
ES module and a duplicate `getRoomPoints` import. These are syntax errors in Node
and browsers. The branch retains the first centroid implementation and removes
the duplicate declarations/import so the geometry/export modules can load.

## Parallel development contracts

These are proposed independent work packages, not a claim that all are implemented.
Agree the geometry contract first. Keep `app.js` wiring in a final integration PR
so independent changes do not compete in the large controller file.

| Workstream                 | Owned area                                               | Deliverable and acceptance evidence                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: canonical plan geometry | New `web/js/planGeometry.js`; geometry fixtures          | Pure `buildPlanGeometry(doc, { level })` returning physical inches, explicit axes, stable room/wall/opening IDs, wall faces with opening gaps, raw unrotated furniture dimensions, dimensions and content bounds. No DOM, jsPDF or Three imports. Adjacent rooms share a wall once. Fixtures cover L-shapes, angled walls, shared doors, reversed wall directions and multiple floors. |
| B: everyday editing        | Dedicated precision-control module + UI                  | Enter exact wall lengths and offsets in feet/inches or metric; preview snaps and conflicts; move/resize entire rooms; one undo step per gesture. Tests round-trip units and keep hosted doors/windows attached after edits. Depends on A's IDs/units, not exporter implementation.                                                                                                     |
| C: sheets and CAD          | `pdfEngine.js`, `dxfExporter.js`, shared export adapters | Consume A; overall and chained dimensions; door/window IDs and schedules; north orientation; readable paper-size annotations; one floor per PDF sheet; separated/layered CAD floors. Audit generated DXF with an independent CAD reader and verify a known ruler in PDF.                                                                                                               |
| D: review and handoff      | New validation/report module                             | Explain missing dimensions, stairs/headroom information, unresolved conflicts and source assumptions. Track location, code edition and review status explicitly. Export a checklist/report without asserting an architectural or engineering approval.                                                                                                                                 |

Suggested geometry payload: `{ units: 'inches', axes: { x: 'right', y: 'down' },
level, bounds, walls, openings, furniture, dimensions, warnings }`.
CAD adapters flip Y once; PDF uses the downward plan axis. Renderers never read
each other's private state. Geometry must not mutate the saved document.

## Prioritized gaps after this PR

- **DXF fidelity:** current structural rectangles cross door/window locations;
  the finish polygon is continuous; all-floor output overlays floor geometry;
  rotated furniture uses an already-swapped footprint and rotates it again.
  Fix these with A/C and entity-level tests before advertising CAD fidelity.
- **Shared boundaries:** establish wall ownership, thickness and opening hosting
  across adjoining rooms. A room polygon alone is not a construction wall assembly.
- **Measurement:** distinguish exterior, wall centreline and clear-interior
  dimensions. Use actual dimension chains, not only bounding-box room labels.
- **Full document package:** elevations, sections, roof/foundation/framing,
  details, structural assumptions and coordinated MEP are additional work.
- **Review semantics:** visual branding/stamps must be distinguished from recorded
  professional review. Existing automated compliance results are design checks,
  not proof of permit readiness.
- **Printed extent:** fit currently frames room walls plus a fixed paper band.
  Outward door swings, annotations and future dimensions need their own measured
  geometry bounds in A; extremely small fit scales can make labels unreadable.

## Validation

Run `cd web && node --test test/pdfEngine.test.mjs test/planScale.test.mjs` for the
focused scale/export checks, followed by `npm test` for the complete web pipeline.
The scale tests assert a real ruler length, sub-0.2 pt/in large-plan fitting,
fixed-scale overflow errors, invalid inputs, and common scales across floors.
Inspect generated sheets with an independent PDF reader; tests alone do not
establish visual quality or a building's suitability for construction.

Observed on this branch: all 13 focused PDF/scale tests pass; changed JavaScript
passes ESLint with two existing unused-variable warnings in `pdfEngine.js`.
Two different-sized floors were exported and rendered with Poppler: both show
the same 1:38.95 fit label and shared origin, with geometry inside the sheet.
The full `npm test` pipeline builds CSS and passes CSS lint, then reports
317 passing / 19 failing tests. Remaining failures include baseline duplicate
`idx` declarations in `scene3d.js`, committed merge conflict markers in
`test/snapping_bridge.test.mjs`, a polygon-overlay assertion and other existing
3D/test issues. The full suite is not green; this change should remain a draft
until the integration blockers are resolved. Android was not changed or tested.
