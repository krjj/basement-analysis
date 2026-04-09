import React from 'react'

// SVG cross-section of slab showing reinforcement
export default function SlabSection({ slab }) {
  const { steel, shortSpan, longSpan, mark } = slab
  if (!steel) return null

  const W  = 280   // SVG width
  const H  = 160   // SVG height
  const PAD = 24   // padding

  // slab proportional thickness
  const maxDraw = 100
  const depth   = steel.depth || 230
  const cover   = steel.cover || 15
  const slabH   = Math.min(maxDraw, depth / 3)
  const top     = (H - slabH) / 2
  const bottom  = top + slabH

  // Scale to fit span in width
  const spanDraw = W - PAD * 2
  const scaleX   = spanDraw / shortSpan

  // Bar positions
  const mainDia  = steel.mainBar.dia
  const distDia  = steel.distBar.dia
  const coverPx  = cover * (slabH / depth)
  const barR     = Math.max(2.5, mainDia * (slabH / depth) * 0.8)
  const topBarR  = Math.max(2, (steel.topSteel?.dia || 8) * (slabH / depth) * 0.8)

  // Number of visible bars in cross section (distribute bars along span)
  const nBars = Math.min(12, Math.floor(shortSpan / steel.mainBar.spacing) + 1)
  const spacing = spanDraw / (nBars + 1)

  const nDist = Math.min(8, Math.floor(longSpan / steel.distBar.spacing) + 1)

  // Bent-up bar path for one bar
  const bentBar = (x) => {
    const y1 = bottom - coverPx - barR
    const bentH = slabH * 0.5
    const bentX = Math.max(0, x - spacing / 3)
    return `M ${PAD} ${y1} L ${PAD + bentX} ${y1} L ${PAD + x} ${top + coverPx + barR} L ${PAD + Math.min(spanDraw, x + spacing/3)} ${top + coverPx + barR}`
  }

  const bars = []
  for (let i = 0; i < nBars; i++) {
    const x = (i + 1) * spacing
    const isBent = steel.altBentUp && i % 2 === 1
    const by = isBent ? top + coverPx + barR : bottom - coverPx - barR
    const col = isBent ? '#f0c060' : '#60c0f0'
    bars.push(<circle key={`m${i}`} cx={PAD + x} cy={by} r={barR} fill={col} opacity={0.9} />)
  }

  // Distribution bars (horizontal in cross-section = dots in line)
  const distBars = []
  const distSpacing = slabH / (nDist + 1)
  for (let j = 0; j < nDist; j++) {
    const y = top + (j + 1) * distSpacing
    distBars.push(<circle key={`d${j}`} cx={PAD + 8} cy={y} r={Math.max(1.5, distDia * (slabH/depth) * 0.6)} fill="#90ee90" opacity={0.9} />)
    distBars.push(<circle key={`dr${j}`} cx={PAD + spanDraw - 8} cy={y} r={Math.max(1.5, distDia * (slabH/depth) * 0.6)} fill="#90ee90" opacity={0.9} />)
  }

  // Top steel bars
  const topBars = []
  if (steel.topSteel?.enabled) {
    for (let i = 0; i < Math.min(8, nBars); i++) {
      const x = (i + 1) * spacing
      topBars.push(<circle key={`t${i}`} cx={PAD + x} cy={top + coverPx + topBarR} r={topBarR} fill="#ff9090" opacity={0.9} />)
    }
  }

  return (
    <div style={{ background: '#0d1117', borderRadius: 8, border: '1px solid #2a3550', padding: 8, marginTop: 8 }}>
      <div style={{ fontSize: 10, color: '#6b7fa8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1 }}>
        Section {mark} — {(shortSpan/1000).toFixed(2)} × {(longSpan/1000).toFixed(2)} m
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Slab outline */}
        <rect x={PAD} y={top} width={spanDraw} height={slabH}
          fill="#1a2030" stroke="#4a6fa5" strokeWidth={1.5} />

        {/* Cover lines */}
        <rect x={PAD + coverPx} y={top + coverPx} width={spanDraw - 2*coverPx} height={slabH - 2*coverPx}
          fill="none" stroke="#2a3a50" strokeWidth={0.5} strokeDasharray="3,3" />

        {/* Distribution bars */}
        {distBars}

        {/* Main bottom/bent bars */}
        {bars}

        {/* Top bars */}
        {topBars}

        {/* Sunk depression if any */}
        {(steel.sunkDepth || 0) > 0 && (() => {
          const sd = (steel.sunkDepth / depth) * slabH
          return <rect x={PAD + spanDraw*0.3} y={top} width={spanDraw*0.4} height={sd}
            fill="#0f1117" stroke="#ff6060" strokeWidth={1} strokeDasharray="3,2" />
        })()}

        {/* Dimension lines */}
        {/* Depth */}
        <line x1={PAD-8} y1={top} x2={PAD-8} y2={bottom} stroke="#88aacc" strokeWidth={0.8} />
        <line x1={PAD-12} y1={top} x2={PAD-4} y2={top} stroke="#88aacc" strokeWidth={0.8} />
        <line x1={PAD-12} y1={bottom} x2={PAD-4} y2={bottom} stroke="#88aacc" strokeWidth={0.8} />
        <text x={PAD-20} y={(top+bottom)/2+4} textAnchor="middle"
          transform={`rotate(-90, ${PAD-20}, ${(top+bottom)/2+4})`}
          fill="#88aacc" fontSize={9}>{depth}mm</text>

        {/* Span */}
        <line x1={PAD} y1={bottom+10} x2={PAD+spanDraw} y2={bottom+10} stroke="#88aacc" strokeWidth={0.8} />
        <line x1={PAD} y1={bottom+7} x2={PAD} y2={bottom+13} stroke="#88aacc" strokeWidth={0.8} />
        <line x1={PAD+spanDraw} y1={bottom+7} x2={PAD+spanDraw} y2={bottom+13} stroke="#88aacc" strokeWidth={0.8} />
        <text x={(PAD + PAD + spanDraw)/2} y={bottom+22} textAnchor="middle" fill="#88aacc" fontSize={9}>
          {(shortSpan/1000).toFixed(2)} m (short)
        </text>

        {/* Cover label */}
        <text x={PAD+2} y={top-4} fill="#6b7fa8" fontSize={8}>cv={steel.cover}mm</text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, fontSize: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <span><span style={{ color: '#60c0f0' }}>●</span> Main bottom {steel.mainBar.dia}φ @{steel.mainBar.spacing}</span>
        {steel.altBentUp && <span><span style={{ color: '#f0c060' }}>●</span> Bent up</span>}
        <span><span style={{ color: '#90ee90' }}>●</span> Dist {steel.distBar.dia}φ @{steel.distBar.spacing}</span>
        {steel.topSteel?.enabled && <span><span style={{ color: '#ff9090' }}>●</span> Top {steel.topSteel.dia}φ @{steel.topSteel.spacing}</span>}
      </div>
    </div>
  )
}
