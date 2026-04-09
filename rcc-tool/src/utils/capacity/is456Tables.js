/**
 * IS 456:2000 Material Tables & Formulae
 * All values sourced directly from IS 456:2000
 */

// ── IS 456 Cl. 26.2.1.1 — Bond stress for plain bars (N/mm²) ─
const TAU_BD_PLAIN = { 15: 1.0, 20: 1.2, 25: 1.4, 30: 1.5, 35: 1.7, 40: 1.9 }

/**
 * Design bond stress τbd (N/mm²)
 * IS 456 Cl. 26.2.1.1 — deformed bars: ×1.6; compression: ×1.25
 * Top bars (>300mm concrete below in single pour): divide by 1.33
 */
export function getTauBd(fck, { deformed = true, compression = false, topBar = false } = {}) {
  const grades = [15, 20, 25, 30, 35, 40]
  const g = grades.find(g => g >= fck) ?? 40
  let tbd = TAU_BD_PLAIN[g] ?? 1.9
  if (deformed)    tbd *= 1.6
  if (compression) tbd *= 1.25
  if (topBar && !compression) tbd /= 1.33
  return tbd
}

/**
 * Development length Ld (mm) — IS 456 Cl. 26.2.1
 * Ld = φ × σs / (4 × τbd)
 * σs = 0.87 fy (tension) or 0.67 fy (compression)
 */
export function calcLd(phi, fy, fck, opts = {}) {
  const { compression = false, topBar = false, deformed = true } = opts
  const sigma_s = compression ? 0.67 * fy : 0.87 * fy
  const tbd = getTauBd(fck, { deformed, compression, topBar })
  return Math.ceil((phi * sigma_s) / (4 * tbd))
}

// ── IS 456 Table 19 — Design shear strength τc (N/mm²) ───────
// Rows = 100As/(bd) breakpoints; columns = [M15, M20, M25, M30, M35, M40]
const TC_PT = [0.15, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00]
const TC_VALS = {
//         M15    M20    M25    M30    M35    M40
  0.15: [0.28,  0.28,  0.29,  0.29,  0.29,  0.30],
  0.25: [0.35,  0.36,  0.36,  0.37,  0.37,  0.38],
  0.50: [0.46,  0.48,  0.49,  0.50,  0.50,  0.51],
  0.75: [0.54,  0.56,  0.57,  0.59,  0.59,  0.60],
  1.00: [0.60,  0.62,  0.64,  0.66,  0.67,  0.68],
  1.25: [0.64,  0.67,  0.70,  0.71,  0.73,  0.74],
  1.50: [0.68,  0.72,  0.74,  0.76,  0.78,  0.79],
  1.75: [0.71,  0.75,  0.78,  0.80,  0.82,  0.84],
  2.00: [0.71,  0.79,  0.82,  0.84,  0.86,  0.88],
  2.25: [0.71,  0.81,  0.85,  0.88,  0.90,  0.92],
  2.50: [0.71,  0.82,  0.88,  0.91,  0.93,  0.95],
  2.75: [0.71,  0.82,  0.90,  0.94,  0.96,  0.98],
  3.00: [0.71,  0.82,  0.92,  0.96,  0.99,  1.01],
}
const GRADE_IDX = { 15: 0, 20: 1, 25: 2, 30: 3, 35: 4, 40: 5 }

/** Interpolated τc from IS 456 Table 19 */
export function getTc(pt_pct, fck) {
  const grades = [15, 20, 25, 30, 35, 40]
  const g   = grades.find(g => g >= fck) ?? 40
  const idx = GRADE_IDX[g]
  const pt  = Math.max(0.15, Math.min(pt_pct, 3.0))

  for (let i = 0; i < TC_PT.length - 1; i++) {
    const lo = TC_PT[i], hi = TC_PT[i + 1]
    if (pt >= lo && pt <= hi) {
      const t = (pt - lo) / (hi - lo)
      return TC_VALS[lo][idx] + t * (TC_VALS[hi][idx] - TC_VALS[lo][idx])
    }
  }
  return TC_VALS[3.00][idx]
}

// ── IS 456 Table 20 — Maximum shear stress τc_max (N/mm²) ────
export const TC_MAX = { 15: 2.5, 20: 2.8, 25: 3.1, 30: 3.5, 35: 3.7, 40: 4.0 }
export function getTcMax(fck) {
  const grades = [15, 20, 25, 30, 35, 40]
  const g = grades.find(g => g >= fck) ?? 40
  return TC_MAX[g]
}

// ── IS 456 Annex G — xu_max/d ─────────────────────────────────
// Based on IS 456 strain compatibility: εcu=0.0035, εs=0.87fy/Es+0.002
export function xuMaxRatio(fy) {
  // Simplified per IS 456 Table G-1
  if (fy <= 250) return 0.531
  if (fy <= 415) return 0.479
  if (fy <= 500) return 0.456
  return 0.456  // Fe550 conservative
}

// ── IS 456 Table 26 — Two-way slab moment coefficients ────────
// 9 edge support cases; αx = short span, αy = long span
// ly/lx breakpoints: 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0
export const SLAB_RATIO_BREAKS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0]

export const SLAB_CASES = {
  1: { label: 'Interior — all edges continuous',
    ax: [0.032,0.037,0.043,0.047,0.051,0.053,0.060,0.065],
    ay: [0.032,0.028,0.025,0.023,0.021,0.019,0.016,0.013] },
  2: { label: 'One short edge discontinuous',
    ax: [0.037,0.043,0.048,0.051,0.055,0.057,0.064,0.068],
    ay: [0.037,0.032,0.029,0.027,0.025,0.023,0.020,0.017] },
  3: { label: 'One long edge discontinuous',
    ax: [0.037,0.044,0.052,0.057,0.063,0.067,0.077,0.085],
    ay: [0.037,0.032,0.028,0.025,0.022,0.020,0.016,0.013] },
  4: { label: 'Two adjacent edges discontinuous',
    ax: [0.047,0.053,0.060,0.065,0.071,0.075,0.084,0.091],
    ay: [0.047,0.041,0.036,0.032,0.029,0.027,0.023,0.020] },
  5: { label: 'Two short edges discontinuous',
    ax: [0.045,0.049,0.052,0.056,0.059,0.060,0.065,0.069],
    ay: [0.045,0.038,0.031,0.027,0.024,0.021,0.017,0.014] },
  6: { label: 'Two long edges discontinuous',
    ax: [0.045,0.054,0.063,0.071,0.078,0.084,0.096,0.105],
    ay: [0.045,0.040,0.035,0.031,0.027,0.024,0.019,0.015] },
  7: { label: 'Three edges discont. (one long cont.)',
    ax: [0.057,0.065,0.071,0.076,0.080,0.084,0.091,0.097],
    ay: [0.057,0.049,0.043,0.038,0.034,0.031,0.024,0.020] },
  8: { label: 'Three edges discont. (one short cont.)',
    ax: [0.057,0.064,0.073,0.082,0.091,0.097,0.111,0.123],
    ay: [0.057,0.049,0.043,0.038,0.034,0.031,0.024,0.020] },
  9: { label: 'All four edges discontinuous',
    ax: [0.056,0.064,0.074,0.081,0.087,0.092,0.103,0.111],
    ay: [0.056,0.048,0.042,0.037,0.033,0.029,0.023,0.020] },
}

/** Interpolated αx, αy from IS 456 Table 26 */
export function getSlabCoeffs(ratio, caseNum = 9) {
  const c  = SLAB_CASES[caseNum] ?? SLAB_CASES[9]
  const br = SLAB_RATIO_BREAKS
  const r  = Math.min(Math.max(ratio, 1.0), 2.0)
  for (let i = 0; i < br.length - 1; i++) {
    if (r >= br[i] && r <= br[i + 1]) {
      const t = (r - br[i]) / (br[i + 1] - br[i])
      return {
        ax: c.ax[i] + t * (c.ax[i + 1] - c.ax[i]),
        ay: c.ay[i] + t * (c.ay[i + 1] - c.ay[i]),
      }
    }
  }
  return { ax: c.ax[7], ay: c.ay[7] }
}
