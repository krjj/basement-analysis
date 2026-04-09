/**
 * IS 456:2000 — Comprehensive RCC Capacity Check Engine
 *
 * Outputs an array of check objects per element:
 *   { id, desc, clause, demand, capacity, unit, dcr, status, note }
 *   status: 'pass' | 'warn' | 'fail' | 'info'
 */

import { calcLd, getTc, getTcMax, xuMaxRatio, getSlabCoeffs, SLAB_CASES } from './is456Tables'


// ── Steel area helpers ─────────────────────────────────────────
const astCircle = (count, dia) => count * Math.PI * dia * dia / 4
const ast1m     = (dia, spacing) => (1000 / spacing) * Math.PI * dia * dia / 4

// ── Moment capacity (IS 456 Cl. 38.1) ─────────────────────────
// Returns { Mu_kNm, xu, xuMax, d, overReinforced }
// Asc_mm2: optional compression steel (e.g. bottom bars during hogging).
// When section is over-reinforced (xu_sr > xu_max), uses doubly-reinforced beam theory
// (IS 456 Annex G, Cl. G-1.2):
//   Mu = Mu_lim + Asc_used × fsc × (d − d')
// where Asc_used = min(Asc_available, Ast_extra) and Ast_extra = Ast - Ast_balanced.
// fsc assumed = 0.87fy (compression steel yields when d'/xu_max is small, typically ≤ 0.43).
function momentCap(b_mm, D_mm, Ast_mm2, cover_mm, fy, fck, Asc_mm2 = 0, d_prime_mm = null) {
  const d     = D_mm - cover_mm
  const xuMax = xuMaxRatio(fy) * d
  const d_    = d_prime_mm ?? cover_mm  // distance of compression steel from compression face

  const xu_sr = (0.87 * fy * Ast_mm2) / (0.36 * fck * b_mm)

  if (Asc_mm2 > 0 && xu_sr > xuMax * 1.001) {
    // Section is over-reinforced when treated as singly-reinforced.
    // Compression steel (Asc) pairs with the excess tension steel to add capacity beyond Mu_lim.
    // Ast_bal = tension steel balanced at xu_max (singly-reinforced limit).
    // Ast_extra = excess tension steel that needs a compression-steel pair.
    // Only use as much Asc as needed — avoids xu going negative if Asc > Ast.
    const fsc     = 0.87 * fy   // assume compression steel yields (d'/xu_max typically < 0.43)
    const Ast_bal = (0.36 * fck * b_mm * xuMax) / (0.87 * fy)
    const Ast_extra = Math.max(0, Ast_mm2 - Ast_bal)
    const Asc_used  = Math.min(Asc_mm2, Ast_extra)
    const Mu_lim    = 0.36 * fck * b_mm * xuMax * (d - 0.42 * xuMax)
    const Mu_asc    = fsc * Asc_used * (d - d_)
    const Mu        = Mu_lim + Mu_asc
    const overReinforced = Asc_used < Ast_extra  // still over-reinforced if Asc insufficient
    return { Mu_kNm: Mu / 1e6, xu: xuMax, xuMax, d, overReinforced, doublyReinforced: true, fsc, Asc_used }
  }

  const xu    = xu_sr
  const overReinforced = xu > xuMax * 1.001
  // IS 456 Cl. G-1.1: limit at xu_max when over-reinforced
  const Mu = overReinforced
    ? 0.36 * fck * b_mm * xuMax * (d - 0.42 * xuMax)
    : 0.87 * fy * Ast_mm2 * (d - 0.42 * xu)
  return { Mu_kNm: Mu / 1e6, xu, xuMax, d, overReinforced }
}

// ── T-beam moment capacity for sagging (IS 456 Annex G, Cl. G-2) ──
// Compression zone is in the slab flange — applies at MIDSPAN only.
// At supports (hogging), flange is in tension → use plain momentCap(bw,...) instead.
// Returns { Mu_kNm, xu, xuMax, d, overReinforced, naInFlange, bf_used }
function momentCapTee(bw, D, bf, Df, Ast, cover, fy, fck) {
  const d     = D - cover
  const xuMax = xuMaxRatio(fy) * d

  // Trial xu assuming NA in flange (rectangular block of width bf)
  const xu_f = (0.87 * fy * Ast) / (0.36 * fck * bf)

  if (xu_f <= Df) {
    // NA in flange — IS 456 Cl. G-1 (rectangular equivalent with b = bf)
    const overReinforced = xu_f > xuMax * 1.001
    const Mu = overReinforced
      ? 0.36 * fck * bf * xuMax * (d - 0.42 * xuMax)
      : 0.87 * fy * Ast * (d - 0.42 * xu_f)
    return { Mu_kNm: Mu / 1e6, xu: xu_f, xuMax, d, overReinforced, naInFlange: true, bf_used: bf }
  }

  // NA in web — IS 456 Annex G, Cl. G-2.2
  // Compression = web block + flange overhangs (0.45fck for flanges per IS 456)
  // 0.36·fck·bw·xu + 0.45·fck·(bf-bw)·Df = 0.87·fy·Ast
  const xu_w = (0.87 * fy * Ast - 0.45 * fck * (bf - bw) * Df) / (0.36 * fck * bw)
  const overReinforced = xu_w > xuMax * 1.001
  const xu_use = overReinforced ? xuMax : xu_w
  const Mu = 0.36 * fck * bw * xu_use * (d - 0.42 * xu_use)
           + 0.45 * fck * (bf - bw) * Df * (d - Df / 2)
  return { Mu_kNm: Mu / 1e6, xu: xu_use, xuMax, d, overReinforced, naInFlange: false, bf_used: bf }
}

// ── Standard check builder ─────────────────────────────────────
function chk(id, desc, clause, demand, capacity, unit, note = '', warnAt = 0.9) {
  const d = typeof demand   === 'number' ? demand   : 0
  const c = typeof capacity === 'number' ? capacity : 0
  const dcr = c > 0 ? d / c : (d === 0 ? 0 : Infinity)
  const status = dcr > 1.0 ? 'fail' : dcr >= warnAt ? 'warn' : 'pass'
  return { id, desc, clause, demand: d, capacity: c, unit, dcr, status, note }
}
function info(id, desc, note = '', clause = '') {
  return { id, desc, clause, demand: null, capacity: null, unit: '', dcr: null, status: 'info', note }
}
function flagFail(id, desc, clause, note) {
  return { id, desc, clause, demand: 1, capacity: 0, unit: '', dcr: Infinity, status: 'fail', note }
}

// ─────────────────────────────────────────────────────────────
// SLAB CHECKS  (IS 456 Cl. 23, 24, 26, Table 19, 26)
// ─────────────────────────────────────────────────────────────
export function checkSlab(slab, wu_factored_kNm2, fy, fck, slabCase = 9) {
  const checks = []
  const st  = slab.steel ?? {}
  const D   = st.depth ?? 230           // mm
  const cv  = st.cover ?? 20            // mm
  const d   = D - cv                    // effective depth mm

  const lx_mm = slab.shortSpan ?? 3000
  const ly_mm = slab.longSpan  ?? 4000
  const lx    = lx_mm / 1000            // m
  const ly    = ly_mm / 1000            // m
  const ratio = ly / lx

  const mainBar = st.mainBar ?? { dia: 10, spacing: 150 }
  const distBar = st.distBar ?? { dia: 8,  spacing: 200 }
  const topBar  = st.topSteel ?? { enabled: false }

  const Ast_x = ast1m(mainBar.dia, mainBar.spacing)   // mm²/m (short span)
  const Ast_y = ast1m(distBar.dia, distBar.spacing)   // mm²/m (long span)

  const wu = wu_factored_kNm2  // already factored by caller

  // ── Span type ──────────────────────────────────────────
  const isTwoWay = ratio <= 2.0
  checks.push(info('span',
    `${isTwoWay ? 'Two-way' : 'One-way'} slab — ly/lx = ${ratio.toFixed(2)}`,
    isTwoWay
      ? `Using IS 456 Table 26 Case ${slabCase}: ${SLAB_CASES[slabCase]?.label ?? ''}`
      : 'One-way: Mu = wu × lx² / 8 (simply supported)',
    'IS 456 Cl. 24.1'))

  // ── Min reinforcement (IS 456 Cl. 26.5.2.1) ───────────
  const minPct  = fy >= 415 ? 0.12 : 0.15
  const Ast_min = minPct / 100 * 1000 * D
  checks.push(chk('ast-min-main', 'Min. steel — main bars', 'IS 456 Cl. 26.5.2.1',
    Ast_min, Ast_x, 'mm²/m',
    `${minPct}% of bD = ${Ast_min.toFixed(0)} mm²/m; provided ${Ast_x.toFixed(0)} mm²/m`))
  checks.push(chk('ast-min-dist', 'Min. steel — dist. bars', 'IS 456 Cl. 26.5.2.1',
    Ast_min, Ast_y, 'mm²/m',
    `${minPct}% of bD = ${Ast_min.toFixed(0)} mm²/m; provided ${Ast_y.toFixed(0)} mm²/m`))

  // ── Max bar spacing (IS 456 Cl. 26.3.3b) ──────────────
  const maxSp = Math.min(3 * D, 300)
  checks.push(chk('spacing-main', 'Max. main bar spacing', 'IS 456 Cl. 26.3.3(b)',
    mainBar.spacing, maxSp, 'mm',
    `min(3D=${3*D}, 300) = ${maxSp} mm`))
  checks.push(chk('spacing-dist', 'Max. dist. bar spacing', 'IS 456 Cl. 26.3.3(b)',
    distBar.spacing, maxSp, 'mm'))

  // ── Moment demand ──────────────────────────────────────
  let Mu_x = 0, Mu_y = 0

  if (!isTwoWay) {
    Mu_x = wu * lx * lx / 8   // simply supported kN·m/m
    checks.push(info('moment', `Mu = wu×lx²/8 = ${wu.toFixed(2)}×${lx.toFixed(2)}² / 8 = ${Mu_x.toFixed(2)} kN·m/m`, '', 'IS 456 Cl. 24.3'))
  } else {
    const { ax, ay } = getSlabCoeffs(ratio, slabCase)
    Mu_x = ax * wu * lx * lx
    Mu_y = ay * wu * lx * lx
    checks.push(info('moment',
      `αx=${ax.toFixed(4)}, αy=${ay.toFixed(4)} (Case ${slabCase}, ly/lx=${ratio.toFixed(2)})`,
      `Mux=${Mu_x.toFixed(2)} kN·m/m, Muy=${Mu_y.toFixed(2)} kN·m/m`,
      'IS 456 Table 26'))
  }

  // ── Flexural capacity — short span ─────────────────────
  const capX = momentCap(1000, D, Ast_x, cv, fy, fck)
  checks.push(chk('flex-x', 'Flexure — short span', 'IS 456 Cl. 38.1',
    Mu_x, capX.Mu_kNm, 'kN·m/m',
    `Ast=${Ast_x.toFixed(0)}mm²/m, d=${d}mm, xu=${capX.xu.toFixed(1)}mm` +
    (capX.overReinforced ? ' ⚠ Over-reinforced — increase depth' : '')))
  if (capX.overReinforced)
    checks.push(flagFail('over-x', 'Short span: over-reinforced (xu > xu_max)', 'IS 456 Cl. 38.1',
      `xu=${capX.xu.toFixed(0)}mm > xu_max=${capX.xuMax.toFixed(0)}mm. Increase slab depth.`))

  // ── Flexural capacity — long span (two-way only) ───────
  if (isTwoWay) {
    const capY = momentCap(1000, D, Ast_y, cv, fy, fck)
    checks.push(chk('flex-y', 'Flexure — long span', 'IS 456 Cl. 38.1',
      Mu_y, capY.Mu_kNm, 'kN·m/m',
      `Ast=${Ast_y.toFixed(0)}mm²/m (dist. bars)`))
    if (capY.overReinforced)
      checks.push(flagFail('over-y', 'Long span: over-reinforced', 'IS 456 Cl. 38.1',
        `xu=${capY.xu.toFixed(0)}mm > xu_max=${capY.xuMax.toFixed(0)}mm`))
  }

  // ── Top steel at supports (two-way continuous) ─────────
  if (topBar.enabled) {
    const Ast_top = ast1m(topBar.dia, topBar.spacing)
    // Hogging at continuous support ≈ 4/3 × midspan (IS 456 SP 24 guidance)
    const Mu_hogg = Mu_x * 4 / 3
    const capTop  = momentCap(1000, D, Ast_top, cv, fy, fck)
    checks.push(chk('flex-top', 'Flexure — top steel (hogging at support)', 'IS 456 Cl. 38.1',
      Mu_hogg, capTop.Mu_kNm, 'kN·m/m',
      `Hogging ≈ 4/3 × midspan; Ast_top=${Ast_top.toFixed(0)}mm²/m`))
  }

  // ── Shear (IS 456 Cl. 40) — no stirrups in slab ───────
  // For two-way slabs, load distributes in both directions.
  // Short-span load fraction from elastic plate theory: wx = 1 / (1 + (lx/ly)^4)
  // (Timoshenko & Woinowsky-Krieger; referenced in SP 24)
  const shearFraction = isTwoWay ? 1 / (1 + Math.pow(lx / ly, 4)) : 1.0
  const Vu   = wu * lx / 2 * shearFraction          // kN/m at face (short-span portion)
  const Vu_d = Math.max(0, Vu - wu * d / 1000)     // at d from support
  const tau_v = (Vu_d * 1000) / (1000 * d)          // N/mm²
  const pt_x  = (100 * Ast_x) / (1000 * d)
  const tau_c = getTc(pt_x, fck)
  const shearNote = isTwoWay
    ? `Two-way slab: wx=${shearFraction.toFixed(2)} (load fraction), Vu_d=${Vu_d.toFixed(1)}kN/m, τv=${tau_v.toFixed(3)}, τc=${tau_c.toFixed(3)} (pt=${pt_x.toFixed(2)}%)`
    : `Vu_d=${Vu_d.toFixed(1)}kN/m, τv=${tau_v.toFixed(3)}, τc=${tau_c.toFixed(3)} (pt=${pt_x.toFixed(2)}%)`
  checks.push(chk('shear', 'Shear stress (no stirrups — slab)', 'IS 456 Cl. 40.2',
    tau_v, tau_c, 'N/mm²', shearNote))

  // ── Deflection l/d (IS 456 Cl. 23.2) ─────────────────
  // Basic l/d: 20 for SS, 26 for continuous, 7 for cantilever
  // Modification factor Kt (Fig. 4): depends on fs and pt
  const basic_ld = 20   // simply supported (conservative)
  const Ast_req  = Mu_x > 0
    ? (Mu_x * 1e6) / (0.87 * fy * (d - 0.42 * Math.min(capX.xu, capX.xuMax)))
    : Ast_x
  const fs = 0.58 * fy * Math.min(Ast_req / Ast_x, 1.0)
  // IS 456 Fig. 4 — simplified regression
  const Kt = Math.min(2.0, Math.max(0.4,
    (26 + (14000 - 29 * fs) / (16 * Math.sqrt(Math.max(fs, 1)) + 850)) / 26))
  const lByD_allow  = basic_ld * Kt
  const lByD_actual = lx_mm / d
  checks.push(chk('deflect', 'Deflection — l/d ratio', 'IS 456 Cl. 23.2',
    lByD_actual, lByD_allow, '',
    `Actual ${lByD_actual.toFixed(1)} vs permitted ${lByD_allow.toFixed(1)} (basic ${basic_ld} × Kt=${Kt.toFixed(2)}, fs=${fs.toFixed(0)}N/mm²)`))

  // ── Development length (IS 456 Cl. 26.2.3) ────────────
  const Ld_main   = calcLd(mainBar.dia, fy, fck)
  // Straight bar at support — available length ≈ wall thickness/2 + edge
  // Conservative: 0.5 × wall_thickness ~115 + 50 cover
  const L_avail   = 165  // mm (conservative — user should verify actual support width)
  const Ld_clause = Vu_d > 0 ? (capX.Mu_kNm * 1e6 / (Vu_d * 1000) + Math.max(d, 12 * mainBar.dia)) : L_avail
  checks.push(chk('dev-len', 'Development length at support (Cl. 26.2.3.3)', 'IS 456 Cl. 26.2.3.3',
    Ld_main, Ld_clause, 'mm',
    `Ld=${Ld_main}mm for φ${mainBar.dia}; M1/V+Lo=${Ld_clause.toFixed(0)}mm (verify actual support bearing length)`))

  return checks
}

// ─────────────────────────────────────────────────────────────
// BEAM CHECKS  (IS 456 Cl. 22, 26, 40, 41)
// ─────────────────────────────────────────────────────────────
export function checkBeam(beam, wu_kNm_fromSlab, fy, fck, adjacentSlabs = [], intCols = [], L_eff_mm = null, bf_tee_mm = null, Df_mm = null) {
  const checks = []
  const bw    = beam.width  ?? 230
  const D     = beam.depth  ?? 450
  const L_mm  = L_eff_mm ?? beam.length ?? 3000   // IS 456 effective span if provided
  const L     = L_mm / 1000
  const cv    = beam.steel?.cover ?? 40
  const d     = D - cv

  const bf   = beam.steel?.bottomFull       ?? { count: 2, dia: 16 }
  const bc   = beam.steel?.bottomCurtail    ?? { count: 0, dia: 16 }
  const ts   = beam.steel?.topSteel         ?? { count: 2, dia: 12 }
  const ext  = beam.steel?.extraTopSupport  ?? { count: 0, dia: 12 }
  const stir = beam.steel?.stirrups         ?? { dia: 8, supportSpacing: 100, midSpacing: 200, supportNos: 6 }
  const ss   = beam.steel?.startSupport
  const es   = beam.steel?.endSupport

  const Ast_bot     = astCircle(bf.count, bf.dia)                             // full bars only (present at supports)
  const Ast_bot_mid = Ast_bot + astCircle(bc.count ?? 0, bc.dia ?? 16)       // + curtailed bars at midspan
  const Ast_top  = astCircle(ts.count, ts.dia) + astCircle(ext.count ?? 0, ext.dia ?? 12)
  const Asv      = astCircle(2, stir.dia)   // 2-legged stirrup
  const sv_sup   = stir.supportSpacing ?? 150
  const sv_mid   = stir.midSpacing     ?? 200

  // ── Self-weight ────────────────────────────────────────
  const selfWt_kNm = 25 * (bw / 1000) * (D / 1000)  // kN/m
  const wu         = wu_kNm_fromSlab + selfWt_kNm * 1.5
  checks.push(info('load',
    `wu = ${wu_kNm_fromSlab.toFixed(1)} (slab) + ${(selfWt_kNm*1.5).toFixed(1)} (self-wt×1.5) = ${wu.toFixed(1)} kN/m`,
    `Beam ${bw}×${D}mm, L=${(L_mm/1000).toFixed(2)}m`, 'IS 456 Cl. 18.2'))

  // ── Span model: simply-supported vs continuous ─────────
  // If intermediate columns detected along beam path, use IS 456 Table 12/13
  // coefficients for continuous beam instead of simply-supported formulae.
  let L_eff, Mu_sag, Mu_hogg, Vu_sup, Vu_end, basic_ld_ratio

  if (intCols.length > 0) {
    const positions = [0, ...intCols.map(c => c.t), 1]
    const subSpans  = []
    for (let i = 0; i < positions.length - 1; i++) {
      subSpans.push((positions[i + 1] - positions[i]) * L)
    }
    L_eff = Math.max(...subSpans)                  // critical (longest) sub-span
    // IS 456 Table 12 — two or more equal spans with UDL
    Mu_sag  = wu * L_eff * L_eff / 12             // end span sagging (reduced)
    Mu_hogg = wu * L_eff * L_eff / 10             // hogging at interior support
    // IS 456 Table 13 shear coefficients
    Vu_sup  = 0.6 * wu * L_eff                    // at interior support (governing)
    Vu_end  = 0.4 * wu * L_eff                    // at end supports (wall/column)
    basic_ld_ratio = 26                            // continuous beam
    checks.push(info('continuous',
      `Continuous beam — ${intCols.length} intermediate column(s), ${subSpans.length} spans`,
      `Sub-spans: [${subSpans.map(s => s.toFixed(2) + 'm').join(', ')}], critical = ${L_eff.toFixed(2)}m. ` +
      `IS 456 Table 12: Mu_sag=wl²/12, Mu_hogg=wl²/10; Table 13: Vu=0.6wl at interior, 0.4wl at ends.`,
      'IS 456 Cl. 22.5.1'))
  } else {
    L_eff  = L
    Mu_sag  = wu * L * L / 8                      // simply-supported
    const hasRigidSupport = !!(beam._rigidEnds ?? (ss || es))
    const rf = beam._colReleaseRf ?? 0             // moment release fraction (col–col beams)
    const M0_hogg = wu * L * L / 12               // fixed-end moment baseline

    if (!hasRigidSupport) {
      Mu_hogg = 0
      checks.push(info('simply-supported',
        'Simply supported — no rigid end supports detected',
        'Both ends frame into beams (pinned connections). Hogging moment = 0; top steel is nominal.',
        'IS 456 Cl. 22.2'))
    } else if (beam._Mu_hogg_manual > 0) {
      Mu_hogg = beam._Mu_hogg_manual
      checks.push(info('col-hogg-est',
        `Hogging: manual override — ${Mu_hogg.toFixed(1)} kN·m`,
        `User-supplied support moment (from frame analysis). ` +
        `Stiffness estimate would give ${(M0_hogg * (1 - rf)).toFixed(1)} kN·m; M₀=wL²/12=${M0_hogg.toFixed(1)} kN·m.`,
        'IS 456 Cl. 22.5'))
    } else if (rf > 0.01) {
      // Column-to-column beam: columns release a fraction of the FEM (1-cycle MDM)
      Mu_hogg = M0_hogg * (1 - rf)
      checks.push(info('col-hogg-est',
        `Hogging: stiffness estimate — ${(rf * 100).toFixed(0)}% released to columns`,
        `M₀ = wL²/12 = ${M0_hogg.toFixed(1)} kN·m. ` +
        `Column/beam stiffness ratio releases ${(rf * 100).toFixed(0)}% → ` +
        `Mu_hogg = ${Mu_hogg.toFixed(1)} kN·m (1-cycle moment distribution). ` +
        `Enter manual value below if you have frame analysis results.`,
        'IS 456 Cl. 22.5'))
    } else {
      // Wall-supported (or support type unknown): fixity limited by top-bar anchorage.
      // Top bars must develop fy to create the full fixed-end moment. If the wall is
      // shallower than Ld_top, the bars slip and only partial fixity is achieved.
      // IS 456 Cl. 26.2.1 — Ld = φ·0.87fy / (4·τbd); top-bar bond factor applies.
      const Ld_top = calcLd(ts.dia, fy, fck, { topBar: true })

      const wallAnchorRatio = (sup) => {
        if (!sup || sup.type !== 'wall') return 1.0   // column end or unknown → full fixity
        const embed = sup.embedmentDepth ?? 230
        const lbend = sup.lBend ? (sup.lBendLength ?? 450) : 0
        return Math.min(1.0, (embed + lbend) / Ld_top)
      }
      const ratioS = wallAnchorRatio(ss)
      const ratioE = wallAnchorRatio(es)
      const fixityFactor = Math.min(ratioS, ratioE)  // governing (weakest) end

      Mu_hogg = fixityFactor * M0_hogg
      // Partial fixity redistributes moment: midspan sagging increases
      Mu_sag  = wu * L * L / 8 - Mu_hogg

      // Audit info for sidebar display
      const govEmbed = (() => {
        const vals = [
          ss?.type === 'wall' ? (ss.embedmentDepth ?? 230) + (ss.lBend ? (ss.lBendLength ?? 450) : 0) : null,
          es?.type === 'wall' ? (es.embedmentDepth ?? 230) + (es.lBend ? (es.lBendLength ?? 450) : 0) : null,
        ].filter(v => v != null)
        return vals.length ? Math.min(...vals) : null
      })()
      const embedStr = govEmbed != null ? `${govEmbed}mm provided` : 'embedment unknown'

      if (fixityFactor >= 1.0) {
        checks.push(info('wall-hogg-est',
          `Hogging: wall support, full fixity — ${Mu_hogg.toFixed(1)} kN·m`,
          `φ${ts.dia} top bar Ld = ${Ld_top}mm (incl. top-bar bond factor); ${embedStr} ≥ Ld → full fixity. ` +
          `Mu_hogg = wL²/12 = ${Mu_hogg.toFixed(1)} kN·m.`,
          'IS 456 Cl. 26.2.1'))
      } else {
        checks.push(info('wall-hogg-est',
          `Hogging: wall support, partial fixity ${(fixityFactor * 100).toFixed(0)}% — ${Mu_hogg.toFixed(1)} kN·m`,
          `φ${ts.dia} top bar Ld = ${Ld_top}mm required (incl. top-bar bond factor); ${embedStr}. ` +
          `Fixity = ${embedStr.replace('mm provided', '')}/${Ld_top} = ${(fixityFactor * 100).toFixed(0)}%. ` +
          `Mu_hogg = ${(fixityFactor * 100).toFixed(0)}% × wL²/12 = ${(fixityFactor * 100).toFixed(0)}% × ${M0_hogg.toFixed(1)} = ${Mu_hogg.toFixed(1)} kN·m. ` +
          `Midspan sagging increases: Mu_sag = wL²/8 − Mu_hogg = ${(wu*L*L/8).toFixed(1)} − ${Mu_hogg.toFixed(1)} = ${Mu_sag.toFixed(1)} kN·m.`,
          'IS 456 Cl. 26.2.1'))
      }
    }

    Vu_sup  = wu * L / 2
    Vu_end  = wu * L / 2
    basic_ld_ratio = 20
  }

  // Vu at critical support (interior for continuous, end for SS)
  const Vu      = Vu_sup
  // Vu_d: shear at distance d from support face (IS 456 Cl. 22.6.2.1).
  // Applies when: (a) support reaction causes end compression AND (b) load applied at top.
  // Both conditions met for slab-loaded beams on walls/columns → use Vu_d for ALL shear checks.
  const Vu_d    = Math.max(0, Vu - wu * d / 1000)

  // ── IS 456 Cl. 26.5.1.1 — Min tension steel ───────────
  const Ast_min = 0.85 * bw * d / fy
  checks.push(chk('ast-min', 'Min. tension steel', 'IS 456 Cl. 26.5.1.1',
    Ast_min, Ast_bot, 'mm²',
    `0.85×bw×d/fy = ${Ast_min.toFixed(0)} mm²; provided ${Ast_bot.toFixed(0)} mm²`))

  // ── IS 456 Cl. 26.5.1.1 — Max tension steel ───────────
  const Ast_max = 0.04 * bw * D
  checks.push(chk('ast-max', 'Max. tension steel (4% bD)', 'IS 456 Cl. 26.5.1.1',
    Ast_bot, Ast_max, 'mm²'))

  // ── Sagging moment capacity (IS 456 Cl. 38.1) ─────────
  // At midspan the slab acts as a compression flange (T-beam behaviour).
  // IS 456 Cl. 23.1.2: effective flange width bf is computed in runCapacityChecks
  // and passed in. At supports (hogging) the flange is in tension → rectangular web only.
  const useTee = !!(bf_tee_mm && Df_mm && bf_tee_mm > bw && adjacentSlabs.length > 0)
  const capBot = useTee
    ? momentCapTee(bw, D, bf_tee_mm, Df_mm, Ast_bot_mid, cv, fy, fck)
    : momentCap(bw, D, Ast_bot_mid, cv, fy, fck)
  const teeNote = useTee
    ? ` | T-beam: bf=${capBot.bf_used.toFixed(0)}mm, Df=${Df_mm}mm, NA ${capBot.naInFlange ? 'in flange ✓' : 'in web'}`
    : ''
  const curtNote = bc.count > 0 ? ` +${bc.count}×T${bc.dia} curtail` : ''
  checks.push(chk('flex-sag', `Flexure — mid-span (sagging${useTee ? ', T-beam' : ''})`, 'IS 456 Cl. 38.1',
    Mu_sag, capBot.Mu_kNm, 'kN·m',
    `wu=${wu.toFixed(1)}kN/m, L_eff=${L_eff.toFixed(2)}m → Mu=${Mu_sag.toFixed(1)}kN·m | ` +
    `Ast=${Ast_bot_mid.toFixed(0)}mm²${curtNote}, xu=${capBot.xu.toFixed(0)}mm (max ${capBot.xuMax.toFixed(0)}mm)` +
    (capBot.overReinforced ? ' ⚠ OVER-REINFORCED' : '') + teeNote))
  if (capBot.overReinforced) {
    // Over-reinforced = brittle failure mode, but only dangerous if near capacity.
    // At low utilization (DCR << 1) bars never reach yield so xu_actual << xu_max.
    const overBot = { id: 'over-bot', desc: 'Bottom steel over-reinforced (xu > xu_max)',
      clause: 'IS 456 Cl. 38.1', demand: null, capacity: null, unit: '', dcr: null,
      status: Mu_sag / capBot.Mu_kNm > 0.75 ? 'fail' : 'warn',
      note: `xu=${capBot.xu.toFixed(0)}mm > xu_max=${capBot.xuMax.toFixed(0)}mm. ` +
            `Brittle failure mode — reduce bar count or increase depth. ` +
            `At current DCR=${( Mu_sag/capBot.Mu_kNm).toFixed(2)} bars are not near yield so risk is low.` }
    checks.push(overBot)
  }

  // ── Hogging moment capacity (IS 456 Cl. 38.1, doubly-reinforced) ─────────
  // Top bars = tension steel. Bottom bars sit in the compression zone → compression steel.
  // Use doubly-reinforced beam theory when bottom bars are present (IS 456 Annex G, Cl. G-1.2).
  if (Ast_top > 0) {
    const d_prime = cv  // compression steel (bottom bars) are at cover depth from soffit
    const capTop = momentCap(bw, D, Ast_top, cv, fy, fck, Ast_bot, d_prime)
    const drNote = capTop.doublyReinforced
      ? ` | doubly-reinforced: bot Asc=${Ast_bot.toFixed(0)}mm² (fsc=${capTop.fsc?.toFixed(0)}MPa)`
      : ''
    checks.push(chk('flex-hogg', 'Flexure — support (hogging)', 'IS 456 Cl. 38.1',
      Mu_hogg, capTop.Mu_kNm, 'kN·m',
      `Mu_hogg=${Mu_hogg.toFixed(1)}kN·m | top Ast=${Ast_top.toFixed(0)}mm²${drNote}`))
    if (capTop.overReinforced) {
      checks.push({ id: 'over-top', desc: 'Top steel over-reinforced (xu > xu_max)',
        clause: 'IS 456 Cl. 38.1', demand: null, capacity: null, unit: '', dcr: null,
        status: Mu_hogg / capTop.Mu_kNm > 0.75 ? 'fail' : 'warn',
        note: `xu=${capTop.xu.toFixed(0)}mm > xu_max=${capTop.xuMax.toFixed(0)}mm even with bottom bars as compression steel. ` +
              `Increase beam depth or reduce top bar count.` })
    }
  } else {
    checks.push(flagFail('no-top', 'No top steel at supports', 'IS 456 Cl. 26.5.1.1',
      'Provide top reinforcement at supports for hogging moment.'))
  }

  // ── IS 456 Cl. 26.5.1.3 — Side face steel (D > 750mm) ─
  if (D > 750) {
    const Asf_req = 0.1 / 100 * (D - 450) * bw
    checks.push(info('side-face',
      `Side face reinforcement required: 0.1% of web (D=${D}mm > 750mm)`,
      `Provide ${Asf_req.toFixed(0)}mm² each face at ≤300mm spacing.`,
      'IS 456 Cl. 26.5.1.3'))
  }

  // ── Shear design (IS 456 Cl. 40) ──────────────────────
  // Critical section at d from support face per IS 456 Cl. 22.6.2.1
  // tau_v used for both τc_max (Table 20) and stirrup capacity checks
  const tau_v      = (Vu_d * 1000) / (bw * d)           // N/mm² — at d from support face
  const pt_bot  = (100 * Ast_bot) / (bw * d)
  const tau_c   = getTc(pt_bot, fck)
  const tau_max = getTcMax(fck)

  // τc_max check — section adequacy at critical section d from support face (IS 456 Cl. 22.6.2.1)
  checks.push(chk('shear-max', 'Max. shear stress (section size)', 'IS 456 Table 20',
    tau_v, tau_max, 'N/mm²',
    `τv=${tau_v.toFixed(3)} (Vu_d=${Vu_d.toFixed(1)}kN at d=${d}mm from face), τc_max=${tau_max} for M${fck}`  ))

  // Stirrup shear capacity at support zone (uses Vu_d per Cl. 40.5.1)
  const Vus_sup = 0.87 * fy * Asv * d / (sv_sup * 1000)  // kN
  const Vc      = tau_c * bw * d / 1000                   // kN
  const Vn      = Vc + Vus_sup
  checks.push(chk('shear-cap', 'Shear capacity at support', 'IS 456 Cl. 40.4',
    Vu_d, Vn, 'kN',
    `Vu_d=${Vu_d.toFixed(1)}kN; Vc=${Vc.toFixed(1)}+Vus=${Vus_sup.toFixed(1)}kN | ` +
    `τv_d=${tau_v.toFixed(3)}, τc=${tau_c.toFixed(3)}, sv_sup=${sv_sup}mm`))

  // Stirrup shear capacity at midspan
  const Vus_mid = 0.87 * fy * Asv * d / (sv_mid * 1000)
  const Vn_mid  = Vc + Vus_mid
  checks.push(chk('shear-mid', 'Shear capacity at mid-span', 'IS 456 Cl. 40.4',
    Vu_d * 0.5, Vn_mid, 'kN',
    `At mid Vu ≈ 0.5×Vu_d; sv_mid=${sv_mid}mm`))

  // ── IS 456 Cl. 26.5.1.6 — Min stirrup area ────────────
  const min_Asv_sv = 0.4 * bw / (0.87 * fy)
  const prov_Asv_sv = Asv / sv_mid
  checks.push(chk('min-stir', 'Min. stirrup Asv/sv', 'IS 456 Cl. 26.5.1.6',
    min_Asv_sv, prov_Asv_sv, 'mm²/mm',
    `0.4bw/(0.87fy)=${min_Asv_sv.toFixed(4)}; provided ${prov_Asv_sv.toFixed(4)}`))

  // ── IS 456 Cl. 26.5.1.5 — Max stirrup spacing ─────────
  const max_sv = Math.min(0.75 * d, 300)
  checks.push(chk('max-stir-mid', 'Max. stirrup spacing — mid', 'IS 456 Cl. 26.5.1.5',
    sv_mid, max_sv, 'mm', `min(0.75d=${(0.75*d).toFixed(0)}, 300)=${max_sv.toFixed(0)}mm`))
  checks.push(chk('max-stir-sup', 'Max. stirrup spacing — support', 'IS 456 Cl. 26.5.1.5',
    sv_sup, max_sv, 'mm'))

  // ── Development length at each support ────────────────
  const dia_bot = bf.dia
  const Ld_bot  = calcLd(dia_bot, fy, fck)
  // M1/V + Lo check (Cl. 26.2.3.3) — use end-support shear (lower shear = tighter check)
  const M1      = capBot.Mu_kNm * 1e6  // N·mm
  const Lo      = Math.max(d, 12 * dia_bot)
  const Ld_allow = M1 / (Vu_end * 1000) + Lo

  ;[['Start', ss], ['End', es]].forEach(([label, sup]) => {
    if (!sup) {
      checks.push(info(`anc-${label.toLowerCase()}`,
        `Anchorage — ${label} support: type not set`,
        'Set support type (wall/column) in Steel tab.', 'IS 456 Cl. 26.2.1'))
      return
    }

    // Cl. 26.2.3.3: at beam END supports moment ≈ 0, bar stress ≈ Vu/Ast not 0.87fy
    // → M1/Vu+Lo is the governing anchorage check, not raw Ld
    const cl26233_ok = Ld_bot <= Ld_allow

    // ── Compute provided anchorage and bar breakdown ────
    const totalBotBars = bf.count
    const minBarsReq   = Math.ceil(totalBotBars / 3)   // IS 456 Cl. 26.2.3.2

    let L_prov, ancBreakdown, supTypeName

    if (sup.type === 'wall') {
      const embed  = sup.embedmentDepth ?? 230
      const lbend  = sup.lBend ? (sup.lBendLength ?? 450) : 0
      L_prov       = embed + lbend
      const nL     = Math.min(sup.lBendCount ?? (sup.lBend ? totalBotBars : 0), totalBotBars)
      const nS     = totalBotBars - nL
      supTypeName  = 'wall'
      ancBreakdown = `embed ${embed}mm${lbend ? ` + hook ${lbend}mm` : ''} = ${L_prov}mm | ` +
                     `${nL} L-bend + ${nS} straight`
    } else {
      const colW     = sup.colWidth ?? 230
      const ext      = sup.barExtension ?? 0
      const hook     = colW - 2 * cv
      const std_hook = Math.max(4 * dia_bot, 75)
      L_prov         = sup.straightBar ? (colW - cv) + ext : hook + std_hook + ext
      supTypeName    = `column (${colW}mm)`
      ancBreakdown   = sup.straightBar
        ? `straight: col ${colW - cv}mm${ext ? ` + ext ${ext}mm` : ''} = ${L_prov}mm`
        : `L-hook: ${hook}mm + hook ${std_hook}mm${ext ? ` + ext ${ext}mm` : ''} = ${L_prov}mm`
    }

    // ── Anchorage check — only shown on failure ──────────
    // (When Cl.26.2.3.3 passes and embedment ≥ Lo, dev-sv PASS row is sufficient)
    const hookEquiv  = 8 * dia_bot
    const L_req      = cl26233_ok ? Lo : Ld_bot
    const L_req_str  = Lo
    const L_req_bend = Math.max(0, Lo - hookEquiv)
    const excess     = L_prov - L_req

    // Only flag physical embedment when Cl.26.2.3.3 itself passes — if the bar
    // diameter is the problem (cl26233_ok=false) that check already captures it.
    if (cl26233_ok && excess < 0) {
      checks.push(chk(`anc-${label.toLowerCase()}`,
        `Anchorage — ${label} (${supTypeName}): provided ${L_prov}mm < Lo=${Lo}mm | straight min: ${L_req_str}mm | L-bend min: ~${L_req_bend}mm`,
        'IS 456 Cl. 26.2.3.3',
        Lo, L_prov, 'mm',
        `Embedment too short — provided ${L_prov}mm, need ≥ Lo=${Lo}mm (${ancBreakdown}). Straight min: ${L_req_str}mm | L-bend min: ~${L_req_bend}mm straight + hook.`))
    }

    // Flag minimum bars failure separately (genuinely critical)
    if (totalBotBars < minBarsReq)
      checks.push(flagFail(`min-bars-${label.toLowerCase()}`,
        `${label} — insufficient bars at support: ${totalBotBars} provided, need ≥ ${minBarsReq}`,
        'IS 456 Cl. 26.2.3.2',
        `At least 1/3 of bottom bars must extend past the support face.`))
  })

  // ── Cl. 26.2.3.3 — Ld ≤ M1/V + Lo ───────────────────
  const hookEquiv26 = 8 * dia_bot   // 90° bend = 8φ equivalent per IS 456 Cl. 26.2.2
  const minStraight = Lo             // minimum physical anchorage — straight bar
  const minLBend    = Math.max(0, Lo - hookEquiv26)  // minimum embed before hook
  checks.push(chk('dev-sv', 'Anchorage at end supports — Ld ≤ M1/Vu + Lo',
    'IS 456 Cl. 26.2.3.3', Ld_bot, Ld_allow, 'mm',
    `Checks that bottom bars won't pull out of the wall/column at beam ends. ` +
    `At a simple end the bar is only lightly stressed (shear-driven, not full yield), ` +
    `so IS 456 allows a reduced anchorage limit instead of the full development length.\n\n` +
    `Limit: Ld (${Ld_bot}mm) ≤ M1/Vu + Lo = ${Ld_allow.toFixed(0)}mm\n` +
    `  M1 = ${capBot.Mu_kNm.toFixed(1)}kN·m  |  Vu = ${Vu_end.toFixed(1)}kN  |  Lo = max(d=${d}, 12φ=${12*dia_bot}) = ${Lo}mm\n\n` +
    `Minimum physical embedment into support:\n` +
    `  • Straight bar : ${minStraight}mm\n` +
    `  • L-bend bar   : ~${minLBend}mm straight + ${hookEquiv26}mm hook bearing\n\n` +
    `Result: Ld ${Ld_bot}mm ≤ ${Ld_allow.toFixed(0)}mm → φ${dia_bot} bars confirmed OK`))

  // ── IS 456 Cl. 23.2 — Deflection l/d ─────────────────
  const Ast_req_approx = Mu_sag * 1e6 / (0.87 * fy * 0.9 * d)
  const fs_beam = 0.58 * fy * Math.min(Ast_req_approx / Ast_bot_mid, 1.0)
  const Kt      = Math.min(2.0, Math.max(0.4, 310 / Math.max(fs_beam, 1)))
  const lByD_a  = (L_eff * 1000) / d   // use effective (sub-)span, not total beam length
  const lByD_p  = basic_ld_ratio * Kt  // 26 for continuous, 20 for simply supported
  checks.push(chk('deflect', 'Deflection — l/d ratio', 'IS 456 Cl. 23.2',
    lByD_a, lByD_p, '',
    `Actual=${lByD_a.toFixed(1)}, Permitted=${lByD_p.toFixed(1)} (basic ${basic_ld_ratio}×Kt=${Kt.toFixed(2)}, fs=${fs_beam.toFixed(0)}N/mm², L_eff=${L_eff.toFixed(2)}m)`))

  // ── Torsion — IS 456 Cl. 41 (split-level slabs) ───────
  const elevations = adjacentSlabs.map(s => s.elevation ?? 0)
  const uniqueElevs = [...new Set(elevations.map(e => Math.round(e / 50) * 50))]

  if (uniqueElevs.length > 1) {
    const eDiff = Math.max(...uniqueElevs) - Math.min(...uniqueElevs)
    checks.push(info('torsion-detect',
      `⚠ Torsion detected — slabs at different elevations (Δ = ${eDiff}mm)`,
      `IS 456 Cl. 41 applies. Equivalent shear Ve and moment Me must be checked. ` +
      `Enter Tu in the input above for full torsion calculation.`,
      'IS 456 Cl. 41.1'))
    checks.push(flagFail('torsion-closed',
      'Torsion: closed stirrups mandatory',
      'IS 456 Cl. 41.3.1',
      'Split-level slab framing creates equilibrium torsion. Open-link stirrups are NOT permitted. Use closed rectangular stirrups.'))
  }

  // If Tu is provided (from capacityInputs.beamTu)
  const Tu = beam._Tu_kNm ?? 0
  if (Tu > 0) {
    const b1 = bw - 2 * cv - stir.dia
    const d1 = D  - 2 * cv - stir.dia

    // Cl. 41.2.1 — torsional shear stress
    const tau_t   = Tu * 1e6 / (bw * bw * (D - bw / 3))
    const tau_ve  = tau_v + tau_t
    checks.push(chk('torsion-stress', 'Torsion shear stress check', 'IS 456 Cl. 41.2.1',
      tau_ve, tau_max, 'N/mm²',
      `τt=${tau_t.toFixed(3)}, τv=${tau_v.toFixed(3)}, τve=${tau_ve.toFixed(3)}`))

    // Cl. 41.3.1 — equivalent shear
    const Ve = Vu_d + 1.6 * Tu * 1000 / bw   // kN
    const tau_eq = Ve * 1000 / (bw * d)
    checks.push(chk('torsion-Ve', 'Equivalent shear Ve', 'IS 456 Cl. 41.3.1',
      Ve, Vn, 'kN',
      `Ve = Vu + 1.6Tu/b = ${Vu_d.toFixed(1)} + ${(1.6*Tu*1000/bw).toFixed(1)} = ${Ve.toFixed(1)}kN`))

    // Cl. 41.4.2 — equivalent moment
    const Mt  = Tu * (1 + D / bw) / 1.7   // kN·m
    const Me1 = Mu_sag + Mt
    checks.push(chk('torsion-Me', 'Equivalent moment Me1 (sagging)', 'IS 456 Cl. 41.4.2',
      Me1, capBot.Mu_kNm, 'kN·m',
      `Me1 = Mu + Tu(1+D/b)/1.7 = ${Mu_sag.toFixed(1)} + ${Mt.toFixed(1)} = ${Me1.toFixed(1)}kN·m`))

    // Cl. 41.4.2 — check top steel for Me2
    const Me2 = Mt - Mu_sag
    if (Me2 > 0 && Ast_top > 0) {
      const capTopT = momentCap(bw, D, Ast_top, cv, fy, fck)
      checks.push(chk('torsion-Me2', 'Equivalent moment Me2 (hogging — torsion)', 'IS 456 Cl. 41.4.2',
        Me2, capTopT.Mu_kNm, 'kN·m',
        `Me2 = Mt - Mu = ${Mt.toFixed(1)} - ${Mu_sag.toFixed(1)} = ${Me2.toFixed(1)}kN·m`))
    }

    // Cl. 41.4.3 — combined stirrup requirement
    const Asv_sv_req = (Tu * 1e6 / (b1 * d1) + Ve * 1000 / (2.5 * d1)) / (0.87 * fy)
    const Asv_sv_prov = Asv / sv_sup
    checks.push(chk('torsion-stir', 'Stirrup area for torsion + shear', 'IS 456 Cl. 41.4.3',
      Asv_sv_req, Asv_sv_prov, 'mm²/mm',
      `Required Asv/sv=${Asv_sv_req.toFixed(4)}; provided ${Asv_sv_prov.toFixed(4)}`))

    // Cl. 41.4.4 — longitudinal steel for torsion
    const Al = (Tu * 1e6 * sv_sup / (b1 * d1 * 0.87 * fy)) * (b1 + d1)
    checks.push(info('torsion-long',
      `Additional longitudinal steel for torsion: Al=${Al.toFixed(0)}mm² (Cl. 41.4.4)`,
      `Distribute: 2/3 at tension face, 1/3 at corners. Add to existing steel.`,
      'IS 456 Cl. 41.4.4'))
  }

  return checks
}

// ─────────────────────────────────────────────────────────────
// COLUMN CHECKS  (IS 456 Cl. 25, 26.5.3, 39)
// ─────────────────────────────────────────────────────────────
export function checkColumn(col, wallHMm, Pu_kN, Mux_kNm, Muy_kNm, fy, fck) {
  const checks = []
  const b   = col.width  ?? 230
  const D   = col.depth  ?? 230
  const cv  = col.steel?.cover ?? 40
  const Ag  = b * D
  const vb  = col.steel?.vertBars ?? { count: 4, dia: 16 }
  const tie = col.steel?.ties    ?? { dia: 8, spacing: 200 }
  const Asc = astCircle(vb.count, vb.dia)
  const Ac  = Ag - Asc

  // ── Cl. 26.5.3.1 — Min steel (0.8% Ag) ────────────────
  const Asc_min = 0.8 / 100 * Ag
  checks.push(chk('asc-min', 'Min. longitudinal steel (0.8%)', 'IS 456 Cl. 26.5.3.1',
    Asc_min, Asc, 'mm²', `0.8% of ${Ag}mm² = ${Asc_min.toFixed(0)}mm²`))

  // ── Cl. 26.5.3.1 — Max steel (6% Ag) ─────────────────
  const Asc_max = 6 / 100 * Ag
  checks.push(chk('asc-max', 'Max. longitudinal steel (6%)', 'IS 456 Cl. 26.5.3.1',
    Asc, Asc_max, 'mm²', `6% of ${Ag}mm² = ${Asc_max.toFixed(0)}mm²`))

  // ── Min 4 bars (rectangular) ──────────────────────────
  if (vb.count < 4)
    checks.push(flagFail('min-bars', 'Minimum 4 bars required (rectangular)', 'IS 456 Cl. 26.5.3.1',
      `Provided ${vb.count} bars.`))

  // ── Cl. 39.3 — Axial capacity (short column) ──────────
  const Pu_cap = (0.4 * fck * Ac + 0.67 * fy * Asc) / 1000  // kN
  checks.push(chk('axial', 'Axial load capacity', 'IS 456 Cl. 39.3',
    Pu_kN, Pu_cap, 'kN',
    `0.4×${fck}×${Ac.toFixed(0)} + 0.67×${fy}×${Asc.toFixed(0)} = ${Pu_cap.toFixed(1)}kN`))

  // ── Cl. 25.4 — Min eccentricity ───────────────────────
  const emin_b = Math.max(20, wallHMm / 500 + b / 30)
  const emin_D = Math.max(20, wallHMm / 500 + D / 30)
  checks.push(info('ecc',
    `Min. eccentricity: eb=${emin_b.toFixed(0)}mm (b-dir), eD=${emin_D.toFixed(0)}mm (D-dir)`,
    `Mu_ecc_b=${(Pu_kN*emin_b/1000).toFixed(2)}kN·m, Mu_ecc_D=${(Pu_kN*emin_D/1000).toFixed(2)}kN·m`,
    'IS 456 Cl. 25.4'))

  // ── Cl. 25.1.2 — Slenderness ──────────────────────────
  const lef    = wallHMm * 0.65  // effective length (fixed base, pin top — conservative)
  const sr_b   = lef / b
  const sr_D   = lef / D
  const slender = sr_b > 12 || sr_D > 12
  checks.push(info('slender',
    `Slenderness: lex/b=${sr_b.toFixed(1)}, lex/D=${sr_D.toFixed(1)} — ${slender ? '⚠ SLENDER (Cl. 39.7 additional moments required)' : 'Short column ✓'}`,
    slender ? 'Additional moments: Max = Pu × D × (lef/D)² / 2000 per Cl. 39.7.1' : '',
    'IS 456 Cl. 25.1.2'))

  // ── Biaxial bending check (Cl. 39.6) ─────────────────
  if (Mux_kNm > 0 || Muy_kNm > 0) {
    // Uniaxial moment capacities (simplified — interaction diagram)
    const d_col = D - cv
    const capX  = momentCap(b, D, Asc / 2, cv, fy, fck)
    const capY  = momentCap(D, b, Asc / 2, cv, fy, fck)
    const pn    = Pu_kN / Pu_cap  // Pu/Puz ratio
    const an    = pn <= 0.2 ? 1.0 : pn >= 0.8 ? 2.0 : 1.0 + 1.667 * (pn - 0.2)
    const IR    = Math.pow(Mux_kNm / (capX.Mu_kNm * 0.9), an) + Math.pow(Muy_kNm / (capY.Mu_kNm * 0.9), an)
    checks.push(chk('biaxial', 'Biaxial bending interaction', 'IS 456 Cl. 39.6',
      IR, 1.0, '',
      `(Mux/${capX.Mu_kNm.toFixed(1)})^${an.toFixed(2)} + (Muy/${capY.Mu_kNm.toFixed(1)})^${an.toFixed(2)} = ${IR.toFixed(3)}`))
  }

  // ── Cl. 26.5.3.2 — Tie spacing ────────────────────────
  const max_tie = Math.min(b, 16 * vb.dia, 300)
  checks.push(chk('tie-sp', 'Lateral tie spacing', 'IS 456 Cl. 26.5.3.2',
    tie.spacing, max_tie, 'mm',
    `min(b=${b}mm, 16φ=${16*vb.dia}mm, 300mm) = ${max_tie}mm`))

  // ── Tie diameter ───────────────────────────────────────
  const tie_dia_min = Math.max(6, Math.ceil(vb.dia / 4))
  if (tie.dia < tie_dia_min)
    checks.push(flagFail('tie-dia', `Tie diameter min = max(6, φ/4) = ${tie_dia_min}mm`, 'IS 456 Cl. 26.5.3.2',
      `Provided φ${tie.dia}mm; required ≥ ${tie_dia_min}mm.`))

  return checks
}

// ─────────────────────────────────────────────────────────────
// WALL CHECKS  (IS 456 Cl. 32 + lateral earth pressure)
// ─────────────────────────────────────────────────────────────
export function checkWall(wall, wallHMm, loads, fy, fck) {
  const checks = []
  const H   = wallHMm / 1000  // m
  const t   = wall.thickness  ?? 230  // mm
  const cv  = wall.steel?.cover ?? 25

  const hb   = wall.steel?.horizBars ?? { dia: 10, spacing: 200, faces: 2 }
  const vb   = wall.steel?.vertBars  ?? { dia: 10, spacing: 200 }
  const faces = hb.faces ?? 2

  // Steel per 1m per face
  const Ash_face = ast1m(hb.dia, hb.spacing)
  const Asv_face = ast1m(vb.dia, vb.spacing)
  const Ash_total = Ash_face * faces
  const Asv_total = Asv_face * faces

  // ── Lateral earth pressure (from loads) ───────────────
  const { soilGamma, soilSaturated, phi, surcharge, loadCase, waterTableDepth, gammaW = 9.81 } = loads
  const gamma  = soilSaturated ? 20 : soilGamma
  const sinPhi = Math.sin(phi * Math.PI / 180)
  const Ka = (1 - sinPhi) / (1 + sinPhi)
  const K0 = 1 - sinPhi
  const Kp = (1 + sinPhi) / (1 - sinPhi)
  const K  = loadCase === 'active' ? Ka : loadCase === 'at-rest' ? K0 : Kp

  const sig_top = K * surcharge
  const sig_bot = K * gamma * H + K * surcharge

  const hwt = waterTableDepth != null ? Math.min(waterTableDepth, wallHMm) : wallHMm
  const hw  = Math.max(0, wallHMm - hwt)
  const u_bot = (soilSaturated && hw > 0) || (waterTableDepth != null && waterTableDepth < wallHMm)
    ? gammaW * (hw / 1000) : 0
  const q_base = sig_bot + u_bot  // total horizontal pressure at base kN/m²

  checks.push(info('pressure',
    `Lateral pressure: σh_top=${sig_top.toFixed(1)}, σh_base=${sig_bot.toFixed(1)}, u=${u_bot.toFixed(1)} kN/m²`,
    `K=${K.toFixed(3)} (${loadCase}), γ=${gamma}kN/m³, φ=${phi}°`,
    'IS 875 Part 5'))

  // ── Base moment — cantilever or propped at top by slab ──
  // Propped cantilever (pin at top slab, fixed at base raft):
  //   Triangular soil (0 at top → w₀ at base): M_base = w₀H²/15, R_top = w₀H/10
  //   Uniform (surcharge + pore):               M_base = w₁H²/8,  R_top = 3w₁H/8
  //   V_base = total_lateral – R_top = 2w₀H/5 + 5w₁H/8
  // Free cantilever (free top):
  //   M_base = K×γ×H³/6 + (K×Q + u)×H²/2
  //   V_base = total lateral force = (σ_top + q_base)×H/2
  const propped = !!(loads.wallTopPropped)
  const w0  = K * gamma * H          // triangular peak at base (kN/m)
  const w1  = K * surcharge + u_bot  // uniform pressure (kN/m)

  let Mu_base, Vu_base, R_top
  if (propped) {
    Mu_base = 1.5 * (w0 * H * H / 15 + w1 * H * H / 8)
    R_top   = w0 * H / 10 + 3 * w1 * H / 8   // unfactored horizontal reaction from slab (kN/m)
    Vu_base = 1.5 * (2 * w0 * H / 5 + 5 * w1 * H / 8)
  } else {
    Mu_base = 1.5 * (K * gamma * H * H * H / 6 + K * surcharge * H * H / 2 + u_bot * H * H / 2)
    R_top   = 0
    Vu_base = 1.5 * (q_base * H / 2 + sig_top * H / 2)
  }

  const modelLabel = propped ? 'propped cantilever (slab at top)' : 'vertical cantilever (free top)'
  checks.push(info('moment',
    `Base moment (${modelLabel}): Mu = ${Mu_base.toFixed(2)} kN·m/m`,
    `Vu = ${Vu_base.toFixed(2)} kN/m at base` +
    (propped ? ` | Slab reaction R_top = ${(1.5 * R_top).toFixed(1)} kN/m (design slab edge for this force)` : ''),
    'IS 456 Cl. 18.2'))

  // ── Horizontal bars resist lateral flexure (out-of-plane) ─
  // Wall treated as vertical one-way slab: horiz bars provide bending capacity
  const capH = momentCap(1000, t, Ash_face, cv, fy, fck)
  checks.push(chk('lat-flex', 'Lateral flexure at base (out-of-plane)', 'IS 456 Cl. 32.4',
    Mu_base, capH.Mu_kNm, 'kN·m/m',
    `Ash_face=${Ash_face.toFixed(0)}mm²/m; d=${capH.d}mm`))

  // ── IS 456 Cl. 32.5 — Min horizontal steel ────────────
  const minH_pct = faces === 2 ? 0.12 : 0.15  // % of total cross-section
  const Ash_min  = minH_pct / 100 * t * 1000
  checks.push(chk('ash-min', 'Min. horizontal reinforcement', 'IS 456 Cl. 32.5(a)',
    Ash_min, Ash_total, 'mm²/m',
    `${minH_pct}% of t×1000 = ${Ash_min.toFixed(0)}mm²/m; provided ${Ash_total.toFixed(0)}mm²/m (${faces} faces)`))

  // ── IS 456 Cl. 32.5 — Min vertical steel ──────────────
  const minV_pct = faces === 2 ? 0.12 : 0.15
  const Asv_min  = minV_pct / 100 * t * 1000
  checks.push(chk('asv-min', 'Min. vertical reinforcement', 'IS 456 Cl. 32.5(b)',
    Asv_min, Asv_total, 'mm²/m',
    `${minV_pct}% = ${Asv_min.toFixed(0)}mm²/m; provided ${Asv_total.toFixed(0)}mm²/m`))

  // ── Two-face requirement (t > 200mm) ──────────────────
  if (t > 200 && faces < 2)
    checks.push(flagFail('two-face', '2-face reinforcement required for t > 200mm', 'IS 456 Cl. 32.5(c)',
      `Wall thickness ${t}mm > 200mm — reinforcement must be provided on both faces.`))

  // ── Max spacing (IS 456 Cl. 32.5) ─────────────────────
  const maxSp = Math.min(3 * t, 450)
  checks.push(chk('h-sp', 'Max. horizontal bar spacing', 'IS 456 Cl. 32.5',
    hb.spacing, maxSp, 'mm', `min(3t=${3*t}, 450) = ${maxSp}mm`))
  checks.push(chk('v-sp', 'Max. vertical bar spacing', 'IS 456 Cl. 32.5',
    vb.spacing, maxSp, 'mm'))

  // ── Shear at base (IS 456 Cl. 40) ─────────────────────
  const d_wall  = t - cv
  const tau_v   = (Vu_base * 1000) / (1000 * d_wall)
  const pt_h    = (100 * Ash_face) / (1000 * d_wall)
  const tau_c   = getTc(pt_h, fck)
  checks.push(chk('shear', 'Shear at base (out-of-plane)', 'IS 456 Cl. 40.2',
    tau_v, tau_c, 'N/mm²',
    `Vu=${Vu_base.toFixed(1)}kN/m; τv=${tau_v.toFixed(3)}, τc=${tau_c.toFixed(3)}`))

  // ── Development length at base (into raft/footing) ────
  const Ld_horiz     = calcLd(hb.dia, fy, fck)
  const raftDepth    = loads.raftThicknessMm ?? 300           // from global loads setting
  const hookMm       = loads.horizBarHookMm  ?? 0            // L-hook extension (0 = straight)
  // Available = straight embedment into raft + hook extension (physical bar length past the bend)
  const straightAvail = Math.max(raftDepth - 75, raftDepth * 0.7)
  const L_available   = straightAvail + hookMm
  const hookNote = hookMm > 0
    ? `L-hook ${hookMm}mm; straight=${straightAvail.toFixed(0)}mm + hook=${hookMm}mm = ${L_available.toFixed(0)}mm available.`
    : `No hook — straight embedment only: raft ${raftDepth}mm − 75mm cover = ${straightAvail.toFixed(0)}mm. Add L-hook to improve anchorage.`
  checks.push(chk('dev-base', 'Dev. length of horiz. bars into raft/footing', 'IS 456 Cl. 26.2.1',
    Ld_horiz, L_available, 'mm', hookNote))

  return checks
}

// ─────────────────────────────────────────────────────────────
// TRIBUTARY WIDTH  (geometric — beam ↔ slab adjacency)
// ─────────────────────────────────────────────────────────────
function projectPtOnLine(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return { t: 0, perp: 0 }
  const t = ((px - ax) * dx + (py - ay) * dy) / len2
  const cx = ax + t * dx, cy = ay + t * dy
  return { t, perp: Math.hypot(px - cx, py - cy) }
}

// ─────────────────────────────────────────────────────────────
// INTERMEDIATE COLUMN DETECTION  (continuous beam support)
// ─────────────────────────────────────────────────────────────
/**
 * Returns columns that lie along the beam path (strictly between endpoints).
 * Each result: { t, colWidth, colId }
 *   t = normalized position [0..1] along beam line
 */
function findIntermediateColumns(beam, columns) {
  if (!beam.start || !beam.end) return []
  const { start: bs, end: be } = beam
  const beamLen = Math.hypot(be.x - bs.x, be.y - bs.y)
  if (beamLen < 1) return []

  const supports = []
  columns.forEach(col => {
    const { t, perp } = projectPtOnLine(col.x, col.y, bs.x, bs.y, be.x, be.y)
    // Must be strictly inside (not within 5% of endpoints) and close to beam axis
    const snapTol = Math.max(col.width ?? 230, col.depth ?? 230) * 0.7
    if (t > 0.05 && t < 0.95 && perp < snapTol) {
      supports.push({ t, colWidth: Math.min(col.width ?? 230, col.depth ?? 230), colId: col.id })
    }
  })

  supports.sort((a, b) => a.t - b.t)
  return supports
}

function slabTribWidth(beam, slab, snapTol = 300) {
  // Returns BM-equivalent tributary width per IS 456 Cl. 24.5.
  // Detects whether this beam is along the short or long side of the slab
  // by measuring the length of the adjacent edge.
  const pts = slab.points ?? []
  const { start: bs, end: be } = beam
  let adjacent = false
  let adjEdgeLen = 0

  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length]
    const r1 = projectPtOnLine(p1.x, p1.y, bs.x, bs.y, be.x, be.y)
    const r2 = projectPtOnLine(p2.x, p2.y, bs.x, bs.y, be.x, be.y)
    if (r1.perp < snapTol && r2.perp < snapTol && r1.t >= -0.1 && r2.t <= 1.1) {
      adjacent = true
      adjEdgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      break
    }
  }

  if (!adjacent) return 0

  const lx = slab.shortSpan ?? 3000   // mm — slab short span
  const ly = slab.longSpan  ?? lx     // mm — slab long span
  const r  = ly / lx                  // aspect ratio ≥ 1

  if (r >= 2) return lx / 2   // one-way slab — full half-span

  // IS 456 Cl. 24.5 — BM-equivalent UDL width for beams supporting two-way slabs.
  // 45° lines from slab corners divide load: triangular regions to short-span beams,
  // trapezoidal regions to long-span beams.
  //
  // Short-span beam (beam runs along lx, adjacent edge ≈ lx):
  //   triangular load → w_eq = w × lx/3   → tribW = lx/3
  //
  // Long-span beam (beam runs along ly, adjacent edge ≈ ly):
  //   trapezoidal load → w_eq = w × lx × (3 − 1/r²) / 6   → tribW = lx × (3 − 1/r²) / 6
  //   r = 1.0 (square):  tribW = lx/3
  //   r = 1.2:           tribW ≈ 0.384 lx
  //   r = 1.5:           tribW ≈ 0.426 lx
  //
  // Detect via adjacent-edge length: if edge is closer to lx (short side) → short-span beam.
  const isShortSpanBeam = adjEdgeLen < (lx + ly) / 2
  if (isShortSpanBeam) {
    return lx / 3   // IS 456 Cl. 24.5 — triangular load, short-span beam
  }
  return lx * (3 - 1 / (r * r)) / 6   // IS 456 Cl. 24.5 — trapezoidal load, long-span beam
}

// Returns the fraction [0, 1] of beam length overlapped by this slab's adjacent edge
function beamSlabOverlapFraction(beam, slab, snapTol = 300) {
  const pts = slab.points ?? []
  const { start: bs, end: be } = beam
  if (!bs || !be) return 0
  const bLen = Math.hypot(be.x - bs.x, be.y - bs.y)
  if (bLen < 1) return 0
  let minT = Infinity, maxT = -Infinity
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length]
    const r1 = projectPtOnLine(p1.x, p1.y, bs.x, bs.y, be.x, be.y)
    const r2 = projectPtOnLine(p2.x, p2.y, bs.x, bs.y, be.x, be.y)
    if (r1.perp < snapTol && r2.perp < snapTol && r1.t >= -0.1 && r2.t <= 1.1) {
      minT = Math.min(minT, Math.max(0, Math.min(r1.t, r2.t)))
      maxT = Math.max(maxT, Math.min(1, Math.max(r1.t, r2.t)))
    }
  }
  return isFinite(minT) ? Math.max(0, maxT - minT) : 0
}

// Length-weighted average tribW for slabs on one side of the beam.
// Slabs that only cover part of the beam length contribute proportionally.
function weightedTribSide(beam, slabs) {
  if (!slabs.length) return 0
  const pairs = slabs.map(s => ({
    tw: slabTribWidth(beam, s),
    wt: beamSlabOverlapFraction(beam, s),
  }))
  const totalWt = pairs.reduce((a, p) => a + p.wt, 0)
  if (totalWt < 0.01) return pairs.reduce((a, p) => a + p.tw, 0) / pairs.length
  return pairs.reduce((a, p) => a + p.tw * p.wt, 0) / totalWt
}

/**
 * Compute T-beam effective flange width per IS 456 Cl. 23.1.2.
 * Returns { bf_mm, Df_mm, bw_mm, naInFlange: true } or null if no adjacent slabs.
 * Used by the properties panel to annotate the cross-section sketch.
 */
export function computeBeamBfTee(beam, slabs) {
  if (!beam.start || !beam.end || !slabs.length) return null
  const adjSlabs = slabs.filter(s => slabTribWidth(beam, s) > 0 && beamSlabOverlapFraction(beam, s) >= 0.1)
  if (!adjSlabs.length) return null

  const Df_mm  = adjSlabs[0].steel?.depth ?? 230
  const bw     = beam.width ?? 230
  const L_mm   = beam.length ?? Math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y)
  // Use simply-supported Lo (conservative — continuous would give a slightly smaller bf)
  const bf_formula = L_mm / 6 + bw + 6 * Df_mm

  // c/c between parallel beams ≈ sum of slab short spans on each side
  const nx = -(beam.end.y - beam.start.y)
  const ny =  beam.end.x  - beam.start.x
  const side = (s) => {
    const pts = s.points ?? []
    if (!pts.length) return 0
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
    return nx * (cx - beam.start.x) + ny * (cy - beam.start.y)
  }
  const leftSlabs  = adjSlabs.filter(s => side(s) <= 0)
  const rightSlabs = adjSlabs.filter(s => side(s) >  0)
  const spLeft  = leftSlabs.length  ? Math.min(...leftSlabs.map(s => s.shortSpan ?? 6000))  : 0
  const spRight = rightSlabs.length ? Math.min(...rightSlabs.map(s => s.shortSpan ?? 6000)) : 0
  const bf_cc   = bw + spLeft + spRight

  const bf_mm = Math.round(Math.min(bf_formula, bf_cc > bw ? bf_cc : bf_formula))
  return { bf_mm, Df_mm, bw_mm: bw }
}

/** Returns { tribW_mm, adjCount } for a single beam given all slabs. */
export function computeBeamTribWidth(beam, slabs) {
  const adjSlabs = slabs.filter(s => slabTribWidth(beam, s) > 0 && beamSlabOverlapFraction(beam, s) >= 0.1)
  if (adjSlabs.length === 0) return { tribW_mm: beam.length / 3, adjCount: 0 }
  if (!beam.start || !beam.end) {
    const tribW_mm = adjSlabs.reduce((acc, s) => acc + slabTribWidth(beam, s), 0) / adjSlabs.length
    return { tribW_mm, adjCount: adjSlabs.length }
  }
  const bLen = Math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y)
  const nx = -(beam.end.y - beam.start.y) / bLen
  const ny =  (beam.end.x - beam.start.x) / bLen
  const sideOf = (s) => {
    const pts = s.points ?? []
    if (!pts.length) return 0
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
    return nx * (cx - beam.start.x) + ny * (cy - beam.start.y)
  }
  const tribW_mm = weightedTribSide(beam, adjSlabs.filter(s => sideOf(s) <= 0))
                 + weightedTribSide(beam, adjSlabs.filter(s => sideOf(s) >  0))
  return { tribW_mm, adjCount: adjSlabs.length }
}

/**
 * Full per-slab breakdown for the canvas tributary visualizer.
 * Returns { slabData, tribLeft, tribRight, tribTotal, adjCount }
 * Each slabData item: { slab, side (-1=left, +1=right), tribW, overlapFrac, lx, r }
 */
export function getBeamTribDetail(beam, slabs) {
  if (!beam.start || !beam.end) {
    return { slabData: [], tribLeft: 0, tribRight: 0, tribTotal: 0, adjCount: 0 }
  }
  const bLen = Math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y)
  const nx = -(beam.end.y - beam.start.y) / bLen
  const ny =  (beam.end.x - beam.start.x) / bLen

  // Require at least 10% beam-length overlap — prevents corner slabs from being
  // counted when only a corner point falls within snapTol of the beam.
  const adjSlabs = slabs.filter(s => slabTribWidth(beam, s) > 0 && beamSlabOverlapFraction(beam, s) >= 0.1)
  const slabData = adjSlabs.map(s => {
    const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length
    const cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length
    const side = ((cx - beam.start.x) * nx + (cy - beam.start.y) * ny) > 0 ? 1 : -1
    const lx = s.shortSpan ?? 3000
    const ly = s.longSpan  ?? lx
    return {
      slab: s,
      side,
      tribW:       slabTribWidth(beam, s),
      overlapFrac: beamSlabOverlapFraction(beam, s),
      lx, r: ly / lx,
    }
  })

  const tribLeft  = weightedTribSide(beam, adjSlabs.filter(s => {
    const d = slabData.find(d => d.slab === s); return d && d.side < 0
  }))
  const tribRight = weightedTribSide(beam, adjSlabs.filter(s => {
    const d = slabData.find(d => d.slab === s); return d && d.side > 0
  }))
  return { slabData, tribLeft, tribRight, tribTotal: tribLeft + tribRight, adjCount: adjSlabs.length }
}

// ─────────────────────────────────────────────────────────────
// MAIN RUNNER
// ─────────────────────────────────────────────────────────────
export function runCapacityChecks(state, capacityInputs) {
  const { beams, slabs, columns, walls, wallHeightMm, loads } = state
  const { fck, fy, beamTu = {}, slabCase = {}, colPu = {}, colMux = {}, colMuy = {} } = capacityInputs

  // ── Vertical load (factored) on slab ─────────────────
  const soilLoad   = (loads.soilDepthMm / 1000) * (loads.slabGamma ?? 18)  // kN/m²
  const liveLoad   = loads.liveLoad ?? 5                                      // kN/m²

  const results = []

  // ── Slabs ─────────────────────────────────────────────
  slabs.forEach(s => {
    const slabD   = s.steel?.depth ?? 230
    const selfWt  = slabD / 1000 * 25
    const wu      = 1.5 * (soilLoad + selfWt + liveLoad)   // factored kN/m²
    const caseNum = slabCase[s.id] ?? 9
    results.push({
      type: 'slab', id: s.id,
      label: s.mark ?? 'Slab',
      wu_note: `wu = 1.5×(${soilLoad.toFixed(1)}+${selfWt.toFixed(1)}+${liveLoad.toFixed(1)}) = ${wu.toFixed(1)} kN/m²`,
      checks: checkSlab(s, wu, fy, fck, caseNum),
    })
  })

  // ── IS 456 Cl. 22.2 — effective span for a beam ───────
  // Detects whether each endpoint is at a column/wall FACE (face-to-face drawing,
  // stored length = clear span) or at a column CENTER (c/c drawing, stored = L_eff).
  // Face-to-face: L_eff = min(L_clear + d, L_clear + halfW1 + halfW2)  → adds support widths
  // Centre-to-centre: endpoint IS at column centre → halfW = 0 → L_eff = L_drawn (already c/c)
  const effectiveSpanMm = (b) => {
    if (!b.start || !b.end) return b.length ?? 3000
    const bLen = Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y)
    if (bLen < 1) return b.length ?? 3000
    const ux = (b.end.x - b.start.x) / bLen
    const uy = (b.end.y - b.start.y) / bLen

    const halfAt = (pt) => {
      for (const col of columns) {
        const hw = col.width / 2, hd = col.depth / 2
        const dx = Math.abs(pt.x - col.x), dy = Math.abs(pt.y - col.y)
        if (dx > hw + 120 || dy > hd + 120) continue
        if (dx < 60 && dy < 60) return 0           // at centre → c/c already, no adjustment
        // At a face — project column half-dims onto beam axis
        return Math.abs(ux) * hw + Math.abs(uy) * hd
      }
      for (const wall of walls) {
        const thk = (wall.thickness ?? 230) / 2
        const wLen = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
        if (wLen < 1) continue
        const wux = (wall.end.x - wall.start.x) / wLen
        const wuy = (wall.end.y - wall.start.y) / wLen
        const along = (pt.x - wall.start.x) * wux + (pt.y - wall.start.y) * wuy
        const perp  = Math.abs((pt.x - wall.start.x) * (-wuy) + (pt.y - wall.start.y) * wux)
        if (along < -120 || along > wLen + 120) continue
        if (perp < 60) return 0                    // at wall centreline → c/c
        if (Math.abs(perp - thk) < 120) return thk // at wall face → add half-thickness
      }
      return 0
    }

    const h1 = halfAt(b.start)
    const h2 = halfAt(b.end)
    const d_mm = (b.depth ?? 450) - (b.steel?.cover ?? 40)
    const L_drawn = b.length ?? bLen
    const L_cc    = L_drawn + h1 + h2
    // IS 456 Cl. 22.2: L_eff = min(clear + d, c/c)
    return Math.round(Math.min(L_drawn + d_mm, L_cc))
  }

  // ── Auto-detect support type + dimensions at a beam endpoint ──
  // Used to fill colWidth / embedmentDepth from the actual element when the
  // user hasn't manually set them (face-to-face drawing makes this important:
  // a 500mm column should give 500mm available anchorage, not the 230mm default).
  const autoSupport = (pt) => {
    if (!pt) return null
    // Column first (higher priority — more specific)
    for (const col of columns) {
      const hw = col.width / 2, hd = col.depth / 2
      if (Math.abs(pt.x - col.x) <= hw + 150 && Math.abs(pt.y - col.y) <= hd + 150)
        return { type: 'column', colWidth: col.width }
    }
    // Wall
    for (const wl of walls) {
      const wLen = Math.hypot(wl.end.x - wl.start.x, wl.end.y - wl.start.y)
      if (wLen < 1) continue
      const wux = (wl.end.x - wl.start.x) / wLen
      const wuy = (wl.end.y - wl.start.y) / wLen
      const along = (pt.x - wl.start.x) * wux + (pt.y - wl.start.y) * wuy
      const perp  = Math.abs((pt.x - wl.start.x) * (-wuy) + (pt.y - wl.start.y) * wux)
      if (along >= -150 && along <= wLen + 150 && perp <= (wl.thickness ?? 230) / 2 + 150)
        return { type: 'wall', embedmentDepth: wl.thickness ?? 230 }
    }
    return null
  }

  // Merge auto-detected support with user-set steel params.
  // Auto provides type + colWidth/embedmentDepth; user values always win when present.
  const mergeSupport = (userSup, autoSup) => {
    if (!autoSup) return userSup ?? null
    if (!userSup) return autoSup
    return { ...autoSup, ...userSup }   // user values override auto-detected ones
  }

  // ── Beams ─────────────────────────────────────────────
  beams.forEach(b => {
    // Detect intermediate columns along this beam (continuous beam support)
    const intCols    = findIntermediateColumns(b, columns)

    // Find adjacent slabs and compute tributary load
    // Separate slabs by which side of the beam they're on using the beam normal vector,
    // then average each side independently and SUM — not average across all slabs.
    const adjSlabs = slabs.filter(s => slabTribWidth(b, s) > 0 && beamSlabOverlapFraction(b, s) >= 0.1)

    let tribW_mm
    let leftSlabs = [], rightSlabs = []
    if (adjSlabs.length === 0) {
      tribW_mm = b.length / 3   // fallback: L/3 if no slabs detected
    } else if (!b.start || !b.end) {
      // No geometry — fall back to plain average (old behaviour)
      tribW_mm = adjSlabs.reduce((acc, s) => acc + slabTribWidth(b, s), 0) / adjSlabs.length
      leftSlabs = adjSlabs
    } else {
      // Normal vector perpendicular to beam (rotated 90°)
      const nx = -(b.end.y - b.start.y)
      const ny =   b.end.x - b.start.x

      const side = (slab) => {
        const pts = slab.points ?? []
        if (pts.length === 0) return 0
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
        const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
        return nx * (cx - b.start.x) + ny * (cy - b.start.y)
      }

      leftSlabs  = adjSlabs.filter(s => side(s) <= 0)
      rightSlabs = adjSlabs.filter(s => side(s) >  0)

      tribW_mm = weightedTribSide(b, leftSlabs) + weightedTribSide(b, rightSlabs)
    }

    const slabD   = adjSlabs.length ? adjSlabs[0].steel?.depth ?? 230 : 230

    // ── T-beam effective flange width (IS 456 Cl. 23.1.2) ──────────
    // Slab acts as compression flange in sagging. bf = Lo/6 + bw + 6·Df,
    // limited by actual centre-to-centre distance between parallel beams.
    const Df_beam    = slabD                        // flange (slab) thickness, mm
    const bw_beam    = b.width ?? 230
    const L_eff_b    = effectiveSpanMm(b)
    const Lo_tee     = intCols.length > 0 ? 0.7 * L_eff_b : L_eff_b  // IS 456 Cl. 23.1.2
    const bf_formula = Lo_tee / 6 + bw_beam + 6 * Df_beam

    // c/c to adjacent parallel beams ≈ short spans of slab panels on each side
    // (slabTribWidth uses shortSpan as the perpendicular dimension)
    const spLeft  = leftSlabs.length  ? Math.min(...leftSlabs.map(s => s.shortSpan ?? 6000))  : 0
    const spRight = rightSlabs.length ? Math.min(...rightSlabs.map(s => s.shortSpan ?? 6000)) : 0
    const bf_cc   = bw_beam + spLeft + spRight   // actual c/c between beam centrelines

    const bf_tee_computed = adjSlabs.length > 0
      ? Math.min(bf_formula, bf_cc > bw_beam ? bf_cc : bf_formula)
      : null
    const selfWt  = slabD / 1000 * 25
    const wu_area = 1.5 * (soilLoad + selfWt + liveLoad)     // kN/m²
    const wu_beam = wu_area * (tribW_mm / 1000)               // kN/m on beam

    // Auto-detect support dims from snapped column/wall and merge with user steel settings.
    // User-set values always win; auto fills missing type + colWidth / embedmentDepth.
    const startAuto = autoSupport(b.start)
    const endAuto   = autoSupport(b.end)

    // ── Stiffness-based hogging release factor (col–col beams only) ──────────
    // For beams whose both ends land on columns, the fixed-end moment wL²/12
    // is conservative — columns release moment proportional to their stiffness.
    // One-cycle moment distribution: rf = k_col / (k_col + k_beam + k_adj_beams)
    let _colReleaseRf = 0
    if (startAuto?.type === 'column' && endAuto?.type === 'column') {
      const bw_    = b.width  ?? 230
      const D_     = b.depth  ?? 450
      const k_beam = (bw_ * D_**3 / 12) / L_eff_b     // EI/L for this beam (E cancels)

      const SNAP_C = 400   // mm — column snap radius

      const colAt = (pt) => columns.find(c =>
        Math.hypot(c.x - (pt?.x||0), c.y - (pt?.y||0)) < SNAP_C)

      // Column stiffness: 4EI/H (fixed base, free top)
      const kCol = (col) => col
        ? 4 * (col.width * col.depth**3 / 12) / wallHeightMm
        : 0

      // Stiffness of OTHER beams framing into the same column
      const kAdj = (col) => {
        if (!col) return 0
        return beams.filter(ob => ob.id !== b.id).reduce((sum, ob) => {
          const ds = Math.hypot((ob.start?.x||0) - col.x, (ob.start?.y||0) - col.y)
          const de = Math.hypot((ob.end?.x||0)   - col.x, (ob.end?.y||0)   - col.y)
          if (Math.min(ds, de) > SNAP_C) return sum
          const Lb = ob.length || Math.hypot(
            (ob.end?.x||0)-(ob.start?.x||0), (ob.end?.y||0)-(ob.start?.y||0))
          return Lb > 1 ? sum + ((ob.width||230)*(ob.depth||450)**3/12) / Lb : sum
        }, 0)
      }

      const cS = colAt(b.start), cE = colAt(b.end)
      const kcs = kCol(cS), kas = kAdj(cS)
      const kce = kCol(cE), kae = kAdj(cE)

      const rf_s = kcs > 0 ? kcs / (kcs + k_beam + kas) : 0
      const rf_e = kce > 0 ? kce / (kce + k_beam + kae) : 0
      _colReleaseRf = (rf_s + rf_e) / 2
    }

    const bResolved = {
      ...b,
      _Tu_kNm:        beamTu[b.id]                 ?? 0,
      _Mu_hogg_manual: (capacityInputs.beamMuHogg ?? {})[b.id] ?? 0,
      _rigidEnds:    !!(startAuto || endAuto),
      _colReleaseRf,   // fraction of FEM released to columns (0 = full fixity / wall)
      steel: {
        ...b.steel,
        startSupport: mergeSupport(b.steel?.startSupport, startAuto),
        endSupport:   mergeSupport(b.steel?.endSupport,   endAuto),
      },
    }

    results.push({
      type: 'beam', id: b.id,
      label: b.label ?? b.mark ?? 'Beam',
      wu_note: `wu = ${wu_area.toFixed(1)}kN/m² × trib ${(tribW_mm/1000).toFixed(2)}m = ${wu_beam.toFixed(1)}kN/m` +
               (adjSlabs.length ? ` (${adjSlabs.length} slabs, IS 456 Cl. 24.5)` : ' (no adjacent slabs — using L/3 estimate)'),
      checks: checkBeam(bResolved, wu_beam, fy, fck, adjSlabs, intCols, L_eff_b, bf_tee_computed, Df_beam),
    })
  })

  // ── Columns ───────────────────────────────────────────
  columns.forEach(c => {
    const Pu  = colPu[c.id]  ?? 0
    const Mux = colMux[c.id] ?? 0
    const Muy = colMuy[c.id] ?? 0
    results.push({
      type: 'column', id: c.id,
      label: c.mark ?? 'Column',
      wu_note: Pu > 0 ? `Pu=${Pu}kN, Mux=${Mux}kN·m, Muy=${Muy}kN·m` : 'Enter Pu below for axial check',
      checks: checkColumn(c, wallHeightMm, Pu, Mux, Muy, fy, fck),
    })
  })

  // ── Walls ─────────────────────────────────────────────
  walls.forEach(w => {
    results.push({
      type: 'wall', id: w.id,
      label: `Wall ${(w.length / 1000).toFixed(1)}m`,
      wu_note: `H=${(wallHeightMm/1000).toFixed(2)}m, t=${w.thickness}mm`,
      checks: checkWall(w, wallHeightMm, loads, fy, fck),
    })
  })

  return results
}
