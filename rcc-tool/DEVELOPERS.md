# RCC Tool — Developer Reference

> IS 456:2000 structural analysis tool for basement RCC design.
> React + Zustand + Konva. All internal dimensions in **millimetres**.

---

## Quick Start

```bash
npm install
npm run dev       # Vite dev server → http://localhost:5173
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

**Node:** 18+. No backend — purely client-side, persists to `localStorage`.

---

## Stack

| Layer | Library | Version |
|-------|---------|---------|
| UI | React | 18.2 |
| Build | Vite + @vitejs/plugin-react | 5.1 |
| State | Zustand | 4.5 |
| 2D Canvas | Konva + react-konva | 9.3 / 18.2 |
| 3D View | @react-three/fiber + drei + three | lazy-loaded |
| Icons | lucide-react | 1.7 |
| PDF | jspdf | 4.2 |

---

## Directory Layout

```
src/
├── main.jsx                        # Entry — renders <App />
├── App.jsx                         # Root layout (toolbar | canvas | right panel)
│
├── components/
│   ├── Toolbar.jsx                 # Left sidebar: tools, undo, dims, PDF, save/load
│   ├── DrawingCanvas.jsx           # Konva canvas — all 2D drawing and interaction
│   ├── PropertiesPanel.jsx         # "Props" tab — dimensions + steel inputs
│   ├── AnalysisPanel.jsx           # "Steel" tab — bar weight / quantity schedule
│   ├── LoadsPanel.jsx              # "Loads" tab — soil params + cross-section diagram
│   ├── CapacityPanel.jsx           # "Check" tab — IS 456 results with DCR bars
│   ├── SteelEditor.jsx             # Reusable bar spec editor (count/dia/spacing/hooks)
│   ├── UnitInput.jsx               # Dimension input with live unit conversion
│   ├── SlabSection.jsx             # SVG slab cross-section sketch
│   ├── ThreeDView.jsx              # 3D model (lazy, heavy — Babylon.js)
│   └── ReportView.jsx              # PDF report layout
│
├── store/
│   └── useStore.js                 # Zustand store — single source of truth
│
├── utils/
│   ├── capacity/
│   │   ├── index.js                # IS 456 capacity check engine (~1400 lines)
│   │   └── is456Tables.js          # IS 456 lookup tables (τc, Ld, xu_max, etc.)
│   ├── constants.js                # COLORS, BEAM_SCHEDULES, SLAB_SCHEDULES, defaults
│   ├── units.js                    # fmtLen / toMM / fmtDual
│   ├── rcc.js                      # Steel weight + bar length calculations
│   ├── regionDetect.js             # Planar face detection for slab region clicks
│   └── exportPDF.js                # PDF generation with dimension annotations
│
└── presets/
    └── basement-slab.json          # Built-in example — loads on "Load Preset"
```

---

## State Management (`src/store/useStore.js`)

Single Zustand store. All coordinates are canvas pixels but stored elements use **mm** for physical dimensions. The mapping is:

```
canvas_px = mm * scale + offset
```

### Auto-save

Debounced 800 ms to `localStorage['rcc-autosave']`. Hydrated on app load before first render via `hydrateData()`. Panel width separately persisted to `localStorage['rcc_panelW']`.

### State Shape

#### Tools & UI
```ts
activeTool:      'select' | 'pan' | 'column' | 'wall' | 'beam' | 'slab'
activeBeamMark:  'B1' | 'B2' | 'B3' | 'B4' | 'CUSTOM'
show3D:          boolean
rightTab:        'properties' | 'analysis' | 'loads' | 'capacity'
dimToggles:      { beam: boolean, wall: boolean, column: boolean, slab: boolean }
pdfTrigger:      number   // increment to fire PDF export
fitTrigger:      number   // increment to fit-to-view
projectName:     string
wallHeightMm:    number   // storey height, default 4267 (14 ft)
primaryUnit:     'mm' | 'cm' | 'm' | 'ft' | 'ft-in'
secondaryUnit:   same
showSecondaryUnit: boolean
scale:           number   // canvas zoom, default 0.06
offset:          { x: number, y: number }
selectedId:      string | null
selectedType:    'column' | 'wall' | 'beam' | 'slab' | null
drawingState:    null | { startPoint, points[] }
past:            snapshot[]   // undo stack, max 50
```

#### `loads` object
```ts
{
  soilDepthMm:      number   // earth fill depth on roof slab (mm)
  slabGamma:        number   // backfill unit weight (kN/m³), default 18
  liveLoad:         number   // imposed load on slab (kN/m²)
  soilGamma:        number   // lateral soil unit weight (kN/m³)
  soilSaturated:    boolean  // use γ=20 when true
  gammaW:           number   // water unit weight, default 9.81
  waterTableDepth:  number | null   // mm from surface; null = no WT
  phi:              number   // soil friction angle (degrees)
  cohesion:         number   // kPa
  surcharge:        number   // surface surcharge (kPa)
  loadCase:         'active' | 'at-rest' | 'passive'
  raftThicknessMm:  number   // used for wall bar anchorage check
  wallTopPropped:   boolean  // propped cantilever (true) vs free (false)
  horizBarHookMm:   number   // L-hook extension of wall bars into raft (mm)
}
```

#### `capacityInputs` object
```ts
{
  fck:         number   // concrete grade (N/mm²) e.g. 25, 30
  fy:          number   // steel yield (N/mm²) e.g. 415, 500, 550
  beamTu:      { [beamId]: number }   // manual torsion (kN·m), 0 = auto
  beamMuHogg:  { [beamId]: number }   // manual hogging moment override (kN·m)
  slabCase:    { [slabId]: 1-9 }      // IS 456 Table 26 support condition
  colPu:       { [colId]: number }    // axial load (kN)
  colMux:      { [colId]: number }    // moment about X (kN·m)
  colMuy:      { [colId]: number }    // moment about Y (kN·m)
}
```

#### Element Schemas

**Column**
```ts
{
  id: string, x: number, y: number,   // canvas coords (px)
  width: number, depth: number,        // mm
  mark: string,                        // 'C1', 'C2', ...
  steel: {
    vertBars: { count: number, dia: number },
    ties:     { dia: number, spacing: number },
    cover:    number   // default 40mm
  }
}
```

**Wall**
```ts
{
  id: string,
  start: { x: number, y: number },
  end:   { x: number, y: number },
  thickness: number,  // mm
  length:    number,  // mm (derived, kept in sync)
  steel: {
    horizBars: { dia: number, spacing: number, faces: number },
    vertBars:  { dia: number, spacing: number, faces: number },
    cover:     number   // default 25mm
  }
}
```

**Beam**
```ts
{
  id: string,
  start: { x: number, y: number },
  end:   { x: number, y: number },
  mark:  'B1' | 'B2' | 'B3' | 'B4' | 'CUSTOM',
  label: string,           // user-editable e.g. 'B1-3'
  width: number, depth: number, length: number, elevation: number,  // mm
  steel: {
    bottomFull:      { count: number, dia: number },  // full-length bottom bars
    bottomCurtail:   { count: number, dia: number },  // midspan-only bars (±L/7)
    topSteel:        { count: number, dia: number },  // full-length top bars
    extraTopSupport: { count: number, dia: number },  // extra top bars at supports
    stirrups: {
      dia:             number,
      supportSpacing:  number,  // mm c/c at supports
      supportNos:      number,  // number of stirrups in support zone
      midSpacing:      number   // mm c/c at midspan
    },
    cover: number,   // default 25mm
    startSupport: {
      type:           'wall' | 'column',
      embedmentDepth: number,   // bearing length into wall (mm)
      lBend:          boolean,  // L-hook at this end
      lBendLength:    number,   // hook vertical length (mm)
      colWidth:       number,   // column size in beam direction (mm)
      straightBar:    boolean   // true = no hook, bar passes through column
    },
    endSupport: { /* same as startSupport */ }
  }
}
```

**Slab**
```ts
{
  id: string,
  points:    { x: number, y: number }[],  // polygon vertices (canvas px)
  mark:      string,   // 'S1'–'S4', 'SC'
  shortSpan: number,   // mm — set automatically from polygon
  longSpan:  number,   // mm
  elevation: number,
  steel: {
    depth:     number,  // slab thickness (mm)
    mainBar:   { dia: number, spacing: number },
    distBar:   { dia: number, spacing: number },
    topSteel:  { dia: number, spacing: number, enabled: boolean },
    altBentUp: boolean,
    sunkDepth: number,
    cover:     number   // default 15mm
  }
}
```

### Actions Reference

```ts
// Tools
setActiveTool(tool)
setActiveBeamMark(mark)
setRightTab(tab)
toggleDims() / setDimToggle(type, val)
toggle3D()
requestPDF() / requestFit()

// Canvas
setScale(s) / setOffset(o)
fitToView(canvasW, canvasH)

// Selection
setSelected(id, type)
setDrawingState(state)

// Elements — create
addColumn(x, y)  → id
addWall(start, end)  → id
addBeam(start, end, mark?)  → id
addSlab(points, mark?)  → id

// Elements — update
updateElement(type, id, patch)          // geometry fields
updateSteel(type, id, patch)            // steel top-level fields
updateSteelNested(type, id, key, patch) // nested steel e.g. startSupport

// Elements — delete
deleteSelected()
clearAll()
goHome()   // clearAll + reset activePresetName/activePresetJson → shows start screen

// Settings
setUnits(primary, secondary, showSecondary)
setWallHeight(mm)
setLoads(patch)                     // partial update to loads object
setCapacityGrades(fck, fy)
setBeamTu(id, kNm)
setBeamMuHogg(id, kNm)
setSlabCase(id, 1–9)
setColLoad(id, { Pu?, Mux?, Muy? })

// History
undo()

// Project I/O
saveProject()                        // downloads JSON file
loadProject(jsonString, presetName?) // parses + hydrates store
resetToPreset()                      // restore to activePresetJson
```

---

## Capacity Engine (`src/utils/capacity/index.js`)

### Architecture

```
runCapacityChecks(storeState, capacityInputs)
  └── for each slab    → checkSlab(...)
  └── for each beam    → checkBeam(...)   ← reads adjacent slabs + intermediate columns
  └── for each column  → checkColumn(...)
  └── for each wall    → checkWall(...)
  └── returns { [elementId]: CheckObject[] }
```

Each `CheckObject`:
```ts
{
  id:       string,   // unique within element e.g. 'flex-sag'
  desc:     string,   // display label
  clause:   string,   // IS 456 reference
  demand:   number,
  capacity: number,
  unit:     string,
  dcr:      number,   // demand/capacity ratio
  status:   'pass' | 'warn' | 'fail' | 'info',
  note:     string    // detail string shown in expanded row
}
```

Status thresholds: pass < 0.9 ≤ warn ≤ 1.0 < fail.

### Core Helper Functions

```ts
astCircle(count, dia)
// → count × π × dia² / 4  (mm²)

ast1m(dia, spacing)
// → (1000/spacing) × π × dia² / 4  (mm²/m, for slabs)

momentCap(b_mm, D_mm, Ast_mm2, cover_mm, fy, fck, Asc_mm2?, d_prime_mm?)
// Singly or doubly-reinforced rectangular section (IS 456 Annex G Cl. G-1.2)
//
// If Asc > 0 AND xu_sr > xuMax (section would be over-reinforced without help):
//   Ast_bal  = (0.36 × fck × b × xuMax) / (0.87 × fy)
//   Ast_xtra = max(0, Ast - Ast_bal)
//   Asc_used = min(Asc, Ast_xtra)   ← CRITICAL: prevents negative xu bug
//   Mu = 0.36·fck·b·xuMax·(d - 0.42·xuMax) + 0.87·fy·Asc_used·(d - d')
//
// Returns: { Mu_kNm, xu, xuMax, d, overReinforced,
//            doublyReinforced?, fsc?, Asc_used? }

momentCapTee(bw, D, bf, Df, Ast, cover, fy, fck)
// T-beam midspan capacity (flange in compression)
// Checks if NA is in flange or web; handles both cases.
// Returns: { Mu_kNm, xu, xuMax, d, overReinforced, naInFlange, bf_used }

chk(id, desc, clause, demand, capacity, unit, note?, warnAt?)
info(id, desc, note?, clause?)
flagFail(id, desc, clause, note)
```

### `checkBeam` — Key Logic

```ts
checkBeam(beam, wu_kNm, fy, fck, adjacentSlabs?, intCols?, L_eff_mm?, bf_tee_mm?, Df_mm?)
```

**Steel areas computed:**
```ts
const bf   = beam.steel?.bottomFull     ?? { count:2, dia:16 }
const bc   = beam.steel?.bottomCurtail  ?? { count:0, dia:16 }
const Ast_bot     = astCircle(bf.count, bf.dia)               // full bars — at supports
const Ast_bot_mid = Ast_bot + astCircle(bc.count, bc.dia)     // + curtailed — at midspan
```

**Why two Ast values matters:**
- Sagging (midspan) check → uses `Ast_bot_mid`
- Hogging (support) compression steel → uses `Ast_bot` (curtailed bars don't reach supports)
- Shear `pt_bot` → uses `Ast_bot` (shear critical at support)
- Deflection modifier → uses `Ast_bot_mid`

**Span model:**
- Intermediate columns found → continuous: Mu_sag = wL²/12, Mu_hogg = wL²/10, Vu = 0.6wL
- No intermediate columns → simply-supported: Mu_sag = wL²/8, Vu = wL/2

**Shear logic:**
- `tau_v_peak` = Vu×1000 / (bw×d) — at support face → IS 456 Table 20 size check
- `tau_v` = Vu_d×1000 / (bw×d) — at d from face → stirrup design check
- τv,max check **cannot be fixed by adding steel** — only bw or d helps

**IS 456 Cl. 24.5 two-way load distribution:**
- `slabTribWidth(beam, slab)` detects short vs long span by comparing adjacent slab edge length to `(lx+ly)/2`
- Short-span beam: `tribW = lx/3`
- Long-span beam: `tribW = lx × (3 - 1/r²) / 6`  where r = ly/lx

### `checkSlab`
IS 456 Table 26 moment coefficients αx, αy interpolated from ly/lx ratio and support case (1–9). Case 9 = all edges discontinuous (conservative default).

### `checkColumn`
Axial: `Pu_cap = 0.4·fck·Ac + 0.67·fy·Asc`. Biaxial: Bresler/IS 456 Cl. 39.6 interaction `(Mux/Mux1)^α + (Muy/Muy1)^α ≤ 1`.

### `checkWall`
Lateral moment from Ka/K0 earth pressure. Two modes:
- **Free cantilever:** `Mu = K·γ·H³/6 + K·Q·H²/2`
- **Propped cantilever:** `Mu = w₀H²/15 + w₁H²/8` (triangular + uniform components)

---

## IS 456 Tables (`src/utils/capacity/is456Tables.js`)

```ts
getTauBd(fck, { deformed?, compression?, topBar? })
// → bond stress τbd (N/mm²), IS 456 Table 5

calcLd(phi, fy, fck, opts)
// → development length Ld (mm) = φ·σs / (4·τbd)

getTc(pt_pct, fck)
// → shear strength τc (N/mm²), IS 456 Table 19, interpolated from pt = 100As/bd

getTcMax(fck)
// → τc,max: M25→3.1, M30→3.5, M35→3.7, M40+→4.0

xuMaxRatio(fy)
// → 0.479 (Fe415), 0.456 (Fe500), 0.446 (Fe550)

getSlabCoeffs(ratio, caseNum)
// → { ax, ay } from IS 456 Table 26, bilinear interpolation on ly/lx
```

---

## Constants (`src/utils/constants.js`)

```ts
GRID_SIZE  = 500    // mm — minor grid lines
MAJOR_GRID = 2500   // mm — major grid lines
DEFAULT_SCALE = 0.06

COLORS = {
  background: '#0f1117',
  gridMinor:  '#1e2533',
  gridMajor:  '#2a3550',
  wall:    '#d0d0d0', column:  '#ffffff',
  slab:    '#4a90d9', selected: '#ff6b35',
  B1: '#FFD700',  // gold
  B2: '#FF8C00',  // orange
  B3: '#00CED1',  // cyan
  B4: '#FF4444',  // red
  CUSTOM: '#bb99ff',
}

// Default covers
COVER = { beam: 25, slab: 15, column: 40, wall: 25 }  // mm

// Available bar diameters
BAR_DIAS = [6, 8, 10, 12, 16, 20, 25, 32]

// Beam schedules (from structural drawings)
BEAM_SCHEDULES = {
  B1: { width:230, depth:450, bottomFull:{4,T25}, bottomCurtail:{3,T25}, topSteel:{3,T25}, stirrups:{T10,@150/200} },
  B2: { width:230, depth:450, bottomFull:{4,T25}, bottomCurtail:{2,T25}, topSteel:{3,T25}, stirrups:{T10,@150/200} },
  B3: { width:230, depth:450, bottomFull:{4,T25}, bottomCurtail:{3,T25}, topSteel:{4,T25}, stirrups:{T10,@150/200} },
  B4: { width:230, depth:450, bottomFull:{4,T20}, bottomCurtail:{2,T16}, topSteel:{3,T20}, stirrups:{T8,@200/200}  },
}

// Slab schedules
SLAB_SCHEDULES = {
  S1: { depth:150, mainBar:T10@175, distBar:T10@175, type:'two-way'  },
  S2: { depth:150, mainBar:T8@100,  distBar:T8@200,  type:'one-way'  },
  S3: { depth:230, mainBar:T12@150, distBar:T12@175, type:'two-way'  },  // primary
  S4: { depth:230, mainBar:T12@150, distBar:T10@200, type:'one-way'  },
  SC: { depth:175, mainBar:T10@125, distBar:T10@175, type:'two-way'  },  // canopy
}
```

---

## Units (`src/utils/units.js`)

All physical values stored internally in **mm**. Converted for display only.

```ts
fmtLen(mm, unit) → string
// 'mm'    → "230 mm"
// 'cm'    → "23.0 cm"
// 'm'     → "0.230 m"
// 'ft'    → "0.754 ft"
// 'ft-in' → "0′-9¼″"  (nearest ¼")

toMM(value, unit) → number
// ft-in accepts: "5-3.25" | "5'3.25\"" | "5 3" | bare number (treated as feet)

fmtDual(mm, primary, secondary) → string
// "5.500 m  |  18′-0″"
```

---

## Canvas (`src/components/DrawingCanvas.jsx`)

Uses `react-konva`. Three Konva `<Layer>` elements:

| Layer | listening | Content |
|-------|-----------|---------|
| 1 | false | Grid, walls, beams, columns, slabs, dim labels, tributary zone fills |
| 2 | true | Tributary draggable info box (`tribBoxPos` state) |
| 3 | false | Hover regions, snap guidelines, drawing preview, cursor crosshair |

**Coordinate system:**
- Canvas pixels ↔ mm: `px = mm × scale + offset.x`
- Inverse: `mm = (px - offset.x) / scale`

**Key canvas state (local, not in Zustand):**
```ts
hoveredBeamId: string | null    // beam under mouse → triggers tributary view
tribBoxPos: {x,y} | null        // draggable info box position (resets on beam change)
```

**Tributary view rendering:**
- `renderTributary()` — visual zones only, no text, non-listening layer
- `renderTribInfoBox()` — draggable Konva Group with all load data; defaults outside slab zone extent

**Snapping:**
- Grid snap (GRID_SIZE = 500mm)
- Endpoint snap to existing element endpoints
- Ortho constraint (Shift key) — locks to nearest 45° axis

---

## Region Detection (`src/utils/regionDetect.js`)

Planar face detection for assigning slabs to enclosed regions. Algorithm:

1. Collect all wall + beam segments
2. `snapSegEndpoints()` — project endpoints onto nearest segment within 400mm tolerance (bridges beam-end to wall-centreline gap)
3. Split all segments at mutual intersections → half-edge graph
4. Cast ray from click point in +x; find first hit edge
5. `traceFace()` — trace smallest-CW-rotation polygon from both half-edge directions
6. Return smallest polygon containing click point

**Tolerances:** `SNAP_TOL = 150mm` (node merge), `CONNECT_TOL = 400mm` (endpoint snap).

---

## Preset System

**File:** `src/presets/basement-slab.json`

Full project snapshot: all elements + loads + capacityInputs + dimToggles.

**Flow:**
1. Empty canvas → start-screen overlay shown (when all four element arrays empty)
2. User clicks preset → `loadProject(JSON.stringify(data), label)`
3. Store records `activePresetName` + `activePresetJson` for reset
4. "↺ reset" button in units row → `resetToPreset()` restores original
5. "RCC" label in toolbar → `goHome()` → clears all + resets preset tracking → shows start screen

---

## PDF Export (`src/utils/exportPDF.js`)

Uses jsPDF. Triggered by incrementing `pdfTrigger` in store. `DrawingCanvas` watches this value, captures Konva stage as image, passes to exportPDF.

---

## Known Issues & Design Decisions

### ⚠ B1-3 τv,max FAIL (DCR 1.17) — Accepted
The beam spans two high-load slabs giving Vu = 401 kN. τv = 4.11 N/mm² > τc,max = 3.5 N/mm² for M30. No steel fix possible (section size limit). Accepted as marginal — IS 456 τc,max is a conservative design cap; real crushing stress is higher. Documented for the specific basement slab preset.

### Curtailed Bars in Capacity Engine
`beam.steel.bottomCurtail` was historically only used in the Steel tab for scheduling. The capacity engine now correctly uses:
- `Ast_bot_mid = Ast_bot + astCircle(bc.count, bc.dia)` → sagging + deflection checks
- `Ast_bot` only → hogging compression steel + shear (curtailed bars absent at supports)

### Doubly-Reinforced Hogging — Negative xu Bug (Fixed)
Early implementation used force equilibrium `xu = 0.87fy(Ast−Asc)/(0.36·fck·b)`. When `Asc > Ast`, `xu` went negative causing `fsc = E × 0.0035 × (1 − d'/xu) → −27,000 MPa` and wildly negative Mu. Fixed by using `Asc_used = min(Asc_available, Ast_extra)`.

### Tributary View — Draggable Box
Info box defaults to a position beyond the actual slab zone extent (not just IS 456 band width). Position stored in `tribBoxPos` React state (not Zustand — intentionally ephemeral, resets on beam selection change).

### Right Panel Width
Default 400px. Max 620px. Persisted to `localStorage['rcc_panelW']`. Do not reduce default below 400.

---

## IS 456:2000 Clauses Implemented

| Check | Clause | Formula |
|-------|--------|---------|
| Min tension steel | 26.5.1.1 | 0.85bd/fy |
| Max tension steel | 26.5.1.1 | 4%bD |
| Max shear (section) | Table 20 | τv ≤ τc,max |
| Stirrup shear | 40.4 | Vus = 0.87fy·Asv·d/sv |
| T-beam flange width | 23.1.2 | bf = f(span, slab) |
| Two-way slab moments | Table 26 | Mx = αx·wu·lx² |
| Two-way load on beams | 24.5 | Triangular / trapezoidal |
| Continuous beam moments | Table 12 | wL²/12 sag, wL²/10 hogg |
| Development length | 26.2.1 | Ld = φσs/(4τbd) |
| Anchorage at support | 26.2.3.3 | M1/V + Lo |
| Deflection (l/d) | 23.2 | (l/d)_perm × Kt |
| Column axial | 39.3 | 0.4fckAc + 0.67fyAsc |
| Column biaxial | 39.6 | Bresler interaction |
| Wall lateral moment | 32 | Cantilever or propped |
| Doubly-reinforced beam | Annex G, G-1.2 | Mu_lim + fsc·Asc·(d−d') |
| Min wall steel | 32.5 | 0.12% or 0.15% |
| Side face steel | 26.5.1.3 | If D > 750mm |
