import React, { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import useStore from '../store/useStore'
import { runCapacityChecks } from '../utils/capacity/index'

// ── Theme ─────────────────────────────────────────────────────
const ST = {
  fail: { fg: '#ef4444', bg: '#7f1d1d22', border: '#7f1d1d' },
  warn: { fg: '#f59e0b', bg: '#78350f22', border: '#78350f' },
  pass: { fg: '#22c55e', bg: '#14532d22', border: '#14532d' },
  info: { fg: '#60a5fa', bg: 'transparent', border: 'transparent' },
}
const TYPE_CLR  = { beam: '#FFD700', slab: '#4a90d9', column: '#c0cce0', wall: '#aab8cc' }
const TYPE_LBL  = { beam: 'BEAM', slab: 'SLAB', column: 'COL', wall: 'WALL' }

// Key checks to highlight per element type
const KEY_IDS = {
  beam:   ['flex-sag', 'flex-hogg', 'shear-max', 'shear-cap', 'deflect'],
  slab:   ['flex-x', 'flex-y', 'flex-top', 'shear', 'deflect'],
  column: ['axial', 'biaxial'],
  wall:   ['lat-flex', 'ash-min', 'dev-base'],
}

// ── Helpers ───────────────────────────────────────────────────
const pct  = (d, c) => c > 0 ? Math.min(100, (d / c) * 100) : 0
const dcr  = (d, c) => c > 0 ? d / c : 0
const clr  = (v)    => v > 1 ? ST.fail.fg : v >= 0.9 ? ST.warn.fg : ST.pass.fg
const lbl  = (v)    => v > 1 ? 'FAIL' : v >= 0.9 ? 'WARN' : 'PASS'

// ── Sub-components ────────────────────────────────────────────

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      flex: 1, background: '#0a0e1a', borderRadius: 8,
      border: `1px solid ${color}55`, padding: '10px 10px 8px',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#4a6fa5', textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 9, color: '#3a5070', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function DcrBar({ demand, capacity, wide }) {
  const filledPct = pct(demand, capacity)
  const ratio = dcr(demand, capacity)
  const color  = clr(ratio)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: wide ? 8 : 5, background: '#1a2535', borderRadius: 3, overflow: 'visible', position: 'relative' }}>
        <div style={{
          width: `${Math.min(100, filledPct)}%`, height: '100%',
          background: color, borderRadius: 3, opacity: 0.85,
        }} />
        {ratio > 1 && (
          <div style={{
            position: 'absolute', right: -1, top: -1, bottom: -1,
            width: 3, background: color, borderRadius: 1,
          }} />
        )}
      </div>
      <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color, width: 32, textAlign: 'right', flexShrink: 0 }}>
        {ratio.toFixed(2)}
      </span>
    </div>
  )
}

function UtilRow({ el, expanded, onToggle }) {
  const { label, type, worstDcr, worstDesc, fail, warn, pass, total, keyChecks, wu_note } = el
  const color = clr(worstDcr)
  const status = lbl(worstDcr)

  return (
    <div style={{ borderBottom: '1px solid #111827', cursor: 'pointer' }} onClick={onToggle}>
      {/* ── Main row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px',
        background: expanded ? '#0a1220' : 'transparent',
        transition: 'background 0.1s',
      }}>
        <span style={{
          fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
          border: `1px solid ${TYPE_CLR[type]}44`, color: TYPE_CLR[type],
          flexShrink: 0, minWidth: 30, textAlign: 'center', boxSizing: 'border-box',
        }}>{TYPE_LBL[type]}</span>

        <span style={{
          fontSize: 11, color: '#c0cce0', fontWeight: 600, flexShrink: 0,
          width: 82, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>

        {/* Bar */}
        <div style={{ flex: 1, height: 6, background: '#1a2535', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            width: `${Math.min(100, worstDcr * 100)}%`, height: '100%',
            background: color, borderRadius: 3, opacity: 0.8,
          }} />
        </div>

        <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color, width: 32, textAlign: 'right', flexShrink: 0 }}>
          {worstDcr.toFixed(2)}
        </span>

        <span style={{
          fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
          background: `${color}22`, border: `1px solid ${color}55`, color,
          flexShrink: 0, minWidth: 30, textAlign: 'center', boxSizing: 'border-box',
        }}>{status}</span>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ background: '#070c18', padding: '6px 10px 10px 46px', borderTop: '1px solid #111827' }}>
          {/* Load note */}
          <div style={{ fontSize: 9, color: '#3a5478', marginBottom: 6, lineHeight: 1.5 }}>
            {wu_note}
          </div>

          {/* Check count badges */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {fail > 0 && <span style={{ fontSize: 8, color: ST.fail.fg, background: ST.fail.bg, border: `1px solid ${ST.fail.border}`, padding: '1px 6px', borderRadius: 3 }}>{fail} fail</span>}
            {warn > 0 && <span style={{ fontSize: 8, color: ST.warn.fg, background: ST.warn.bg, border: `1px solid ${ST.warn.border}`, padding: '1px 6px', borderRadius: 3 }}>{warn} warn</span>}
            <span style={{ fontSize: 8, color: '#4a6fa5' }}>{pass}/{total} pass</span>
          </div>

          {/* Key checks */}
          {keyChecks.map(c => (
            <div key={c.id} style={{ marginBottom: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: clr(c.dcr) }}>{c.desc}</span>
                <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#4a6080' }}>
                  {c.demand.toFixed(1)} / {c.capacity.toFixed(1)} {c.unit}
                </span>
              </div>
              <DcrBar demand={c.demand} capacity={c.capacity} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoadCapTable({ results }) {
  // Show key demand/capacity for primary checks, grouped by element type
  const types = ['beam', 'slab', 'column', 'wall']
  const byType = {}
  types.forEach(t => { byType[t] = results.filter(r => r.type === t) })

  const primaryCheck = {
    beam:   ['flex-sag',  'Mu (sag)',   'kN·m'],
    slab:   ['flex-x',    'Mu (main)',  'kN·m/m'],
    column: ['axial',     'Pu',         'kN'],
    wall:   ['lat-flex',  'Mu',         'kN·m/m'],
  }
  const secondCheck = {
    beam:   ['shear-max', 'τv',         'N/mm²'],
    slab:   ['flex-y',    'Mu (dist)',  'kN·m/m'],
    column: ['biaxial',   'Interaction',''],
    wall:   ['dev-base',  'Dev. len',   'mm'],
  }

  const cellStyle = {
    padding: '4px 6px', fontSize: 10, borderBottom: '1px solid #111827', color: '#8a9ab5',
    fontFamily: 'monospace', textAlign: 'right',
  }
  const hStyle = { ...cellStyle, color: '#4a6fa5', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {types.filter(t => byType[t].length > 0).map(t => {
        const [p1, lbl1] = primaryCheck[t]
        const [p2, lbl2] = secondCheck[t]
        return (
          <div key={t}>
            <div style={{ fontSize: 10, color: TYPE_CLR[t], textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
              {t}s — {lbl1} · {lbl2}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0a0e1a' }}>
                  <th style={{ ...hStyle, textAlign: 'left', width: '20%' }}>Element</th>
                  <th style={hStyle}>{lbl1} dem</th>
                  <th style={hStyle}>{lbl1} cap</th>
                  <th style={hStyle}>Reserve</th>
                  <th style={hStyle}>{lbl2} DCR</th>
                  <th style={{ ...hStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {byType[t].map((el, i) => {
                  const c1 = el.checks.find(c => c.id === p1)
                  const c2 = el.checks.find(c => c.id === p2)
                  const reserve = c1 ? c1.capacity - c1.demand : null
                  const reservePct = c1 && c1.capacity > 0 ? ((1 - c1.demand / c1.capacity) * 100) : null
                  const status = lbl(el.worstDcr)
                  const sc = clr(el.worstDcr)
                  return (
                    <tr key={el.id} style={{ background: i % 2 === 0 ? '#080c18' : 'transparent' }}>
                      <td style={{ ...cellStyle, textAlign: 'left', color: '#c0cce0', fontWeight: 600 }}>{el.label}</td>
                      <td style={cellStyle}>{c1 ? c1.demand.toFixed(1) : '—'}</td>
                      <td style={{ ...cellStyle, color: '#6b8ab5' }}>{c1 ? c1.capacity.toFixed(1) : '—'}</td>
                      <td style={{ ...cellStyle, color: reserve != null ? (reserve < 0 ? ST.fail.fg : '#4a9060') : '#3a5070' }}>
                        {reserve != null ? (
                          <>{reserve >= 0 ? '+' : ''}{reserve.toFixed(1)}<span style={{ fontSize: 7, opacity: 0.7 }}> ({reservePct >= 0 ? '+' : ''}{reservePct?.toFixed(0)}%)</span></>
                        ) : '—'}
                      </td>
                      <td style={{ ...cellStyle, color: c2 ? clr(c2.dcr) : '#3a5070' }}>
                        {c2 ? c2.dcr.toFixed(2) : '—'}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center', color: sc, fontWeight: 700 }}>{status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function CriticalList({ results }) {
  const items = []
  results.forEach(el => {
    el.checks.filter(c => c.status === 'fail' || c.status === 'warn').forEach(c => {
      items.push({ el, check: c })
    })
  })
  items.sort((a, b) => b.check.dcr - a.check.dcr)
  if (!items.length) return <div style={{ fontSize: 10, color: '#22c55e', padding: '8px 0' }}>All checks passing.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map(({ el, check }, i) => {
        const isFail = check.status === 'fail'
        const c = isFail ? ST.fail : ST.warn
        return (
          <div key={i} style={{
            background: c.bg, border: `1px solid ${c.border}`,
            borderRadius: 7, padding: '7px 10px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: TYPE_CLR[el.type], background: '#0a0e1a', padding: '1px 5px', borderRadius: 3 }}>
                  {el.label}
                </span>
                <span style={{ fontSize: 10, color: c.fg, fontWeight: 600 }}>{check.desc}</span>
              </div>
              <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: c.fg, flexShrink: 0, marginLeft: 8 }}>
                {check.dcr.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 9, color: '#4a5878' }}>
                {check.demand.toFixed(1)} / {check.capacity.toFixed(1)} {check.unit}
                {' · '}{check.clause}
              </span>
              <span style={{ fontSize: 8, color: c.fg, opacity: 0.7, flexShrink: 0 }}>
                {isFail ? 'FAIL' : 'WARN'}
              </span>
            </div>
            {check.note && (
              <div style={{ fontSize: 8, color: '#3a5070', marginTop: 3, lineHeight: 1.5 }}>
                {check.note.split('|')[0].trim()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────
function Sec({ title, color = '#4a6fa5', children, right }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `1px solid ${color}44`, paddingBottom: 5, marginBottom: 10,
      }}>
        <span style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  )
}

// ── PDF export ────────────────────────────────────────────────
async function generatePdf(results, stats, loads, capacityInputs, projectName) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, L = 14, R = 14, CW = W - L - R

  const BG   = [7,  12,  24]
  const HDR  = [13, 19,  35]
  const ROW  = [10, 16,  28]
  const TXT  = [180, 200, 220]
  const DIM  = [80, 110, 150]
  const FAIL = [239, 68,  68]
  const WARN = [245, 158, 11]
  const PASS = [34,  197, 94]
  const ACC  = [74,  144, 226]

  const stColor = (s) => s === 'fail' ? FAIL : s === 'warn' ? WARN : PASS

  doc.setFillColor(...BG); doc.rect(0, 0, W, 297, 'F')

  // ── Cover header ──
  doc.setFillColor(...HDR); doc.rect(0, 0, W, 30, 'F')

  doc.setFontSize(15); doc.setFont(undefined, 'bold'); doc.setTextColor(...TXT)
  doc.text(projectName || 'RCC Structure', L, 12)

  doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(...DIM)
  doc.text('Structural Load & Capacity Report  ·  IS 456:2000', L, 19)
  doc.text(new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }), W - R, 19, { align:'right' })

  doc.setFontSize(7.5); doc.setTextColor(...DIM)
  doc.text(`fck = M${capacityInputs.fck}  |  fy = Fe${capacityInputs.fy}  |  Soil ${(loads.soilDepthMm/1000).toFixed(2)}m @ ${loads.slabGamma} kN/m³  |  LL ${loads.liveLoad} kN/m²`, L, 26)
  doc.text(`${stats.fail} FAIL  ·  ${stats.warn} WARN  ·  ${stats.pass} PASS  ·  ${stats.total} total checks`, W - R, 26, { align:'right' })

  let y = 38

  // ── Stat boxes ──
  const boxes = [
    { label:'FAIL',     val: stats.fail,    color: stats.fail > 0 ? FAIL : DIM },
    { label:'WARN',     val: stats.warn,    color: stats.warn > 0 ? WARN : DIM },
    { label:'PASS',     val: stats.pass,    color: PASS },
    { label:'HEALTH',   val: `${stats.health}%`, color: ACC },
    { label:'ELEMENTS', val: results.length, color: DIM },
  ]
  const bw = (CW - 12) / 5
  boxes.forEach((b, i) => {
    const bx = L + i * (bw + 3)
    doc.setFillColor(...HDR); doc.rect(bx, y, bw, 13, 'F')
    doc.setDrawColor(...b.color); doc.setLineWidth(0.4); doc.rect(bx, y, bw, 13, 'S')
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(...b.color)
    doc.text(String(b.val), bx + bw / 2, y + 8, { align: 'center' })
    doc.setFontSize(5.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...DIM)
    doc.text(b.label, bx + bw / 2, y + 12, { align: 'center' })
  })
  y += 20

  // ── Capacity Utilization ──
  doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...ACC)
  doc.text('CAPACITY UTILIZATION — ALL ELEMENTS', L, y); y += 5

  // Table header
  doc.setFillColor(...HDR); doc.rect(L, y, CW, 6, 'F')
  doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(...DIM)
  doc.text('ELEMENT', L + 2, y + 4)
  doc.text('TYPE', L + 26, y + 4)
  doc.text('WORST CHECK', L + 44, y + 4)
  doc.text('DCR BAR', L + 120, y + 4)
  doc.text('DCR', L + 155, y + 4, { align: 'right' })
  doc.text('STATUS', W - R - 2, y + 4, { align: 'right' })
  y += 7

  const sorted = [...results].sort((a, b) => b.worstDcr - a.worstDcr)
  sorted.forEach((el, i) => {
    if (y > 268) {
      doc.addPage()
      doc.setFillColor(...BG); doc.rect(0, 0, W, 297, 'F')
      y = 14
    }
    if (i % 2 === 0) { doc.setFillColor(...ROW); doc.rect(L, y - 1, CW, 6.5, 'F') }

    const sc = stColor(el.worstStatus)
    const barX = L + 108, barW = 44, barH = 3
    const fillW = Math.min(barW, el.worstDcr * barW)

    doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(...TXT)
    doc.text(el.label, L + 2, y + 4)
    doc.setFont(undefined, 'normal'); doc.setTextColor(...DIM)
    doc.text(TYPE_LBL[el.type], L + 26, y + 4)
    const desc = el.worstDesc.length > 26 ? el.worstDesc.slice(0, 25) + '…' : el.worstDesc
    doc.setTextColor(...TXT)
    doc.text(desc, L + 44, y + 4)

    doc.setFillColor(26, 37, 53); doc.rect(barX, y + 0.5, barW, barH, 'F')
    doc.setFillColor(...sc); doc.rect(barX, y + 0.5, fillW, barH, 'F')

    doc.setFont(undefined, 'bold'); doc.setTextColor(...sc)
    doc.text(el.worstDcr.toFixed(2), L + 155, y + 4, { align: 'right' })
    doc.setFontSize(5.5)
    doc.text(el.worstStatus.toUpperCase(), W - R - 2, y + 4, { align: 'right' })

    y += 6
  })
  y += 8

  // ── Load vs Capacity Detail ──
  const types = ['beam', 'slab', 'column', 'wall']
  const primaryChk = { beam:'flex-sag', slab:'flex-x', column:'axial', wall:'lat-flex' }
  const secondChk  = { beam:'shear-max', slab:'flex-y', column:'biaxial', wall:'dev-base' }
  const primLbl    = { beam:'Mu sag (kN·m)', slab:'Mu main (kN·m/m)', column:'Pu (kN)', wall:'Mu (kN·m/m)' }
  const secLbl     = { beam:'τv max (N/mm²)', slab:'Mu dist (kN·m/m)', column:'Biaxial DCR', wall:'Dev. length' }

  types.forEach(t => {
    const els = results.filter(r => r.type === t)
    if (!els.length) return
    if (y > 245) {
      doc.addPage(); doc.setFillColor(...BG); doc.rect(0, 0, W, 297, 'F'); y = 14
    }

    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...ACC)
    doc.text(`LOAD vs CAPACITY — ${t.toUpperCase()}S`, L, y); y += 5

    // Header
    doc.setFillColor(...HDR); doc.rect(L, y, CW, 6, 'F')
    doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(...DIM)
    const cols = [
      [L+2, 'ELEMENT', 'left'],
      [L+28, 'LOAD NOTE', 'left'],
      [L+108, primLbl[t], 'right'],
      [L+132, 'CAPACITY', 'right'],
      [L+152, 'RESERVE', 'right'],
      [L+168, secLbl[t], 'right'],
      [W-R-2, 'WORST DCR', 'right'],
    ]
    cols.forEach(([x, txt, align]) => doc.text(txt.length > 14 ? txt.slice(0,13)+'.' : txt, x, y + 4, { align }))
    y += 7

    els.forEach((el, i) => {
      if (y > 270) return
      const c1 = el.checks.find(c => c.id === primaryChk[t])
      const c2 = el.checks.find(c => c.id === secondChk[t])
      const reserve = c1 ? c1.capacity - c1.demand : null
      const sc = stColor(el.worstStatus)

      if (i % 2 === 0) { doc.setFillColor(...ROW); doc.rect(L, y - 1, CW, 6.5, 'F') }
      doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(...TXT)
      doc.text(el.label, L + 2, y + 4)

      const note = (el.wu_note || '').split('(')[0].trim().slice(0, 28)
      doc.setFont(undefined, 'normal'); doc.setTextColor(...DIM)
      doc.text(note, L + 28, y + 4)

      if (c1) {
        doc.setTextColor(...TXT); doc.text(c1.demand.toFixed(1), L + 108, y + 4, { align: 'right' })
        doc.setTextColor(...DIM); doc.text(c1.capacity.toFixed(1), L + 132, y + 4, { align: 'right' })
        const rClr = reserve != null && reserve < 0 ? FAIL : [60, 150, 80]
        doc.setTextColor(...rClr)
        doc.text(reserve != null ? `${reserve >= 0 ? '+' : ''}${reserve.toFixed(1)}` : '—', L + 152, y + 4, { align: 'right' })
      }
      if (c2) { doc.setTextColor(...DIM); doc.text(c2.dcr.toFixed(2), L + 168, y + 4, { align: 'right' }) }

      doc.setFont(undefined, 'bold'); doc.setTextColor(...sc)
      doc.text(el.worstDcr.toFixed(2), W - R - 2, y + 4, { align: 'right' })
      y += 6
    })
    y += 6
  })

  // ── Critical Issues ──
  const criticals = []
  results.forEach(el => {
    el.checks.filter(c => c.status === 'fail' || c.status === 'warn').forEach(c => {
      criticals.push({ el, check: c })
    })
  })
  criticals.sort((a, b) => b.check.dcr - a.check.dcr)

  if (criticals.length) {
    if (y > 240) { doc.addPage(); doc.setFillColor(...BG); doc.rect(0, 0, W, 297, 'F'); y = 14 }
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...ACC)
    doc.text('CRITICAL ISSUES', L, y); y += 5

    doc.setFillColor(...HDR); doc.rect(L, y, CW, 6, 'F')
    doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(...DIM)
    doc.text('ELEMENT', L+2, y+4); doc.text('CHECK', L+28, y+4)
    doc.text('DEMAND', L+116, y+4, { align:'right' }); doc.text('CAPACITY', L+136, y+4, { align:'right' })
    doc.text('CLAUSE', L+157, y+4); doc.text('DCR', W-R-2, y+4, { align:'right' })
    y += 7

    criticals.forEach(({ el, check }, i) => {
      if (y > 272) return
      const sc = stColor(check.status)
      if (i % 2 === 0) { doc.setFillColor(...ROW); doc.rect(L, y - 1, CW, 6.5, 'F') }
      doc.setFontSize(6)
      doc.setFont(undefined, 'bold'); doc.setTextColor(...TXT); doc.text(el.label, L+2, y+4)
      const desc = check.desc.length > 30 ? check.desc.slice(0, 29) + '…' : check.desc
      doc.setFont(undefined, 'normal'); doc.setTextColor(...DIM); doc.text(desc, L+28, y+4)
      doc.setTextColor(...TXT); doc.text(check.demand.toFixed(1), L+116, y+4, { align:'right' })
      doc.setTextColor(...DIM); doc.text(`${check.capacity.toFixed(1)} ${check.unit}`, L+136, y+4, { align:'right' })
      doc.text(check.clause.slice(0,18), L+141, y+4)
      doc.setFont(undefined, 'bold'); doc.setTextColor(...sc); doc.text(check.dcr.toFixed(2), W-R-2, y+4, { align:'right' })
      y += 6
    })
  }

  // ── Load Parameters ──
  if (y > 240) { doc.addPage(); doc.setFillColor(...BG); doc.rect(0, 0, W, 297, 'F'); y = 14 }
  y += 6
  doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...ACC)
  doc.text('LOAD PARAMETERS', L, y); y += 5

  const params = [
    ['Soil fill depth on slab', `${(loads.soilDepthMm/1000).toFixed(2)} m`],
    ['Backfill unit weight (γ)', `${loads.slabGamma} kN/m³`],
    ['Live load (imposed)', `${loads.liveLoad} kN/m²`],
    ['Soil friction angle (φ)', `${loads.phi}°`],
    ['Earth pressure case', loads.loadCase],
    ['Wall top condition', loads.wallTopPropped ? 'Propped by slab' : 'Free cantilever'],
    ['Raft/footing thickness', `${loads.raftThicknessMm} mm`],
    ['Water table', loads.waterTableDepth != null ? `${(loads.waterTableDepth/1000).toFixed(2)} m from surface` : 'None'],
  ]
  params.forEach(([k, v], i) => {
    if (i % 2 === 0) { doc.setFillColor(...ROW); doc.rect(L, y - 1, CW, 6.5, 'F') }
    doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...DIM); doc.text(k, L+2, y+4)
    doc.setFont(undefined, 'bold'); doc.setTextColor(...TXT); doc.text(v, W-R-2, y+4, { align:'right' })
    y += 6
  })

  // ── Footer ──
  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFillColor(12, 18, 30); doc.rect(0, 285, W, 12, 'F')
    doc.setFontSize(6); doc.setFont(undefined, 'normal'); doc.setTextColor(50, 70, 100)
    doc.text('RCC Tool  ·  IS 456:2000  ·  For design review only — not for construction without licensed engineer sign-off', L, 291)
    doc.text(`Page ${p} / ${total}`, W - R, 291, { align: 'right' })
  }

  doc.save(`${(projectName || 'rcc').replace(/\s+/g, '-').toLowerCase()}-capacity-report.pdf`)
}

// ── Main component ────────────────────────────────────────────
export default function StructureReport() {
  const store = useStore()
  const { beams, slabs, columns, walls, wallHeightMm, loads, capacityInputs, projectName } = store
  const [expandedId, setExpandedId]   = useState(null)
  const [typeFilter, setTypeFilter]   = useState('all')
  const [exporting, setExporting]     = useState(false)

  const state = useMemo(() => ({ beams, slabs, columns, walls, wallHeightMm, loads }), [
    beams, slabs, columns, walls, wallHeightMm, loads,
  ])

  const rawResults = useMemo(() => {
    try { return runCapacityChecks(state, capacityInputs) }
    catch { return [] }
  }, [state, capacityInputs])

  // Enrich each result with summary fields
  const results = useMemo(() => rawResults.map(el => {
    const scored = el.checks.filter(c => c.dcr != null && c.dcr >= 0)
    if (!scored.length) return { ...el, worstDcr: 0, worstDesc: '', worstStatus: 'pass', fail: 0, warn: 0, pass: 0, keyChecks: [] }
    const worst = scored.reduce((m, c) => c.dcr > m.dcr ? c : m)
    const keyChecks = (KEY_IDS[el.type] ?? []).map(id => el.checks.find(c => c.id === id)).filter(Boolean)
    return {
      ...el,
      worstDcr:    worst.dcr,
      worstDesc:   worst.desc,
      worstStatus: worst.status,
      fail:   scored.filter(c => c.status === 'fail').length,
      warn:   scored.filter(c => c.status === 'warn').length,
      pass:   scored.filter(c => c.status === 'pass').length,
      keyChecks,
    }
  }).sort((a, b) => b.worstDcr - a.worstDcr), [rawResults])

  const stats = useMemo(() => {
    let fail = 0, warn = 0, pass = 0
    rawResults.forEach(r => r.checks.forEach(c => {
      if (c.status === 'fail') fail++
      else if (c.status === 'warn') warn++
      else if (c.status === 'pass') pass++
    }))
    const total = fail + warn + pass
    return { fail, warn, pass, total, health: total ? Math.round((pass / total) * 100) : 100 }
  }, [rawResults])

  const filtered = typeFilter === 'all' ? results : results.filter(r => r.type === typeFilter)

  const handleExport = async () => {
    setExporting(true)
    try { await generatePdf(results, stats, loads, capacityInputs, projectName) }
    finally { setExporting(false) }
  }

  if (!results.length) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#3a5070', fontSize: 12 }}>
      No structural elements to report.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', fontSize: 11 }}>
    <div style={{ padding: '12px 10px 10px', overflowY: 'auto', flex: 1 }}>

      {/* ── Health summary ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
        <StatCard label="Fail"   value={stats.fail}  color={stats.fail > 0 ? '#ef4444' : '#2a3550'} />
        <StatCard label="Warn"   value={stats.warn}  color={stats.warn > 0 ? '#f59e0b' : '#2a3550'} />
        <StatCard label="Pass"   value={stats.pass}  color="#22c55e" />
        <StatCard label="Health" value={`${stats.health}%`} color="#4a90d9" sub={`${stats.total} checks`} />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 14 }}>
        {['all', 'beam', 'slab', 'column', 'wall'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            flex: 1, padding: '3px 0', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5,
            background: typeFilter === t ? '#1a2845' : 'transparent',
            border: `1px solid ${typeFilter === t ? '#2563eb' : '#1e2533'}`,
            color: typeFilter === t ? '#93c5fd' : '#3a5070',
            borderRadius: 4, cursor: 'pointer', transition: 'all 0.1s',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Utilization chart ──────────────────────────────────── */}
      <Sec
        title={`Capacity Utilization (${filtered.length} elements)`}
        color="#4a90d9"
        right={<span style={{ fontSize: 8, color: '#3a5070' }}>click to expand</span>}
      >
        <div style={{ background: '#070c18', borderRadius: 8, border: '1px solid #111827', overflow: 'hidden' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 16px', fontSize: 10, color: '#3a5070' }}>No elements of this type.</div>
          )}
          {filtered.map(el => (
            <UtilRow
              key={el.id}
              el={el}
              expanded={expandedId === el.id}
              onToggle={() => setExpandedId(expandedId === el.id ? null : el.id)}
            />
          ))}
        </div>
      </Sec>

      {/* ── Load vs capacity table ─────────────────────────────── */}
      <Sec title="Load vs Capacity — Key Checks" color="#f0c060">
        <LoadCapTable results={results} />
      </Sec>

      {/* ── Critical issues ────────────────────────────────────── */}
      <Sec
        title={`Issues (${stats.fail} fail · ${stats.warn} warn)`}
        color={stats.fail > 0 ? '#ef4444' : stats.warn > 0 ? '#f59e0b' : '#22c55e'}
      >
        <CriticalList results={results} />
      </Sec>

    </div>

      {/* ── Sticky export footer ──────────────────────────────── */}
      <div style={{ padding: '10px 10px', borderTop: '1px solid #1e2533', background: '#0a0e1a', flexShrink: 0 }}>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            width: '100%', padding: '8px 0',
            background: exporting ? '#111827' : '#1a3060',
            border: `1px solid ${exporting ? '#2a3550' : '#2563eb'}`,
            borderRadius: 8, color: exporting ? '#4a6fa5' : '#93c5fd',
            fontSize: 12, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer',
            letterSpacing: 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Download size={13} />
          {exporting ? 'Generating PDF…' : 'Export PDF Report'}
        </button>
      </div>

    </div>
  )
}
