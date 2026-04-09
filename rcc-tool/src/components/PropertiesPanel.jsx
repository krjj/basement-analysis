import React, { useState } from 'react'
import useStore from '../store/useStore'
import { BEAM_SCHEDULES, SLAB_SCHEDULES, COLORS, defaultBeamSteel, defaultSlabSteel } from '../utils/constants'
import { BeamSteelEditor, SlabSteelEditor, ColumnSteelEditor, WallSteelEditor } from './SteelEditor'
import SlabSection from './SlabSection'
import UnitInput, { UnitDisplay } from './UnitInput'
import { computeBeamTribWidth, computeBeamBfTee } from '../utils/capacity/index'

// ── Tiny helpers ──────────────────────────────────────────
const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom: 11 }}>
    <div style={{ fontSize: 10, color: '#6b7fa8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>
      {label}
      {hint && <span style={{ marginLeft: 6, color: '#2a3550', textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
    </div>
    {children}
  </div>
)

// Plain mm input — for dimensions that are always in mm (structural details)
const MmInput = ({ value, onChange, min = 0, max }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="number" value={value} min={min} max={max}
      onChange={e => onChange(+e.target.value)}
      style={{ flex: 1, background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
        color: '#e0e0e0', padding: '4px 8px', fontSize: 12, outline: 'none' }}
    />
    <span style={{ fontSize: 10, color: '#4a6fa5', minWidth: 20 }}>mm</span>
  </div>
)

const SelField = ({ value, onChange, options }) => (
  <select value={value} onChange={onChange}
    style={{ width: '100%', background: '#1e2533', border: '1px solid #2a3550',
      borderRadius: 4, color: '#e0e0e0', padding: '4px 8px', fontSize: 12, outline: 'none' }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

const PlainInput = ({ value, onChange, placeholder }) => (
  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: '100%', background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
      color: '#e0e0e0', padding: '4px 8px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
)

const TabBtn = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    flex: 1, padding: '6px 0', background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    color: active ? '#e0e0e0' : '#4a6fa5', fontSize: 10, cursor: 'pointer',
    textTransform: 'uppercase', letterSpacing: 1,
  }}>
    {label}
  </button>
)

const typeColor = { column: '#ffffff', wall: '#d0d0d0', beam: '#FFD700', slab: '#4a90d9' }

// ── Section sketches ──────────────────────────────────────────
function BeamSection({ width = 230, depth = 450, slabDepth = 230, bfTee = null }) {
  const W = 150, H = bfTee ? 125 : 105
  const scale = Math.min((W * 0.28) / width, (H * 0.6) / depth)
  const bw = Math.max(width * scale, 8)
  const bd = depth * scale
  const fd = Math.max(slabDepth * scale, 5)
  const fw = Math.min(bw * 3.4, W - 10)
  const cx = W / 2
  // If showing bf label, push everything down to leave room at top
  const topPad = bfTee ? 22 : 8
  const flangeY = topPad
  const webY = flangeY + fd

  return (
    <svg width={W} height={H} style={{ display: 'block', margin: '0 auto 8px' }}>
      {/* bf dimension line at top (when T-beam info available) */}
      {bfTee && (
        <>
          <line x1={cx - fw/2} y1={topPad - 10} x2={cx + fw/2} y2={topPad - 10}
            stroke="#3a80c0" strokeWidth={0.8} />
          <line x1={cx - fw/2} y1={topPad - 13} x2={cx - fw/2} y2={topPad - 7} stroke="#3a80c0" strokeWidth={0.8} />
          <line x1={cx + fw/2} y1={topPad - 13} x2={cx + fw/2} y2={topPad - 7} stroke="#3a80c0" strokeWidth={0.8} />
          <text x={cx} y={topPad - 14} textAnchor="middle" fontSize={6.5} fill="#5a9ad0" fontWeight="600">
            bf = {bfTee.toLocaleString()} mm  (IS 456 Cl. 23.1.2)
          </text>
        </>
      )}

      {/* Slab flange */}
      <rect x={cx - fw/2} y={flangeY} width={fw} height={fd}
        fill="#1e3a5a" stroke="#4a90d9" strokeWidth={0.8} opacity={0.8} />
      {/* "continues" indicators at flange edges */}
      <text x={cx - fw/2 - 4} y={flangeY + fd/2 + 3} textAnchor="end" fontSize={9} fill="#4a6fa5">···</text>
      <text x={cx + fw/2 + 4} y={flangeY + fd/2 + 3} textAnchor="start" fontSize={9} fill="#4a6fa5">···</text>

      {/* Beam web */}
      <rect x={cx - bw/2} y={webY} width={bw} height={bd}
        fill="#8a7030" stroke="#FFD700" strokeWidth={1} opacity={0.9} />

      {/* Df dimension — left of flange */}
      <line x1={cx - fw/2 - 6} y1={flangeY} x2={cx - fw/2 - 6} y2={webY}
        stroke="#4a90d9" strokeWidth={0.7} />
      <text x={cx - fw/2 - 8} y={flangeY + fd/2 + 3} textAnchor="end" fontSize={6} fill="#4a90d9">{slabDepth}</text>

      {/* bw dimension below web */}
      <line x1={cx - bw/2} y1={webY + bd + 6} x2={cx + bw/2} y2={webY + bd + 6} stroke="#4a6fa5" strokeWidth={0.8} />
      <text x={cx} y={webY + bd + 15} textAnchor="middle" fontSize={7} fill="#6b8ab5">{width}</text>

      {/* D (total depth) dimension — right side */}
      <line x1={cx + bw/2 + 6} y1={flangeY} x2={cx + bw/2 + 6} y2={webY + bd}
        stroke="#4a6fa5" strokeWidth={0.7} />
      <text x={cx + bw/2 + 15} y={flangeY + (fd + bd)/2 + 3} textAnchor="middle" fontSize={7} fill="#6b8ab5">{depth}</text>
    </svg>
  )
}

function ColumnSection({ width = 230, depth = 230 }) {
  const maxSz = 100
  const scale = Math.min(maxSz / width, maxSz / depth, 0.4)
  const w = width * scale, d = depth * scale
  const ox = (maxSz - w) / 2 + 10, oy = (maxSz - d) / 2
  return (
    <svg width={maxSz + 30} height={maxSz + 20} style={{ display: 'block', margin: '0 auto 10px' }}>
      <rect x={ox} y={oy} width={w} height={d} fill="#3a3a4a" stroke="#aaaacc" strokeWidth={1.2} />
      {/* rebars corners */}
      {[[ox+6,oy+6],[ox+w-6,oy+6],[ox+6,oy+d-6],[ox+w-6,oy+d-6]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="#FFD700" />
      ))}
      {/* dim width */}
      <line x1={ox} y1={oy + d + 8} x2={ox + w} y2={oy + d + 8} stroke="#4a6fa5" strokeWidth={0.8} />
      <text x={ox + w/2} y={oy + d + 16} textAnchor="middle" fontSize={7} fill="#6b8ab5">{width}</text>
      {/* dim depth */}
      <line x1={ox + w + 8} y1={oy} x2={ox + w + 8} y2={oy + d} stroke="#4a6fa5" strokeWidth={0.8} />
      <text x={ox + w + 18} y={oy + d/2 + 3} textAnchor="middle" fontSize={7} fill="#6b8ab5">{depth}</text>
    </svg>
  )
}

function WallSection({ thickness = 230 }) {
  const W = 160, H = 110
  const t = Math.min(Math.max(thickness * 0.18, 18), 60)
  const h = 70
  const ox = (W - t) / 2, oy = 8
  // diagonal hatch lines
  const hatchLines = []
  for (let i = -h; i < t + h; i += 8) {
    const x1 = ox + Math.max(0, i), y1 = oy + Math.max(0, -i)
    const x2 = ox + Math.min(t, i + h), y2 = oy + Math.min(h, h - i)
    if (x2 > x1) hatchLines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3a5570" strokeWidth={0.6} />)
  }
  // ground line
  const gy = oy + h
  return (
    <svg width={W} height={H} style={{ display: 'block', margin: '0 auto 10px' }}>
      {/* ground fill */}
      <rect x={0} y={gy} width={W} height={H - gy} fill="#1a2530" />
      <line x1={0} y1={gy} x2={W} y2={gy} stroke="#3a5060" strokeWidth={1} />
      {/* wall body */}
      <rect x={ox} y={oy} width={t} height={h} fill="#2a3a4a" stroke="#7090b0" strokeWidth={1.2} />
      {/* hatch */}
      <clipPath id="wclip"><rect x={ox} y={oy} width={t} height={h} /></clipPath>
      <g clipPath="url(#wclip)">{hatchLines}</g>
      {/* rebar dots — two rows */}
      {[oy + 10, oy + h - 10].map((ry, ri) => (
        [ox + 6, ox + t - 6].map((rx, ci) => (
          <circle key={`${ri}-${ci}`} cx={rx} cy={ry} r={2.5} fill="#FFD700" stroke="#0d1120" strokeWidth={0.5} />
        ))
      ))}
      {/* dimension arrow */}
      <line x1={ox} y1={gy + 12} x2={ox + t} y2={gy + 12} stroke="#4a6fa5" strokeWidth={0.8}
        markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text x={ox + t/2} y={gy + 22} textAnchor="middle" fontSize={8} fill="#7090b0" fontWeight="600">
        {thickness} mm
      </text>
      {/* side label */}
      <text x={ox - 6} y={oy + h/2 + 3} textAnchor="end" fontSize={7} fill="#3a5570">wall</text>
    </svg>
  )
}

function SlabSection2D({ thickness = 150 }) {
  const W = 160, H = 82
  const t = Math.min(Math.max(thickness * 0.18, 16), 40), w = 130
  const ox = (W - w) / 2, oy = 8
  return (
    <svg width={W} height={H} style={{ display: 'block', margin: '0 auto 10px' }}>
      {/* slab body */}
      <rect x={ox} y={oy} width={w} height={t} fill="#1e3050" stroke="#4a90d9" strokeWidth={1.2} />
      {/* top surface hatching */}
      {[0.2, 0.5, 0.8].map(f => (
        <line key={f} x1={ox} y1={oy + t * f} x2={ox + w} y2={oy + t * f}
          stroke="#2a4565" strokeWidth={0.5} />
      ))}
      {/* bottom rebar (main) */}
      {[0.2, 0.35, 0.5, 0.65, 0.8].map(f => (
        <circle key={f} cx={ox + w * f} cy={oy + t - 7} r={2.5} fill="#FFD700" stroke="#0d1120" strokeWidth={0.5} />
      ))}
      {/* top rebar (dist) */}
      {[0.25, 0.5, 0.75].map(f => (
        <circle key={f} cx={ox + w * f} cy={oy + 7} r={2} fill="#a0c0ff" stroke="#0d1120" strokeWidth={0.5} />
      ))}
      {/* dim */}
      <line x1={ox + w + 8} y1={oy} x2={ox + w + 8} y2={oy + t} stroke="#4a6fa5" strokeWidth={0.8} />
      <text x={ox + w + 18} y={oy + t / 2 + 3} textAnchor="middle" fontSize={8} fill="#7090b0" fontWeight="600">{thickness}</text>
      <text x={W / 2} y={oy + t + 18} textAnchor="middle" fontSize={7} fill="#4a6fa5">{thickness} mm thick</text>
    </svg>
  )
}

/** Extend wall end point so total length = newLenMm, keeping same bearing */
function wallEndForLength(wall, newLenMm) {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const curr = Math.sqrt(dx * dx + dy * dy)
  if (curr < 1) return wall.end
  const s = newLenMm / curr
  return { x: Math.round(wall.start.x + dx * s), y: Math.round(wall.start.y + dy * s) }
}

export default function PropertiesPanel() {
  const {
    selectedId, selectedType,
    columns, walls, beams, slabs,
    updateElement, updateSteel,
  } = useStore()
  const [subTab, setSubTab] = useState('props')

  // ── Nothing selected ──────────────────────────────────
  if (!selectedId) return (
    <div style={{ padding: 16 }}>
      <p style={{ color: '#4a6fa5', fontSize: 12, lineHeight: 1.7 }}>Click an element to edit.</p>
      <div style={{ marginTop: 16, color: '#2a3a50', fontSize: 11, lineHeight: 2.2 }}>
        <div>↖ V — Select</div>
        <div>✋ H — Pan</div>
        <div>▪ C — Column</div>
        <div>▬ W — Wall (chain, dbl-click end)</div>
        <div>╌ B — Beam</div>
        <div>▨ A — Slab polygon</div>
        <div style={{ marginTop: 8, color: '#1e2a3a' }}>
          Ctrl+Z undo · Del delete · Esc cancel<br />
          D — toggle dim labels · 3 — 3D view<br />
          <br />
          Length inputs accept the selected unit<br />
          (top of panel). ft-in: type 18-6.25
        </div>
      </div>
    </div>
  )

  const elMap = { column: columns, wall: walls, beam: beams, slab: slabs }
  const el = elMap[selectedType]?.find(e => e.id === selectedId)
  if (!el) return null

  const upd  = (patch) => updateElement(selectedType, selectedId, patch)
  const updS = (patch) => updateSteel(selectedType, selectedId, patch)

  // ── Render ────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Type + mark header */}
      <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: 1, color: typeColor[selectedType] }}>
          {selectedType}
        </span>
        {selectedType === 'beam' && (
          <span style={{ padding: '1px 8px', borderRadius: 4,
            background: (COLORS[el.mark] || COLORS.CUSTOM) + '22',
            color: COLORS[el.mark] || COLORS.CUSTOM, fontSize: 10 }}>
            {el.mark}
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e2533', margin: '6px 0 0' }}>
        <TabBtn label="Props"   active={subTab === 'props'}   onClick={() => setSubTab('props')} />
        <TabBtn label="Reinforcement" active={subTab === 'steel'} onClick={() => setSubTab('steel')} />
        {selectedType === 'slab' && (
          <TabBtn label="Section" active={subTab === 'section'} onClick={() => setSubTab('section')} />
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

        {/* ══ PROPERTIES ══ */}
        {subTab === 'props' && (
          <>
            {/* ── COLUMN ── */}
            {selectedType === 'column' && (
              <>
                <ColumnSection width={el.width} depth={el.depth} />
                <Field label="Mark">
                  <PlainInput value={el.mark} onChange={v => upd({ mark: v })} placeholder="C1" />
                </Field>
                <Field label="Width" hint="(beam direction)">
                  <UnitInput valueMm={el.width} onChange={v => upd({ width: v })} min={100} max={3000} />
                </Field>
                <Field label="Depth" hint="(perp. to beam)">
                  <UnitInput valueMm={el.depth} onChange={v => upd({ depth: v })} min={100} max={3000} />
                </Field>
                <Field label="Position X">
                  <UnitInput valueMm={el.x} onChange={v => upd({ x: v })} min={-100000} max={100000} />
                </Field>
                <Field label="Position Y">
                  <UnitInput valueMm={el.y} onChange={v => upd({ y: v })} min={-100000} max={100000} />
                </Field>
              </>
            )}

            {/* ── WALL ── */}
            {selectedType === 'wall' && (
              <>
                <WallSection thickness={el.thickness} />
                <Field label="Length" hint="(edits end point)">
                  <UnitInput
                    valueMm={el.length}
                    onChange={v => {
                      const newEnd = wallEndForLength(el, v)
                      upd({ length: v, end: newEnd })
                    }}
                    min={100} max={100000}
                  />
                </Field>
                <Field label="Thickness">
                  <UnitInput valueMm={el.thickness} onChange={v => upd({ thickness: v })} min={100} max={1000} />
                </Field>
                <Field label="Start X">
                  <UnitInput valueMm={el.start.x} onChange={v => {
                    const s = { ...el.start, x: v }
                    const dx = el.end.x - el.start.x, dy = el.end.y - el.start.y
                    upd({ start: s, length: Math.round(Math.sqrt(dx*dx+dy*dy)) })
                  }} min={-100000} max={100000} />
                </Field>
                <Field label="Start Y">
                  <UnitInput valueMm={el.start.y} onChange={v => {
                    const s = { ...el.start, y: v }
                    const dx = el.end.x - el.start.x, dy = el.end.y - el.start.y
                    upd({ start: s, length: Math.round(Math.sqrt(dx*dx+dy*dy)) })
                  }} min={-100000} max={100000} />
                </Field>
                <Field label="End X">
                  <UnitInput valueMm={el.end.x} onChange={v => {
                    const e2 = { ...el.end, x: v }
                    const dx = v - el.start.x, dy = el.end.y - el.start.y
                    upd({ end: e2, length: Math.round(Math.sqrt(dx*dx+dy*dy)) })
                  }} min={-100000} max={100000} />
                </Field>
                <Field label="End Y">
                  <UnitInput valueMm={el.end.y} onChange={v => {
                    const e2 = { ...el.end, y: v }
                    const dx = el.end.x - el.start.x, dy = v - el.start.y
                    upd({ end: e2, length: Math.round(Math.sqrt(dx*dx+dy*dy)) })
                  }} min={-100000} max={100000} />
                </Field>
                <div style={{ background: '#0d1320', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: '#6b7fa8', lineHeight: 1.8 }}>
                  <div>Angle: {(Math.atan2(el.end.y - el.start.y, el.end.x - el.start.x) * 180 / Math.PI).toFixed(1)}°</div>
                </div>
              </>
            )}

            {/* ── BEAM ── */}
            {selectedType === 'beam' && (
              <>
                {(() => {
                  const bfInfo = computeBeamBfTee(el, slabs)
                  return <BeamSection width={el.width} depth={el.depth}
                    slabDepth={bfInfo?.Df_mm ?? el.steel?.depth ?? 230}
                    bfTee={bfInfo?.bf_mm ?? null} />
                })()}
                <Field label="Label" hint="(shown on plan)">
                  <PlainInput value={el.label || el.mark}
                    onChange={v => upd({ label: v })}
                    placeholder="e.g. B1, RB-1, Lintel-A" />
                </Field>

                <Field label="Steel schedule" hint="(sets default steel)">
                  <SelField value={el.mark}
                    onChange={e => {
                      upd({ mark: e.target.value,
                        width: BEAM_SCHEDULES[e.target.value]?.width || 230,
                        depth: BEAM_SCHEDULES[e.target.value]?.depth || 450 })
                      updS(defaultBeamSteel(e.target.value))
                    }}
                    options={Object.keys(BEAM_SCHEDULES).map(k => ({ value: k, label: BEAM_SCHEDULES[k].label }))}
                  />
                </Field>

                <Field label="Length" hint="(structural calc span)">
                  <UnitInput valueMm={el.length} onChange={v => upd({ length: v })} min={100} />
                </Field>

                <Field label="Width (bw)">
                  <UnitInput valueMm={el.width} onChange={v => upd({ width: v })} min={100} max={1000} />
                </Field>

                <Field label="Depth (D)">
                  <UnitInput valueMm={el.depth} onChange={v => upd({ depth: v })} min={150} max={1500} />
                </Field>

                <Field label="Elevation" hint="(bottom of beam from floor)">
                  <UnitInput valueMm={el.elevation || 0} onChange={v => upd({ elevation: v })} min={0} max={10000} />
                </Field>

                {/* Derived */}
                {(() => {
                  const { tribW_mm, adjCount } = el.start && el.end
                    ? computeBeamTribWidth(el, slabs)
                    : { tribW_mm: el.length / 3, adjCount: 0 }
                  const tribArea_m2 = (tribW_mm / 1000) * (el.length / 1000)
                  const bfInfo = computeBeamBfTee(el, slabs)
                  return (
                    <div style={{ background: '#0d1320', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#6b7fa8', lineHeight: 1.8 }}>
                      <div>Size: {el.width} × {el.depth} mm</div>
                      <div>Top of beam: <UnitDisplay valueMm={(el.elevation || 0) + el.depth} /></div>
                      <div>Start support: {el.steel?.startSupport?.type || 'wall'}</div>
                      <div>End support: {el.steel?.endSupport?.type || 'wall'}</div>
                      {bfInfo && (
                        <div style={{ marginTop: 4, borderTop: '1px solid #1e2533', paddingTop: 4 }}>
                          <span style={{ color: '#4a90d9', fontWeight: 600 }}>T-beam</span>
                          {' — '}bf = <span style={{ color: '#5ab0f0' }}>{bfInfo.bf_mm.toLocaleString()} mm</span>
                          {', '}Df = <span style={{ color: '#5ab0f0' }}>{bfInfo.Df_mm} mm</span>
                          <span style={{ color: '#2a4060', marginLeft: 4 }}>Cl. 23.1.2</span>
                        </div>
                      )}
                      <div style={{ marginTop: bfInfo ? 0 : 4, borderTop: bfInfo ? 'none' : '1px solid #1e2533', paddingTop: bfInfo ? 0 : 4 }}>
                        Trib. width: <span style={{ color: '#88aaff' }}>{(tribW_mm / 1000).toFixed(2)} m</span>
                        {adjCount > 0 ? ` (${adjCount} slab${adjCount > 1 ? 's' : ''})` : ' (L/3 fallback)'}
                      </div>
                      <div>
                        Trib. area: <span style={{ color: '#88aaff' }}>{tribArea_m2.toFixed(2)} m²</span>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            {/* ── SLAB ── */}
            {selectedType === 'slab' && (
              <>
                <SlabSection2D thickness={el.steel?.depth ?? SLAB_SCHEDULES[el.mark]?.depth ?? 150} />
                <Field label="Slab mark">
                  <SelField value={el.mark}
                    onChange={e => {
                      upd({ mark: e.target.value })
                      updS(defaultSlabSteel(e.target.value))
                    }}
                    options={Object.keys(SLAB_SCHEDULES).map(k => ({
                      value: k, label: `${k} — ${SLAB_SCHEDULES[k].description}`
                    }))}
                  />
                </Field>

                <Field label="Short span" hint="(auto from polygon; edit to override)">
                  <UnitInput valueMm={el.shortSpan} onChange={v => upd({ shortSpan: v })} min={300} max={20000} />
                </Field>
                <Field label="Long span" hint="(auto from polygon; edit to override)">
                  <UnitInput valueMm={el.longSpan} onChange={v => upd({ longSpan: v })} min={300} max={20000} />
                </Field>

                <Field label="Elevation (top of slab)" hint="0 = floor level">
                  <UnitInput valueMm={el.elevation || 0} onChange={v => upd({ elevation: v })} min={-5000} max={20000} />
                </Field>

                <div style={{ background: '#0d1320', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#6b7fa8', lineHeight: 1.8 }}>
                  <div>{SLAB_SCHEDULES[el.mark]?.description}</div>
                  <div>Thickness: {el.steel?.depth || SLAB_SCHEDULES[el.mark]?.depth} mm</div>
                  <div>Type: {SLAB_SCHEDULES[el.mark]?.type}</div>
                  {(el.elevation || 0) !== 0 && (
                    <div style={{ color: '#88aaff' }}>↑ Raised <UnitDisplay valueMm={el.elevation} /></div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ══ STEEL ══ */}
        {subTab === 'steel' && (
          <>
            {selectedType === 'beam'   && <BeamSteelEditor   steel={el.steel} width={el.width} depth={el.depth} onUpdate={updS} />}
            {selectedType === 'slab'   && <SlabSteelEditor   steel={el.steel} onUpdate={updS} />}
            {selectedType === 'column' && <ColumnSteelEditor steel={el.steel} onUpdate={updS} />}
            {selectedType === 'wall'   && <WallSteelEditor   steel={el.steel} onUpdate={updS} />}
          </>
        )}

        {/* ══ SECTION (slab only) ══ */}
        {subTab === 'section' && selectedType === 'slab' && (
          <SlabSection slab={el} />
        )}
      </div>
    </div>
  )
}
