import React, { useRef, useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Ruler, BarChart2, Scale, ShieldCheck, LayoutDashboard } from 'lucide-react'
import Toolbar from './components/Toolbar'
import DrawingCanvas from './components/DrawingCanvas'
import PropertiesPanel from './components/PropertiesPanel'
import AnalysisPanel from './components/AnalysisPanel'
import LoadsPanel from './components/LoadsPanel'
import CapacityPanel from './components/CapacityPanel'
import StructureReport from './components/StructureReport'
import useStore from './store/useStore'
import { UNIT_LABELS } from './utils/units'
import finalPreset from './presets/final.json'

const PRESETS = [
  { label: 'Backfilled Basement', description: 'Heavy basement with soil backfill on roof slab — RCC walls, internal beams & two-way slabs', data: finalPreset },
]

// Lazy-load 3D (heavy dep)
const ThreeDView = lazy(() => import('./components/ThreeDView'))

const PANEL_MIN = 200
const PANEL_MAX = 620
const PANEL_DEFAULT = 400

const UNIT_OPTIONS = Object.keys(UNIT_LABELS)

const selStyle = {
  background: '#1e2533', border: '1px solid #2a3550', borderRadius: 4,
  color: '#e0e0e0', padding: '2px 5px', fontSize: 11, outline: 'none',
}

// ── Help modal ─────────────────────────────────────────────────
const HELP_SECTIONS = [
  {
    title: 'Drawing',
    items: [
      'Toolbar (left): select Wall [W], Beam [B], Column [C], Slab [A] — click to activate, then click/drag on canvas to place.',
      'Click a placed element to select it. Drag to move. Delete key removes it.',
      'Pan with [H] or middle-mouse. Fit all to view with [F].',
      'Snap to grid is automatic. Hold Shift for ortho lock while drawing walls/beams.',
    ],
  },
  {
    title: 'Dimensions & Steel (Dims / Steel tabs)',
    items: [
      'Select any element → right panel shows its dimensions and reinforcement.',
      'Dims tab: edit width, depth, span. Steel tab: bar counts, diameters, stirrup spacing, support types.',
      'Support type (wall / column) and embedment depth at each end of a beam affect hogging moment and anchorage checks.',
    ],
  },
  {
    title: 'Loads — set these first',
    color: '#f59e0b',
    items: [
      'Go to the Loads tab (scale icon) in the right panel.',
      'Set soil depth on roof slab, unit weights, live load, and water table — these drive all beam and slab demands.',
      'Wall top propped checkbox changes the wall from cantilever to propped — halves the base moment.',
      'Raft thickness controls bar development length into the footing.',
    ],
  },
  {
    title: 'Capacity Checks (Checks tab)',
    color: '#22c55e',
    items: [
      'Click any beam, slab, column, or wall on the canvas → its card auto-expands in the Checks tab.',
      'Each row shows Demand / Capacity / DCR. Green = pass, amber = warn (DCR 0.9–1.0), red = fail.',
      'Expand any row to read the full IS 456 clause note and fix guidance.',
      'Beam hogging: computed from wall embedment / column stiffness automatically. Override with Manual Mu_hogg if you have frame analysis results.',
      'Tributary load distribution for each beam is shown — click the audit arrow to see how wu was calculated.',
    ],
  },
  {
    title: 'Tributary View',
    items: [
      'Select a beam → a tributary zone overlay appears on the canvas showing which slab area loads it.',
      'Short-span beams get triangular load (IS 456 Cl. 24.5); long-span beams get trapezoidal.',
      'The info box is draggable if it overlaps your drawing.',
    ],
  },
  {
    title: 'Keyboard shortcuts',
    items: [
      '[V] Select  [H] Pan  [W] Wall  [B] Beam  [C] Column  [A] Slab',
      '[F] Fit to view  [D] Toggle dimension labels  [3] Toggle 3D view  [Z] Undo',
    ],
  },
]

function HelpModal({ onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#0d1120', border: '1px solid #1e2e45', borderRadius: 12,
        width: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 56px rgba(0,0,0,0.8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1e2533' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e0e0' }}>How to use this tool</div>
            <div style={{ fontSize: 10, color: '#4a6fa5', marginTop: 2 }}>IS 456:2000 · RCC Analysis</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a6fa5', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {HELP_SECTIONS.map(sec => (
            <div key={sec.title}>
              <div style={{ fontSize: 10, fontWeight: 700, color: sec.color ?? '#4a90d9', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{sec.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {sec.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: sec.color ?? '#2563eb', fontSize: 10, marginTop: 1, flexShrink: 0 }}>›</span>
                    <span style={{ fontSize: 11, color: '#9ab0cc', lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ padding: '10px 12px', background: '#0a0e1c', border: '1px solid #2a1f0a', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: '#7a5a20', lineHeight: 1.6 }}>
              Results are preliminary estimates — always verify with a licensed structural engineer before use on any project.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const {
    rightTab, setRightTab,
    show3D, toggle3D, toggleDims,
    primaryUnit, secondaryUnit, showSecondaryUnit, setUnits,
    fitToView, requestFit,
    columns, walls, beams, slabs, loadProject,
    activePresetName, resetToPreset,
  } = useStore()
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [helpOpen, setHelpOpen] = useState(false)
  const [panelW, setPanelW] = useState(() => {
    const saved = parseInt(localStorage.getItem('rcc_panelW'), 10)
    return saved && saved >= PANEL_MIN && saved <= PANEL_MAX ? saved : PANEL_DEFAULT
  })
  const mainRef = useRef(null)
  const dragging = useRef(false)

  const onResizeMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev) => {
      if (!dragging.current) return
      const newW = window.innerWidth - ev.clientX
      setPanelW(Math.min(PANEL_MAX, Math.max(PANEL_MIN, newW)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setPanelW(w => { localStorage.setItem('rcc_panelW', w); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    const measure = () => {
      if (mainRef.current) setCanvasSize({ w: mainRef.current.clientWidth, h: mainRef.current.clientHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])


  // Extra keyboard shortcuts at app level
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.key === '3') toggle3D()
      if (e.key.toLowerCase() === 'd') toggleDims()
      if (e.key.toLowerCase() === 'f') requestFit()
      if (e.key === '?') setHelpOpen(v => !v)
      if (e.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle3D, toggleDims, fitToView, canvasSize])

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* Toolbar */}
      <Toolbar />

      {/* Canvas */}
      <div ref={mainRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0f1117' }}>
        {canvasSize.w > 0 && (
          <DrawingCanvas canvasWidth={canvasSize.w} canvasHeight={canvasSize.h} />
        )}

        {/* Empty-state preset overlay */}
        {columns.length === 0 && walls.length === 0 && beams.length === 0 && slabs.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              background: '#0d1120', border: '1px solid #1e2533', borderRadius: 12,
              padding: '28px 36px', maxWidth: 380, pointerEvents: 'auto',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}>
              <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>RCC Tool</div>
              <div style={{ fontSize: 18, color: '#e0e0e0', fontWeight: 700, marginBottom: 4 }}>Start drawing</div>
              <div style={{ fontSize: 11, color: '#7a9fc5', marginBottom: 20, lineHeight: 1.6 }}>
                Use the toolbar to place walls, beams, columns and slabs — or load a preset to explore.
              </div>
              <div style={{ fontSize: 10, color: '#5a7a9a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Presets</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => {
                    loadProject(JSON.stringify(p.data), p.label)
                    setTimeout(() => requestFit(), 80)
                  }} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    background: '#141d2e', border: '1px solid #3a5070', borderRadius: 8,
                    padding: '18px 22px', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#3a5070'}
                  >
                    <span style={{ fontSize: 12, color: '#93c5fd', fontWeight: 700 }}>{p.label}</span>
                    <span style={{ fontSize: 10, color: '#7a9fc5', marginTop: 2 }}>{p.description}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: '8px 10px', background: '#0a0e1c', border: '1px solid #2a1f0a', borderRadius: 6 }}>
                <div style={{ fontSize: 9, color: '#7a5a20', lineHeight: 1.6 }}>
                  ⚠ Early in development. Results are for reference only — always verify with a qualified structural engineer before use on any project.
                </div>
              </div>
              <button
                onClick={() => setHelpOpen(true)}
                style={{
                  marginTop: 14, width: '100%', padding: '8px 0',
                  background: 'transparent', border: '1px solid #2a3550',
                  borderRadius: 6, color: '#4a6fa5', fontSize: 11, cursor: 'pointer',
                  letterSpacing: 0.5,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#93c5fd' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a3550'; e.currentTarget.style.color = '#4a6fa5' }}
              >? How to use this tool</button>
              <div style={{ marginTop: 10, fontSize: 9, color: '#1e2d42', textAlign: 'center' }}>
                v1.0 · Kshitij Jamdade · IS 456:2000
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{
          width: 4, flexShrink: 0, cursor: 'col-resize',
          background: '#1e2533',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
        onMouseLeave={e => e.currentTarget.style.background = '#1e2533'}
      />

      {/* Right panel */}
      <div style={{
        width: panelW, background: '#0d1120', borderLeft: 'none',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>

        {/* Units selector row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          borderBottom: '1px solid #1e2533', background: '#0a0e1a', flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 9, color: '#4a6fa5', textTransform: 'uppercase', letterSpacing: 1 }}>Unit</span>
          <select
            title="Primary display unit"
            value={primaryUnit}
            onChange={e => setUnits(e.target.value, secondaryUnit, showSecondaryUnit)}
            style={selStyle}
          >
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#4a6fa5', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showSecondaryUnit}
              onChange={e => setUnits(primaryUnit, secondaryUnit, e.target.checked)}
              style={{ accentColor: '#2563eb', width: 11, height: 11 }}
            />
            dual
          </label>

          {/* Help button */}
          <button
            onClick={() => setHelpOpen(true)}
            title="How to use this tool"
            style={{
              marginLeft: 'auto', background: 'none', border: '1px solid #2a3550',
              borderRadius: 10, color: '#4a6fa5', fontSize: 10, fontWeight: 700,
              width: 18, height: 18, cursor: 'pointer', lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#93c5fd' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a3550'; e.currentTarget.style.color = '#4a6fa5' }}
          >?</button>

          {/* Preset indicator + reset */}
          {activePresetName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: '#3a5070', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activePresetName}
              </span>
              <button
                onClick={() => {
                  if (window.confirm(`Reset to "${activePresetName}" defaults? All changes will be lost.`)) {
                    resetToPreset()
                    setTimeout(() => requestFit(), 80)
                  }
                }}
                title={`Reset to "${activePresetName}" defaults`}
                style={{
                  background: 'none', border: '1px solid #2a3550', borderRadius: 3,
                  color: '#6b7fa8', fontSize: 9, padding: '1px 6px', cursor: 'pointer',
                  lineHeight: 1.4,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a3550'; e.currentTarget.style.color = '#6b7fa8' }}
              >
                ↺ reset
              </button>
            </div>
          )}

          {showSecondaryUnit && (
            <select
              title="Secondary display unit"
              value={secondaryUnit}
              onChange={e => setUnits(primaryUnit, e.target.value, showSecondaryUnit)}
              style={{ ...selStyle, opacity: showSecondaryUnit ? 1 : 0.4 }}
            >
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
            </select>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e2533', flexShrink: 0 }}>
          {[
            { id: 'properties', label: 'Dims',   Icon: Ruler        },
            { id: 'analysis',   label: 'Steel',  Icon: BarChart2    },
            { id: 'loads',      label: 'Loads',  Icon: Scale        },
            { id: 'capacity',   label: 'Checks', Icon: ShieldCheck  },
            { id: 'report',     label: 'Summary', Icon: LayoutDashboard },
          ].map(({ id, label, Icon }) => {
            const active = rightTab === id
            return (
              <button key={id} onClick={() => setRightTab(id)} style={{
                flex: 1, padding: '7px 0', background: 'transparent', border: 'none',
                borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                color: active ? '#e0e0e0' : '#4a6fa5',
                fontSize: 9, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.8,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}>
                <Icon size={14} strokeWidth={active ? 2 : 1.5} />
                {label}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {rightTab === 'properties' && <PropertiesPanel />}
          {rightTab === 'analysis'   && <AnalysisPanel />}
          {rightTab === 'loads'      && <LoadsPanel />}
          {rightTab === 'capacity'   && <CapacityPanel />}
          {rightTab === 'report'     && <StructureReport />}
        </div>
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* 3D overlay */}
      {show3D && (
        <Suspense fallback={
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#070b12',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a90d9', fontSize: 16 }}>
            Loading 3D…
          </div>
        }>
          <ThreeDView onClose={toggle3D} />
        </Suspense>
      )}
    </div>
  )
}
