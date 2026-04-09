import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import { calcBeamSteel, calcSlabSteel, calcColumnSteel, calcWallSteel, aggregateByDia } from '../utils/rcc'
import { COLORS, WALL_HEIGHT_MM } from '../utils/constants'
import { fmtDual } from '../utils/units'
import { generateReport } from './ReportView'
import { FileDown } from 'lucide-react'

const Sec = ({ title, color = '#f0c060', children }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: 1,
      borderBottom: `1px solid #1e2533`, paddingBottom: 4, marginBottom: 8 }}>{title}</div>
    {children}
  </div>
)

const KV = ({ label, value, accent }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11 }}>
    <span style={{ color: '#9aadcc' }}>{label}</span>
    <span style={{ color: accent || '#e0e0e0', fontWeight: accent ? 600 : 400 }}>{value}</span>
  </div>
)

const TRow = ({ cells, head }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 72px 54px',
    gap: 3, padding: '2px 0', borderBottom: head ? '1px solid #2a3550' : 'none',
    fontSize: head ? 8 : 10, color: head ? '#6b7fa8' : '#c0cce0' }}>
    {cells.map((c, i) => <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</div>)}
  </div>
)

export default function AnalysisPanel() {
  const {
    beams, slabs, columns, walls, wallHeightMm,
    loads, primaryUnit, secondaryUnit, showSecondaryUnit,
  } = useStore()

  const beamRes   = useMemo(() => beams.map(b => ({ el: b,   ...calcBeamSteel(b.length, { ...b.steel, width: b.width, depth: b.depth }) })), [beams])
  const slabRes   = useMemo(() => slabs.map(s => ({ el: s,   ...calcSlabSteel(s.shortSpan, s.longSpan, s.steel) })), [slabs])
  const colRes    = useMemo(() => columns.map(c => ({ el: c,  ...calcColumnSteel(wallHeightMm, c.width, c.depth, c.steel) })), [columns, wallHeightMm])
  const wallRes   = useMemo(() => walls.map(w => ({ el: w,   ...calcWallSteel(w.length, wallHeightMm, w.thickness, w.steel) })), [walls, wallHeightMm])

  const allRes    = [...beamRes, ...slabRes, ...colRes, ...wallRes]
  const byDia     = useMemo(() => aggregateByDia(allRes), [allRes])

  const tBeam  = beamRes.reduce((s, r) => s + r.totalWt, 0)
  const tSlab  = slabRes.reduce((s, r) => s + r.totalWt, 0)
  const tCol   = colRes.reduce((s,  r) => s + r.totalWt, 0)
  const tWall  = wallRes.reduce((s, r) => s + r.totalWt, 0)
  const grand  = tBeam + tSlab + tCol + tWall

  // Format a length using the primary (and optionally secondary) unit
  const fmtL = (mm) => showSecondaryUnit
    ? fmtDual(mm, primaryUnit, secondaryUnit)
    : fmtDual(mm, primaryUnit, primaryUnit)

  const handleReport = () => {
    generateReport(beams, slabs, columns, walls, loads, wallHeightMm, primaryUnit)
  }

  if (allRes.length === 0) {
    return (
      <div style={{ padding: 16, color: '#4a6fa5', fontSize: 12, lineHeight: 1.7 }}>
        Draw elements on canvas, then view the complete RCC steel analysis here.
      </div>
    )
  }

  const ResultBlock = ({ label, color, results, totalWt }) => (
    <div style={{ marginBottom: 14 }}>
      {results.map(({ el, rows, totalWt: wt }) => (
        <div key={el.id} style={{ marginBottom: 10, background: '#0d1320', borderRadius: 6, padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color, fontWeight: 700 }}>
              {el.label || el.mark}
              {el.length != null && (
                <span style={{ color: '#6b7fa8', fontSize: 9, marginLeft: 6 }}>
                  {fmtL(el.length)}
                </span>
              )}
              {el.shortSpan != null && (
                <span style={{ color: '#6b7fa8', fontSize: 9, marginLeft: 6 }}>
                  {fmtL(el.shortSpan)}×{fmtL(el.longSpan)}
                </span>
              )}
            </span>
            <span style={{ color: '#888', fontSize: 10 }}>{wt.toFixed(1)} kg</span>
          </div>
          <TRow head cells={['Description','Nos','Total mm','kg']} />
          {rows.map((r, i) => <TRow key={i} cells={[r.desc, r.nos, r.totalLen.toLocaleString(), r.wt.toFixed(1)]} />)}
        </div>
      ))}
      {results.length > 1 && (
        <KV label={`All ${label.toLowerCase()}`} value={`${totalWt.toFixed(1)} kg`} accent={color} />
      )}
    </div>
  )

  return (
    <div style={{ padding: 12, overflowY: 'auto', flex: 1, fontSize: 11 }}>

      {/* Generate Report button */}
      <button
        onClick={handleReport}
        style={{
          width: '100%', marginBottom: 14, padding: '8px 0',
          background: '#1a3060', border: '1px solid #2563eb', borderRadius: 8,
          color: '#93c5fd', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          letterSpacing: 0.5,
        }}
        title="Export printable A4 bar schedule PDF"
      >
        <FileDown size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Export PDF
      </button>

      <Sec title="Summary">
        <KV label="Columns" value={columns.length} />
        <KV label="Walls" value={`${walls.length} (H=${fmtL(wallHeightMm)})`} />
        <KV label="Beams" value={beams.length} />
        <KV label="Slabs" value={slabs.length} />
      </Sec>

      {beamRes.length > 0 && (
        <Sec title="Beam Steel" color={COLORS.B1}>
          <ResultBlock label="Beams" color={COLORS.B1} results={beamRes} totalWt={tBeam} />
        </Sec>
      )}

      {slabRes.length > 0 && (
        <Sec title="Slab Steel" color={COLORS.slab}>
          <ResultBlock label="Slabs" color={COLORS.slab} results={slabRes} totalWt={tSlab} />
        </Sec>
      )}

      {colRes.length > 0 && (
        <Sec title="Column Steel" color={COLORS.column}>
          <ResultBlock label="Columns" color={COLORS.column} results={colRes} totalWt={tCol} />
        </Sec>
      )}

      {wallRes.length > 0 && (
        <Sec title="Wall Steel" color="#99bbcc">
          <ResultBlock label="Walls" color="#99bbcc" results={wallRes} totalWt={tWall} />
        </Sec>
      )}

      {byDia.length > 0 && (
        <Sec title="Total by Diameter" color="#88aacc">
          <div style={{ display: 'grid', gridTemplateColumns: '40px 50px 1fr 54px', gap: 4, marginBottom: 6 }}>
            {['Dia', 'Length', '', 'kg'].map((h, i) => (
              <div key={i} style={{ fontSize: 8, color: '#6b7fa8', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {byDia.map(d => (
            <div key={d.dia} style={{ display: 'grid', gridTemplateColumns: '40px 50px 1fr 54px', gap: 4, marginBottom: 4, alignItems: 'center' }}>
              <span style={{ color: '#f0c060' }}>{d.dia}φ</span>
              <span style={{ color: '#9aadcc', fontSize: 10 }}>{(d.totalLen/1000).toFixed(0)}m</span>
              <div style={{ background: '#1e2533', borderRadius: 3, height: 12, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (d.wt/grand)*100*4)}%`, height: '100%', background: '#2563eb', borderRadius: 3 }} />
              </div>
              <span style={{ color: '#e0e0e0' }}>{d.wt.toFixed(1)}</span>
            </div>
          ))}
        </Sec>
      )}

      {/* Grand total */}
      <div style={{ background: '#111d30', border: '1px solid #1e3a5a', borderRadius: 10, padding: '12px 14px', marginTop: 4 }}>
        {[['Beams', tBeam, COLORS.B1], ['Slabs', tSlab, COLORS.slab], ['Columns', tCol, '#ccc'], ['Walls', tWall, '#99bbcc']].map(([l, v, c]) => v > 0 && (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ color: '#9aadcc' }}>{l}</span>
            <span style={{ color: c }}>{v.toFixed(1)} kg</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #2a3550', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#e0e0e0', fontWeight: 700 }}>Grand Total</span>
          <span style={{ color: '#00ff99', fontWeight: 700, fontSize: 15 }}>{grand.toFixed(1)} kg</span>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10, color: '#4a6fa5', marginTop: 3 }}>
          ≈ {(grand/1000).toFixed(3)} MT
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 8, background: '#0d1117', borderRadius: 6, fontSize: 10, color: '#2a3550', lineHeight: 1.6 }}>
        <div style={{ color: '#4a6fa5', marginBottom: 4 }}>📝 Notes</div>
        <div>• All steel per IS:456 / IS:2502</div>
        <div>• Development length = 40d (Fe500)</div>
        <div>• Cover: Beam 25mm · Slab 15mm · Col 40mm · Wall 25mm</div>
        <div>• Wall height: {fmtL(wallHeightMm)}</div>
      </div>
    </div>
  )
}
