export const GRID_SIZE  = 500   // mm
export const MAJOR_GRID = 2500  // mm
export const WALL_HEIGHT_MM = 4267  // 14 ft

export const DEFAULT_SCALE = 0.06

export const COLORS = {
  background: '#0f1117',
  gridMinor:  '#1e2533',
  gridMajor:  '#2a3550',
  wall:       '#d0d0d0',
  column:     '#ffffff',
  slab:       '#4a90d9',
  selected:   '#ff6b35',
  cursor:     '#00ff99',
  text:       '#e0e0e0',
  dimLine:    '#88aacc',
  // Beam mark colours
  B1: '#FFD700',
  B2: '#FF8C00',
  B3: '#00CED1',
  B4: '#FF4444',
  CUSTOM: '#bb99ff',
}

// ── Default steel specs (used when element created) ──────
// Per-end support definition for beams
export const defaultBeamEnd = (type = 'wall') => ({
  type,              // 'wall' | 'column'
  // Wall end
  embedmentDepth: 230,   // bearing length into wall (mm)
  lBend: true,           // L-hook at this end
  lBendLength: 450,      // L-hook vertical length (mm) — typically = beam depth or 450
  // Column end — hook inside column
  colWidth: 230,         // column size in beam direction (used to calc hook)
  straightBar: false,    // when true: bar runs straight through column (no hook); valid if col. width ≥ 40d
  // Confinement note: column end → ld measured from column face, hook = colWidth - 2×cover
})

export const defaultBeamSteel = (mark = 'B1') => {
  const s = BEAM_SCHEDULES[mark] || BEAM_SCHEDULES.B1
  return {
    bottomFull:       { count: s.bottomFull.count,    dia: s.bottomFull.dia },
    bottomCurtail:    { count: s.bottomCurtail.count, dia: s.bottomCurtail.dia },
    topSteel:         { count: s.topSteel.count,      dia: s.topSteel.dia },
    extraTopSupport:  { count: 0, dia: 16 },
    stirrups:         { ...s.stirrups },
    cover:            25,
    startSupport:     defaultBeamEnd('wall'),
    endSupport:       defaultBeamEnd('wall'),
  }
}

export const defaultColumnSteel = () => ({
  vertBars: { count: 8, dia: 16 },
  ties:     { dia: 8, spacing: 150 },
  cover:    40,
})

export const defaultWallSteel = () => ({
  horizBars: { dia: 10, spacing: 150, faces: 2 },  // T10 @ 6"c/c both faces (section drawing)
  vertBars:  { dia: 10, spacing: 150, faces: 2 },  // T10 @ 6"c/c both faces (section drawing)
  cover:     25,                                    // 25mm — Note 3 in drawing
})

export const defaultSlabSteel = (mark = 'S3') => {
  const s = SLAB_SCHEDULES[mark] || SLAB_SCHEDULES.S3
  return {
    depth:      s.depth,
    mainBar:    { ...s.mainBar },
    distBar:    { ...s.distBar },
    topSteel:   { dia: 8, spacing: 200, enabled: false },
    altBentUp:  true,
    sunkDepth:  0,
    cover:      15,
  }
}

// ── Beam schedule from MR. KSHITIJ JAMDADE drawings ─────
export const BEAM_SCHEDULES = {
  B1: {
    label: 'B-1', width: 230, depth: 450,
    bottomFull:    { count: 4, dia: 25 },
    bottomCurtail: { count: 3, dia: 25 },
    topSteel:      { count: 3, dia: 25 },
    stirrups: { dia: 10, supportSpacing: 150, supportNos: 10, midSpacing: 200 },
  },
  B2: {
    label: 'B-2', width: 230, depth: 450,
    bottomFull:    { count: 4, dia: 25 },
    bottomCurtail: { count: 2, dia: 25 },
    topSteel:      { count: 3, dia: 25 },
    stirrups: { dia: 10, supportSpacing: 150, supportNos: 6, midSpacing: 200 },
  },
  B3: {
    label: 'B-3', width: 230, depth: 450,
    bottomFull:    { count: 4, dia: 25 },
    bottomCurtail: { count: 3, dia: 25 },
    topSteel:      { count: 4, dia: 25 },
    stirrups: { dia: 10, supportSpacing: 150, supportNos: 6, midSpacing: 200 },
  },
  B4: {
    label: 'B-4', width: 230, depth: 450,
    bottomFull:    { count: 4, dia: 20 },
    bottomCurtail: { count: 2, dia: 16 },
    topSteel:      { count: 3, dia: 20 },
    stirrups: { dia: 8, supportSpacing: 200, supportNos: null, midSpacing: 200 },
  },
  CUSTOM: {
    label: 'Custom', width: 230, depth: 450,
    bottomFull:    { count: 4, dia: 20 },
    bottomCurtail: { count: 2, dia: 16 },
    topSteel:      { count: 3, dia: 20 },
    stirrups: { dia: 8, supportSpacing: 150, supportNos: 6, midSpacing: 200 },
  },
}

export const SLAB_SCHEDULES = {
  S1: { label: 'S1', depth: 150, mainBar: { dia: 10, spacing: 175 }, distBar: { dia: 10, spacing: 175 }, type: 'two-way',  description: 'Bottom slab' },
  S2: { label: 'S2', depth: 150, mainBar: { dia: 8,  spacing: 100 }, distBar: { dia: 8,  spacing: 200 }, type: 'one-way',  description: 'Septic tank top slab' },
  S3: { label: 'S3', depth: 230, mainBar: { dia: 12, spacing: 150 }, distBar: { dia: 12, spacing: 175 }, type: 'two-way',  description: 'Two-way slab' },
  S4: { label: 'S4', depth: 230, mainBar: { dia: 12, spacing: 150 }, distBar: { dia: 10, spacing: 200 }, type: 'one-way',  description: 'One-way slab' },
  SC: { label: 'SC', depth: 175, mainBar: { dia: 10, spacing: 125 }, distBar: { dia: 10, spacing: 175 }, type: 'two-way',  description: 'Canopy slab' },
}

export const COVER = { beam: 25, slab: 15, column: 40, wall: 25 }

// Standard bar diameters available
export const BAR_DIAS = [6, 8, 10, 12, 16, 20, 25, 32]
