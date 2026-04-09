# RCC Tool — Agent Onboarding Guide

A web-based RCC (Reinforced Cement Concrete) structural design and analysis tool for basement slabs, walls, beams, and columns following **IS 456:2000** (Indian Standard). Built with React + Zustand + Konva.

---

## Tech Stack

- **React + Vite** — UI framework
- **Zustand** — state management (`src/store/useStore.js`)
- **Konva / react-konva** — 2D canvas drawing
- **Babylon.js** (lazy-loaded) — 3D visualization
- **IS 456:2000** — the sole structural code reference

---

## Project Structure

```
src/
  App.jsx                   # Root layout: toolbar + canvas + right panel
  main.jsx                  # Entry point
  components/
    Toolbar.jsx             # Left sidebar: tools, undo, PDF, save/load, height
    DrawingCanvas.jsx       # Konva 2D canvas — draw, drag, snap, ortho
    PropertiesPanel.jsx     # Right panel Props tab: dimensions + steel editors
    AnalysisPanel.jsx       # Right panel Steel tab: bar weights + quantities
    LoadsPanel.jsx          # Right panel Loads tab: soil/load params + cross-section diagram
    CapacityPanel.jsx       # Right panel Check tab: IS 456 check results
    SteelEditor.jsx         # Reusable bar spec inputs (count, dia, spacing, support types)
    UnitInput.jsx           # Dimension input with unit conversion
    SlabSection.jsx         # SVG slab cross-section sketch
    ThreeDView.jsx          # Lazy-loaded 3D view (Babylon.js)
    ReportView.jsx          # PDF report layout
  store/
    useStore.js             # Zustand store — all state + actions
  utils/
    capacity/
      index.js              # IS 456 capacity check engine (~1400 lines)
      is456Tables.js        # IS 456 tables: τc, τc_max, Ld, xu_max, slab coefficients
    constants.js            # Colors, grid sizes, default steel specs, beam/slab schedules
    units.js                # fmtLen, toMM, fmtDual — unit conversion
    rcc.js                  # Steel weight/quantity calculations
    regionDetect.js         # Spatial queries: point-in-slab, beam intersections, tributary
    exportPDF.js            # PDF generation with annotations
  presets/
    basement-slab.json      # Built-in example basement structure
```

---

## Zustand Store (`src/store/useStore.js`)

### UI State
```js
activeTool: 'select' | 'pan' | 'column' | 'wall' | 'beam' | 'slab'
activeBeamMark: 'B1' | 'B2' | 'B3' | 'B4' | 'CUSTOM'
show3D: boolean
rightTab: 'properties' | 'analysis' | 'loads' | 'capacity'
dimToggles: { beam, wall, column, slab }  // per-type label visibility
pdfTrigger: number     // increment to trigger PDF
fitTrigger: number     // increment to fit view
projectName: string
wallHeightMm: number   // storey/wall height (default 4267mm = 14ft)
primaryUnit / secondaryUnit: 'ft' | 'ft-in' | 'mm' | 'cm' | 'm'
showSecondaryUnit: boolean
```

### Load Parameters (`loads` object)
```js
loads: {
  soilDepthMm: 600,        // soil cover on roof slab
  slabGamma: 18,           // backfill unit weight (kN/m³)
  liveLoad: 5.0,           // imposed load (kN/m²)
  soilGamma: 18,           // lateral soil unit weight
  soilSaturated: false,
  gammaW: 9.81,
  waterTableDepth: null,   // mm from surface (null = no water)
  phi: 30,                 // friction angle (degrees)
  cohesion: 0,
  surcharge: 10,           // kPa surface surcharge
  loadCase: 'active' | 'at-rest' | 'passive',
  raftThicknessMm: 300,    // affects wall bar development length check
  wallTopPropped: boolean, // propped cantilever vs free cantilever wall
  horizBarHookMm: 0,       // L-hook extension of wall bars into raft
}
```

### Capacity Inputs (`capacityInputs` object)
```js
capacityInputs: {
  fck: 25,                         // concrete grade (N/mm²)
  fy: 500,                         // steel yield (N/mm²)
  beamTu: { [beamId]: kNm },       // manual torsion override per beam
  beamMuHogg: { [beamId]: kNm },   // manual hogging moment override
  slabCase: { [slabId]: 1–9 },     // IS 456 Table 26 case per slab
  colPu: { [colId]: kN },          // axial load per column
  colMux / colMuy: { [colId]: kNm }
}
```

### Structural Elements

#### Column
```js
{ id, x, y, width, depth, mark: 'C1',
  steel: { vertBars: {count, dia}, ties: {dia, spacing}, cover } }
```

#### Wall
```js
{ id, start: {x,y}, end: {x,y}, thickness, length,
  steel: { horizBars: {dia, spacing, faces}, vertBars: {dia, spacing, faces}, cover } }
```

#### Beam
```js
{ id, start: {x,y}, end: {x,y}, mark: 'B1', label: 'B1-1',
  width, depth, length, elevation,
  steel: {
    bottomFull:     { count, dia },   // full-length bottom bars (present at supports)
    bottomCurtail:  { count, dia },   // extra bars at midspan only (±L/7 from centre)
    topSteel:       { count, dia },   // full-length top bars
    extraTopSupport:{ count, dia },   // additional top bars at supports only
    stirrups: { dia, supportSpacing, supportNos, midSpacing },
    cover,
    startSupport: { type: 'wall'|'column', embedmentDepth, lBend, lBendLength, colWidth, straightBar },
    endSupport:   { ... same ... }
  }
}
```

#### Slab
```js
{ id, points: [{x,y},...], mark: 'S3',
  shortSpan, longSpan, elevation,
  steel: {
    depth,
    mainBar:  { dia, spacing },
    distBar:  { dia, spacing },
    topSteel: { dia, spacing, enabled },
    altBentUp: boolean,
    sunkDepth, cover
  }
}
```

### Key Actions
| Action | Purpose |
|--------|---------|
| `addColumn/Wall/Beam/Slab(...)` | Create element, returns id |
| `updateElement(type, id, patch)` | Update geometry fields |
| `updateSteel(type, id, patch)` | Update steel object |
| `updateSteelNested(type, id, key, patch)` | Update nested steel (e.g. startSupport) |
| `deleteSelected()` / `clearAll()` | Remove elements |
| `goHome()` | Clear all + reset preset tracking (shows start screen) |
| `setLoads(patch)` | Update load parameters |
| `setCapacityGrades(fck, fy)` | Update concrete/steel grades |
| `setBeamTu(id, Tu)` / `setBeamMuHogg(id, M)` | Manual beam moment overrides |
| `setSlabCase(id, n)` | IS 456 Table 26 case for slab |
| `setColLoad(id, {Pu?, Mux?, Muy?})` | Column design loads |
| `loadProject(json, presetName?)` | Load project JSON |
| `resetToPreset()` | Restore to original preset |
| `undo()` | Pop history (max 50 snapshots) |
| `requestFit()` | Fit all elements to view |

### Persistence
- **Auto-save:** Debounced 800ms to `localStorage['rcc-autosave']`
- **Panel width:** Persisted to `localStorage['rcc_panelW']` (default 400px)
- **Project save/load:** Manual JSON download/upload

---

## Capacity Engine (`src/utils/capacity/index.js`)

### Helper Functions
```js
astCircle(count, dia)        // → mm² from bar count + diameter
ast1m(dia, spacing)          // → mm²/m for slabs

momentCap(b, D, Ast, cover, fy, fck, Asc?, d_prime?)
// Singly OR doubly-reinforced beam (IS 456 Annex G Cl. G-1.2)
// When xu > xuMax and Asc > 0:
//   Mu = 0.36·fck·b·xuMax·(d − 0.42·xuMax) + fsc·Asc_used·(d − d')
//   Asc_used = min(Asc_available, Ast_extra) where Ast_extra = Ast − Ast_bal
//   Ast_bal = 0.36·fck·b·xuMax / (0.87·fy)
// Returns: { Mu_kNm, xu, xuMax, d, overReinforced, doublyReinforced?, fsc?, Asc_used? }

momentCapTee(bw, D, bf, Df, Ast, cover, fy, fck)
// T-beam midspan (flange in compression)
// Returns: { Mu_kNm, xu, xuMax, d, overReinforced, naInFlange, bf_used }

chk(id, desc, clause, demand, capacity, unit, note?, warnAt?)
// → check object: {id, desc, clause, demand, capacity, unit, dcr, status, note}
// status: 'pass' (dcr<0.9) | 'warn' (0.9≤dcr≤1.0) | 'fail' (dcr>1.0)

info(id, desc, note?, clause?)   // informational row, no pass/fail
flagFail(id, desc, clause, note) // hard failure row
```

### Main Check Functions

#### `checkSlab(slab, wu_kNm2, fy, fck, slabCase=9)`
Checks: min/max reinforcement, one-way vs two-way moment (IS 456 Table 26), flexure, shear, deflection (l/d), development length.

#### `checkBeam(beam, wu_kNm, fy, fck, adjacentSlabs=[], intCols=[], L_eff_mm?, bf_tee_mm?, Df_mm?)`
Key logic:
- **Curtailed bars:** `Ast_bot_mid = Ast_bot + astCircle(bc.count, bc.dia)` used for **sagging** check only. Hogging compression steel uses `Ast_bot` (full bars only, present at support).
- **T-beam:** Uses `bf_tee_mm` + `Df_mm` at midspan (slab flange in compression); rectangular at support (hogging).
- **Doubly-reinforced hogging:** Bottom bars (`Ast_bot`) act as compression steel when top steel is over-balanced.
- **Continuous span model:** If intermediate columns detected → IS 456 Table 12 (wL²/12 sag, wL²/10 hogg, 0.6wL shear). Otherwise simply-supported.
- **Shear checks:** τv,max at support face (section size — cannot be fixed by steel) + stirrup capacity at d from face.
- **IS 456 two-way slab load (Cl. 24.5):** Short-span beam gets triangular distribution (tribW = lx/3); long-span beam gets trapezoidal (tribW = lx·(3−1/r²)/6). Detected via adjacent slab edge length vs (lx+ly)/2 threshold.

#### `checkColumn(col, wallHMm, Pu, Mux, Muy, fy, fck)`
Checks: axial capacity, biaxial bending interaction, steel limits (0.8%–6%), tie spacing.

#### `checkWall(wall, wallHMm, loads, fy, fck)`
Checks: lateral moment capacity (Ka/K0 × γ × H²), horizontal bar flexure, min steel, development + hook into raft.

### Entry Point
```js
runCapacityChecks(storeState, capacityInputs)
// → { [elementId]: check[] }
// Loops all elements, computes loads (slab→beam), runs checks
```

---

## IS 456 Tables (`src/utils/capacity/is456Tables.js`)

```js
getTauBd(fck, {deformed?, compression?, topBar?})  // bond stress
calcLd(phi, fy, fck, opts)                          // development length
getTc(pt_pct, fck)                                  // shear strength τc (Table 19)
getTcMax(fck)                                       // max shear τc,max (Table 20)
xuMaxRatio(fy)                                      // 0.479 (Fe415), 0.456 (Fe500)
getSlabCoeffs(ratio, caseNum)                       // αx, αy from Table 26
```

**τc,max by grade:** M25=3.1, M30=3.5, M35=3.7, M40+=4.0 N/mm²

---

## Constants (`src/utils/constants.js`)

```js
// Beam colors
COLORS.B1 = '#FFD700'  // gold
COLORS.B2 = '#FF8C00'  // orange
COLORS.B3 = '#00CED1'  // cyan
COLORS.B4 = '#FF4444'  // red

// Default panel width (persisted to localStorage)
// App.jsx: PANEL_DEFAULT=400, PANEL_MIN=200, PANEL_MAX=620

// Default covers: beam=25mm, slab=15mm, column=40mm

// Beam schedules: B1={230×450}, B2={230×600}, B3={300×600}, B4={300×750}
// Slab schedules: S1=150mm, S2=175mm, S3=200mm, S4=230mm
```

---

## Units (`src/utils/units.js`)

```js
fmtLen(mm, unit)           // mm → display string
toMM(value, unit)          // user input → mm (ft-in accepts "5-3.25", "5'3.25\"")
fmtDual(mm, primary, sec)  // "5.500 m  |  18′-0″"
UNIT_LABELS: { ft, 'ft-in', mm, cm, m }
```

---

## Key Design Decisions & History

### Curtailed Bars (Important)
`bottomCurtail` bars (stored as `beam.steel.bottomCurtail`) were previously ignored in capacity checks — only showed in Steel tab for scheduling. **Fixed:** `Ast_bot_mid = Ast_bot + astCircle(bc.count, bc.dia)` is now used for the sagging flexure check and deflection. Full bars only (`Ast_bot`) remain for hogging compression steel and shear `pt_bot`.

### Doubly-Reinforced Hogging
Hogging check passes `Ast_bot` as compression steel to `momentCap()`. Prior to the fix, hogging was computed as singly-reinforced, causing a false FAIL. The safe implementation uses `Asc_used = min(Asc_available, Ast_extra)` to prevent negative xu when Asc > Ast.

### IS 456 Cl. 24.5 Two-Way Slab Load Reduction
Short-span beam: `tribW = lx/3` (triangular). Long-span beam: `tribW = lx·(3−1/r²)/6` (trapezoidal). Detection compares adjacent slab edge length to `(lx+ly)/2` midpoint. Implemented in `slabTribWidth()` in capacity/index.js.

### τv,max Failure (Section Size)
This IS 456 Table 20 check is purely a concrete web size limit (`τv = Vu/(bw×d) ≤ τc,max`). No steel can fix it. Only increasing `bw` or `d` (or adding an intermediate support to reduce Vu) resolves it. DCR up to ~1.2 is generally accepted in practice for confined basement beams.

### Tributary View (Canvas)
Three Konva layers:
1. `<Layer listening={false}>` — zone fills, outlines (visual only)
2. `<Layer>` — draggable info box (`tribBoxPos` state, resets on beam change)
3. `<Layer listening={false}>` — hover, guidelines, preview, cursor

### Right Panel Width
Default 400px. User preference persisted to `localStorage['rcc_panelW']`. Do not reduce below 400px default — user prefers wider panel.

---

## Structural Knowledge (Context for IS 456 Checks)

| Check | IS 456 Ref | Notes |
|-------|-----------|-------|
| Min tension steel | Cl. 26.5.1.1 | 0.85bd/fy |
| Max tension steel | Cl. 26.5.1.1 | 4%bD |
| Max shear (section size) | Table 20 | τv,max only depends on fck |
| Stirrup shear | Cl. 40.4 | τv − τc portion carried by stirrups |
| T-beam flange width | Cl. 23.1.2 | bf based on slab presence + span |
| Slab moments | Table 26 | αx/αy interpolated from ly/lx |
| Continuous beam moments | Table 12/13 | wL²/12 sag, wL²/10 hogg |
| Development length | Cl. 26.2.1 | Ld = φσs/(4τbd) |
| Anchorage | Cl. 26.2.3.3 | M1/V + Lo |
| Deflection (l/d) | Cl. 23.2 | Basic ratio modified by Kt |
| Column biaxial | Cl. 39.6 | Interaction formula |
| Wall lateral | Cl. 32 | Cantilever or propped |
| Doubly-reinforced beam | Annex G, Cl. G-1.2 | Mu_lim + fsc·Asc·(d−d') |
| Two-way load on beam | Cl. 24.5 | Triangular (short) / trapezoidal (long) |

---

## Current Project State (Basement Slab Preset)

The default preset is a basement RCC structure:
- **Walls:** External retaining walls ~4.3m high, propped by roof slab
- **Beams:** B1 mark (230×450mm), B2–B4 variants. Primary span beams are B1-series.
- **Slabs:** S3 mark (200mm depth), two-way slabs with earth fill
- **Loads:** ~0.91m earth fill on roof slab → ~18.3 kN/m² soil + 2.0 kN/m² LL
- **B1-3 known issue:** τv,max FAIL (DCR 1.17) due to high tributary load from two adjacent slabs. Accepted as marginal — see "τv,max Failure" note above. All other B1-3 checks now PASS after curtailed bar fix.

---

## Running the App

```bash
cd /Users/kshitij/basement-analysis/rcc-tool
npm run dev      # development server (Vite)
npm run build    # production build
```
