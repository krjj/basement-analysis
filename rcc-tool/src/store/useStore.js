import { create } from 'zustand'
import { defaultBeamSteel, defaultColumnSteel, defaultWallSteel, defaultSlabSteel, BEAM_SCHEDULES, SLAB_SCHEDULES } from '../utils/constants'

let _id = 1
const genId = () => `e${_id++}`

// ── localStorage auto-save helpers ───────────────────────
const LS_KEY = 'rcc-autosave'

const lsRead = () => {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null }
  catch { return null }
}

const lsWrite = (data) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) }
  catch { /* quota exceeded */ }
}

// Build initial element state from a saved/preset data object
const hydrateData = (data) => {
  if (!data) return null
  const allIds = [
    ...(data.columns || []), ...(data.walls || []),
    ...(data.beams   || []), ...(data.slabs || []),
  ].map(e => parseInt(e.id?.replace('e', '') || '0', 10)).filter(n => !isNaN(n))
  if (allIds.length > 0) _id = Math.max(...allIds) + 1
  return data
}

// Attempt to restore from localStorage on first load (avoids the empty-state flash)
const _saved = hydrateData(lsRead())

const HISTORY_LIMIT = 50

// Snapshot just the element arrays
const snapshot = (s) => ({
  columns: s.columns.map(e => ({ ...e, steel: { ...e.steel } })),
  walls:   s.walls.map(e => ({ ...e, steel: { ...e.steel } })),
  beams:   s.beams.map(e => ({ ...e, steel: { ...e.steel } })),
  slabs:   s.slabs.map(e => ({ ...e, steel: { ...e.steel } })),
})

// ── Default loads ─────────────────────────────────────────
const defaultLoads = () => ({
  // ── Slab / roof backfill ──────────────────────────────
  soilDepthMm:     600,      // soil cover on top of slab (mm)
  slabGamma:       18,       // unit weight of backfill on slab (kN/m³)
  liveLoad:        5.0,      // imposed live load (kN/m²)
  // ── Soil / lateral ───────────────────────────────────
  soilGamma:       18,
  soilSaturated:   false,
  gammaW:          9.81,
  waterTableDepth: null,     // mm from surface; null = no water effect
  phi:             30,
  cohesion:        0,
  surcharge:       10,
  loadCase:        'active', // 'active' | 'at-rest' | 'passive'
  // ── Foundation ───────────────────────────────────────
  raftThicknessMm: 300,      // raft / footing depth (mm) — used for wall bar development length
  wallTopPropped:  false,    // true = slab connects at top (propped cantilever), false = free top
  horizBarHookMm:  0,        // L-hook extension on horizontal wall bars into raft (mm); 0 = straight/no hook
})

const useStore = create((set, get) => ({
  // ── Tool ──────────────────────────────────────────────
  activeTool:     'select',
  activeBeamMark: 'B1',
  showDims:   false,
  dimToggles: _saved?.dimToggles ?? { beam: false, wall: true, column: false, slab: false },
  show3D:     false,
  rightTab:   'properties',
  pdfTrigger: 0,
  fitTrigger: 0,
  projectName: 'STRUCTURAL PLAN',

  // ── Global settings ───────────────────────────────────
  wallHeightMm: _saved?.wallHeightMm ?? 4267,

  // ── Units ─────────────────────────────────────────────
  primaryUnit:       _saved?.primaryUnit       ?? 'ft-in',
  secondaryUnit:     _saved?.secondaryUnit     ?? 'mm',
  showSecondaryUnit: _saved?.showSecondaryUnit ?? false,

  // ── Loads ─────────────────────────────────────────────
  loads: _saved?.loads ? { ...defaultLoads(), ..._saved.loads } : defaultLoads(),

  // ── Capacity inputs ───────────────────────────────────
  capacityInputs: _saved?.capacityInputs
    ? { fck: 25, fy: 500, beamTu: {}, beamMuHogg: {}, slabCase: {}, colPu: {}, colMux: {}, colMuy: {}, ..._saved.capacityInputs }
    : { fck: 25, fy: 500, beamTu: {}, beamMuHogg: {}, slabCase: {}, colPu: {}, colMux: {}, colMuy: {} },

  // ── Elements ─────────────────────────────────────────
  columns: [],
  walls:   [],
  beams:   [],
  slabs:   [],

  // ── Preset tracking ───────────────────────────────────
  activePresetName: null,
  activePresetJson: null,

  // ── History (undo) ───────────────────────────────────
  past: [],

  // ── Draw state ────────────────────────────────────────
  drawingState: null,

  // ── Selection ────────────────────────────────────────
  selectedId:   null,
  selectedType: null,

  // ── View ─────────────────────────────────────────────
  scale:  0.06,
  offset: { x: 80, y: 80 },

  // ─────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────
  _push: () => {
    const cur = snapshot(get())
    set(s => ({ past: [...s.past.slice(-HISTORY_LIMIT), cur] }))
  },

  // ── Actions ──────────────────────────────────────────
  setActiveTool:    (t)  => set({ activeTool: t, drawingState: null }),
  setActiveBeamMark:(m)  => set({ activeBeamMark: m }),
  setRightTab:     (t)  => set({ rightTab: t }),
  setScale:        (s)  => set({ scale: s }),
  setOffset:       (o)  => set({ offset: o }),
  fitToView: (canvasWidth, canvasHeight) => {
    const { columns, walls, beams, slabs } = get()
    const pts = []
    columns.forEach(c => { pts.push({ x: c.x - c.width/2, y: c.y - c.depth/2 }); pts.push({ x: c.x + c.width/2, y: c.y + c.depth/2 }) })
    walls.forEach(w => { pts.push(w.start); pts.push(w.end) })
    beams.forEach(b => { if (b.start && b.end) { pts.push(b.start); pts.push(b.end) } })
    slabs.forEach(s => s.points?.forEach(p => pts.push(p)))
    if (pts.length === 0) return
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
    const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
    const pad = 60
    const scaleX = (canvasWidth  - pad * 2) / (maxX - minX || 1)
    const scaleY = (canvasHeight - pad * 2) / (maxY - minY || 1)
    const newScale = Math.min(scaleX, scaleY, 0.5)
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    set({ scale: newScale, offset: { x: canvasWidth / 2 - cx * newScale, y: canvasHeight / 2 - cy * newScale } })
  },
  setDrawingState: (ds) => set({ drawingState: ds }),
  setSelected:     (id, type) => set({ selectedId: id, selectedType: type }),
  toggleDims: () => set(s => {
    const next = !s.showDims
    return { showDims: next, dimToggles: { beam: next, wall: next, column: next, slab: next } }
  }),
  setDimToggle: (type, val) => set(s => ({ dimToggles: { ...s.dimToggles, [type]: val } })),
  toggle3D:        ()   => set(s => ({ show3D: !s.show3D })),
  requestPDF:      ()   => set(s => ({ pdfTrigger: s.pdfTrigger + 1 })),
  requestFit:      ()   => set(s => ({ fitTrigger: s.fitTrigger + 1 })),
  setProjectName:  (n)  => set({ projectName: n }),
  setWallHeight:   (h)  => set({ wallHeightMm: h }),

  // ── Units ─────────────────────────────────────────────
  setUnits: (primary, secondary, showSecondary) =>
    set({ primaryUnit: primary, secondaryUnit: secondary, showSecondaryUnit: showSecondary }),

  // ── Loads ─────────────────────────────────────────────
  setLoads: (patch) => set(s => ({ loads: { ...s.loads, ...patch } })),

  // ── Capacity inputs ───────────────────────────────────
  setCapacityGrades: (fck, fy) =>
    set(s => ({ capacityInputs: { ...s.capacityInputs, fck, fy } })),
  setBeamTu:      (id, Tu) => set(s => ({ capacityInputs: { ...s.capacityInputs, beamTu:     { ...s.capacityInputs.beamTu,     [id]: Tu } } })),
  setBeamMuHogg:  (id, M)  => set(s => ({ capacityInputs: { ...s.capacityInputs, beamMuHogg: { ...s.capacityInputs.beamMuHogg, [id]: M  } } })),
  setSlabCase: (id, n)    => set(s => ({ capacityInputs: { ...s.capacityInputs, slabCase: { ...s.capacityInputs.slabCase, [id]: n  } } })),
  setColLoad:  (id, patch)=> set(s => {
    const ci = s.capacityInputs
    return { capacityInputs: { ...ci,
      colPu:  { ...ci.colPu,  [id]: patch.Pu  ?? ci.colPu[id]  ?? 0 },
      colMux: { ...ci.colMux, [id]: patch.Mux ?? ci.colMux[id] ?? 0 },
      colMuy: { ...ci.colMuy, [id]: patch.Muy ?? ci.colMuy[id] ?? 0 },
    }}
  }),

  undo: () => set(s => {
    if (s.past.length === 0) return s
    const prev = s.past[s.past.length - 1]
    return { ...prev, past: s.past.slice(0, -1), selectedId: null, selectedType: null }
  }),

  // ── Add elements ──────────────────────────────────────
  addColumn: (x, y) => {
    get()._push()
    const col = {
      id: genId(), x, y, width: 230, depth: 230,
      mark: `C${get().columns.length + 1}`,
      steel: defaultColumnSteel(),
    }
    set(s => ({ columns: [...s.columns, col] }))
    return col.id
  },

  addWall: (start, end) => {
    get()._push()
    const dx  = end.x - start.x, dy = end.y - start.y
    const len = Math.round(Math.sqrt(dx * dx + dy * dy))
    const wall = {
      id: genId(), start, end, thickness: 230, length: len,
      steel: defaultWallSteel(),
    }
    set(s => ({ walls: [...s.walls, wall] }))
    return wall.id
  },

  addBeam: (start, end, mark) => {
    mark = mark || get().activeBeamMark || 'B1'
    get()._push()
    const dx  = end.x - start.x, dy = end.y - start.y
    const len = Math.round(Math.sqrt(dx * dx + dy * dy))
    const beamCount = get().beams.length + 1
    const beam = {
      id: genId(), start, end, mark,
      label: `${mark}-${beamCount}`,   // editable custom label shown on plan
      width: BEAM_SCHEDULES[mark]?.width || 230,
      depth: BEAM_SCHEDULES[mark]?.depth || 450,
      length: len,
      elevation: 0,
      steel: defaultBeamSteel(mark),
    }
    set(s => ({ beams: [...s.beams, beam] }))
    return beam.id
  },

  addSlab: (points, mark = 'S3') => {
    get()._push()
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const w  = Math.max(...xs) - Math.min(...xs)
    const h  = Math.max(...ys) - Math.min(...ys)
    const slab = {
      id: genId(), points, mark,
      shortSpan: Math.round(Math.min(w, h)),
      longSpan:  Math.round(Math.max(w, h)),
      elevation: 0,   // top of slab from floor in mm (0 = ground level)
      steel: defaultSlabSteel(mark),
    }
    set(s => ({ slabs: [...s.slabs, slab] }))
    return slab.id
  },

  // ── Update element ────────────────────────────────────
  updateElement: (type, id, patch) => {
    set(s => ({
      [`${type}s`]: s[`${type}s`].map(el => el.id === id ? { ...el, ...patch } : el)
    }))
  },

  updateSteel: (type, id, patch) => {
    set(s => ({
      [`${type}s`]: s[`${type}s`].map(el =>
        el.id === id ? { ...el, steel: { ...el.steel, ...patch } } : el
      )
    }))
  },

  updateSteelNested: (type, id, key, patch) => {
    set(s => ({
      [`${type}s`]: s[`${type}s`].map(el =>
        el.id === id
          ? { ...el, steel: { ...el.steel, [key]: { ...el.steel[key], ...patch } } }
          : el
      )
    }))
  },

  // ── Delete ────────────────────────────────────────────
  deleteSelected: () => {
    const { selectedId, selectedType } = get()
    if (!selectedId) return
    get()._push()
    set(s => ({
      [`${selectedType}s`]: s[`${selectedType}s`].filter(el => el.id !== selectedId),
      selectedId: null, selectedType: null,
    }))
  },

  clearAll: () => {
    get()._push()
    set({ columns: [], walls: [], beams: [], slabs: [], selectedId: null, selectedType: null, drawingState: null })
  },

  goHome: () => {
    get()._push()
    set({
      columns: [], walls: [], beams: [], slabs: [],
      selectedId: null, selectedType: null, drawingState: null,
      activePresetName: null, activePresetJson: null,
    })
    // Clear autosave so refresh shows the start screen
    try { localStorage.removeItem(LS_KEY) } catch {}
  },

  // ── Save project ──────────────────────────────────────
  saveProject: () => {
    const s = get()
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      wallHeightMm:      s.wallHeightMm,
      primaryUnit:       s.primaryUnit,
      secondaryUnit:     s.secondaryUnit,
      showSecondaryUnit: s.showSecondaryUnit,
      loads:             s.loads,
      capacityInputs:    s.capacityInputs,
      columns:           s.columns,
      walls:             s.walls,
      beams:             s.beams,
      slabs:             s.slabs,
    }
    const json     = JSON.stringify(data, null, 2)
    const blob     = new Blob([json], { type: 'application/json' })
    const url      = URL.createObjectURL(blob)
    const dateStr  = new Date().toISOString().slice(0, 10)
    const a        = document.createElement('a')
    a.href         = url
    a.download     = `rcc-project-${dateStr}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  // ── Load project ──────────────────────────────────────
  // presetName: if loading a built-in preset, pass its label so reset can restore it
  loadProject: (jsonString, presetName) => {
    try {
      const data = JSON.parse(jsonString)
      const allIds = [
        ...(data.columns || []), ...(data.walls || []),
        ...(data.beams   || []), ...(data.slabs || []),
      ].map(e => parseInt(e.id?.replace('e', '') || '0', 10)).filter(n => !isNaN(n))
      if (allIds.length > 0) _id = Math.max(...allIds) + 1

      // When presetName is provided → this IS a fresh preset load, store original JSON for reset
      // When presetName is undefined → restoring from autosave; carry saved preset tracking forward
      const isPresetLoad = presetName !== undefined
      set({
        columns:           data.columns           || [],
        walls:             data.walls             || [],
        beams:             data.beams             || [],
        slabs:             data.slabs             || [],
        wallHeightMm:      data.wallHeightMm      ?? 4267,
        primaryUnit:       data.primaryUnit       ?? 'ft-in',
        secondaryUnit:     data.secondaryUnit     ?? 'mm',
        showSecondaryUnit: data.showSecondaryUnit ?? false,
        loads:             { ...defaultLoads(), ...(data.loads || {}) },
        capacityInputs:    { fck: 25, fy: 500, beamTu: {}, beamMuHogg: {}, slabCase: {}, colPu: {}, colMux: {}, colMuy: {}, ...(data.capacityInputs || {}) },
        dimToggles:        { beam: false, wall: true, column: false, slab: false, ...(data.dimToggles || {}) },
        activePresetName:  isPresetLoad ? presetName           : (data.activePresetName ?? null),
        activePresetJson:  isPresetLoad ? jsonString           : (data.activePresetJson  ?? null),
        selectedId:        null,
        selectedType:      null,
        drawingState:      null,
        past:              [],
      })
    } catch (err) {
      console.error('loadProject: failed to parse JSON', err)
      alert('Failed to load project file. Please check the file is a valid RCC project JSON.')
    }
  },

  // ── Reset to original preset state ────────────────────
  resetToPreset: () => {
    const { activePresetJson, activePresetName, loadProject } = get()
    if (activePresetJson && activePresetName) {
      loadProject(activePresetJson, activePresetName)
    }
  },
}))

// ── Persistence helpers ───────────────────────────────────
const persistState = (s) => lsWrite({
  version:           1,
  savedAt:           new Date().toISOString(),
  wallHeightMm:      s.wallHeightMm,
  primaryUnit:       s.primaryUnit,
  secondaryUnit:     s.secondaryUnit,
  showSecondaryUnit: s.showSecondaryUnit,
  loads:             s.loads,
  capacityInputs:    s.capacityInputs,
  dimToggles:        s.dimToggles,
  activePresetName:  s.activePresetName,
  activePresetJson:  s.activePresetJson,
  columns:           s.columns,
  walls:             s.walls,
  beams:             s.beams,
  slabs:             s.slabs,
})

// ── Auto-save to localStorage (debounced 800ms) ───────────
let _saveTimer = null
useStore.subscribe((s) => {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => persistState(s), 800)
})

export default useStore
