// Report generation — opens a styled A4 HTML page and triggers print

import { calcBeamSteel, calcSlabSteel, calcColumnSteel, calcWallSteel, aggregateByDia } from '../utils/rcc'

// ── Weight per metre, kg/m ────────────────────────────────
const wtPerM = (dia) => (dia * dia) / 162

// ── Steel summary for an element result ──────────────────
function elementTotalWeight(rows) {
  return rows.reduce((s, r) => s + (r.wt || 0), 0)
}

// ── Format helpers ────────────────────────────────────────
const fmt1 = (n) => (isNaN(n) ? '—' : n.toFixed(1))
const fmt2 = (n) => (isNaN(n) ? '—' : n.toFixed(2))
const fmt3 = (n) => (isNaN(n) ? '—' : n.toFixed(3))
const fmtM = (mm) => `${(mm / 1000).toFixed(2)} m`

function today() {
  return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── CSS for the report ────────────────────────────────────
const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10pt;
    color: #111;
    background: #fff;
    padding: 20mm 15mm;
  }
  h1 { font-size: 16pt; letter-spacing: 2px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 11pt; letter-spacing: 1px; text-align: center; color: #555; margin-bottom: 16px; }
  h3 {
    font-size: 10pt; text-transform: uppercase; letter-spacing: 1px;
    border-bottom: 2px solid #111; padding-bottom: 4px;
    margin-top: 20px; margin-bottom: 8px;
  }
  .meta { display: flex; justify-content: space-between; font-size: 9pt; color: #444; margin-bottom: 20px; border-top: 1px solid #ccc; padding-top: 8px; }
  table {
    width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9pt;
  }
  th {
    background: #1e293b; color: #fff;
    border: 1px solid #111; padding: 5px 6px;
    text-align: left; font-weight: 600; white-space: nowrap;
  }
  td {
    border: 1px solid #888; padding: 4px 6px;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f5f7fa; }
  .total-row td { font-weight: 700; background: #e8f0fe !important; }
  .grand-total {
    margin-top: 16px; padding: 12px 16px;
    border: 2px solid #1e293b; border-radius: 6px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .grand-total .label { font-size: 12pt; font-weight: 700; }
  .grand-total .value { font-size: 14pt; font-weight: 700; color: #1e3a8a; }
  .kv { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 6px; }
  .kv span { font-size: 9pt; }
  .kv .k { color: #555; }
  .kv .v { font-weight: 600; }
  .note { font-size: 8pt; color: #666; margin-top: 6px; font-style: italic; }
  @media print {
    body { padding: 10mm 12mm; }
    .page-break { page-break-before: always; }
    h3 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
`

// ── Table builder helpers ─────────────────────────────────
function htmlTable(headers, rows, totalRow) {
  const headHtml = headers.map(h => `<th>${h}</th>`).join('')
  const bodyHtml = rows.map(r =>
    `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`
  ).join('')
  const totHtml = totalRow
    ? `<tr class="total-row">${totalRow.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`
    : ''
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}${totHtml}</tbody></table>`
}

// ── Section builders ──────────────────────────────────────
function beamScheduleHtml(beams, wallHeightMm) {
  if (!beams.length) return '<p class="note">No beams defined.</p>'
  const rows = beams.map((b, i) => {
    const res = calcBeamSteel(b.length, { ...b.steel, width: b.width, depth: b.depth })
    const wt  = elementTotalWeight(res.rows)
    const s   = b.steel
    const ss  = s.startSupport || {}
    const es  = s.endSupport   || {}
    const supLabel = (sup) => sup.type === 'column'
      ? `Col ${sup.colWidth || 230}mm`
      : `Wall ${sup.embedmentDepth || 230}mm${sup.lBend ? '+hook' : ''}`
    return [
      `B${i + 1}`,
      b.label || b.mark,
      `${b.width}×${b.depth}mm`,
      fmtM(b.length),
      `${s.bottomFull.count}-${s.bottomFull.dia}φ`,
      `${s.topSteel.count}-${s.topSteel.dia}φ`,
      `${s.stirrups.dia}φ@${s.stirrups.supportSpacing}/${s.stirrups.midSpacing}`,
      supLabel(ss),
      supLabel(es),
      fmt1(wt),
    ]
  })
  const total = beams.reduce((s, b) => {
    const res = calcBeamSteel(b.length, { ...b.steel, width: b.width, depth: b.depth })
    return s + elementTotalWeight(res.rows)
  }, 0)
  return htmlTable(
    ['Mark','Label','Size','Span','Bot. Steel','Top Steel','Stirrups','Start Sup.','End Sup.','Wt (kg)'],
    rows,
    ['','','','','','','','','TOTAL', fmt1(total)],
  )
}

function slabScheduleHtml(slabs) {
  if (!slabs.length) return '<p class="note">No slabs defined.</p>'
  const rows = slabs.map((s, i) => {
    const res = calcSlabSteel(s.shortSpan, s.longSpan, s.steel)
    const wt  = elementTotalWeight(res.rows)
    const st  = s.steel
    return [
      `S${i + 1}`,
      fmtM(s.shortSpan),
      fmtM(s.longSpan),
      `${st.depth} mm`,
      `${st.mainBar.dia}φ@${st.mainBar.spacing}`,
      `${st.distBar.dia}φ@${st.distBar.spacing}`,
      st.topSteel?.enabled ? `${st.topSteel.dia}φ@${st.topSteel.spacing}` : '—',
      fmt1(wt),
    ]
  })
  const total = slabs.reduce((s, sl) => {
    const res = calcSlabSteel(sl.shortSpan, sl.longSpan, sl.steel)
    return s + elementTotalWeight(res.rows)
  }, 0)
  return htmlTable(
    ['Mark','Short Span','Long Span','Thick.','Main Bar','Dist Bar','Top Steel','Wt (kg)'],
    rows,
    ['','','','','','','TOTAL', fmt1(total)],
  )
}

function columnScheduleHtml(columns, wallHeightMm) {
  if (!columns.length) return '<p class="note">No columns defined.</p>'
  const rows = columns.map((c, i) => {
    const res = calcColumnSteel(wallHeightMm, c.width, c.depth, c.steel)
    const wt  = elementTotalWeight(res.rows)
    const st  = c.steel
    return [
      c.mark || `C${i + 1}`,
      `${c.width}×${c.depth}mm`,
      `${st.vertBars.count}-${st.vertBars.dia}φ`,
      `${st.ties.dia}φ@${st.ties.spacing}`,
      fmtM(wallHeightMm),
      fmt1(wt),
    ]
  })
  const total = columns.reduce((s, c) => {
    const res = calcColumnSteel(wallHeightMm, c.width, c.depth, c.steel)
    return s + elementTotalWeight(res.rows)
  }, 0)
  return htmlTable(
    ['Mark','Size','Vert Bars','Ties','Height','Wt (kg)'],
    rows,
    ['','','','','TOTAL', fmt1(total)],
  )
}

function wallScheduleHtml(walls, wallHeightMm) {
  if (!walls.length) return '<p class="note">No walls defined.</p>'
  const rows = walls.map((w, i) => {
    const res = calcWallSteel(w.length, wallHeightMm, w.thickness, w.steel)
    const wt  = elementTotalWeight(res.rows)
    const st  = w.steel
    return [
      `W${i + 1}`,
      fmtM(w.length),
      `${w.thickness} mm`,
      `${st.horizBars.dia}φ@${st.horizBars.spacing}`,
      `${st.vertBars.dia}φ@${st.vertBars.spacing}`,
      fmtM(wallHeightMm),
      fmt1(wt),
    ]
  })
  const total = walls.reduce((s, w) => {
    const res = calcWallSteel(w.length, wallHeightMm, w.thickness, w.steel)
    return s + elementTotalWeight(res.rows)
  }, 0)
  return htmlTable(
    ['Mark','Length','Thickness','Horiz.','Vert.','Height','Wt (kg)'],
    rows,
    ['','','','','','TOTAL', fmt1(total)],
  )
}

function bomHtml(beams, slabs, columns, walls, wallHeightMm) {
  const allRes = [
    ...beams.map(b => calcBeamSteel(b.length, { ...b.steel, width: b.width, depth: b.depth })),
    ...slabs.map(s => calcSlabSteel(s.shortSpan, s.longSpan, s.steel)),
    ...columns.map(c => calcColumnSteel(wallHeightMm, c.width, c.depth, c.steel)),
    ...walls.map(w => calcWallSteel(w.length, wallHeightMm, w.thickness, w.steel)),
  ]
  const byDia = aggregateByDia(allRes)
  if (!byDia.length) return '<p class="note">No elements to tally.</p>'
  const totalWt = byDia.reduce((s, d) => s + d.wt, 0)
  const rows = byDia.map(d => [
    `${d.dia} φ`,
    fmt1(d.totalLen / 1000),
    fmt1(d.wt),
  ])
  return htmlTable(
    ['Bar Dia (mm)', 'Total Length (m)', 'Weight (kg)'],
    rows,
    ['TOTAL', '—', fmt1(totalWt)],
  )
}

function loadSummaryHtml(loads, wallHeightMm) {
  if (!loads) return '<p class="note">No load data.</p>'
  const H_m = wallHeightMm / 1000
  const sinPhi = Math.sin((loads.phi * Math.PI) / 180)
  const Ka = (1 - sinPhi) / (1 + sinPhi)
  const K0 = 1 - sinPhi
  const gamma = loads.soilSaturated ? 20 : loads.soilGamma
  const K = loads.loadCase === 'active' ? Ka : loads.loadCase === 'at-rest' ? K0 : (1 + sinPhi) / (1 - sinPhi)
  const sigma_bot = K * gamma * H_m + K * loads.surcharge
  const hwt = loads.waterTableDepth != null ? Math.min(loads.waterTableDepth, wallHeightMm) : wallHeightMm
  const hw  = Math.max(0, wallHeightMm - hwt)
  const u_bot = hw > 0 ? (loads.gammaW || 9.81) * (hw / 1000) : 0

  return `
    <div class="kv"><span class="k">Dead Load:</span><span class="v">${loads.deadLoad} kN/m²</span>
      <span class="k">Live Load:</span><span class="v">${loads.liveLoad} kN/m²</span></div>
    <div class="kv"><span class="k">Surcharge q:</span><span class="v">${loads.surcharge} kN/m²</span>
      <span class="k">Soil γ:</span><span class="v">${gamma} kN/m³ ${loads.soilSaturated ? '(saturated)' : ''}</span></div>
    <div class="kv"><span class="k">φ:</span><span class="v">${loads.phi}°</span>
      <span class="k">c:</span><span class="v">${loads.cohesion} kN/m²</span>
      <span class="k">Wall H:</span><span class="v">${H_m.toFixed(2)} m</span></div>
    <div class="kv"><span class="k">Load case:</span><span class="v">${loads.loadCase}</span>
      <span class="k">Ka:</span><span class="v">${Ka.toFixed(3)}</span>
      <span class="k">K₀:</span><span class="v">${K0.toFixed(3)}</span></div>
    <div class="kv"><span class="k">Lateral σh at base:</span><span class="v">${sigma_bot.toFixed(2)} kN/m²</span>
      <span class="k">Pore u at base:</span><span class="v">${u_bot.toFixed(2)} kN/m²</span></div>
    <div class="kv"><span class="k">Total horiz. at base:</span><span class="v"><strong>${(sigma_bot + u_bot).toFixed(2)} kN/m²</strong></span></div>
  `
}

// ── Grand total ───────────────────────────────────────────
function grandTotalKg(beams, slabs, columns, walls, wallHeightMm) {
  let total = 0
  beams.forEach(b => {
    const res = calcBeamSteel(b.length, { ...b.steel, width: b.width, depth: b.depth })
    total += elementTotalWeight(res.rows)
  })
  slabs.forEach(s => {
    const res = calcSlabSteel(s.shortSpan, s.longSpan, s.steel)
    total += elementTotalWeight(res.rows)
  })
  columns.forEach(c => {
    const res = calcColumnSteel(wallHeightMm, c.width, c.depth, c.steel)
    total += elementTotalWeight(res.rows)
  })
  walls.forEach(w => {
    const res = calcWallSteel(w.length, wallHeightMm, w.thickness, w.steel)
    total += elementTotalWeight(res.rows)
  })
  return total
}

// ── Public API ────────────────────────────────────────────
/**
 * @param {Array}  beams
 * @param {Array}  slabs
 * @param {Array}  columns
 * @param {Array}  walls
 * @param {Object} loads
 * @param {number} wallHeightMm
 * @param {string} units  primary unit label
 */
export function generateReport(beams, slabs, columns, walls, loads, wallHeightMm, units = 'mm') {
  const grand = grandTotalKg(beams, slabs, columns, walls, wallHeightMm)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>RCC Structural Report</title>
  <style>${CSS}</style>
</head>
<body>
  <h1>STRUCTURAL REPORT — RCC BUNKER</h1>
  <h2>Complete Steel Schedule & Load Summary</h2>
  <div class="meta">
    <span><strong>Date:</strong> ${today()}</span>
    <span><strong>Primary Unit:</strong> ${units}</span>
    <span><strong>Wall Height:</strong> ${fmtM(wallHeightMm)} (${(wallHeightMm / 304.8).toFixed(2)} ft)</span>
  </div>

  <h3>1. Beam Schedule</h3>
  ${beamScheduleHtml(beams, wallHeightMm)}

  <div class="page-break"></div>

  <h3>2. Slab Schedule</h3>
  ${slabScheduleHtml(slabs)}

  <h3>3. Column Schedule</h3>
  ${columnScheduleHtml(columns, wallHeightMm)}

  <h3>4. Wall Schedule</h3>
  ${wallScheduleHtml(walls, wallHeightMm)}

  <div class="page-break"></div>

  <h3>5. Steel Bill of Materials (by Diameter)</h3>
  ${bomHtml(beams, slabs, columns, walls, wallHeightMm)}

  <h3>6. Load Summary</h3>
  ${loadSummaryHtml(loads, wallHeightMm)}

  <div class="grand-total">
    <span class="label">Grand Total Steel</span>
    <span class="value">${fmt1(grand)} kg &nbsp;(${fmt3(grand / 1000)} MT)</span>
  </div>

  <p class="note" style="margin-top:20px;">
    Generated by RCC Bunker Tool · ${today()} · All calculations per IS:456 / IS:2502.
    Development length = 40d (Fe500). Cover: Beam 25mm · Slab 15mm · Column 40mm · Wall 25mm.
    This report is for preliminary estimation only. Verify all values with a licensed structural engineer.
  </p>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('Please allow pop-ups to generate the report.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  // Give browser time to render before printing
  setTimeout(() => win.print(), 600)
}
