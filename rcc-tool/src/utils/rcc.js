import { BEAM_SCHEDULES, SLAB_SCHEDULES, COVER } from './constants'

// d²/162  kg/m  (d in mm)
export const wtPerMeter = (dia) => (dia * dia) / 162
const ld = (dia) => 40 * dia  // development length

// ── Anchorage per end ─────────────────────────────────────
// Returns extra bar length added at one end based on support type
// Wall:   embedmentDepth (bearing) + lBend length (if enabled)
// Column: hook inside column = colWidth - 2×cover  (no separate embedment)
function anchorageAtEnd(sup, dia, cv) {
  if (!sup) return ld(dia)           // fallback: full dev length
  if (sup.type === 'column') {
    // Bar extends ld from column face (into span handled by bar length),
    // plus hook inside column = colWidth - 2×cover
    const hook = (sup.colWidth || 230) - 2 * cv
    return Math.max(ld(dia), hook)
  }
  // Wall: development length beyond wall face + optional L-bend
  const lBendAdd = sup.lBend ? (sup.lBendLength || 450) : 0
  return (sup.embedmentDepth || 230) + lBendAdd
}

// ── Beam steel ────────────────────────────────────────────
export function calcBeamSteel(lengthMm, steel) {
  const L  = lengthMm
  const cv = steel.cover ?? COVER.beam
  const ss = steel.startSupport
  const es = steel.endSupport
  const rows = []

  // Anchorage extension at each end
  const ancStart = anchorageAtEnd(ss, steel.bottomFull.dia, cv)
  const ancEnd   = anchorageAtEnd(es, steel.bottomFull.dia, cv)

  // 1. Bottom full bars — length = clear span + anchorage each end
  const fullLen = L + ancStart + ancEnd
  rows.push({
    desc:     `Bottom full  (${steel.bottomFull.count}–${steel.bottomFull.dia}φ)`,
    nos:      steel.bottomFull.count,
    dia:      steel.bottomFull.dia,
    lenEach:  Math.round(fullLen),
    totalLen: Math.round(steel.bottomFull.count * fullLen),
    note:     `Anchorage: ${ss?.type||'wall'} end +${Math.round(ancStart)}mm | ${es?.type||'wall'} end +${Math.round(ancEnd)}mm`,
  })

  // 2. Curtail bars @L/7 each end (additional bottom near support)
  const curtailLen = L / 7 + Math.max(ancStart, ancEnd) / 2
  const cNos       = steel.bottomCurtail.count * 2
  rows.push({
    desc:     `Bottom curtail @L/7  (${steel.bottomCurtail.count}–${steel.bottomCurtail.dia}φ × 2 ends)`,
    nos:      cNos, dia: steel.bottomCurtail.dia,
    lenEach:  Math.round(curtailLen),
    totalLen: Math.round(cNos * curtailLen),
  })

  // 3. Top bars — anchorage same rule but for top bars (hogging zone)
  const ancStartTop = anchorageAtEnd(ss, steel.topSteel.dia, cv)
  const ancEndTop   = anchorageAtEnd(es, steel.topSteel.dia, cv)
  const topLen = L + ancStartTop + ancEndTop
  rows.push({
    desc:     `Top bars  (${steel.topSteel.count}–${steel.topSteel.dia}φ)`,
    nos:      steel.topSteel.count, dia: steel.topSteel.dia,
    lenEach:  Math.round(topLen),
    totalLen: Math.round(steel.topSteel.count * topLen),
  })

  // 4. Extra top at supports (if any)
  if (steel.extraTopSupport?.count > 0) {
    const exLen  = L / 4 + ld(steel.extraTopSupport.dia)
    const exNos  = steel.extraTopSupport.count * 2
    rows.push({
      desc:     `Extra top @support  (${steel.extraTopSupport.count}–${steel.extraTopSupport.dia}φ × 2 ends)`,
      nos:      exNos, dia: steel.extraTopSupport.dia,
      lenEach:  Math.round(exLen),
      totalLen: Math.round(exNos * exLen),
    })
  }

  // 5. Stirrups
  const sd  = steel.stirrups.dia
  const bw  = (steel.width || 230) - 2 * cv
  const dw  = (steel.depth || 450) - 2 * cv
  const oneStir = 2 * (bw + dw) + 24 * sd

  let nStir
  if (steel.stirrups.supportNos) {
    const supZ = steel.stirrups.supportNos * steel.stirrups.supportSpacing
    const mid  = Math.max(0, L - 2 * cv - 2 * supZ)
    nStir = 2 * steel.stirrups.supportNos + Math.ceil(mid / steel.stirrups.midSpacing) + 1
  } else {
    nStir = Math.ceil((L - 2 * cv) / steel.stirrups.midSpacing) + 1
  }

  rows.push({
    desc:     `Stirrups  (${sd}φ @${steel.stirrups.supportSpacing}/${steel.stirrups.midSpacing})`,
    nos:      nStir, dia: sd,
    lenEach:  Math.round(oneStir),
    totalLen: Math.round(nStir * oneStir),
  })

  rows.forEach(r => {
    r.wt = parseFloat(((r.totalLen / 1000) * wtPerMeter(r.dia)).toFixed(2))
  })

  const totalWt = parseFloat(rows.reduce((s, r) => s + r.wt, 0).toFixed(2))
  return { rows, totalWt }
}

// ── Slab steel ────────────────────────────────────────────
export function calcSlabSteel(shortMm, longMm, steel) {
  const rows = []

  // Main bars along short span
  const mainLen  = shortMm + 2 * ld(steel.mainBar.dia)
  const mainNos  = Math.ceil(longMm / steel.mainBar.spacing) + 1
  const bentExtra = steel.altBentUp ? Math.floor(mainNos / 2) * (steel.depth * 2 * 0.414) : 0
  rows.push({
    desc:     `Main bars  (${steel.mainBar.dia}φ @${steel.mainBar.spacing})${steel.altBentUp ? ' [alt bent up]' : ''}`,
    nos:      mainNos, dia: steel.mainBar.dia,
    lenEach:  Math.round(mainLen),
    totalLen: Math.round(mainNos * mainLen + bentExtra),
  })

  // Distribution bars
  const distLen = longMm + 2 * ld(steel.distBar.dia)
  const distNos = Math.ceil(shortMm / steel.distBar.spacing) + 1
  rows.push({
    desc:     `Dist. bars  (${steel.distBar.dia}φ @${steel.distBar.spacing})`,
    nos:      distNos, dia: steel.distBar.dia,
    lenEach:  Math.round(distLen),
    totalLen: Math.round(distNos * distLen),
  })

  // Top steel (if enabled)
  if (steel.topSteel?.enabled) {
    const topLen = shortMm + 2 * ld(steel.topSteel.dia)
    const topNos = Math.ceil(longMm  / steel.topSteel.spacing) + 1
    rows.push({
      desc:     `Top steel  (${steel.topSteel.dia}φ @${steel.topSteel.spacing})`,
      nos:      topNos, dia: steel.topSteel.dia,
      lenEach:  Math.round(topLen),
      totalLen: Math.round(topNos * topLen),
    })
  }

  rows.forEach(r => {
    r.wt = parseFloat(((r.totalLen / 1000) * wtPerMeter(r.dia)).toFixed(2))
  })

  const totalWt = parseFloat(rows.reduce((s, r) => s + r.wt, 0).toFixed(2))
  return { rows, totalWt }
}

// ── Column steel ──────────────────────────────────────────
export function calcColumnSteel(heightMm, width, depth, steel) {
  const cv = steel.cover ?? COVER.column
  const rows = []

  // Vertical bars — run full height + development into footing + hook at top
  const barLen = heightMm + 40 * steel.vertBars.dia + 300 // lap + hook
  rows.push({
    desc:     `Vert. bars  (${steel.vertBars.count}–${steel.vertBars.dia}φ)`,
    nos:      steel.vertBars.count, dia: steel.vertBars.dia,
    lenEach:  Math.round(barLen),
    totalLen: Math.round(steel.vertBars.count * barLen),
  })

  // Ties
  const tiePerim = 2 * ((width - 2*cv) + (depth - 2*cv)) + 24 * steel.ties.dia
  const nTies    = Math.ceil(heightMm / steel.ties.spacing) + 1
  rows.push({
    desc:     `Ties  (${steel.ties.dia}φ @${steel.ties.spacing})`,
    nos:      nTies, dia: steel.ties.dia,
    lenEach:  Math.round(tiePerim),
    totalLen: Math.round(nTies * tiePerim),
  })

  rows.forEach(r => { r.wt = parseFloat(((r.totalLen/1000)*wtPerMeter(r.dia)).toFixed(2)) })
  const totalWt = parseFloat(rows.reduce((s, r) => s + r.wt, 0).toFixed(2))
  return { rows, totalWt }
}

// ── Wall steel ────────────────────────────────────────────
export function calcWallSteel(lengthMm, heightMm, thicknessMm, steel) {
  const cv = steel.cover ?? COVER.wall
  const rows = []
  const faces = steel.horizBars.faces || 2

  // Horizontal bars
  const hCount = Math.ceil(heightMm / steel.horizBars.spacing) + 1
  const hLen   = lengthMm + 2 * 40 * steel.horizBars.dia
  rows.push({
    desc:     `Horiz. bars  (${steel.horizBars.dia}φ @${steel.horizBars.spacing}, ${faces} faces)`,
    nos:      hCount * faces, dia: steel.horizBars.dia,
    lenEach:  Math.round(hLen),
    totalLen: Math.round(hCount * faces * hLen),
  })

  // Vertical bars
  const vCount = Math.ceil(lengthMm / steel.vertBars.spacing) + 1
  const vLen   = heightMm + 40 * steel.vertBars.dia
  rows.push({
    desc:     `Vert. bars  (${steel.vertBars.dia}φ @${steel.vertBars.spacing}, ${faces} faces)`,
    nos:      vCount * faces, dia: steel.vertBars.dia,
    lenEach:  Math.round(vLen),
    totalLen: Math.round(vCount * faces * vLen),
  })

  rows.forEach(r => { r.wt = parseFloat(((r.totalLen/1000)*wtPerMeter(r.dia)).toFixed(2)) })
  const totalWt = parseFloat(rows.reduce((s, r) => s + r.wt, 0).toFixed(2))
  return { rows, totalWt }
}

// ── Aggregate by diameter ─────────────────────────────────
export function aggregateByDia(results) {
  const map = {}
  results.forEach(res => {
    res.rows.forEach(r => {
      if (!map[r.dia]) map[r.dia] = { dia: r.dia, totalLen: 0, wt: 0 }
      map[r.dia].totalLen += r.totalLen
      map[r.dia].wt       += r.wt
    })
  })
  return Object.values(map)
    .sort((a, b) => a.dia - b.dia)
    .map(d => ({ ...d, totalLen: Math.round(d.totalLen), wt: parseFloat(d.wt.toFixed(2)) }))
}
