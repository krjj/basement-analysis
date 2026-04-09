import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import UnitInput from './UnitInput'
import { toMM } from '../utils/units'

// ── Primitives ────────────────────────────────────────────
const lbl = { fontSize: 10, color: '#6b7fa8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }
const Lbl = ({ children }) => <div style={lbl}>{children}</div>
const Row = ({ children }) => <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>{children}</div>
const Unit = ({ children }) => <span style={{ fontSize: 10, color: '#6b7fa8', flexShrink: 0 }}>{children}</span>

const Sep = ({ title, color = '#f0c060' }) => (
  <div style={{
    fontSize: 9, color, textTransform: 'uppercase', letterSpacing: 1,
    borderBottom: `1px solid #2a3550`, paddingBottom: 4, marginBottom: 8, marginTop: 14,
  }}>{title}</div>
)

const KV = ({ label, value, accent, sub }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: sub ? 2 : 5, fontSize: sub ? 10 : 11 }}>
    <span style={{ color: sub ? '#4a6080' : '#9aadcc' }}>{label}</span>
    <span style={{ color: accent || (sub ? '#6b8ab5' : '#e0e0e0'), fontFamily: 'monospace', fontWeight: accent ? 600 : 400 }}>{value}</span>
  </div>
)

const Num = ({ value, onChange, min = 0, max, step = 0.5 }) => (
  <input type="number" value={value} min={min} max={max} step={step}
    onChange={e => onChange(parseFloat(e.target.value) || 0)}
    style={{
      width: 70, background: '#1e2533', border: '1px solid #2a3550',
      borderRadius: 4, color: '#e0e0e0', padding: '3px 6px', fontSize: 12, outline: 'none',
    }} />
)

function RadioGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
      {options.map(o => (
        <label key={o.value} style={{
          display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          fontSize: 11, color: value === o.value ? '#60a5fa' : '#9aadcc',
          background: value === o.value ? '#1a2845' : 'transparent',
          border: `1px solid ${value === o.value ? '#2563eb' : '#2a3550'}`,
          borderRadius: 5, padding: '3px 10px',
        }}>
          <input type="radio" value={o.value} checked={value === o.value}
            onChange={() => onChange(o.value)} style={{ accentColor: '#2563eb', width: 12, height: 12 }} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

// ── Cross-section diagram ─────────────────────────────────
function CrossSection({ soilDepthMm, slabDepthMm, wallHMm, wallThkMm, lateralP, soilLoad, liveLoad, raftThicknessMm = 300, wallTopPropped = false }) {
  const W = 240

  // Fixed pixel heights — labels make dimensions readable regardless of scale
  const soilH   = Math.max(18, Math.min(36, soilDepthMm / 40))
  const topSlabH = Math.max(10, Math.min(18, slabDepthMm / 20))
  const wallH   = 100
  const raftH   = Math.max(16, Math.min(36, raftThicknessMm / 16))  // always visible
  const pccH    = 7
  const groundH = 18

  const wallX  = 44
  const wallW  = 16
  const roomW  = 120
  const rightX = wallX + wallW + roomW
  const totalW = wallW + roomW + wallW

  // Y positions from top
  const soilTop    = 8
  const topSlabTop = soilTop + soilH
  const wallTop    = topSlabTop + topSlabH
  const raftTop    = wallTop + wallH
  const pccTop     = raftTop + raftH
  const groundTop  = pccTop + pccH
  const SVG_H      = groundTop + groundH + 8  // tight fit, 8px bottom padding

  // Lateral pressure (triangular over full wall height)
  const latW = Math.round(Math.min(38, lateralP / 1.2))

  const fmt1 = n => n.toFixed(1)

  // Soil hatch lines
  const soilHatch = Array.from({ length: Math.ceil(totalW / 7) }, (_, i) => ({
    x1: wallX + i * 7, y1: soilTop,
    x2: wallX + i * 7 - soilH, y2: soilTop + soilH,
  }))
  // Ground hatch
  const gndHatch = Array.from({ length: Math.ceil((totalW + 20) / 7) }, (_, i) => ({
    x1: wallX - 10 + i * 7, y1: groundTop,
    x2: wallX - 10 + i * 7 - groundH * 0.7, y2: groundTop + groundH,
  }))

  return (
    <svg viewBox={`0 0 ${W} ${SVG_H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <marker id="arr-dn" markerWidth="5" markerHeight="5" refX="2.5" refY="5" orient="auto">
          <path d="M0,0 L5,0 L2.5,5 Z" fill="#f0c060" />
        </marker>
        <marker id="arr-rt" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="#60a5fa" />
        </marker>
        <marker id="arr-rt-grn" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="#86efac" />
        </marker>
      </defs>

      {/* ── Soil backfill ── */}
      <rect x={wallX} y={soilTop} width={totalW} height={soilH}
        fill="#6b4c2a" fillOpacity={0.5} stroke="#8b6340" strokeWidth={0.5} />
      {soilHatch.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="#8b6340" strokeWidth={0.5} strokeOpacity={0.4} />
      ))}
      <text x={wallX + totalW / 2} y={soilTop + soilH / 2 + 3}
        textAnchor="middle" fontSize={8} fill="#c8a060">
        Soil {(soilDepthMm / 1000).toFixed(2)}m
      </text>

      {/* ── Top slab (roof) — thicker stroke if propped ── */}
      <rect x={wallX} y={topSlabTop} width={totalW} height={topSlabH}
        fill="#2a5a7a" fillOpacity={0.85} stroke={wallTopPropped ? '#86efac' : '#5a8aaa'} strokeWidth={wallTopPropped ? 1.5 : 1} />
      <text x={wallX + totalW / 2} y={topSlabTop + topSlabH / 2 + 3}
        textAnchor="middle" fontSize={7} fill="#a0d0f0">
        Roof slab {slabDepthMm}mm{wallTopPropped ? ' ←R' : ''}
      </text>

      {/* ── Walls ── */}
      <rect x={wallX} y={wallTop} width={wallW} height={wallH}
        fill="#3a4a5a" stroke="#5a7090" strokeWidth={1} />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={wallX} y1={wallTop + i * wallH / 5}
          x2={wallX + wallW} y2={wallTop + (i + 1) * wallH / 5}
          stroke="#5a7090" strokeWidth={0.5} strokeOpacity={0.5} />
      ))}
      <rect x={rightX} y={wallTop} width={wallW} height={wallH}
        fill="#3a4a5a" stroke="#5a7090" strokeWidth={1} />
      {/* room interior */}
      <rect x={wallX + wallW} y={wallTop} width={roomW} height={wallH}
        fill="#070e1a" />
      {/* room label */}
      <text x={wallX + wallW + roomW / 2} y={wallTop + wallH / 2 + 3}
        textAnchor="middle" fontSize={8} fill="#2a3550">interior</text>

      {/* ── Raft slab ── */}
      <rect x={wallX} y={raftTop} width={totalW} height={raftH}
        fill="#1e3a5a" fillOpacity={0.9} stroke="#4a90d9" strokeWidth={1.2} />
      {/* raft hatch lines */}
      {Array.from({ length: Math.ceil(totalW / 10) }, (_, i) => (
        <line key={i} x1={wallX + i * 10} y1={raftTop + 2} x2={wallX + i * 10 + raftH * 0.6} y2={raftTop + raftH - 2}
          stroke="#4a90d9" strokeWidth={0.4} strokeOpacity={0.4} />
      ))}
      <text x={wallX + totalW / 2} y={raftTop + raftH / 2 + 3}
        textAnchor="middle" fontSize={8} fill="#7ab8e8" fontWeight="600">
        Raft {raftThicknessMm}mm
      </text>

      {/* ── PCC lean concrete ── */}
      <rect x={wallX} y={pccTop} width={totalW} height={pccH}
        fill="#2a3530" stroke="#3a5040" strokeWidth={0.5} />
      <text x={wallX + totalW / 2} y={pccTop + pccH - 1}
        textAnchor="middle" fontSize={6} fill="#4a6050">PCC 100mm</text>

      {/* ── Ground (earth) ── */}
      <rect x={wallX - 10} y={groundTop} width={totalW + 20} height={groundH}
        fill="#1a2518" />
      {gndHatch.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="#3a5030" strokeWidth={0.8} />
      ))}
      <text x={wallX + totalW / 2} y={groundTop + groundH - 3}
        textAnchor="middle" fontSize={7} fill="#4a6040">firm ground</text>

      {/* ── GL dashed line ── */}
      <line x1={2} y1={topSlabTop} x2={wallX - 2} y2={topSlabTop}
        stroke="#4a6fa5" strokeWidth={0.8} strokeDasharray="3,2" />
      <text x={1} y={topSlabTop + 3} fontSize={7} fill="#4a6fa5">GL</text>

      {/* ── Downward load arrows ── */}
      {[0.2, 0.5, 0.8].map((f, i) => {
        const ax = wallX + wallW + f * roomW
        return (
          <line key={i} x1={ax} y1={soilTop} x2={ax} y2={topSlabTop + topSlabH - 2}
            stroke="#f0c060" strokeWidth={1.5} markerEnd="url(#arr-dn)" />
        )
      })}

      {/* ── Lateral pressure (triangular, left wall) ── */}
      <polygon
        points={`${wallX - 2},${wallTop} ${wallX - 2 - latW},${raftTop} ${wallX - 2},${raftTop}`}
        fill="#2563eb" fillOpacity={0.3} stroke="#3b82f6" strokeWidth={0.8} />
      {[0.35, 0.65, 0.9].map((f, i) => {
        const ay = wallTop + f * wallH
        const aw = latW * f
        return (
          <line key={i} x1={wallX - 2 - aw} y1={ay} x2={wallX - 1} y2={ay}
            stroke="#60a5fa" strokeWidth={1} markerEnd="url(#arr-rt)" />
        )
      })}

      {/* ── Propped reaction arrow at top (green horizontal) ── */}
      {wallTopPropped && (
        <>
          <line x1={wallX - 18} y1={wallTop + 4} x2={wallX - 2} y2={wallTop + 4}
            stroke="#86efac" strokeWidth={1.5} markerEnd="url(#arr-rt-grn)" />
          <text x={wallX - 20} y={wallTop + 3} textAnchor="end" fontSize={6.5} fill="#86efac">R↑</text>
        </>
      )}

      {/* ── Right side dimensions ── */}
      {/* Wall height */}
      <line x1={rightX + wallW + 6} y1={wallTop} x2={rightX + wallW + 6} y2={raftTop}
        stroke="#2a3550" strokeWidth={0.8} />
      <line x1={rightX + wallW + 3} y1={wallTop} x2={rightX + wallW + 9} y2={wallTop} stroke="#2a3550" strokeWidth={0.8} />
      <line x1={rightX + wallW + 3} y1={raftTop} x2={rightX + wallW + 9} y2={raftTop} stroke="#2a3550" strokeWidth={0.8} />
      <text x={rightX + wallW + 10} y={(wallTop + raftTop) / 2 + 3}
        fontSize={8} fill="#6b7fa8">{(wallHMm / 1000).toFixed(1)}m</text>

      {/* Raft thickness dim */}
      <line x1={rightX + wallW + 6} y1={raftTop} x2={rightX + wallW + 6} y2={pccTop}
        stroke="#2a5070" strokeWidth={0.8} />
      <text x={rightX + wallW + 10} y={raftTop + raftH / 2 + 3}
        fontSize={7} fill="#4a90d9">{raftThicknessMm}mm</text>

      {/* Load labels */}
      <text x={rightX + wallW + 2} y={soilTop + 9}
        fontSize={7.5} fill="#c8a060">{fmt1(soilLoad)} kN/m²</text>
      <text x={rightX + wallW + 2} y={soilTop + 18}
        fontSize={7} fill="#f0c060">+{fmt1(liveLoad)} LL</text>
      <text x={wallX - 4 - latW} y={raftTop + 10}
        fontSize={7.5} fill="#93c5fd" textAnchor="middle">{fmt1(lateralP)}</text>
      <text x={wallX - 4 - latW} y={raftTop + 18}
        fontSize={6.5} fill="#4a6fa5" textAnchor="middle">kN/m²</text>
    </svg>
  )
}

// ── Lateral pressure diagram ──────────────────────────────
function PressureDiagram({ H_mm, sigma_top, sigma_bot, u_bot }) {
  const W = 200, H = 120
  const pad = { l: 12, r: 76, t: 8, b: 20 }
  const chartH = H - pad.t - pad.b
  const chartW = W - pad.l - pad.r
  const maxP   = Math.max(sigma_bot + u_bot, 0.1)
  const scaleX = chartW / maxP
  const x0 = pad.l, y0 = pad.t, yBot = pad.t + chartH

  const xSigTop = pad.l + sigma_top * scaleX
  const xSigBot = pad.l + sigma_bot * scaleX
  const xTotBot = pad.l + (sigma_bot + u_bot) * scaleX

  const fmt1 = n => n.toFixed(1)

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={x0} y1={y0} x2={x0} y2={yBot + 4} stroke="#2a3550" strokeWidth={1} />
      <line x1={x0} y1={yBot} x2={W - 6} y2={yBot} stroke="#2a3550" strokeWidth={1} />

      <polygon points={`${x0},${y0} ${xSigTop},${y0} ${xSigBot},${yBot} ${x0},${yBot}`}
        fill="#2563eb" fillOpacity={0.35} stroke="#3b82f6" strokeWidth={1} />

      {u_bot > 0 && (
        <polygon points={`${xSigBot},${yBot} ${xTotBot},${yBot} ${x0},${yBot}`}
          fill="#06b6d4" fillOpacity={0.35} stroke="#06b6d4" strokeWidth={1} />
      )}

      <text x={x0 - 4} y={y0 + 4} fontSize={7} fill="#6b7fa8" textAnchor="end">0</text>
      <text x={x0 - 4} y={yBot + 3} fontSize={7} fill="#6b7fa8" textAnchor="end">{(H_mm / 1000).toFixed(1)}m</text>
      {sigma_top > 0 && <text x={xSigTop + 2} y={y0 + 9} fontSize={8} fill="#93c5fd">{fmt1(sigma_top)}</text>}
      <text x={xSigBot + 2} y={yBot - 3} fontSize={8} fill="#93c5fd">{fmt1(sigma_bot)}</text>
      {u_bot > 0 && <text x={xTotBot + 2} y={yBot - 3} fontSize={8} fill="#67e8f9">{fmt1(sigma_bot + u_bot)}</text>}

      <rect x={W - pad.r + 4} y={10} width={8} height={7} fill="#2563eb" fillOpacity={0.5} />
      <text x={W - pad.r + 15} y={17} fontSize={8} fill="#9aadcc">Lateral σh</text>
      {u_bot > 0 && <>
        <rect x={W - pad.r + 4} y={22} width={8} height={7} fill="#06b6d4" fillOpacity={0.5} />
        <text x={W - pad.r + 15} y={29} fontSize={8} fill="#9aadcc">Pore u</text>
      </>}
      <text x={x0 + chartW / 2} y={H - 2} fontSize={7} fill="#6b7fa8" textAnchor="middle">kN/m²</text>
    </svg>
  )
}

// ── Main panel ────────────────────────────────────────────
export default function LoadsPanel() {
  const { loads, setLoads, wallHeightMm, slabs } = useStore()

  const {
    soilDepthMm, slabGamma,
    liveLoad,
    soilGamma, soilSaturated, gammaW,
    waterTableDepth, phi, cohesion, surcharge,
    loadCase, raftThicknessMm = 300, wallTopPropped = false, horizBarHookMm = 0,
  } = loads

  const H = wallHeightMm
  const H_m = H / 1000

  // ── Slab depth (average of slabs, or default 230mm) ──
  const slabDepthMm = useMemo(() => {
    if (!slabs?.length) return 230
    return Math.round(slabs.reduce((s, sl) => s + (sl.steel?.depth || 230), 0) / slabs.length)
  }, [slabs])

  // ── Vertical load from soil on slab ──────────────────
  const soilLoad     = (soilDepthMm / 1000) * slabGamma          // kN/m²
  const slabSelfWt   = (slabDepthMm / 1000) * 25                 // kN/m² (RC = 25 kN/m³)
  const totalVertical = soilLoad + slabSelfWt + liveLoad          // kN/m²

  // ── Lateral earth pressure ────────────────────────────
  const gamma  = soilSaturated ? 20 : soilGamma
  const sinPhi = Math.sin((phi * Math.PI) / 180)
  const Ka = (1 - sinPhi) / (1 + sinPhi)
  const K0 = 1 - sinPhi
  const Kp = (1 + sinPhi) / (1 - sinPhi)
  const K  = loadCase === 'active' ? Ka : loadCase === 'at-rest' ? K0 : Kp

  const sigma_top = K * surcharge
  const sigma_bot = K * gamma * H_m + K * surcharge

  const hwt  = waterTableDepth != null ? Math.min(waterTableDepth, H) : H
  const hw   = Math.max(0, H - hwt)
  const u_bot = (!soilSaturated && waterTableDepth != null && waterTableDepth < H) || (soilSaturated && hw > 0)
    ? gammaW * (hw / 1000) : 0

  const totalAtBase = sigma_bot + u_bot
  const fmt1 = n => n.toFixed(2)
  const fmt2 = n => n.toFixed(3)

  return (
    <div style={{ padding: 12, overflowY: 'auto', flex: 1, fontSize: 11 }}>

      {/* ══ SLAB / ROOF LOADS ══ */}
      <Sep title="Roof / Slab Loading" color="#f0c060" />

      <Lbl>Soil backfill depth on slab</Lbl>
      <Row>
        <UnitInput valueMm={soilDepthMm} onChange={v => setLoads({ soilDepthMm: v })} min={0} max={10000} />
      </Row>

      <Lbl>Backfill unit weight γ</Lbl>
      <Row>
        <Num value={slabGamma} onChange={v => setLoads({ slabGamma: v })} min={10} max={25} step={0.5} />
        <Unit>kN/m³</Unit>
      </Row>

      <Lbl>Live load (people / equipment)</Lbl>
      <Row>
        <Num value={liveLoad} onChange={v => setLoads({ liveLoad: v })} min={0} max={100} step={0.5} />
        <Unit>kN/m²</Unit>
      </Row>

      {/* Computed vertical summary */}
      <div style={{ background: '#0d1320', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
        <KV label="Soil load" value={`${(soilDepthMm/1000).toFixed(2)}m × ${slabGamma} = ${fmt1(soilLoad)} kN/m²`} sub />
        <KV label="Slab self-wt" value={`${slabDepthMm}mm × 25 = ${fmt1(slabSelfWt)} kN/m²`} sub />
        <KV label="Live load" value={`${fmt1(liveLoad)} kN/m²`} sub />
        <div style={{ borderTop: '1px solid #1e2533', marginTop: 4, paddingTop: 4 }}>
          <KV label="Total on slab" value={`${fmt1(totalVertical)} kN/m²`} accent="#f0c060" />
        </div>
      </div>

      {/* ══ LATERAL LOADS ══ */}
      <Sep title="Lateral Earth Pressure" color="#93c5fd" />

      <Lbl>Load case</Lbl>
      <RadioGroup
        options={[
          { value: 'active',  label: 'Active' },
          { value: 'at-rest', label: 'At-Rest' },
          { value: 'passive', label: 'Passive' },
        ]}
        value={loadCase}
        onChange={v => setLoads({ loadCase: v })}
      />

      <Lbl>Soil unit weight γ</Lbl>
      <Row>
        <Num value={soilGamma} onChange={v => setLoads({ soilGamma: v })} min={10} max={25} step={0.5} />
        <Unit>kN/m³</Unit>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9aadcc', cursor: 'pointer' }}>
          <input type="checkbox" checked={soilSaturated} onChange={e => setLoads({ soilSaturated: e.target.checked })}
            style={{ accentColor: '#06b6d4' }} />
          Saturated (20)
        </label>
      </Row>

      <Lbl>Friction angle φ</Lbl>
      <Row>
        <Num value={phi} onChange={v => setLoads({ phi: v })} min={0} max={45} step={1} />
        <Unit>°</Unit>
        <span style={{ fontSize: 9, color: '#4a6fa5' }}>
          Ka={fmt2(Ka)} K₀={fmt2(K0)}
        </span>
      </Row>

      <Lbl>Surcharge q (surface)</Lbl>
      <Row>
        <Num value={surcharge} onChange={v => setLoads({ surcharge: v })} min={0} max={200} step={1} />
        <Unit>kN/m²</Unit>
      </Row>

      <Lbl>Water table depth from surface</Lbl>
      <Row>
        <UnitInput
          valueMm={waterTableDepth ?? H * 2}
          onChange={v => setLoads({ waterTableDepth: v >= H * 1.5 ? null : v })}
          min={0} max={H * 2}
        />
      </Row>
      {waterTableDepth != null && waterTableDepth < H && (
        <div style={{ fontSize: 10, color: '#06b6d4', marginBottom: 8 }}>
          Water {(hw/1000).toFixed(2)}m above base → u = {fmt1(u_bot)} kN/m²
        </div>
      )}

      {/* Lateral computed summary */}
      <div style={{ background: '#0d1320', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
        <KV label={`K (${loadCase})`} value={fmt2(K)} accent="#60a5fa" />
        <KV label="σh at top" value={`${fmt1(sigma_top)} kN/m²`} sub />
        <KV label="σh at base" value={`${fmt1(sigma_bot)} kN/m²`} sub />
        {u_bot > 0 && <KV label="Pore u" value={`${fmt1(u_bot)} kN/m²`} accent="#67e8f9" sub />}
        <div style={{ borderTop: '1px solid #1e2533', marginTop: 4, paddingTop: 4 }}>
          <KV label="Total at base" value={`${fmt1(totalAtBase)} kN/m²`} accent="#00ff99" />
        </div>
      </div>

      {/* ══ FOUNDATION ══ */}
      <Sep title="Foundation" color="#a78bfa" />

      <Lbl>Wall top boundary condition</Lbl>
      <RadioGroup
        options={[
          { value: 'cantilever', label: 'Free top (cantilever)' },
          { value: 'propped',    label: 'Propped by slab' },
        ]}
        value={wallTopPropped ? 'propped' : 'cantilever'}
        onChange={v => setLoads({ wallTopPropped: v === 'propped' })}
      />
      <div style={{ fontSize: 10, color: wallTopPropped ? '#86efac' : '#f59e0b', marginBottom: 8, lineHeight: 1.5 }}>
        {wallTopPropped
          ? 'Propped cantilever — ground slab takes horizontal reaction at top. Mu = w₀H²/15 + w₁H²/8'
          : 'Free cantilever — conservative worst case. Mu = K·γ·H³/6 + K·Q·H²/2'}
      </div>

      <Lbl>Raft / footing thickness</Lbl>
      <Row>
        <UnitInput valueMm={raftThicknessMm} onChange={v => setLoads({ raftThicknessMm: v })} min={150} max={2000} />
      </Row>
      <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 10 }}>
        Used for wall bar anchorage check — horizontal bars must develop into the raft.
      </div>

      <Lbl>Horizontal bar L-hook into raft</Lbl>
      <Row>
        <UnitInput valueMm={horizBarHookMm} onChange={v => setLoads({ horizBarHookMm: v })} min={0} max={600} />
      </Row>
      <div style={{ fontSize: 10, color: horizBarHookMm > 0 ? '#86efac' : '#4a6fa5', marginBottom: 10, lineHeight: 1.5 }}>
        {horizBarHookMm > 0
          ? `Hook adds ${horizBarHookMm}mm → total available = ${Math.max(raftThicknessMm - 75, 0) + horizBarHookMm}mm`
          : 'Set to 0 if bars are straight (no hook). Bars bend 90° down into raft.'}
      </div>

      {/* ══ CROSS-SECTION DIAGRAM ══ */}
      <Sep title="Cross-section View" color="#9aadcc" />
      <div style={{ background: '#0d1320', borderRadius: 8, padding: '10px 4px', marginBottom: 8, overflowX: 'auto' }}>
        <CrossSection
          soilDepthMm={soilDepthMm}
          slabDepthMm={slabDepthMm}
          wallHMm={wallHeightMm}
          wallThkMm={230}
          lateralP={totalAtBase}
          soilLoad={soilLoad}
          liveLoad={liveLoad}
          raftThicknessMm={raftThicknessMm}
          wallTopPropped={wallTopPropped}
        />
        <div style={{ fontSize: 9, color: '#4a6fa5', marginTop: 4, paddingLeft: 8, lineHeight: 1.6 }}>
          Yellow arrows = vertical load on slab · Blue = lateral soil pressure
        </div>
      </div>

      {/* Lateral pressure diagram */}
      <Sep title="Lateral Pressure Profile" color="#9aadcc" />
      <div style={{ background: '#0d1320', borderRadius: 8, padding: 10, marginBottom: 8 }}>
        <PressureDiagram H_mm={H} sigma_top={sigma_top} sigma_bot={sigma_bot} u_bot={u_bot} />
      </div>

      <div style={{ fontSize: 9, color: '#2a3550', lineHeight: 1.7, marginTop: 8 }}>
        <div style={{ color: '#3a5070', marginBottom: 2 }}>Assumptions</div>
        <div>• Ka = (1−sinφ)/(1+sinφ) — Rankine active</div>
        <div>• K₀ = 1−sinφ — Jáky at-rest</div>
        <div>• RC self-weight = 25 kN/m³</div>
        <div>• Slab depth auto-read from slab elements</div>
      </div>
    </div>
  )
}
