import React, { useState, useMemo, useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import { runCapacityChecks } from '../utils/capacity/index'
import { SLAB_CASES } from '../utils/capacity/is456Tables'

// ── colour tokens ──────────────────────────────────────────────
const C = {
  pass: '#22c55e', warn: '#f59e0b', fail: '#ef4444', info: '#60a5fa',
  bg:   '#0d1120', card: '#111827', border: '#1e2533',
  text: '#e0e0e0', dim: '#4a6fa5',
}

// ── tiny helpers ───────────────────────────────────────────────
const pct = (n) => (n != null ? (n * 100).toFixed(0) + '%' : '—')
const fmt = (n, dp = 2) => (n != null ? (+n).toFixed(dp) : '—')
const STATUS_ICON = { pass: '✓', warn: '!', fail: '✗', info: 'i' }
const STATUS_LABEL = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', info: 'INFO' }

const selStyle = {
  background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
  color: C.text, padding: '2px 5px', fontSize: 11, outline: 'none',
}
const numInput = {
  background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
  color: C.text, padding: '2px 5px', fontSize: 11, outline: 'none',
  width: 64, textAlign: 'right',
}

// ── StatusBadge ────────────────────────────────────────────────
function StatusBadge({ status, small }) {
  const col = C[status] ?? C.info
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: col + '22', color: col,
      border: `1px solid ${col}55`,
      borderRadius: 4, padding: small ? '1px 5px' : '2px 7px',
      fontSize: small ? 9 : 10, fontWeight: 700, letterSpacing: 0.5,
      flexShrink: 0,
    }}>
      {STATUS_ICON[status]} {STATUS_LABEL[status]}
    </span>
  )
}

// ── DCR bar ────────────────────────────────────────────────────
function DCRBar({ dcr }) {
  if (dcr == null || !isFinite(dcr)) return null
  const pctW = Math.min(dcr, 1.5) / 1.5 * 100
  const col  = dcr > 1.0 ? C.fail : dcr >= 0.9 ? C.warn : C.pass
  return (
    <div style={{ position: 'relative', height: 4, background: '#1e2533', borderRadius: 2, flex: 1, minWidth: 60 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pctW}%`, background: col, borderRadius: 2, transition: 'width 0.3s' }} />
      {/* 100% line */}
      <div style={{ position: 'absolute', left: `${100/1.5}%`, top: -2, width: 1, height: 8, background: '#4a6fa5' }} />
    </div>
  )
}

// ── Plain-language failure reasons keyed by check id ───────────
const REASONS = {
  // Beam
  'flex-sag':      'Midspan sagging moment exceeds bottom steel capacity — verify T-beam flanges are active, or add bottom bars / increase depth',
  'flex-hogg':     'Negative moment at support (continuity + loads) exceeds top steel capacity — add top bars or increase beam depth',
  'no-top':        'No top steel provided at supports — hogging moment will cause cracking at the top face',
  'shear-max':     'Peak shear stress at support exceeds τc,max — section is too small; increase beam width or depth',
  'shear-cap':     'Shear at support exceeds stirrup + concrete capacity — add stirrups or reduce spacing',
  'shear-mid':     'Shear at mid-span exceeds capacity — check stirrup spacing in middle zone',
  'min-stir':      'Stirrup area / spacing too low — minimum shear reinforcement not satisfied',
  'max-stir-mid':  'Stirrup spacing at mid-span too large — reduce to ≤ 0.75d',
  'max-stir-sup':  'Stirrup spacing at support zone too large — tighten to prescribed zone',
  'dev-sv':        'Insufficient bar anchorage at end support — extend bars or add a standard hook',
  'torsion-closed':'Torsional moment requires closed stirrups — open links are not adequate',
  'torsion-stress':'Torsion shear stress exceeds τc,max — section too small for combined torsion + shear',
  'torsion-Ve':    'Equivalent shear (torsion + direct shear) exceeds stirrup capacity',
  'torsion-Me':    'Equivalent moment (torsion sagging) exceeds bottom steel capacity',
  'torsion-Me2':   'Equivalent moment (torsion hogging) exceeds top steel capacity',
  'torsion-stir':  'Stirrup area for combined torsion + shear is insufficient',
  'ast-min':       'Longitudinal steel below minimum (0.85bd/fy) — beam may crack excessively under load',
  'ast-max':       'Steel exceeds 4%bD — section will be over-reinforced and brittle',
  // Slab
  'flex-x':        'Short-span bending moment exceeds main bar capacity — increase bar size or reduce spacing',
  'flex-y':        'Long-span bending moment exceeds distribution bar capacity',
  'flex-top':      'Hogging moment at slab support exceeds top steel capacity — add top bars at supports',
  'over-x':        'Short span is over-reinforced (xu > xu,max) — section brittle; increase slab depth',
  'over-y':        'Long span is over-reinforced — increase slab depth or reduce steel',
  'deflect':       'l/d ratio exceeds IS 456 limit — member may deflect excessively under service loads',
  'dev-len':       'Development length at support insufficient — extend bar past the support or add a hook',
  'ast-min-main':  'Main bar area below minimum — risk of sudden failure; increase bar size or reduce spacing',
  'ast-min-dist':  'Distribution bar area below minimum requirement',
  'spacing-main':  'Main bar spacing exceeds IS 456 limit — bars too far apart for crack control',
  'spacing-dist':  'Distribution bar spacing exceeds maximum',
  // Wall
  'lat-flex':      'Lateral soil pressure bending moment at base exceeds wall steel capacity — add horizontal bars or increase wall thickness',
  'ash-min':       'Horizontal reinforcement below IS 456 minimum — increase bar size or reduce spacing (both faces)',
  'asv-min':       'Vertical reinforcement below IS 456 minimum',
  'two-face':      'Wall > 200 mm thick requires reinforcement on both faces',
  'h-sp':          'Horizontal bar spacing exceeds IS 456 maximum',
  'v-sp':          'Vertical bar spacing exceeds maximum limit',
  'dev-base':      'Horizontal bars need more anchorage into the raft — increase raft thickness or add a 90° standard hook',
  // Column
  'axial':         'Axial load exceeds column compression capacity — increase section size or add steel',
  'biaxial':       'Combined axial + biaxial bending exceeds interaction capacity — check moments or increase section',
  'asc-min':       'Longitudinal steel below 0.8% — add bars',
  'asc-max':       'Longitudinal steel exceeds 6% — reduce bar count or use a larger section',
  'min-bars':      'Rectangular column requires minimum 4 longitudinal bars',
  'tie-sp':        'Lateral tie spacing exceeds IS 456 limit — tighten ties for confinement',
  'tie-dia':       'Tie bar diameter too small for the main bar diameter used',
}

// ── CheckRow ───────────────────────────────────────────────────
function CheckRow({ chk }) {
  const [open, setOpen] = useState(false)
  const { id, desc, clause, demand, capacity, unit, dcr, status, note } = chk
  if (status === 'info') {
    return (
      <div style={{ padding: '5px 10px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: C.info, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>ℹ</span>
        <div>
          <div style={{ fontSize: 11, color: C.text }}>{desc}</div>
          {note && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{note}</div>}
        </div>
      </div>
    )
  }
  const hasDC  = demand != null && capacity != null
  const reason = REASONS[id]
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      >
        <StatusBadge status={status} small />
        {/* Description + inline demand/capacity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.text, lineHeight: 1.3 }}>{desc}</div>
          {hasDC && (
            <div style={{ fontSize: 9.5, color: C[status], marginTop: 1, opacity: 0.85 }}>
              {fmt(demand, 1)} / {fmt(capacity, 1)} {unit}
            </div>
          )}
        </div>
        {dcr != null && isFinite(dcr) && (
          <>
            <DCRBar dcr={dcr} />
            <span style={{ fontSize: 10, color: C[status], width: 36, textAlign: 'right', flexShrink: 0 }}>{fmt(dcr, 2)}</span>
          </>
        )}
        <span style={{ fontSize: 10, color: C.dim, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '4px 10px 8px 28px', background: '#0a0e1a', fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
          {/* Natural-language reason */}
          {reason && (status === 'fail' || status === 'warn') && (
            <div style={{
              marginBottom: 7, padding: '5px 8px',
              background: status === 'fail' ? '#1f0a0a' : '#1f1200',
              borderLeft: `2px solid ${C[status]}`,
              color: status === 'fail' ? '#fca5a5' : '#fde68a',
              borderRadius: '0 4px 4px 0', fontSize: 10, lineHeight: 1.5,
            }}>
              {reason}
            </div>
          )}
          {clause && <div><b style={{ color: C.text }}>Clause:</b> {clause}</div>}
          {hasDC && (
            <>
              <div><b style={{ color: C.text }}>Demand:</b> {fmt(demand)} {unit}</div>
              <div><b style={{ color: C.text }}>Capacity:</b> {fmt(capacity)} {unit}</div>
            </>
          )}
          {dcr != null && <div><b style={{ color: C.text }}>DCR:</b> {isFinite(dcr) ? fmt(dcr, 3) : '∞'}</div>}
          {note && <div style={{ marginTop: 4, color: '#7a9fc0', fontStyle: 'italic' }}>{note}</div>}
        </div>
      )}
    </div>
  )
}

// ── Slab Case Picker ───────────────────────────────────────────
// Each case: [top, right, bottom, left] — true = continuous (fixed), false = discontinuous (free)
// Edges: top = short-span far edge, bottom = short-span near edge, left/right = long-span edges
const CASE_EDGES = {
  1: [true,  true,  true,  true ],   // all continuous
  2: [false, true,  true,  true ],   // one short discont
  3: [true,  false, true,  false],   // one long discont
  4: [false, false, true,  true ],   // two adjacent discont
  5: [false, true,  false, true ],   // two short discont
  6: [true,  false, true,  false],   // two long discont (same edges as 3 but different αx)
  7: [false, false, false, true ],   // three discont, one long cont
  8: [false, false, false, true ],   // three discont, one short cont (same pattern)
  9: [false, false, false, false],   // all discont
}

const CASE_LABELS = {
  1: 'Interior — all four edges continuous',
  2: 'One short edge discontinuous',
  3: 'One long edge discontinuous',
  4: 'Two adjacent edges discontinuous',
  5: 'Two short edges discontinuous',
  6: 'Two long edges discontinuous',
  7: 'Three edges discontinuous (one long edge continuous)',
  8: 'Three edges discontinuous (one short edge continuous)',
  9: 'All four edges discontinuous',
}

function SlabDiagram({ edges, size = 28, color = '#4a7090' }) {
  const [top, right, bottom, left] = edges
  const p = 4, w = size - p * 2, h = size - p * 2
  const edge = (x1, y1, x2, y2, cont) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={cont ? '#60a5fa' : color}
      strokeWidth={cont ? 2.5 : 1}
      strokeDasharray={cont ? 'none' : '3,2'}
      strokeLinecap="round" />
  )
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <rect x={p} y={p} width={w} height={h} fill="#0d1828" stroke="none" />
      {edge(p, p, p + w, p,     top)}
      {edge(p + w, p, p + w, p + h, right)}
      {edge(p, p + h, p + w, p + h, bottom)}
      {edge(p, p, p, p + h,   left)}
    </svg>
  )
}

function SlabCasePicker({ id, currentCase, onSelect, recommended }) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const t = setTimeout(() => document.addEventListener('mousedown', h), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h) }
  }, [open])

  const cur = currentCase ?? 9
  const curEdges = CASE_EDGES[cur] ?? CASE_EDGES[9]

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const dropW = 344  // 3 × 100px cols + gaps + padding
      const left = Math.min(r.left, window.innerWidth - dropW - 8)
      setDropPos({ top: r.bottom + 4, left: Math.max(8, left) })
    }
    setOpen(o => !o)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button ref={btnRef} onClick={handleOpen} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: '#1a2535', border: '1px solid #2a3550', borderRadius: 5,
        padding: '3px 8px 3px 5px', cursor: 'pointer', color: C.text,
      }}>
        <SlabDiagram edges={curEdges} size={22} />
        <span style={{ fontSize: 10 }}>Case {cur} — {CASE_LABELS[cur]}</span>
        <span style={{ fontSize: 9, color: C.dim }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 1000,
          background: '#0f1828', border: '1px solid #2a3550', borderRadius: 7,
          padding: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        }}>
          {recommended && (
            <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              ★ Case {recommended} recommended based on surrounding supports
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {Object.entries(CASE_EDGES).map(([n, edges]) => {
              const num = +n
              const isSelected = num === cur
              const isRec = num === recommended
              return (
                <button key={n} onClick={() => { onSelect(num); setOpen(false) }} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: isSelected ? '#1a2f50' : '#0d1828',
                  border: isSelected ? '1.5px solid #2563eb' : isRec ? '1.5px solid #f59e0b66' : '1px solid #1e2533',
                  borderRadius: 5, padding: '8px 6px 6px', cursor: 'pointer',
                  width: 100,
                }}>
                  <SlabDiagram edges={edges} size={38} color={isSelected ? '#4a90d9' : '#3a5070'} />
                  <span style={{ fontSize: 9, color: isSelected ? '#93c5fd' : '#6b8ab5', fontWeight: 700 }}>
                    {isRec && <span style={{ color: '#f59e0b' }}>★ </span>}Case {n}
                  </span>
                  <span style={{
                    fontSize: 8, color: isSelected ? '#4a7aaa' : '#3a5070',
                    textAlign: 'center', lineHeight: 1.4,
                    wordBreak: 'break-word', whiteSpace: 'normal',
                  }}>{CASE_LABELS[num]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ElementCard ────────────────────────────────────────────────
function ElementCard({ result, capacityInputs, setBeamTu, setBeamMuHogg, setSlabCase, setColLoad, selected, cardRef, slabs, beams, walls }) {
  const [open, setOpen] = useState(true)
  const [hoggAudit, setHoggAudit] = useState(false)
  const { type, id, label, wu_note, checks } = result

  // Auto-expand when selected from canvas
  useEffect(() => { if (selected) setOpen(true) }, [selected])

  const worst = checks.reduce((w, c) => {
    if (c.status === 'fail') return 'fail'
    if (c.status === 'warn' && w !== 'fail') return 'warn'
    return w
  }, 'pass')
  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length

  const borderColor = selected
    ? '#2563eb'
    : worst === 'fail' ? C.fail + '44' : worst === 'warn' ? C.warn + '33' : C.border

  return (
    <div ref={cardRef} style={{ marginBottom: 8, border: `2px solid ${borderColor}`, borderRadius: 6, overflow: 'hidden',
      boxShadow: selected ? '0 0 0 1px #2563eb55' : 'none', transition: 'border-color 0.2s, box-shadow 0.2s' }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
          background: selected ? '#0f1f3d' : '#111827', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, width: 36, flexShrink: 0 }}>{type}</span>
        <span style={{ fontWeight: 700, fontSize: 12, color: C.text, flex: 1 }}>{label}</span>
        {failCount > 0 && <span style={{ color: C.fail, fontSize: 10, fontWeight: 700 }}>{failCount} FAIL</span>}
        {warnCount > 0 && <span style={{ color: C.warn, fontSize: 10, fontWeight: 700 }}>{warnCount} WARN</span>}
        <StatusBadge status={worst} small />
        <span style={{ color: C.dim, fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <>
          {/* Context note */}
          <div style={{ padding: '4px 10px', background: '#0d1120', fontSize: 10, color: '#5a8fc0', borderBottom: `1px solid ${C.border}` }}>
            {wu_note}
          </div>

          {/* Per-element extra inputs */}
          {type === 'beam' && (
            <div style={{ padding: '5px 10px', background: '#0a0e1a', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: C.dim }}>Manual Tu (kN·m):</span>
                <input
                  type="number" min={0} step={0.5}
                  value={capacityInputs.beamTu[id] ?? 0}
                  onChange={e => setBeamTu(id, +e.target.value)}
                  style={numInput}
                />
                <span style={{ fontSize: 9, color: C.dim }}>(0 = auto)</span>
              </div>
              {(() => {
                const hoggChk  = checks.find(c => c.id === 'flex-hogg')
                const auditChk = checks.find(c => ['col-hogg-est', 'simply-supported', 'continuous', 'wall-hogg-est'].includes(c.id))
                const mu       = hoggChk?.demand
                const auditDesc = auditChk?.desc ?? 'wL²/12 — full fixed-end moment (wall / unknown support)'
                const auditNote = auditChk?.note ?? null
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: C.dim }}>Manual Mu_hogg (kN·m):</span>
                      <input
                        type="number" min={0} step={1}
                        value={(capacityInputs.beamMuHogg ?? {})[id] ?? 0}
                        onChange={e => setBeamMuHogg(id, +e.target.value)}
                        style={numInput}
                      />
                      {mu != null
                        ? <span style={{ fontSize: 9, color: '#5a8fc0' }}>computed: <b style={{ color: C.text }}>{mu.toFixed(1)}</b> kN·m</span>
                        : <span style={{ fontSize: 9, color: C.dim }}>(0 = stiffness estimate)</span>}
                    </div>
                    <div
                      onClick={() => setHoggAudit(v => !v)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ fontSize: 9, color: '#3b6ea8', marginTop: 1, flexShrink: 0 }}>{hoggAudit ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 9, color: '#3b6ea8', lineHeight: 1.4 }}>{auditDesc}</span>
                    </div>
                    {hoggAudit && auditNote && (
                      <div style={{ marginTop: 3, padding: '5px 8px', background: '#0d1828', borderRadius: 4, fontSize: 9, color: '#4a7aaa', lineHeight: 1.6 }}>
                        {auditNote}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {type === 'slab' && (() => {
            // Recommend case: count how many slab edges are backed by a beam or wall.
            // Edges are: top, right, bottom, left of the bounding box.
            const slab = slabs?.find(s => s.id === id)
            let recommended = null
            if (slab?.points?.length >= 3) {
              const pts = slab.points
              // "Continuous" in IS 456 Table 26 = an adjacent slab panel shares that edge.
              // A perimeter wall or beam alone is NOT continuous — the slab ends there.
              const SNAP = 400
              const edgeCont = pts.map((p1, i) => {
                const p2 = pts[(i + 1) % pts.length]
                if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1) return false
                const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
                for (const other of (slabs ?? [])) {
                  if (other.id === id || !other.points?.length) continue
                  const ops = other.points
                  for (let j = 0; j < ops.length; j++) {
                    const q1 = ops[j], q2 = ops[(j + 1) % ops.length]
                    const qlen = Math.hypot(q2.x - q1.x, q2.y - q1.y)
                    if (qlen < 1) continue
                    const ux = (q2.x - q1.x) / qlen, uy = (q2.y - q1.y) / qlen
                    const t = (mx - q1.x) * ux + (my - q1.y) * uy
                    if (t < -SNAP || t > qlen + SNAP) continue
                    const perp = Math.abs((mx - q1.x) * (-uy) + (my - q1.y) * ux)
                    if (perp < SNAP) return true
                  }
                }
                return false
              })
              const contCount = edgeCont.filter(Boolean).length
              if (contCount === 4) recommended = 1
              else if (contCount === 3) recommended = 7
              else if (contCount === 2) recommended = 4
              else if (contCount === 1) recommended = 8
              else recommended = 9
            }
            return (
              <div style={{ padding: '6px 10px', background: '#0a0e1a', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 5 }}>Support case (IS 456 Table 26):</div>
                <SlabCasePicker
                  id={id}
                  currentCase={capacityInputs.slabCase[id] ?? 9}
                  onSelect={n => setSlabCase(id, n)}
                  recommended={recommended}
                />
              </div>
            )
          })()}

          {type === 'column' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#0a0e1a', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.dim }}>Loads:</span>
              {[['Pu', 'kN'], ['Mux', 'kN·m'], ['Muy', 'kN·m']].map(([key, unit]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.dim }}>
                  {key}
                  <input
                    type="number" min={0} step={1}
                    value={capacityInputs[`col${key}`]?.[id] ?? 0}
                    onChange={e => setColLoad(id, { [key]: +e.target.value })}
                    style={numInput}
                  />
                  <span style={{ fontSize: 9 }}>{unit}</span>
                </label>
              ))}
            </div>
          )}

          {/* Check rows */}
          <div>
            {checks.map((c, i) => <CheckRow key={c.id ?? i} chk={c} />)}
          </div>
        </>
      )}
    </div>
  )
}

// ── Summary strip ──────────────────────────────────────────────
function Summary({ results }) {
  const all   = results.flatMap(r => r.checks)
  const fails = all.filter(c => c.status === 'fail').length
  const warns = all.filter(c => c.status === 'warn').length
  const pass  = all.filter(c => c.status === 'pass').length
  const total = fails + warns + pass

  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 10px', background: '#111827', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: C.dim, marginRight: 4 }}>Summary</span>
      {[
        { label: 'FAIL', count: fails, col: C.fail },
        { label: 'WARN', count: warns, col: C.warn },
        { label: 'PASS', count: pass,  col: C.pass },
      ].map(({ label, count, col }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: col, fontWeight: 700 }}>{count}</span>
          <span style={{ fontSize: 10, color: C.dim }}>{label}</span>
        </span>
      ))}
      <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto' }}>{total} checks</span>
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────
const FILTERS = ['all', 'slab', 'beam', 'column', 'wall']

// ── Main CapacityPanel ─────────────────────────────────────────
export default function CapacityPanel() {
  const {
    beams, slabs, columns, walls,
    wallHeightMm, loads,
    capacityInputs,
    setCapacityGrades, setBeamTu, setBeamMuHogg, setSlabCase, setColLoad,
    selectedId, selectedType,
  } = useStore()

  const [filter, setFilter] = useState('all')
  const scrollRef = useRef(null)
  const cardRefs  = useRef({})   // { [elementId]: domNode }

  const state = useMemo(() => ({ beams, slabs, columns, walls, wallHeightMm, loads }), [
    beams, slabs, columns, walls, wallHeightMm, loads,
  ])

  const results = useMemo(() => {
    try { return runCapacityChecks(state, capacityInputs) }
    catch (e) { console.error('capacity calc error', e); return [] }
  }, [state, capacityInputs])

  const filtered = filter === 'all' ? results : results.filter(r => r.type === filter)

  // When canvas selection changes → switch filter to show it + scroll to card
  useEffect(() => {
    if (!selectedId) return
    const match = results.find(r => r.id === selectedId)
    if (!match) return
    // Switch filter if the element isn't visible under current filter
    if (filter !== 'all' && filter !== match.type) setFilter('all')
    // Scroll after a tick (let filter re-render first)
    const t = setTimeout(() => {
      const node = cardRefs.current[selectedId]
      if (node && scrollRef.current) {
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 60)
    return () => clearTimeout(t)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = beams.length + slabs.length + columns.length + walls.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>

      {/* Grade & steel selector */}
      <div style={{ padding: '8px 10px', background: '#111827', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1 }}>Materials</span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.dim }}>
          fck
          <select value={capacityInputs.fck} onChange={e => setCapacityGrades(+e.target.value, capacityInputs.fy)} style={selStyle}>
            {[15, 20, 25, 30, 35, 40].map(v => <option key={v} value={v}>M{v}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.dim }}>
          fy
          <select value={capacityInputs.fy} onChange={e => setCapacityGrades(capacityInputs.fck, +e.target.value)} style={selStyle}>
            {[250, 415, 500, 550].map(v => <option key={v} value={v}>Fe{v}</option>)}
          </select>
        </label>

        <span style={{ fontSize: 9, color: '#2a4a6f', marginLeft: 'auto' }}>IS 456:2000</span>
      </div>

      {isEmpty ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 12, textAlign: 'center', padding: 24 }}>
          Draw columns, walls, beams, or slabs<br />to see capacity checks.
        </div>
      ) : (
        <>
          <Summary results={results} />

          {/* Filter bar */}
          <div style={{ display: 'flex', padding: '4px 8px', gap: 4, borderBottom: `1px solid ${C.border}`, background: '#0a0e1a', flexShrink: 0 }}>
            {FILTERS.map(f => {
              const count = f === 'all' ? results.length : results.filter(r => r.type === f).length
              return (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '3px 8px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10,
                  background: filter === f ? '#2563eb' : '#1e2533',
                  color:      filter === f ? '#fff'    : C.dim,
                  fontWeight: filter === f ? 700 : 400,
                }}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  {count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({count})</span>}
                </button>
              )
            })}
          </div>

          {/* Scrollable results */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: C.dim, fontSize: 11, textAlign: 'center', paddingTop: 24 }}>No {filter} elements.</div>
            ) : (
              filtered.map(r => (
                <ElementCard
                  key={r.id}
                  result={r}
                  capacityInputs={capacityInputs}
                  setBeamTu={setBeamTu}
                  setBeamMuHogg={setBeamMuHogg}
                  setSlabCase={setSlabCase}
                  setColLoad={setColLoad}
                  selected={r.id === selectedId}
                  cardRef={el => { cardRefs.current[r.id] = el }}
                  slabs={slabs}
                  beams={beams}
                  walls={walls}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
