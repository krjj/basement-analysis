import { jsPDF } from 'jspdf'

// ── Helpers ────────────────────────────────────────────────────────────────

function hex2rgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function fmtDate() {
  const d = new Date()
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Scale bar: compute a "nice" world length given the drawn pixel extent
function niceScaleBar(worldWidthMm, barMaxPx) {
  // Target ~1/5 of the bar max width
  const target = worldWidthMm * (barMaxPx / 5) / barMaxPx
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)))
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
    .map(v => v * magnitude)
    .find(v => v >= target) ?? magnitude
  return nice   // mm
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * @param {string}  dataUrl        PNG data URL from stage.toDataURL()
 * @param {object}  state          Zustand store snapshot
 * @param {number}  canvasWidth    screen pixels
 * @param {number}  canvasHeight   screen pixels
 * @param {number}  worldScale     mm per screen-pixel (store.scale, NOT the pixelRatio)
 */
export async function exportPDF(dataUrl, state, canvasWidth, canvasHeight, worldScale) {
  const {
    columns = [], walls = [], beams = [], slabs = [],
    wallHeightMm = 4267,
    projectName = 'STRUCTURAL PLAN',
    primaryUnit = 'ft-in',
    dimToggles = {},
  } = state

  // ── Page setup (A3 landscape) ──────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const PW = doc.internal.pageSize.getWidth()   // 420 mm
  const PH = doc.internal.pageSize.getHeight()  // 297 mm

  const M  = 10    // outer margin
  const TH = 12    // top title bar height
  const FH = 10    // footer bar height
  const TBW = 72   // title block width (right column)

  const drawX  = M
  const drawY  = M + TH
  const drawW  = PW - 2 * M - TBW - 4   // 4mm gap before title block
  const drawH  = PH - 2 * M - TH - FH

  // ── Background ────────────────────────────────────────────────────────
  doc.setFillColor(8, 12, 22)
  doc.rect(0, 0, PW, PH, 'F')

  // Outer border
  doc.setDrawColor(42, 53, 80)
  doc.setLineWidth(0.4)
  doc.rect(M, M, PW - 2*M, PH - 2*M)

  // ── Top title bar ────────────────────────────────────────────────────
  doc.setFillColor(13, 17, 32)
  doc.rect(M, M, PW - 2*M, TH, 'F')
  doc.setDrawColor(42, 53, 80)
  doc.line(M, M + TH, PW - M, M + TH)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(224, 224, 224)
  doc.text(projectName.toUpperCase(), M + 4, M + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(74, 111, 165)
  doc.text(`Date: ${fmtDate()}`, PW - M - TBW - 8, M + 8, { align: 'right' })

  // ── Drawing area ──────────────────────────────────────────────────────
  doc.setFillColor(13, 17, 32)
  doc.rect(drawX, drawY, drawW, drawH, 'F')

  // Fit canvas image maintaining aspect ratio
  const imgAR = canvasWidth / canvasHeight
  const boxAR = drawW / drawH
  let iW, iH, iX, iY
  if (imgAR > boxAR) {
    iW = drawW;  iH = drawW / imgAR
    iX = drawX;  iY = drawY + (drawH - iH) / 2
  } else {
    iH = drawH;  iW = drawH * imgAR
    iX = drawX + (drawW - iW) / 2;  iY = drawY
  }
  doc.addImage(dataUrl, 'PNG', iX, iY, iW, iH)

  // ── Scale bar ─────────────────────────────────────────────────────────
  // worldScale = mm-per-pixel (store.scale) → drawing pixel to PDF mm conversion
  // PDF mm per world mm = iW / (canvasWidth / worldScale)
  const pdfMmPerWorldMm = iW / (canvasWidth / worldScale)
  const worldWidthMm    = canvasWidth / worldScale   // total world mm visible

  const barMaxPdf   = 50   // max scale bar length in PDF mm
  const niceWrldMm  = niceScaleBar(worldWidthMm, barMaxPdf)
  const barLenPdf   = niceWrldMm * pdfMmPerWorldMm

  const bx = drawX + 4
  const by = drawY + drawH - 6

  doc.setDrawColor(180, 200, 220)
  doc.setLineWidth(0.3)
  // Bar ticks
  doc.line(bx, by - 1.5, bx, by + 1.5)
  doc.line(bx + barLenPdf, by - 1.5, bx + barLenPdf, by + 1.5)
  doc.line(bx, by, bx + barLenPdf, by)
  // Half-bar tick
  doc.setLineWidth(0.2)
  doc.setDrawColor(120, 160, 200)
  doc.line(bx + barLenPdf/2, by - 1, bx + barLenPdf/2, by + 1)

  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(140, 170, 210)
  doc.text('0', bx, by + 4)
  // Label the midpoint
  const midWrldM = (niceWrldMm / 2000)
  doc.text(midWrldM >= 1 ? `${midWrldM.toFixed(0)}m` : `${(niceWrldMm/2000*1000).toFixed(0)}mm`,
    bx + barLenPdf/2, by + 4, { align: 'center' })
  // Label the end
  const endWrldM = niceWrldMm / 1000
  doc.text(endWrldM >= 1 ? `${endWrldM.toFixed(0)} m` : `${niceWrldMm.toFixed(0)} mm`,
    bx + barLenPdf, by + 4)

  // ── Title block (right column) ─────────────────────────────────────────
  const tbX = PW - M - TBW
  const tbY = drawY
  const tbH = drawH

  doc.setFillColor(10, 14, 26)
  doc.rect(tbX, tbY, TBW, tbH, 'F')
  doc.setDrawColor(42, 53, 80)
  doc.rect(tbX, tbY, TBW, tbH)

  // Section: Element counts
  const sectionHeader = (label, y) => {
    doc.setFillColor(20, 30, 55)
    doc.rect(tbX + 1, y - 1, TBW - 2, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(74, 144, 217)
    doc.text(label, tbX + 4, y + 4)
    return y + 8
  }

  const row = (label, value, colorHex, y) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(160, 180, 210)
    doc.text(label, tbX + 6, y)
    const [r, g, b] = hex2rgb(colorHex)
    doc.setFillColor(r, g, b)
    doc.circle(tbX + 38, y - 1.5, 1.2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(r, g, b)
    doc.text(String(value), tbX + 42, y)
    return y + 7
  }

  let ty = tbY + 4
  ty = sectionHeader('ELEMENT SCHEDULE', ty)
  ty = row('Columns',  columns.length, '#e0e0e0', ty)
  ty = row('Walls',    walls.length,   '#a0b0c8', ty)
  ty = row('Beams',    beams.length,   '#FFD700', ty)
  ty = row('Slabs',    slabs.length,   '#4a90d9', ty)

  // Divider
  ty += 2
  doc.setDrawColor(30, 40, 60)
  doc.line(tbX + 4, ty, tbX + TBW - 4, ty)
  ty += 5

  // Section: Dimensions
  ty = sectionHeader('DIMENSIONS', ty)
  const wallHm = (wallHeightMm / 1000).toFixed(2)
  const wallHft = (wallHeightMm / 304.8).toFixed(1)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(160, 180, 210)
  doc.text('Wall / Storey Height', tbX + 6, ty)
  ty += 5
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(200, 220, 240)
  doc.text(`${wallHm} m  /  ${wallHft} ft`, tbX + 6, ty)
  ty += 8

  // Beam schedule summary
  const beamMarks = [...new Set(beams.map(b => b.mark))].sort()
  if (beamMarks.length) {
    doc.setDrawColor(30, 40, 60)
    doc.line(tbX + 4, ty, tbX + TBW - 4, ty)
    ty += 5
    ty = sectionHeader('BEAM MARKS', ty)
    beamMarks.forEach(m => {
      // beam color mapping
      const BCOLORS = { B1: '#d4a017', B2: '#f97316', B3: '#22c55e', B4: '#a855f7', CUSTOM: '#888888' }
      const c = BCOLORS[m] ?? '#FFD700'
      const cnt = beams.filter(b => b.mark === m).length
      ty = row(`${m}`, cnt, c, ty)
    })
  }

  // Divider + materials note
  ty = Math.max(ty, tbY + tbH - 40)
  doc.setDrawColor(30, 40, 60)
  doc.line(tbX + 4, ty, tbX + TBW - 4, ty)
  ty += 5
  ty = sectionHeader('MATERIALS', ty)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(110, 130, 170)
  doc.text('Verify grades on site.', tbX + 6, ty)
  ty += 5
  doc.text('IS 456 : 2000 applies.', tbX + 6, ty)

  // ── Footer ─────────────────────────────────────────────────────────────
  const ftY = PH - M - FH
  doc.setFillColor(10, 14, 26)
  doc.rect(M, ftY, PW - 2*M, FH, 'F')
  doc.setDrawColor(42, 53, 80)
  doc.line(M, ftY, PW - M, ftY)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(60, 90, 130)
  doc.text(
    'Generated by RCC Tool — For design reference only. Verify all dimensions on site before construction.',
    M + 4, ftY + 6.5
  )
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(74, 111, 165)
  doc.text('1 / 1', PW - M - 4, ftY + 6.5, { align: 'right' })

  // ── Save ───────────────────────────────────────────────────────────────
  const fileName = `${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${
    new Date().toISOString().slice(0, 10)
  }.pdf`
  doc.save(fileName)
}
