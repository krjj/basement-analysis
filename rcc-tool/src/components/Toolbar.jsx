import React, { useRef, useState, useEffect } from 'react'
import {
  House, MousePointer2, Hand, Square, RectangleHorizontal, SeparatorHorizontal,
  Grid2x2, Undo2, Ruler, Scan, Box, ArrowUpDown,
  FileDown, Save, FolderOpen, Trash2, X, ChevronDown,
} from 'lucide-react'
import useStore from '../store/useStore'
import { COLORS } from '../utils/constants'
import UnitInput from './UnitInput'

const TOOLS = [
  { id: 'select', Icon: MousePointer2,       key: 'V', tip: 'Select / move elements' },
  { id: 'pan',    Icon: Hand,                key: 'H', tip: 'Pan canvas' },
  { id: 'column', Icon: Square,              key: 'C', tip: 'Place column' },
  { id: 'wall',   Icon: RectangleHorizontal, key: 'W', tip: 'Draw wall' },
  { id: 'beam',   Icon: SeparatorHorizontal, key: 'B', tip: 'Draw beam' },
  { id: 'slab',   Icon: Grid2x2,             key: 'A', tip: 'Draw slab polygon' },
]

const BTN_BASE = {
  width: 48, height: 44, borderRadius: 8, cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 2, transition: 'all 0.12s', border: '1px solid',
  background: 'transparent',
}

function ToolBtn({ id, Icon, keyHint, tip, active, onClick }) {
  return (
    <button
      title={`${id.toUpperCase()} [${keyHint}] — ${tip}`}
      onClick={onClick}
      style={{
        ...BTN_BASE,
        background: active ? '#2563eb' : '#131929',
        borderColor: active ? '#3b82f6' : '#1e2a3a',
        color: active ? '#fff' : '#5a7a9a',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#1a2540'; e.currentTarget.style.borderColor = '#2a4060'; e.currentTarget.style.color = '#8ab0d0' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = '#131929'; e.currentTarget.style.borderColor = '#1e2a3a'; e.currentTarget.style.color = '#5a7a9a' } }}
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.75} />
      <span style={{ fontSize: 7, letterSpacing: 0.5, fontWeight: 600, opacity: active ? 0.9 : 0.5 }}>{keyHint}</span>
    </button>
  )
}

function ActionBtn({ title, onClick, disabled, active, danger, children }) {
  const bg    = active ? '#2563eb' : danger ? (disabled ? '#0d1120' : '#3b0f0f') : '#131929'
  const bc    = active ? '#3b82f6' : danger ? (disabled ? '#1e2a3a' : '#7f1d1d') : '#1e2a3a'
  const color = disabled ? '#2a3a50' : active ? '#fff' : danger ? '#fca5a5' : '#5a7a9a'
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{ ...BTN_BASE, background: bg, borderColor: bc, color, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = active ? '#1d4ed8' : danger ? '#5a1010' : '#1a2540'; e.currentTarget.style.borderColor = active ? '#2563eb' : danger ? '#ef4444' : '#2a4060' } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = bc } }}
    >
      {children}
    </button>
  )
}

const Divider = () => <div style={{ height: 1, background: '#1a2535', margin: '2px 10px' }} />

function heightLabel(mm) {
  const totalIn = mm / 25.4
  const ft = Math.floor(totalIn / 12)
  const inch = Math.round(totalIn - ft * 12)
  return inch === 0 ? `${ft} ft` : `${ft}′ ${inch}″`
}

function HeightPopover({ wallHeightMm, setWallHeight, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])
  return (
    <div ref={ref} style={{
      position: 'fixed', left: 68, top: '50%', transform: 'translateY(-50%)',
      zIndex: 200, background: '#0f1825', border: '1px solid #2563eb',
      borderRadius: 10, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', minWidth: 200,
    }}>
      <div style={{ fontSize: 10, color: '#4a90d9', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
        Wall / Storey Height
      </div>
      <UnitInput valueMm={wallHeightMm} onChange={setWallHeight} min={500} max={20000} />
      <div style={{ marginTop: 8, fontSize: 10, color: '#4a6fa5', lineHeight: 1.9 }}>
        <div>{Math.round(wallHeightMm)} mm</div>
        <div>{(wallHeightMm / 304.8).toFixed(2)} ft</div>
        <div>{(wallHeightMm / 1000).toFixed(3)} m</div>
      </div>
      <button onClick={onClose} style={{
        marginTop: 10, width: '100%', padding: '6px 0',
        background: '#2563eb', border: 'none', borderRadius: 6,
        color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
      }}>Done</button>
    </div>
  )
}

// ── Analytics admin — change passcode here ─────────────────────
const ANALYTICS_PASS = '123'
const ANALYTICS_URL  = 'https://statcounter.com/p13214650/summary'

function AnalyticsModal({ onClose }) {
  const [pass, setPass] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [err, setErr] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])
  const attempt = () => {
    if (pass === ANALYTICS_PASS) { setUnlocked(true); setErr(false) }
    else { setErr(true); setPass('') }
  }
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#0f1825', border: '1px solid #1e2e45', borderRadius: 10,
        padding: '20px 24px', width: 280, boxShadow: '0 12px 48px rgba(0,0,0,0.8)',
      }}>
        {!unlocked ? (
          <>
            <div style={{ fontSize: 11, color: '#4a7aaa', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Access required</div>
            <input
              ref={inputRef} type="password" placeholder="Passcode"
              value={pass}
              onChange={e => { setPass(e.target.value); setErr(false) }}
              onKeyDown={e => e.key === 'Enter' && attempt()}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1a2535', border: `1px solid ${err ? '#ef4444' : '#2a3a50'}`,
                borderRadius: 6, color: '#e0e0e0', padding: '7px 10px', fontSize: 12, outline: 'none',
              }}
            />
            {err && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 5 }}>Incorrect</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={attempt} style={{
                flex: 1, padding: '7px 0', background: '#2563eb', border: 'none',
                borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
              }}>Enter</button>
              <button onClick={onClose} style={{
                padding: '7px 14px', background: 'transparent', border: '1px solid #2a3a50',
                borderRadius: 6, color: '#5a7a9a', fontSize: 11, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Analytics</div>
            <div style={{ fontSize: 10, color: '#4a7aaa', marginBottom: 14, lineHeight: 1.6 }}>
              Visit stats via GoatCounter — unique visitors, countries, referrers.
            </div>
            <button onClick={() => window.open(ANALYTICS_URL, '_blank')} style={{
              width: '100%', padding: '8px 0', background: '#2563eb', border: 'none',
              borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, marginBottom: 8,
            }}>Open Dashboard ↗</button>
            <button onClick={onClose} style={{
              width: '100%', padding: '6px 0', background: 'transparent', border: '1px solid #2a3a50',
              borderRadius: 6, color: '#5a7a9a', fontSize: 11, cursor: 'pointer',
            }}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Toolbar() {
  const {
    activeTool, setActiveTool,
    activeBeamMark, setActiveBeamMark,
    toggleDims, dimToggles, setDimToggle,
    show3D, toggle3D,
    past, undo, deleteSelected, clearAll, goHome,
    selectedId, wallHeightMm, setWallHeight,
    saveProject, loadProject,
    requestPDF, requestFit,
  } = useStore()

  const [dimsOpen, setDimsOpen] = useState(false)
  const [heightOpen, setHeightOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const tapCount = useRef(0)
  const tapTimer = useRef(null)
  const dimsRef  = useRef(null)
  const fileRef  = useRef(null)

  const handleBeamLabelTap = () => {
    tapCount.current += 1
    clearTimeout(tapTimer.current)
    if (tapCount.current >= 5) { tapCount.current = 0; setAnalyticsOpen(true); return }
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 1500)
  }

  useEffect(() => {
    if (!dimsOpen) return
    const handler = (e) => { if (dimsRef.current && !dimsRef.current.contains(e.target)) setDimsOpen(false) }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [dimsOpen])

  const handleFileLoad = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => loadProject(ev.target.result)
    reader.readAsText(file); e.target.value = ''
  }

  const dimsActive = Object.values(dimToggles).some(Boolean)

  return (
    <div style={{
      width: 64, background: '#0a0f1c', borderRight: '1px solid #1a2535',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 0 10px', gap: 3, userSelect: 'none', flexShrink: 0,
    }}>

      {/* Home */}
      <button
        title="Home — return to start screen"
        onClick={() => { if (confirm('Return to start? All unsaved changes will be lost.')) goHome() }}
        style={{
          ...BTN_BASE, height: 40, marginBottom: 2,
          background: '#0f1928', borderColor: '#1a2a40',
          color: '#3a6090',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1a2e50'; e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#4a90d9' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#0f1928'; e.currentTarget.style.borderColor = '#1a2a40'; e.currentTarget.style.color = '#3a6090' }}
      >
        <House size={15} strokeWidth={1.75} />
      </button>

      <Divider />

      {/* Drawing tools */}
      {TOOLS.map(t => (
        <ToolBtn
          key={t.id} id={t.id} Icon={t.Icon}
          keyHint={t.key} tip={t.tip}
          active={activeTool === t.id}
          onClick={() => setActiveTool(t.id)}
        />
      ))}

      <Divider />

      {/* Undo */}
      <ActionBtn title="Undo [Ctrl+Z]" onClick={undo} disabled={past.length === 0}>
        <Undo2 size={16} strokeWidth={1.75} />
      </ActionBtn>

      {/* Dim labels — single button, popover on click */}
      <div style={{ position: 'relative' }}>
        <button
          title="Dimension labels — click to toggle, hold to pick types [D]"
          onClick={() => setDimsOpen(o => !o)}
          style={{
            ...BTN_BASE,
            background: dimsActive ? '#2563eb' : dimsOpen ? '#1a2540' : '#131929',
            borderColor: dimsActive ? '#3b82f6' : dimsOpen ? '#2a4060' : '#1e2a3a',
            color: dimsActive ? '#fff' : '#5a7a9a',
            position: 'relative',
          }}
          onMouseEnter={e => { if (!dimsActive && !dimsOpen) { e.currentTarget.style.background = '#1a2540'; e.currentTarget.style.borderColor = '#2a4060'; e.currentTarget.style.color = '#8ab0d0' } }}
          onMouseLeave={e => { if (!dimsActive && !dimsOpen) { e.currentTarget.style.background = '#131929'; e.currentTarget.style.borderColor = '#1e2a3a'; e.currentTarget.style.color = '#5a7a9a' } }}
        >
          <Ruler size={16} strokeWidth={dimsActive ? 2 : 1.75} />
          <span style={{ fontSize: 7, letterSpacing: 0.5, fontWeight: 600, opacity: dimsActive ? 0.9 : 0.5 }}>D</span>
          <ChevronDown size={8} style={{ position: 'absolute', bottom: 3, right: 3, opacity: 0.4 }} />
        </button>

        {dimsOpen && (
          <div ref={dimsRef} style={{
            position: 'fixed', left: 68, zIndex: 200,
            background: '#0f1825', border: '1px solid #1e2a3a',
            borderRadius: 10, padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)', minWidth: 160,
          }}>
            <div style={{ fontSize: 9, color: '#4a90d9', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
              Dim Labels
            </div>
            {[
              { key: 'wall',   label: 'Walls',   color: '#d0d0d0' },
              { key: 'beam',   label: 'Beams',   color: '#FFD700' },
              { key: 'column', label: 'Columns', color: '#ffffff' },
              { key: 'slab',   label: 'Slabs',   color: '#4a90d9' },
            ].map(({ key, label, color }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, cursor: 'pointer', fontSize: 11, color }}>
                <input type="checkbox" checked={!!dimToggles[key]} onChange={e => setDimToggle(key, e.target.checked)} style={{ accentColor: color, width: 13, height: 13 }} />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Fit to view */}
      <ActionBtn title="Fit to view [F]" onClick={requestFit}>
        <Scan size={16} strokeWidth={1.75} />
      </ActionBtn>

      {/* 3D */}
      <ActionBtn title="Toggle 3D view [3]" onClick={toggle3D} active={show3D}>
        <Box size={16} strokeWidth={1.75} />
      </ActionBtn>

      <Divider />

      {/* Wall height */}
      <button
        title="Set wall / storey height"
        onClick={() => setHeightOpen(o => !o)}
        style={{
          ...BTN_BASE, height: 46,
          background: heightOpen ? '#1a2840' : '#131929',
          borderColor: heightOpen ? '#2563eb' : '#1e2a3a',
          color: '#5a7a9a',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1a2540'; e.currentTarget.style.borderColor = '#2a4060' }}
        onMouseLeave={e => { e.currentTarget.style.background = heightOpen ? '#1a2840' : '#131929'; e.currentTarget.style.borderColor = heightOpen ? '#2563eb' : '#1e2a3a' }}
      >
        <ArrowUpDown size={13} strokeWidth={1.75} color="#4a7a9a" />
        <span style={{ fontSize: 8, color: '#6a9abd', fontWeight: 600, lineHeight: 1, letterSpacing: 0.2 }}>
          {heightLabel(wallHeightMm)}
        </span>
      </button>

      {heightOpen && (
        <HeightPopover wallHeightMm={wallHeightMm} setWallHeight={setWallHeight} onClose={() => setHeightOpen(false)} />
      )}

      <div style={{ flex: 1 }} />

      {/* File actions */}
      <ActionBtn title="Export dimensioned PDF (A3 landscape)" onClick={requestPDF}>
        <FileDown size={16} strokeWidth={1.75} />
      </ActionBtn>
      <ActionBtn title="Save project as JSON" onClick={saveProject}>
        <Save size={16} strokeWidth={1.75} />
      </ActionBtn>
      <ActionBtn title="Load project from JSON" onClick={() => fileRef.current?.click()}>
        <FolderOpen size={16} strokeWidth={1.75} />
      </ActionBtn>
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileLoad} />

      <Divider />

      {/* Delete / Clear */}
      <ActionBtn title="Delete selected [Del]" onClick={deleteSelected} disabled={!selectedId} danger>
        <Trash2 size={16} strokeWidth={1.75} />
      </ActionBtn>
      <ActionBtn title="Clear all elements" onClick={() => { if (confirm('Clear all elements?')) clearAll() }}>
        <X size={16} strokeWidth={1.75} />
      </ActionBtn>

      {/* Beam mark picker */}
      <div style={{ width: 48, marginTop: 6, marginBottom: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div onClick={handleBeamLabelTap} style={{ fontSize: 7, color: '#2a3a50', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'default', userSelect: 'none' }}>Beam</div>
        {[['B1', COLORS.B1], ['B2', COLORS.B2], ['B3', COLORS.B3], ['B4', COLORS.B4]].map(([m, c]) => {
          const active = activeBeamMark === m
          return (
            <button key={m} title={`Draw beams as ${m}`}
              onClick={() => { setActiveBeamMark(m); setActiveTool('beam') }}
              style={{
                width: '100%', height: 22,
                background: active ? c + '22' : 'transparent',
                border: active ? `1px solid ${c}88` : '1px solid #1a2535',
                borderRadius: 5, display: 'flex', alignItems: 'center', gap: 5,
                padding: '0 6px', cursor: 'pointer', transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = c + '44' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#1a2535' }}
            >
              <div style={{ width: 6, height: 6, borderRadius: 2, background: c, flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: active ? c : '#3a5070', fontWeight: active ? 700 : 400 }}>{m}</span>
            </button>
          )
        })}
      </div>
      {analyticsOpen && <AnalyticsModal onClose={() => setAnalyticsOpen(false)} />}
    </div>
  )
}
