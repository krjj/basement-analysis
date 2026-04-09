import React from 'react'
import { BAR_DIAS } from '../utils/constants'

// ── Tiny primitives ───────────────────────────────────────
const label = { fontSize: 10, color: '#6b7fa8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }
const row   = { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }

const Lbl = ({ children }) => <div style={label}>{children}</div>

const Num = ({ value, onChange, min = 0, max = 9999, style = {} }) => (
  <input type="number" value={value} min={min} max={max} onChange={e => onChange(+e.target.value)}
    style={{ width: 64, background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
      color: '#e0e0e0', padding: '3px 6px', fontSize: 12, outline: 'none', ...style }} />
)

const DiaSelect = ({ value, onChange }) => (
  <select value={value} onChange={e => onChange(+e.target.value)}
    style={{ background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
      color: '#e0e0e0', padding: '3px 6px', fontSize: 12, outline: 'none' }}>
    {BAR_DIAS.map(d => <option key={d} value={d}>{d}φ</option>)}
  </select>
)

const Toggle = ({ label: lbl, value, onChange }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#9aadcc' }}>
    <div onClick={() => onChange(!value)}
      style={{ width: 32, height: 16, borderRadius: 8, position: 'relative', cursor: 'pointer',
        background: value ? '#2563eb' : '#1e2533', border: '1px solid #2a3550', transition: 'background 0.2s' }}>
      <div style={{ position: 'absolute', top: 1, left: value ? 17 : 1,
        width: 12, height: 12, borderRadius: 6, background: value ? '#fff' : '#666', transition: 'left 0.2s' }} />
    </div>
    {lbl}
  </label>
)

const Sep = ({ title }) => (
  <div style={{ fontSize: 9, color: '#f0c060', textTransform: 'uppercase', letterSpacing: 1,
    borderBottom: '1px solid #2a3550', paddingBottom: 4, marginBottom: 8, marginTop: 12 }}>
    {title}
  </div>
)

// ── Per-end anchorage editor ──────────────────────────────
function EndSupportEditor({ sup, onChange, barDia = 25, totalBotBars = 2, totalTopBars = 2 }) {
  if (!sup) return null
  const upd = (patch) => onChange({ ...sup, ...patch })
  return (
    <div style={{ background: '#0d1420', borderRadius: 6, padding: '8px', marginBottom: 4 }}>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Type</span>
        <select value={sup.type} onChange={e => upd({ type: e.target.value })}
          style={{ background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
            color: '#e0e0e0', padding: '3px 8px', fontSize: 12, outline: 'none', flex: 1 }}>
          <option value="wall">Wall support</option>
          <option value="column">Column support</option>
        </select>
      </div>

      {sup.type === 'wall' && (
        <>
          <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 6, lineHeight: 1.5 }}>
            Bar extends into wall (bearing) + L-hook.<br />
            Total anchorage = embedment + hook length.
          </div>
          <div style={row}>
            <span style={{ fontSize: 11, color: '#9aadcc', width: 80 }}>Bearing (embed)</span>
            <Num value={sup.embedmentDepth} onChange={v => upd({ embedmentDepth: v })} min={100} max={600} />
            <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <Toggle label="L-bend hook" value={sup.lBend} onChange={v => upd({ lBend: v })} />
          </div>
          {sup.lBend && (
            <div style={row}>
              <span style={{ fontSize: 11, color: '#9aadcc', width: 80 }}>Hook length</span>
              <Num value={sup.lBendLength} onChange={v => upd({ lBendLength: v })} min={100} max={800} />
              <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
            </div>
          )}
          <Sep title="Bar split at support" />
          <div style={row}>
            <span style={{ fontSize: 11, color: '#9aadcc', width: 80 }}>L-bend bars</span>
            <Num
              value={sup.lBendCount ?? (sup.lBend ? totalBotBars : 0)}
              onChange={v => upd({ lBendCount: Math.min(+v, totalBotBars) })}
              min={0} max={totalBotBars}
            />
            <span style={{ fontSize: 10, color: '#6b7fa8' }}>of {totalBotBars} bot.</span>
          </div>
          {(() => {
            const nL = Math.min(sup.lBendCount ?? (sup.lBend ? totalBotBars : 0), totalBotBars)
            const nS = totalBotBars - nL
            const minReq = Math.ceil(totalBotBars / 3)
            return (
              <div style={{ fontSize: 10, color: '#3a5a3a', marginTop: 4, lineHeight: 1.8 }}>
                <div>{nL} L-bend + {nS} straight = {totalBotBars} bot. bars at support</div>
                <div style={{ color: totalBotBars >= minReq ? '#3a5a3a' : '#ef4444' }}>
                  Min required: {minReq} bars (IS 456 Cl. 26.2.3.2)
                </div>
                <div style={{ color: '#4a6fa5', marginTop: 2 }}>
                  Top bars at simple wall = nominal (no Ld needed)
                </div>
              </div>
            )
          })()}
        </>
      )}

      {sup.type === 'column' && (
        <>
          <div style={{ fontSize: 10, color: '#4a6fa5', marginBottom: 6, lineHeight: 1.5 }}>
            Bar passes through column & hooks inside.<br />
            Hook = col. depth − 2×cover (no embedment depth).<br />
            Confinement by column ties = adequate anchorage.
          </div>
          <div style={row}>
            <span style={{ fontSize: 11, color: '#9aadcc', width: 80 }}>Column depth</span>
            <Num value={sup.colWidth} onChange={v => upd({ colWidth: v })} min={150} max={900} />
            <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <Toggle
              label="Straight bar (no hook)"
              value={!!sup.straightBar}
              onChange={v => upd({ straightBar: v })}
            />
          </div>
          <div style={row}>
            <span style={{ fontSize: 11, color: '#9aadcc', width: 80 }}>Bar extension</span>
            <Num value={sup.barExtension ?? 0} onChange={v => upd({ barExtension: v })} min={0} max={2000} />
            <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm past col face</span>
          </div>
          {sup.straightBar ? (
            <div style={{ fontSize: 10, color: '#3a5a3a', marginTop: 4 }}>
              Total anchorage = col width − cover + extension = {(sup.colWidth||230) - 40 + (sup.barExtension||0)} mm
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#3a5a3a', marginTop: 4 }}>
              Hook inside col = {Math.max(0, (sup.colWidth||230) - 50)} mm (col − 2×25cv)
              {(sup.barExtension||0) > 0 && ` + ${sup.barExtension}mm extension`}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Beam steel editor ─────────────────────────────────────
export function BeamSteelEditor({ steel, width, depth, onUpdate }) {
  const upd = (key, patch) => onUpdate({ [key]: { ...steel[key], ...patch } })

  return (
    <div>
      <Sep title="Bottom Steel" />
      <Lbl>Full bars</Lbl>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Count</span>
        <Num value={steel.bottomFull.count} onChange={v => upd('bottomFull', { count: v })} min={1} max={12} />
        <span style={{ fontSize: 11, color: '#9aadcc' }}>Dia</span>
        <DiaSelect value={steel.bottomFull.dia} onChange={v => upd('bottomFull', { dia: v })} />
      </div>
      <Lbl>Curtail bars (@L/7)</Lbl>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Count</span>
        <Num value={steel.bottomCurtail.count} onChange={v => upd('bottomCurtail', { count: v })} min={0} max={12} />
        <span style={{ fontSize: 11, color: '#9aadcc' }}>Dia</span>
        <DiaSelect value={steel.bottomCurtail.dia} onChange={v => upd('bottomCurtail', { dia: v })} />
      </div>

      <Sep title="Top Steel" />
      <Lbl>Top bars (full length)</Lbl>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Count</span>
        <Num value={steel.topSteel.count} onChange={v => upd('topSteel', { count: v })} min={0} max={12} />
        <span style={{ fontSize: 11, color: '#9aadcc' }}>Dia</span>
        <DiaSelect value={steel.topSteel.dia} onChange={v => upd('topSteel', { dia: v })} />
      </div>
      <Lbl>Extra top @ supports</Lbl>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Count</span>
        <Num value={steel.extraTopSupport?.count || 0} onChange={v => upd('extraTopSupport', { count: v })} min={0} max={12} />
        <span style={{ fontSize: 11, color: '#9aadcc' }}>Dia</span>
        <DiaSelect value={steel.extraTopSupport?.dia || 16} onChange={v => upd('extraTopSupport', { dia: v })} />
      </div>

      <Sep title="Stirrups" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Dia</span>
        <DiaSelect value={steel.stirrups.dia} onChange={v => upd('stirrups', { dia: v })} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Support @</span>
        <Num value={steel.stirrups.supportSpacing} onChange={v => upd('stirrups', { supportSpacing: v })} min={50} max={300} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Nos @end</span>
        <Num value={steel.stirrups.supportNos || 0} onChange={v => upd('stirrups', { supportNos: v || null })} min={0} max={20} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 50 }}>Mid @</span>
        <Num value={steel.stirrups.midSpacing} onChange={v => upd('stirrups', { midSpacing: v })} min={100} max={400} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>

      <Sep title="Anchorage — Start End" />
      <EndSupportEditor
        sup={steel.startSupport}
        onChange={v => onUpdate({ startSupport: v })}
        barDia={steel.bottomFull.dia}
        totalBotBars={steel.bottomFull.count}
        totalTopBars={(steel.topSteel?.count ?? 0) + (steel.extraTopSupport?.count ?? 0)}
      />

      <Sep title="Anchorage — Finish End" />
      <EndSupportEditor
        sup={steel.endSupport}
        onChange={v => onUpdate({ endSupport: v })}
        barDia={steel.bottomFull.dia}
        totalBotBars={steel.bottomFull.count}
        totalTopBars={(steel.topSteel?.count ?? 0) + (steel.extraTopSupport?.count ?? 0)}
      />

      <Sep title="Cover" />
      <div style={row}>
        <Num value={steel.cover} onChange={v => onUpdate({ cover: v })} min={10} max={75} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
    </div>
  )
}

// ── Slab steel editor ─────────────────────────────────────
export function SlabSteelEditor({ steel, onUpdate }) {
  const upd = (key, patch) => onUpdate({ [key]: typeof patch === 'object' ? { ...steel[key], ...patch } : patch })

  return (
    <div>
      <Sep title="Slab Geometry" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 70 }}>Thickness</span>
        <Num value={steel.depth} onChange={v => onUpdate({ depth: v })} min={100} max={600} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 70 }}>Sunk depth</span>
        <Num value={steel.sunkDepth || 0} onChange={v => onUpdate({ sunkDepth: v })} min={0} max={300} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <Toggle label="Alt. bars bent up" value={steel.altBentUp}
          onChange={v => onUpdate({ altBentUp: v })} />
      </div>

      <Sep title="Main Bars (short span)" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Dia</span>
        <DiaSelect value={steel.mainBar.dia} onChange={v => upd('mainBar', { dia: v })} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Spacing</span>
        <Num value={steel.mainBar.spacing} onChange={v => upd('mainBar', { spacing: v })} min={75} max={300} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>

      <Sep title="Distribution Bars (long span)" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Dia</span>
        <DiaSelect value={steel.distBar.dia} onChange={v => upd('distBar', { dia: v })} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Spacing</span>
        <Num value={steel.distBar.spacing} onChange={v => upd('distBar', { spacing: v })} min={75} max={300} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>

      <Sep title="Top Steel" />
      <div style={{ marginBottom: 8 }}>
        <Toggle label="Enable top steel" value={steel.topSteel?.enabled || false}
          onChange={v => upd('topSteel', { enabled: v })} />
      </div>
      {steel.topSteel?.enabled && (
        <>
          <div style={row}>
            <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Dia</span>
            <DiaSelect value={steel.topSteel.dia} onChange={v => upd('topSteel', { dia: v })} />
          </div>
          <div style={row}>
            <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Spacing</span>
            <Num value={steel.topSteel.spacing} onChange={v => upd('topSteel', { spacing: v })} min={75} max={300} />
            <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
          </div>
        </>
      )}

      <Sep title="Cover" />
      <div style={row}>
        <Num value={steel.cover} onChange={v => onUpdate({ cover: v })} min={10} max={50} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
    </div>
  )
}

// ── Column steel editor ───────────────────────────────────
export function ColumnSteelEditor({ steel, onUpdate }) {
  const upd = (key, patch) => onUpdate({ [key]: { ...steel[key], ...patch } })

  return (
    <div>
      <Sep title="Vertical Bars" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Count</span>
        <Num value={steel.vertBars.count} onChange={v => upd('vertBars', { count: v })} min={4} max={32} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Dia</span>
        <DiaSelect value={steel.vertBars.dia} onChange={v => upd('vertBars', { dia: v })} />
      </div>

      <Sep title="Lateral Ties" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Dia</span>
        <DiaSelect value={steel.ties.dia} onChange={v => upd('ties', { dia: v })} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Spacing</span>
        <Num value={steel.ties.spacing} onChange={v => upd('ties', { spacing: v })} min={75} max={300} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>

      <Sep title="Cover" />
      <div style={row}>
        <Num value={steel.cover} onChange={v => onUpdate({ cover: v })} min={20} max={75} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
    </div>
  )
}

// ── Wall steel editor ─────────────────────────────────────
export function WallSteelEditor({ steel, onUpdate }) {
  const upd = (key, patch) => onUpdate({ [key]: { ...steel[key], ...patch } })

  return (
    <div>
      <Sep title="Horizontal Bars" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Dia</span>
        <DiaSelect value={steel.horizBars.dia} onChange={v => upd('horizBars', { dia: v })} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Spacing</span>
        <Num value={steel.horizBars.spacing} onChange={v => upd('horizBars', { spacing: v })} min={75} max={300} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Faces</span>
        <select value={steel.horizBars.faces} onChange={e => upd('horizBars', { faces: +e.target.value })}
          style={{ background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4, color: '#e0e0e0', padding: '3px 6px', fontSize: 12 }}>
          <option value={1}>1 (single)</option>
          <option value={2}>2 (both faces)</option>
        </select>
      </div>

      <Sep title="Vertical Bars" />
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Dia</span>
        <DiaSelect value={steel.vertBars.dia} onChange={v => upd('vertBars', { dia: v })} />
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Spacing</span>
        <Num value={steel.vertBars.spacing} onChange={v => upd('vertBars', { spacing: v })} min={75} max={300} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, color: '#9aadcc', width: 60 }}>Faces</span>
        <select value={steel.vertBars.faces} onChange={e => upd('vertBars', { faces: +e.target.value })}
          style={{ background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4, color: '#e0e0e0', padding: '3px 6px', fontSize: 12 }}>
          <option value={1}>1 (single)</option>
          <option value={2}>2 (both faces)</option>
        </select>
      </div>

      <Sep title="Cover" />
      <div style={row}>
        <Num value={steel.cover} onChange={v => onUpdate({ cover: v })} min={15} max={75} />
        <span style={{ fontSize: 10, color: '#6b7fa8' }}>mm</span>
      </div>
    </div>
  )
}
