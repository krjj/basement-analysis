import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Stage, Layer, Line, Rect, Circle, Text, Group, Arrow } from 'react-konva'
import useStore from '../store/useStore'
import { COLORS, BEAM_SCHEDULES } from '../utils/constants'
import { fmtLen, toMM } from '../utils/units'
import { getBeamTribDetail } from '../utils/capacity/index'
import { detectRegion } from '../utils/regionDetect'
import { exportPDF } from '../utils/exportPDF'

const SCALE_FACTOR = 1.12

// Nice grid sizes in mm — used for both rendering and snapping
const NICE_GRID = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]

// Returns { minor, major } grid sizes in mm for the current scale.
// Targets ~8 screen-pixels between minor lines so 1mm is reachable at high zoom.
function calcGrid(scale) {
  const idealMm = 8 / scale
  const minor = NICE_GRID.find(v => v >= idealMm) ?? 5000
  const majorIdx = NICE_GRID.indexOf(minor)
  const major = NICE_GRID[Math.min(majorIdx + 3, NICE_GRID.length - 1)]
  return { minor, major }
}

const BEAM_COLOR = (mark) => COLORS[mark] || COLORS.CUSTOM

export default function DrawingCanvas({ canvasWidth, canvasHeight }) {
  const stageRef = useRef(null)

  const primaryUnit = useStore(s => s.primaryUnit)
  const fmt = useCallback((mm) => fmtLen(mm, primaryUnit), [primaryUnit])

  const {
    activeTool, setActiveTool, dimToggles, setDimToggle,
    activeBeamMark,
    columns, walls, beams, slabs,
    addColumn, addWall, addBeam, addSlab,
    updateElement,
    selectedId, selectedType, setSelected,
    drawingState, setDrawingState,
    deleteSelected, undo,
    scale, offset, setScale, setOffset, fitToView,
    pdfTrigger, fitTrigger, projectName, wallHeightMm,
  } = useStore()

  // ── PDF export ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfTrigger) return
    const stage = stageRef.current
    if (!stage) return

    // Turn all dims on, wait two frames for Konva to repaint, then capture
    const prev = { ...dimToggles }
    ;['beam', 'wall', 'column', 'slab'].forEach(k => setDimToggle(k, true))

    const capture = () => {
      const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' })
      exportPDF(
        dataUrl,
        { columns, walls, beams, slabs, wallHeightMm, projectName, primaryUnit, dimToggles },
        canvasWidth,
        canvasHeight,
        scale
      ).finally(() => {
        // Restore dim toggles
        Object.keys(prev).forEach(k => setDimToggle(k, prev[k]))
      })
    }

    // Two rAFs to let React re-render + Konva repaint before screenshot
    requestAnimationFrame(() => requestAnimationFrame(capture))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfTrigger])

  // ── Fit to view ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fitTrigger) return
    fitToView(canvasWidth, canvasHeight)
  }, [fitTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic grid size based on zoom
  const { minor: gridSize, major: majorSize } = calcGrid(scale)
  const snap = useCallback((val) => Math.round(val / gridSize) * gridSize, [gridSize])

  const [cursorWorld, setCursorWorld] = useState(null)
  const [preview, setPreview]         = useState(null)
  const [lengthStr, setLengthStr]     = useState('')
  const [orthoLock, setOrthoLock]     = useState(false)   // Shift held
  const [orthoMode, setOrthoMode]     = useState(false)   // persistent toggle (O key)
  const [dragState, setDragState]     = useState(null)    // column drag
  const [labelEdit, setLabelEdit]     = useState(null)    // { id, sx, sy, value }
  const [hoveredBeamId, setHoveredBeamId] = useState(null)
  const [hoverRegion,   setHoverRegion]   = useState(null)
  const [tribBoxPos,    setTribBoxPos]    = useState(null)  // dragged position of trib info box
  const labelInputRef                  = useRef(null)
  const lengthInputRef                = useRef(null)
  const isPanning  = useRef(false)
  const panOrigin  = useRef(null)
  const justDragged = useRef(false)   // suppress click-deselect after drag

  // Constrain point to nearest 90° axis from start
  const orthoSnap = (start, pt) => {
    const dx = Math.abs(pt.x - start.x), dy = Math.abs(pt.y - start.y)
    return dx >= dy ? { x: pt.x, y: start.y } : { x: start.x, y: pt.y }
  }

  // Snap to nearest 45° when within threshold — auto-snap to 0/90/180/270 when close
  const angleSnap = (start, pt, threshDeg = 8) => {
    const dx = pt.x - start.x, dy = pt.y - start.y
    const len = Math.hypot(dx, dy)
    if (len < 1) return pt
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI
    const snapped  = Math.round(angleDeg / 90) * 90   // nearest cardinal
    if (Math.abs(angleDeg - snapped) <= threshDeg || Math.abs(Math.abs(angleDeg - snapped) - 360) <= threshDeg) {
      const rad = snapped * Math.PI / 180
      return { x: Math.round(start.x + len * Math.cos(rad)), y: Math.round(start.y + len * Math.sin(rad)) }
    }
    return pt
  }

  // Whether ortho is active (persistent mode OR shift held)
  const isOrtho = orthoMode || orthoLock

  // true when a first point has been placed for wall or beam
  const isDrawingLinear = (activeTool === 'wall' || activeTool === 'beam') && !!drawingState?.startPoint

  // ── Drag snap candidates ───────────────────────────────
  // Returns X and Y snap lines for alignment, and a function that checks
  // both center AND edge alignment for the column being dragged.
  const getDragSnapCandidates = useCallback((excludeId) => {
    const xs = new Set(), ys = new Set()

    walls.forEach(w => {
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y
      const len = Math.hypot(dx, dy)
      if (len < 1) return
      // Endpoints (corners)
      xs.add(w.start.x); xs.add(w.end.x)
      ys.add(w.start.y); ys.add(w.end.y)
      // Midpoint
      xs.add((w.start.x + w.end.x) / 2)
      ys.add((w.start.y + w.end.y) / 2)
      // Both inner and outer face lines
      const t = w.thickness / 2
      if (Math.abs(dy) < Math.abs(dx)) {       // horizontal wall → faces are top/bottom
        ys.add(w.start.y + t); ys.add(w.start.y - t)
        // Also center line
        ys.add(w.start.y)
      } else {                                  // vertical wall → faces are left/right
        xs.add(w.start.x + t); xs.add(w.start.x - t)
        xs.add(w.start.x)
      }
    })

    columns.forEach(c => {
      if (c.id === excludeId) return
      // Center + 4 edges of every other column
      xs.add(c.x); xs.add(c.x - c.width / 2); xs.add(c.x + c.width / 2)
      ys.add(c.y); ys.add(c.y - c.depth / 2); ys.add(c.y + c.depth / 2)
    })

    beams.forEach(b => {
      xs.add(b.start.x); xs.add(b.end.x)
      ys.add(b.start.y); ys.add(b.end.y)
    })

    return { xs: [...xs], ys: [...ys] }
  }, [walls, columns, beams])

  // Auto-focus label input when it opens
  useEffect(() => {
    if (labelEdit && labelInputRef.current) {
      labelInputRef.current.focus()
      labelInputRef.current.select()
    }
  }, [labelEdit?.id])

  const commitLabelEdit = () => {
    if (labelEdit) {
      updateElement('beam', labelEdit.id, { label: labelEdit.value })
      setLabelEdit(null)
    }
  }

  // Parse typed length string → mm (null if invalid)
  const lengthOverrideMm = (() => {
    if (!lengthStr.trim()) return null
    const mm = toMM(lengthStr, primaryUnit)
    return isNaN(mm) || mm <= 0 ? null : mm
  })()

  // Project endpoint along cursor direction at an exact distance
  const endpointAtLength = (start, dir, lenMm) => {
    const dx = dir.x - start.x, dy = dir.y - start.y
    const d  = Math.hypot(dx, dy)
    if (d < 1) return { x: Math.round(start.x + lenMm), y: start.y }
    return { x: Math.round(start.x + dx / d * lenMm), y: Math.round(start.y + dy / d * lenMm) }
  }

  // Commit the typed length along current cursor direction
  const commitLength = useCallback(() => {
    if (!lengthOverrideMm || !drawingState?.startPoint || !cursorWorld) return
    const ep = endpointAtLength(drawingState.startPoint, cursorWorld, lengthOverrideMm)
    if (activeTool === 'wall') {
      addWall(drawingState.startPoint, ep)
      setDrawingState({ startPoint: ep })
    } else if (activeTool === 'beam') {
      addBeam(drawingState.startPoint, ep, activeBeamMark)
      setDrawingState(null)
    }
    setPreview(null)
    setLengthStr('')
  }, [lengthOverrideMm, drawingState, cursorWorld, activeTool, addWall, addBeam, setDrawingState, activeBeamMark])

  // ── Coord helpers ─────────────────────────────────────
  const wx  = useCallback((x) => x * scale + offset.x, [scale, offset])
  const wy  = useCallback((y) => y * scale + offset.y, [scale, offset])
  const ws  = useCallback((s) => s * scale, [scale])

  const toWorld = useCallback((sx, sy) => ({
    x: (sx - offset.x) / scale,
    y: (sy - offset.y) / scale,
  }), [scale, offset])

  const getSnapped = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return null
    const p = stage.getPointerPosition()
    if (!p) return null
    const w = toWorld(p.x, p.y)
    const gridPt = { x: snap(w.x), y: snap(w.y) }

    // ── Priority 1: snap to nearest column snap points (when cursor near column)
    // For beam tool: face/corner points only — centre is excluded so beams are
    // drawn face-to-face (clear span), matching IS 456 Cl. 22.2 convention.
    const colProximity = 56 / scale   // screen pixels in world units
    let bestColPt = null, bestColD = colProximity
    for (const c of columns) {
      const hw = c.width / 2, hd = c.depth / 2
      const pts = [
        // Centre — only available for non-beam tools (column placement, selection, etc.)
        ...(activeTool !== 'beam' ? [{ x: c.x, y: c.y }] : []),
        { x: c.x - hw, y: c.y      },   // left face mid
        { x: c.x + hw, y: c.y      },   // right face mid
        { x: c.x,      y: c.y - hd },   // top face mid
        { x: c.x,      y: c.y + hd },   // bottom face mid
        { x: c.x - hw, y: c.y - hd },   // TL corner
        { x: c.x + hw, y: c.y - hd },   // TR corner
        { x: c.x - hw, y: c.y + hd },   // BL corner
        { x: c.x + hw, y: c.y + hd },   // BR corner
      ]
      for (const pt of pts) {
        const d = Math.hypot(w.x - pt.x, w.y - pt.y)
        if (d < bestColD) { bestColPt = pt; bestColD = d }
      }
    }
    if (bestColPt) return bestColPt

    // ── Priority 2: wall-face lock for beam tool ──────────
    // If the cursor is inside a wall's body, unconditionally push the snap
    // point to the nearest face — overrides grid so beams can't be placed
    // inside walls regardless of grid alignment.
    if (activeTool === 'beam') {
      for (const wl of walls) {
        const dx = wl.end.x - wl.start.x, dy = wl.end.y - wl.start.y
        const len = Math.hypot(dx, dy)
        if (len < 1) continue
        const nxU = -dy / len, nyU = dx / len            // unit normal
        const thk = (wl.thickness ?? 230) / 2
        const t = ((w.x - wl.start.x) * dx + (w.y - wl.start.y) * dy) / (len * len)
        if (t < -0.02 || t > 1.02) continue              // outside wall length
        const tc   = Math.max(0, Math.min(1, t))
        const projX = wl.start.x + tc * dx
        const projY = wl.start.y + tc * dy
        const perp  = (w.x - projX) * nxU + (w.y - projY) * nyU   // signed perp dist
        if (Math.abs(perp) < thk) {
          // Cursor is inside wall body — snap to nearest face
          const sign = perp >= 0 ? 1 : -1
          return { x: projX + nxU * thk * sign, y: projY + nyU * thk * sign }
        }
      }
    }

    // ── Priority 3: snap to wall endpoints / beam endpoints ──
    // For beam tool: also offer wall face at cursor's projected position
    // so beams snap to faces for T-intersections anywhere along the wall.
    const thresh = 28 / scale
    const candidates = [
      ...walls.flatMap(wl => {
        const base = [wl.start, wl.end]
        if (activeTool !== 'beam') return base
        const dx = wl.end.x - wl.start.x, dy = wl.end.y - wl.start.y
        const len = Math.hypot(dx, dy)
        if (len < 1) return base
        const nx = -dy / len * (wl.thickness ?? 230) / 2
        const ny =  dx / len * (wl.thickness ?? 230) / 2
        const t = Math.max(0, Math.min(1, ((w.x - wl.start.x) * dx + (w.y - wl.start.y) * dy) / (len * len)))
        const projX = wl.start.x + t * dx
        const projY = wl.start.y + t * dy
        return [
          ...base,
          { x: projX + nx, y: projY + ny },   // face 1 at cursor projection
          { x: projX - nx, y: projY - ny },   // face 2 at cursor projection
        ]
      }),
      ...beams.flatMap(b => [b.start, b.end]),
    ]
    let best = null, bestD = thresh
    for (const pt of candidates) {
      const d = Math.hypot(w.x - pt.x, w.y - pt.y)
      if (d < bestD) { best = pt; bestD = d }
    }
    return best ?? gridPt
  }, [toWorld, scale, snap, columns, walls, beams])

  // ── Keyboard ──────────────────────────────────────────
  useEffect(() => {
    const onShift = (e) => { if (e.key === 'Shift') setOrthoLock(true)  }
    const onShiftUp = (e) => { if (e.key === 'Shift') setOrthoLock(false) }
    window.addEventListener('keydown', onShift)
    window.addEventListener('keyup',   onShiftUp)
    return () => { window.removeEventListener('keydown', onShift); window.removeEventListener('keyup', onShiftUp) }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'SELECT') return
      // If the length input is focused, let it handle its own keys
      if (e.target === lengthInputRef.current) return

      if (e.target.tagName === 'INPUT') return

      const k = e.key.toLowerCase()

      // Direct distance entry: digit/decimal pressed while linear drawing active
      if (isDrawingLinear && /^[\d.]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        setLengthStr(prev => prev + e.key)
        setTimeout(() => lengthInputRef.current?.focus(), 0)
        return
      }
      if (isDrawingLinear && e.key === 'Backspace') {
        setLengthStr(prev => prev.slice(0, -1))
        return
      }

      if (k === 'v') setActiveTool('select')
      if (k === 'h') setActiveTool('pan')
      if (k === 'c') setActiveTool('column')
      if (k === 'w') setActiveTool('wall')
      if (k === 'b') setActiveTool('beam')
      if (k === 'a') setActiveTool('slab')
      if (k === 'o') setOrthoMode(m => !m)
      if (k === 'escape') { setDrawingState(null); setPreview(null); setSelected(null, null); setLengthStr('') }
      if (k === 'delete') deleteSelected()
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setActiveTool, setDrawingState, setSelected, deleteSelected, undo, isDrawingLinear, commitLength])

  // ── Zoom ─────────────────────────────────────────────
  const handleWheel = (e) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    const ptr   = stage.getPointerPosition()
    const oldSc = scale
    const dir   = e.evt.deltaY < 0 ? SCALE_FACTOR : 1 / SCALE_FACTOR
    const newSc = Math.max(0.008, Math.min(20.0, oldSc * dir))
    const wpt   = toWorld(ptr.x, ptr.y)
    setScale(newSc)
    setOffset({ x: ptr.x - wpt.x * newSc, y: ptr.y - wpt.y * newSc })
  }

  // ── Mouse ─────────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (dragState) return   // column drag in progress — don't start pan
    if (activeTool === 'pan' || e.evt.button === 1) {
      isPanning.current = true
      panOrigin.current = { x: e.evt.clientX, y: e.evt.clientY, ox: offset.x, oy: offset.y }
      e.evt.preventDefault()
    }
  }
  const handleMouseUp = () => {
    isPanning.current = false
    if (dragState) {
      updateElement('column', dragState.id, { x: dragState.curX, y: dragState.curY })
      setDragState(null)
      justDragged.current = true
    }
  }

  const handleMouseMove = (e) => {
    if (isPanning.current && panOrigin.current) {
      setOffset({
        x: panOrigin.current.ox + e.evt.clientX - panOrigin.current.x,
        y: panOrigin.current.oy + e.evt.clientY - panOrigin.current.y,
      })
      return
    }
    // ── Column drag ───────────────────────────────────────
    if (dragState) {
      const stage = stageRef.current
      const p = stage?.getPointerPosition()
      if (!p) return
      const world = toWorld(p.x, p.y)   // raw — no grid snap yet

      const col = columns.find(c => c.id === dragState.id)
      const hw = col ? col.width / 2 : 0   // half-width
      const hd = col ? col.depth / 2 : 0   // half-depth

      const { xs, ys } = getDragSnapCandidates(dragState.id)
      const thresh = 16 / scale   // 16 screen pixels in world units
      let newX = null, newY = null, guideX = null, guideY = null

      // Check center AND all 4 edges of the column against each snap line
      for (const sx of xs) {
        for (const offset of [0, -hw, hw]) {
          if (Math.abs((world.x + offset) - sx) < thresh) {
            newX = sx - offset   // back-compute center position
            guideX = sx
            break
          }
        }
        if (newX !== null) break
      }
      for (const sy of ys) {
        for (const offset of [0, -hd, hd]) {
          if (Math.abs((world.y + offset) - sy) < thresh) {
            newY = sy - offset
            guideY = sy
            break
          }
        }
        if (newY !== null) break
      }

      // Fall back to grid snap only when no alignment found
      if (newX === null) newX = snap(world.x)
      if (newY === null) newY = snap(world.y)

      setDragState(d => ({ ...d, curX: newX, curY: newY, guideX, guideY }))
      return
    }

    let snapped = getSnapped()
    if (!snapped) return

    // Orthogonal constraint: full lock when ortho mode/shift, else auto-snap near 0/90°
    if (drawingState?.startPoint && (activeTool === 'wall' || activeTool === 'beam')) {
      if (isOrtho) {
        snapped = orthoSnap(drawingState.startPoint, snapped)
      } else {
        snapped = angleSnap(drawingState.startPoint, snapped, 8)
      }
    }

    setCursorWorld(snapped)

    if ((activeTool === 'wall' || activeTool === 'beam') && drawingState?.startPoint)
      setPreview({ type: activeTool, start: drawingState.startPoint, end: snapped })
    else if (activeTool === 'slab' && drawingState?.points?.length)
      setPreview({ type: 'slab', points: drawingState.points, cursor: snapped })
    else
      setPreview(null)

    // Slab region fill: detect closed loop under cursor while no polygon is started
    if (activeTool === 'slab' && !drawingState?.points?.length) {
      setHoverRegion(detectRegion(snapped, walls, beams))
    } else {
      setHoverRegion(null)
    }
  }

  const handleClick = (e) => {
    if (e.evt.button !== 0 || isPanning.current || activeTool === 'pan') return
    const snapped = getSnapped()
    if (!snapped) return

    if (activeTool === 'column') {
      addColumn(snapped.x, snapped.y)
    } else if (activeTool === 'wall') {
      if (!drawingState?.startPoint) {
        setDrawingState({ startPoint: snapped })
      } else {
        addWall(drawingState.startPoint, snapped)
        setDrawingState({ startPoint: snapped })   // chain
        setPreview(null)
      }
    } else if (activeTool === 'beam') {
      if (!drawingState?.startPoint) {
        setDrawingState({ startPoint: snapped })
      } else {
        addBeam(drawingState.startPoint, snapped, activeBeamMark)
        setDrawingState(null); setPreview(null)
      }
    } else if (activeTool === 'slab') {
      const pts = drawingState?.points || []

      // Auto-fill: if no polygon started, try to detect a closed region and fill it
      if (pts.length === 0) {
        const region = detectRegion(snapped, walls, beams)
        if (region) { addSlab(region); setHoverRegion(null); return }
      }

      // Manual polygon drawing
      if (pts.length >= 3) {
        const d = Math.hypot(snapped.x - pts[0].x, snapped.y - pts[0].y)
        if (d < Math.max(gridSize * 2, 100)) { addSlab(pts); setDrawingState(null); setPreview(null); return }
      }
      setDrawingState({ points: [...pts, snapped] })
    } else if (activeTool === 'select' && e.target === stageRef.current) {
      if (justDragged.current) { justDragged.current = false; return }
      setSelected(null, null)
    }
  }

  const handleDblClick = () => {
    if (activeTool === 'slab' && drawingState?.points?.length >= 3) {
      addSlab(drawingState.points); setDrawingState(null); setPreview(null)
    } else if (activeTool === 'wall') {
      setDrawingState(null); setPreview(null)
    }
  }

  // Reset trib box position whenever the focused beam changes
  useEffect(() => { setTribBoxPos(null) }, [selectedId, hoveredBeamId])

  // ── Grid ─────────────────────────────────────────────
  const renderGrid = () => {
    const lines = []
    const minX = -offset.x / scale, maxX = (canvasWidth  - offset.x) / scale
    const minY = -offset.y / scale, maxY = (canvasHeight - offset.y) / scale
    const sx = Math.floor(minX / gridSize) * gridSize
    const sy = Math.floor(minY / gridSize) * gridSize
    for (let gx = sx; gx <= maxX; gx += gridSize) {
      const maj = Math.round(gx) % majorSize === 0
      lines.push(<Line key={`vg${gx}`} points={[wx(gx),0,wx(gx),canvasHeight]}
        stroke={maj ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={maj?1:0.5} listening={false} />)
    }
    for (let gy = sy; gy <= maxY; gy += gridSize) {
      const maj = Math.round(gy) % majorSize === 0
      lines.push(<Line key={`hg${gy}`} points={[0,wy(gy),canvasWidth,wy(gy)]}
        stroke={maj ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={maj?1:0.5} listening={false} />)
    }
    lines.push(
      <Line key="ox" points={[wx(0)-10,wy(0),wx(0)+10,wy(0)]} stroke="#3b82f6" strokeWidth={1.5} listening={false} />,
      <Line key="oy" points={[wx(0),wy(0)-10,wx(0),wy(0)+10]} stroke="#3b82f6" strokeWidth={1.5} listening={false} />,
    )
    return lines
  }

  // ── Dim label helper ──────────────────────────────────
  const dimLine = (x1, y1, x2, y2, text, color = COLORS.dimLine, offset2 = 18) => {
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len < 1) return null
    const nx = -dy / len, ny = dx / len  // normal
    const ox = nx * offset2, oy = ny * offset2
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    return (
      <Group listening={false}>
        <Line points={[x1, y1, x1 + ox, y1 + oy]} stroke={color} strokeWidth={0.8} dash={[3,3]} />
        <Line points={[x2, y2, x2 + ox, y2 + oy]} stroke={color} strokeWidth={0.8} dash={[3,3]} />
        <Line points={[x1 + ox, y1 + oy, x2 + ox, y2 + oy]} stroke={color} strokeWidth={1} />
        {/* Arrow ticks */}
        <Line points={[x1+ox-nx*4+dx/len*4, y1+oy-ny*4+dy/len*4, x1+ox, y1+oy, x1+ox+nx*4+dx/len*4, y1+oy+ny*4+dy/len*4]} stroke={color} strokeWidth={1} />
        <Line points={[x2+ox-nx*4-dx/len*4, y2+oy-ny*4-dy/len*4, x2+ox, y2+oy, x2+ox+nx*4-dx/len*4, y2+oy+ny*4-dy/len*4]} stroke={color} strokeWidth={1} />
        <Text x={mx + ox - 24} y={my + oy - 7} text={text}
          fontSize={9} fill={color} fontStyle="bold" />
      </Group>
    )
  }

  // ── Render walls ──────────────────────────────────────
  const renderWalls = () => walls.map(w => {
    const sel = selectedId === w.id
    const thk = Math.max(3, ws(w.thickness))
    return (
      <Group key={w.id} onClick={() => setSelected(w.id, 'wall')}>
        <Line
          points={[wx(w.start.x), wy(w.start.y), wx(w.end.x), wy(w.end.y)]}
          stroke={sel ? COLORS.selected : COLORS.wall}
          strokeWidth={thk} lineCap="square" />
      </Group>
    )
  })

  // ── Render columns ────────────────────────────────────
  const renderColumns = () => columns.map(c => {
    const sel     = selectedId === c.id
    const isDragging = dragState?.id === c.id
    const cx      = isDragging ? dragState.curX : c.x
    const cy      = isDragging ? dragState.curY : c.y
    const cw      = Math.max(8, ws(c.width))
    const cd      = Math.max(8, ws(c.depth))
    const color   = isDragging ? '#f59e0b' : sel ? COLORS.selected : COLORS.column

    return (
      <Group key={c.id}
        onMouseDown={(e) => {
          if (activeTool !== 'select' || e.evt.button !== 0) return
          e.cancelBubble = true
          setSelected(c.id, 'column')
          setDragState({ id: c.id, curX: c.x, curY: c.y, guideX: null, guideY: null })
        }}
        onClick={(e) => {
          if (activeTool === 'select') {
            e.cancelBubble = true
            setSelected(c.id, 'column')
          }
          // Other tools (beam, wall…) — let click bubble to Stage so drawing works
        }}
      >
        <Rect x={wx(cx)-cw/2} y={wy(cy)-cd/2} width={cw} height={cd}
          fill={isDragging ? '#1a1a00' : '#111'}
          stroke={color} strokeWidth={sel || isDragging ? 2 : 1.5}
          opacity={isDragging ? 0.75 : 1}
        />
        <Line points={[wx(cx)-cw/2, wy(cy)-cd/2, wx(cx)+cw/2, wy(cy)+cd/2]}
          stroke={color} strokeWidth={0.8} listening={false} />
        <Line points={[wx(cx)+cw/2, wy(cy)-cd/2, wx(cx)-cw/2, wy(cy)+cd/2]}
          stroke={color} strokeWidth={0.8} listening={false} />
        {/* Snap point markers */}
        {(sel || (cursorWorld && (() => {
          const hw = c.width/2, hd = c.depth/2, prox = 56/scale
          return Math.hypot(cursorWorld.x - cx, cursorWorld.y - cy) < Math.hypot(hw + prox, hd + prox)
        })())) && [
          { x: cx,    y: cy    }, { x: cx-c.width/2, y: cy    }, { x: cx+c.width/2, y: cy    },
          { x: cx,    y: cy-c.depth/2 }, { x: cx, y: cy+c.depth/2 },
          { x: cx-c.width/2, y: cy-c.depth/2 }, { x: cx+c.width/2, y: cy-c.depth/2 },
          { x: cx-c.width/2, y: cy+c.depth/2 }, { x: cx+c.width/2, y: cy+c.depth/2 },
        ].map((pt, i) => {
          const snapped = cursorWorld &&
            Math.hypot(cursorWorld.x - pt.x, cursorWorld.y - pt.y) < 4/scale
          return (
            <Rect key={i}
              x={wx(pt.x)-3} y={wy(pt.y)-3} width={6} height={6}
              fill={snapped ? '#22c55e' : 'transparent'}
              stroke={snapped ? '#22c55e' : '#44aa6688'}
              strokeWidth={1} listening={false} rotation={45}
            />
          )
        })}
      </Group>
    )
  })

  // ── Render beams ──────────────────────────────────────
  // ── Tributary geometry helpers ────────────────────────
  const projectPtOnLine = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    if (len2 < 1) return { t: 0, perp: 0 }
    const t = ((px - ax) * dx + (py - ay) * dy) / len2
    const cx = ax + t * dx, cy = ay + t * dy
    return { t, perp: Math.hypot(px - cx, py - cy) }
  }

  const slabAdjacentToBeam = (beam, slab, snapTol = 300) => {
    const pts = slab.points ?? []
    const { start: bs, end: be } = beam
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length]
      const r1 = projectPtOnLine(p1.x, p1.y, bs.x, bs.y, be.x, be.y)
      const r2 = projectPtOnLine(p2.x, p2.y, bs.x, bs.y, be.x, be.y)
      if (r1.perp < snapTol && r2.perp < snapTol && r1.t >= -0.1 && r2.t <= 1.1)
        return true
    }
    return false
  }

  const renderTributary = () => {
    // Show on beam SELECTION (click) as primary, hover as secondary
    const beamId = (selectedType === 'beam' && selectedId) ? selectedId : hoveredBeamId
    if (!beamId) return null
    const beam = beams.find(b => b.id === beamId)
    if (!beam || !beam.start || !beam.end) return null

    const { slabData, tribLeft, tribRight } = getBeamTribDetail(beam, slabs)
    if (!slabData.length) return null

    const { start: bs, end: be } = beam
    const bLen = Math.hypot(be.x - bs.x, be.y - bs.y)
    if (bLen < 1) return null

    const ux = (be.x - bs.x) / bLen   // unit along beam (world)
    const uy = (be.y - bs.y) / bLen
    const nxW = -uy, nyW = ux          // perp unit (world, same in screen — isotropic)

    const COL_L = '#3b82f6'   // blue  — left side
    const COL_R = '#f97316'   // orange — right side

    // ── Compute IS 456 45° zone polygon for a slab (returns flat screen-coord array)
    const getZonePts = (d) => {
      const { slab, side } = d
      const pts = slab.points ?? []
      const snapTol = 300
      let minT = Infinity, maxT = -Infinity
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i], p2 = pts[(i + 1) % pts.length]
        const r1 = projectPtOnLine(p1.x, p1.y, bs.x, bs.y, be.x, be.y)
        const r2 = projectPtOnLine(p2.x, p2.y, bs.x, bs.y, be.x, be.y)
        if (r1.perp < snapTol && r2.perp < snapTol && r1.t >= -0.1 && r2.t <= 1.1) {
          minT = Math.min(minT, Math.max(0, Math.min(r1.t, r2.t)))
          maxT = Math.max(maxT, Math.min(1, Math.max(r1.t, r2.t)))
        }
      }
      if (!isFinite(minT)) return null
      const lxHalf = (slab.shortSpan ?? 3000) / 2   // world mm
      const edgeProjLen = (maxT - minT) * bLen

      // World-space edge endpoints
      const e1x = bs.x + ux * minT * bLen, e1y = bs.y + uy * minT * bLen
      const e2x = bs.x + ux * maxT * bLen, e2y = bs.y + uy * maxT * bLen
      // Perp direction into slab
      const pdx = side * nxW, pdy = side * nyW

      if (edgeProjLen <= lxHalf * 2) {
        // Triangle — 45° lines meet before reaching lx/2
        const apexD = edgeProjLen / 2
        const ax = (e1x + e2x) / 2 + pdx * apexD
        const ay = (e1y + e2y) / 2 + pdy * apexD
        return [wx(e1x), wy(e1y), wx(e2x), wy(e2y), wx(ax), wy(ay)]
      } else {
        // Trapezoid — flat top at depth lx/2
        const v3x = e2x - ux * lxHalf + pdx * lxHalf
        const v3y = e2y - uy * lxHalf + pdy * lxHalf
        const v4x = e1x + ux * lxHalf + pdx * lxHalf
        const v4y = e1y + uy * lxHalf + pdy * lxHalf
        return [wx(e1x), wy(e1y), wx(e2x), wy(e2y), wx(v3x), wy(v3y), wx(v4x), wy(v4y)]
      }
    }

    const midSx = (wx(bs.x) + wx(be.x)) / 2
    const midSy = (wy(bs.y) + wy(be.y)) / 2
    const sx1 = wx(bs.x), sy1 = wy(bs.y)
    const sx2 = wx(be.x), sy2 = wy(be.y)
    const lOff = ws(tribLeft)
    const rOff = ws(tribRight)

    const elems = []

    // ── Visual only: slab highlights + 45° zone fills + band outlines ──
    // No text on canvas — all numbers go into the summary box.
    slabData.forEach((d, i) => {
      const col = d.side < 0 ? COL_L : COL_R
      const slabPts = d.slab.points.flatMap(p => [wx(p.x), wy(p.y)])
      elems.push(
        <Line key={`sh${i}`} points={slabPts} closed
          fill={col + '0c'} stroke={col + '38'}
          strokeWidth={1} dash={[5, 5]} listening={false} />
      )
      const zone = getZonePts(d)
      if (zone) elems.push(
        <Line key={`z${i}`} points={zone} closed
          fill={col + '28'} stroke={col + 'aa'}
          strokeWidth={1.5} listening={false} />
      )
    })

    // BM-equivalent band outlines (dashed) + one arrow per side (no text)
    const addBand = (key, sign, off, col) => {
      if (off < 1) return
      const px1 = sx1 + sign * nxW * off, py1 = sy1 + sign * nyW * off
      const px2 = sx2 + sign * nxW * off, py2 = sy2 + sign * nyW * off
      elems.push(
        <Line key={`b${key}`} points={[px1, py1, px2, py2, sx2, sy2, sx1, sy1]}
          closed fill={col + '12'} stroke={col + '70'}
          strokeWidth={1} dash={[8, 5]} listening={false} />,
        <Arrow key={`a${key}`}
          points={[midSx, midSy, midSx + sign * nxW * off, midSy + sign * nyW * off]}
          stroke={col} strokeWidth={1.5} pointerLength={6} pointerWidth={5}
          fill={col} listening={false} />
      )
    }
    addBand('l', -1, lOff, COL_L)
    addBand('r', +1, rOff, COL_R)

    // ── Info box: all labels consolidated, color-coded ──────────────
    const beamLenM = bLen / 1000
    const areaSqM  = beamLenM * (tribLeft + tribRight) / 1000
    return <Group listening={false}>{elems}</Group>
  }

  // ── Draggable trib info box (separate interactive layer) ──────────
  const renderTribInfoBox = () => {
    const beamId = (selectedType === 'beam' && selectedId) ? selectedId : hoveredBeamId
    const beam = beams.find(b => b.id === beamId)
    if (!beam?.start || !beam?.end) return null
    const { slabData, tribLeft, tribRight } = getBeamTribDetail(beam, slabs)
    if (!slabData.length) return null

    const { start: bs, end: be } = beam
    const bLen   = Math.hypot(be.x - bs.x, be.y - bs.y)
    if (bLen < 1) return null
    const ux = (be.x - bs.x) / bLen, uy = (be.y - bs.y) / bLen
    const nxW = -uy, nyW = ux
    const midSx = (wx(bs.x) + wx(be.x)) / 2
    const midSy = (wy(bs.y) + wy(be.y)) / 2
    const lOff = ws(tribLeft), rOff = ws(tribRight)

    const COL_L = '#3b82f6', COL_R = '#f97316'

    // Default position: beyond the actual slab zone extent (lxHalf per slab),
    // not just the IS 456 band width — ensures box starts outside all colored zones.
    const maxZoneExtent = slabData.reduce((mx, d) =>
      Math.max(mx, ws((d.slab.shortSpan ?? 3000) / 2)), 0)
    const boxSign    = lOff >= rOff ? -1 : 1
    const defaultBx  = midSx + boxSign * nxW * (maxZoneExtent + 20)
    const defaultBy  = midSy + boxSign * nyW * (maxZoneExtent + 20)

    const boxX = tribBoxPos ? tribBoxPos.x : defaultBx
    const boxY = tribBoxPos ? tribBoxPos.y : defaultBy

    const beamLenM  = bLen / 1000
    const areaSqM   = beamLenM * (tribLeft + tribRight) / 1000
    const areaSqFt  = areaSqM * 10.764

    const leftSlabs  = slabData.filter(d => d.side < 0)
    const rightSlabs = slabData.filter(d => d.side > 0)

    const slabRows = []
    leftSlabs.forEach(d => {
      slabRows.push({ col: COL_L, text: `▶ ${d.slab.mark ?? 'slab'}: ${fmt(d.tribW)}` })
    })
    if (leftSlabs.length > 1)
      slabRows.push({ col: COL_L, text: `  subtotal: ${fmt(tribLeft)}`, dim: true })
    rightSlabs.forEach(d => {
      slabRows.push({ col: COL_R, text: `▶ ${d.slab.mark ?? 'slab'}: ${fmt(d.tribW)}` })
    })
    if (rightSlabs.length > 1)
      slabRows.push({ col: COL_R, text: `  subtotal: ${fmt(tribRight)}`, dim: true })

    const ROW_H = 14, PAD = 8
    const BOX_W = 228
    const BOX_H = PAD + 13 + slabRows.length * ROW_H + 6 + ROW_H + ROW_H + PAD

    // All coords relative to (0,0) = box centre, Group provides the translate
    const bx = -BOX_W / 2, by = -BOX_H / 2
    const boxElems = [
      <Rect key="bg" x={bx} y={by} width={BOX_W} height={BOX_H}
        fill="#06080f" stroke="#2563eb" strokeWidth={1} cornerRadius={5} />,
      // Drag-handle hint (⠿ dots top-right)
      <Text key="dh" x={bx + BOX_W - 18} y={by + 5}
        text="⠿" fontSize={11} fill="#2a4070" />,
      <Text key="hd" x={bx + PAD} y={by + PAD}
        text="IS 456 Cl. 24.5 — two-way distribution"
        fontSize={8} fill="#4a6fa5" />,
    ]

    let rowY = by + PAD + 13
    slabRows.forEach((r, i) => {
      boxElems.push(
        <Text key={`sr${i}`} x={bx + PAD} y={rowY}
          text={r.text} fontSize={10}
          fill={r.dim ? r.col + '99' : r.col} fontStyle={r.dim ? 'normal' : 'bold'} />
      )
      rowY += ROW_H
    })
    rowY += 4
    boxElems.push(
      <Text key="iv" x={bx + PAD} y={rowY}
        text={`Σ = ${fmt(tribLeft + tribRight)}  ·  L = ${beamLenM.toFixed(2)} m`}
        fontSize={10} fill="#e0e0e0" fontStyle="bold" />,
      <Text key="ia" x={bx + PAD} y={rowY + ROW_H}
        text={`Area ≈ ${areaSqM.toFixed(1)} m²   (${areaSqFt.toFixed(0)} ft²)`}
        fontSize={10} fill="#86efac" fontStyle="bold" />
    )

    return (
      <Group
        x={boxX} y={boxY}
        draggable
        onDragEnd={e => setTribBoxPos({ x: e.target.x(), y: e.target.y() })}
        onMouseEnter={() => { document.body.style.cursor = 'move' }}
        onMouseLeave={() => { document.body.style.cursor = '' }}
      >
        {boxElems}
      </Group>
    )
  }

  const renderBeams = () => beams.map(b => {
    const sel = selectedId === b.id
    const col = sel ? COLORS.selected : BEAM_COLOR(b.mark)
    const bw  = Math.max(4, ws(b.width))

    // Screen-space geometry
    const sx1 = wx(b.start.x), sy1 = wy(b.start.y)
    const sx2 = wx(b.end.x),   sy2 = wy(b.end.y)
    const slen = Math.hypot(sx2 - sx1, sy2 - sy1)
    if (slen < 1) return null

    const msx = (sx1 + sx2) / 2, msy = (sy1 + sy2) / 2

    return (
      <Group key={b.id}
        onClick={() => setSelected(b.id, 'beam')}
        onMouseEnter={() => setHoveredBeamId(b.id)}
        onMouseLeave={() => setHoveredBeamId(null)}
        onDblClick={(e) => {
          e.cancelBubble = true
          setSelected(b.id, 'beam')
          setLabelEdit({ id: b.id, sx: msx, sy: msy, value: b.label || b.mark })
        }}>
        <Line points={[sx1, sy1, sx2, sy2]}
          stroke={col} strokeWidth={bw} opacity={sel ? 0.9 : 0.5} lineCap="butt" />
      </Group>
    )
  })

  // ── Render slabs ──────────────────────────────────────
  const renderSlabs = () => slabs.map(s => {
    const sel  = selectedId === s.id
    const pts  = s.points.flatMap(p => [wx(p.x), wy(p.y)])
    // Hatch lines across slab
    const xs   = s.points.map(p => wx(p.x)), ys = s.points.map(p => wy(p.y))
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const hatchLines = []
    const spacing = Math.max(8, ws(s.steel?.mainBar?.spacing || 150))
    for (let y = minY; y <= maxY; y += spacing) {
      hatchLines.push(<Line key={`h${y}`} points={[Math.min(...xs), y, Math.max(...xs), y]}
        stroke={sel ? 'rgba(255,107,53,0.2)' : 'rgba(74,144,217,0.12)'}
        strokeWidth={0.5} listening={false} />)
    }

    return (
      <Group key={s.id} onClick={() => setSelected(s.id, 'slab')}>
        <Line points={pts} closed
          fill={sel ? 'rgba(255,107,53,0.1)' : 'rgba(74,144,217,0.08)'}
          stroke={sel ? COLORS.selected : COLORS.slab}
          strokeWidth={sel ? 2 : 1.5} dash={[ws(300), ws(150)]} />
        {hatchLines}
      </Group>
    )
  })

  // ── Drag guidelines ───────────────────────────────────
  const renderGuidelines = () => {
    if (!dragState) return null
    const lines = []
    const col = columns.find(c => c.id === dragState.id)
    const hw = col ? col.width / 2 : 0
    const hd = col ? col.depth / 2 : 0

    if (dragState.guideX != null) {
      const sx = wx(dragState.guideX)
      // determine if center or edge snapped
      const cx = dragState.curX
      const edgeLabel = Math.abs(cx - dragState.guideX) < 1 ? 'ctr'
        : Math.abs(cx - hw - dragState.guideX) < 1 || Math.abs(cx + hw - dragState.guideX) < 1 ? 'edge' : ''
      lines.push(
        <Line key="gx" points={[sx, 0, sx, canvasHeight]}
          stroke="#f59e0b" strokeWidth={1} dash={[5, 4]} opacity={0.75} listening={false} />,
        <Text key="gx-lbl" x={sx + 3} y={12}
          text={`${fmt(dragState.guideX)}${edgeLabel ? ' ·'+edgeLabel : ''}`}
          fontSize={9} fill="#f59e0b" listening={false} />
      )
    }
    if (dragState.guideY != null) {
      const sy = wy(dragState.guideY)
      const cy = dragState.curY
      const edgeLabel = Math.abs(cy - dragState.guideY) < 1 ? 'ctr'
        : Math.abs(cy - hd - dragState.guideY) < 1 || Math.abs(cy + hd - dragState.guideY) < 1 ? 'edge' : ''
      lines.push(
        <Line key="gy" points={[0, sy, canvasWidth, sy]}
          stroke="#f59e0b" strokeWidth={1} dash={[5, 4]} opacity={0.75} listening={false} />,
        <Text key="gy-lbl" x={6} y={sy + 3}
          text={`${fmt(dragState.guideY)}${edgeLabel ? ' ·'+edgeLabel : ''}`}
          fontSize={9} fill="#f59e0b" listening={false} />
      )
    }
    return lines
  }

  // ── Preview ───────────────────────────────────────────
  const renderPreview = () => {
    if (!preview || !cursorWorld) return null

    // When user has typed an exact length, snap preview end to that distance
    const previewEnd = (preview.start && lengthOverrideMm)
      ? endpointAtLength(preview.start, cursorWorld, lengthOverrideMm)
      : cursorWorld

    if (preview.type === 'wall') {
      const dx = previewEnd.x - preview.start.x, dy = previewEnd.y - preview.start.y
      const lenMm = Math.round(Math.hypot(dx, dy))
      const midX = (preview.start.x + previewEnd.x) / 2
      const midY = (preview.start.y + previewEnd.y) / 2
      const angle = Math.atan2(dy, dx) * 180 / Math.PI
      return (
        <Group listening={false}>
          <Line points={[wx(preview.start.x),wy(preview.start.y),wx(previewEnd.x),wy(previewEnd.y)]}
            stroke="#aaa" strokeWidth={Math.max(3,ws(230))} lineCap="square" opacity={0.5} dash={[6,4]} />
          {/* Live length label above midpoint */}
          <Text x={wx(midX)-30} y={wy(midY)-22}
            text={`${fmt(lenMm)}  ${angle.toFixed(1)}°`}
            fontSize={10} fill="#88ccff" fontStyle="bold" />
        </Group>
      )
    }
    if (preview.type === 'beam') {
      const dx = previewEnd.x - preview.start.x, dy = previewEnd.y - preview.start.y
      const lenMm = Math.round(Math.hypot(dx, dy))
      const midX = (preview.start.x + previewEnd.x) / 2
      const midY = (preview.start.y + previewEnd.y) / 2
      return (
        <Group listening={false}>
          <Line points={[wx(preview.start.x),wy(preview.start.y),wx(previewEnd.x),wy(previewEnd.y)]}
            stroke={COLORS.B1} strokeWidth={Math.max(3,ws(230))} opacity={0.5} dash={[ws(350),ws(150)]} />
          <Text x={wx(midX)-30} y={wy(midY)-22}
            text={fmt(lenMm)}
            fontSize={10} fill="#88ccff" fontStyle="bold" />
        </Group>
      )
    }
    if (preview.type === 'slab') {
      const all = [...preview.points, cursorWorld]
      return <Line points={all.flatMap(p=>[wx(p.x),wy(p.y)])}
        stroke={COLORS.slab} strokeWidth={1.5} dash={[6,4]} opacity={0.8} listening={false} />
    }
    return null
  }

  // ── Cursor ────────────────────────────────────────────
  const renderCursor = () => {
    if (!cursorWorld) return null
    const sx = wx(cursorWorld.x), sy = wy(cursorWorld.y)

    // Detect if we're snapped to an endpoint (not just the grid)
    const thresh = 28 / scale
    const colProximity2 = 56 / scale
    const isEndpointSnap =
      columns.some(c => {
        const hw = c.width / 2, hd = c.depth / 2
        return [
          { x: c.x, y: c.y }, { x: c.x-hw, y: c.y }, { x: c.x+hw, y: c.y },
          { x: c.x, y: c.y-hd }, { x: c.x, y: c.y+hd },
          { x: c.x-hw, y: c.y-hd }, { x: c.x+hw, y: c.y-hd },
          { x: c.x-hw, y: c.y+hd }, { x: c.x+hw, y: c.y+hd },
        ].some(pt => Math.hypot(cursorWorld.x - pt.x, cursorWorld.y - pt.y) < colProximity2)
      }) ||
      [
        ...walls.flatMap(wl => [wl.start, wl.end]),
        ...beams.flatMap(b  => [b.start, b.end]),
      ].some(pt => Math.hypot(cursorWorld.x - pt.x, cursorWorld.y - pt.y) < thresh)

    const col = isEndpointSnap ? '#22c55e' : isOrtho && isDrawingLinear ? '#f59e0b' : COLORS.cursor

    let label = `X: ${fmt(cursorWorld.x)}  Y: ${fmt(cursorWorld.y)}`
    if (isDrawingLinear && drawingState?.startPoint) {
      const dx = cursorWorld.x - drawingState.startPoint.x
      const dy = cursorWorld.y - drawingState.startPoint.y
      const lenMm = Math.round(Math.hypot(dx, dy))
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)
      label = `L: ${fmt(lenMm)}  ∠${angle}°`
    }

    return (
      <Group listening={false}>
        <Line points={[sx-12,sy,sx+12,sy]} stroke={col} strokeWidth={1} />
        <Line points={[sx,sy-12,sx,sy+12]} stroke={col} strokeWidth={1} />
        {isEndpointSnap
          ? <Rect x={sx-5} y={sy-5} width={10} height={10} stroke={col} strokeWidth={1.5} fill="transparent" />
          : <Circle x={sx} y={sy} radius={2.5} fill={col} />
        }
        <Text x={sx+10} y={sy-20} text={label} fontSize={10} fill={col} />
      </Group>
    )
  }

  const cursorStyle = { select:'default', pan:'grab', column:'crosshair', wall:'crosshair', beam:'crosshair', slab:'crosshair' }[activeTool] || 'default'

  return (
    <div style={{ position: 'relative', width: canvasWidth, height: canvasHeight, cursor: cursorStyle }}>
      <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}
        onWheel={handleWheel} onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onClick={handleClick} onDblClick={handleDblClick}>
        <Layer listening={false}>{renderGrid()}</Layer>
        <Layer>
          {renderSlabs()}
          {renderWalls()}
          {renderBeams()}
          {renderColumns()}
        </Layer>
        <Layer listening={false}>
          {slabs.map(s => {
            const sel = selectedId === s.id
            const cx = s.points.reduce((a,p) => a+p.x, 0) / s.points.length
            const cy = s.points.reduce((a,p) => a+p.y, 0) / s.points.length
            return <Group key={s.id+'_ol'}>
              <Text x={wx(cx)} y={wy(cy)-7} align="center" text={s.mark} fontSize={10} fill={sel ? COLORS.selected : COLORS.slab} fontStyle="bold" />
              <Text x={wx(cx)} y={wy(cy)+5} align="center" text={`${fmt(s.shortSpan)}×${fmt(s.longSpan)}`} fontSize={8} fill={sel ? '#ffa060' : '#3a5f8a'} />
              {s.elevation !== 0 && <Text x={wx(cx)-20} y={wy(cy)+12} text={`EL +${fmt(s.elevation)}`} fontSize={8} fill="#88aaff" />}
              {(sel || dimToggles.slab) && s.points.length >= 2 && dimLine(wx(s.points[0].x), wy(s.points[0].y), wx(s.points[1].x), wy(s.points[1].y), fmt(s.shortSpan), sel ? COLORS.selected : COLORS.slab, 22)}
            </Group>
          })}
          {walls.map(w => {
            const sel = selectedId === w.id
            return (sel || dimToggles.wall) ? <Group key={w.id+'_ol'}>{dimLine(wx(w.start.x), wy(w.start.y), wx(w.end.x), wy(w.end.y), fmt(w.length), sel ? COLORS.selected : COLORS.dimLine)}</Group> : null
          })}
          {beams.map(b => {
            const sel = selectedId === b.id
            const col = sel ? COLORS.selected : BEAM_COLOR(b.mark)
            const bw = Math.max(4, ws(b.width))
            const sx1=wx(b.start.x), sy1=wy(b.start.y), sx2=wx(b.end.x), sy2=wy(b.end.y)
            const sdx=sx2-sx1, sdy=sy2-sy1, slen=Math.hypot(sdx,sdy)
            if (slen < 1) return null
            const nx=-sdy/slen, ny=sdx/slen
            const msx=(sx1+sx2)/2, msy=(sy1+sy2)/2
            const markText=b.label||b.mark, lenText=fmt(b.length)
            const pw=(t,fs)=>t.length*fs*0.62+12, ph=(fs)=>fs+8
            const mW=pw(markText,10), mH=ph(10), lW=pw(lenText,9), lH=ph(9)
            const markProj=Math.abs(nx)*mW/2+Math.abs(ny)*mH/2
            const dimProj=Math.abs(nx)*lW/2+Math.abs(ny)*lH/2
            const dimOff=Math.max(bw/2+28,markProj+dimProj+8)
            const ox=nx*dimOff, oy=ny*dimOff
            const dlmx=msx+ox, dlmy=msy+oy
            const ux=sdx/slen, uy=sdy/slen
            return <Group key={b.id+'_ol'}>
              <Rect x={msx-mW/2} y={msy-mH/2} width={mW} height={mH} fill="#0a0d18cc" stroke={col} strokeWidth={sel?2:1} cornerRadius={3} />
              <Text x={msx-mW/2+6} y={msy-mH/2+4} text={markText} fontSize={10} fill={col} fontStyle="bold" />
              {(sel||dimToggles.beam) && <Group>
                <Line points={[sx1,sy1,sx1+ox,sy1+oy]} stroke={col} strokeWidth={0.8} dash={[3,3]} opacity={0.7}/>
                <Line points={[sx2,sy2,sx2+ox,sy2+oy]} stroke={col} strokeWidth={0.8} dash={[3,3]} opacity={0.7}/>
                <Line points={[sx1+ox,sy1+oy,sx2+ox,sy2+oy]} stroke={col} strokeWidth={1}/>
                <Line points={[sx1+ox+ux*5,sy1+oy+uy*5,sx1+ox,sy1+oy,sx1+ox+ux*5+nx*3,sy1+oy+uy*5+ny*3]} stroke={col} strokeWidth={1}/>
                <Line points={[sx2+ox-ux*5,sy2+oy-uy*5,sx2+ox,sy2+oy,sx2+ox-ux*5+nx*3,sy2+oy-uy*5+ny*3]} stroke={col} strokeWidth={1}/>
                <Rect x={dlmx-lW/2} y={dlmy-lH/2} width={lW} height={lH} fill="#0a0d18" stroke={col} strokeWidth={0.8} cornerRadius={2}/>
                <Text x={dlmx-lW/2+6} y={dlmy-lH/2+4} text={lenText} fontSize={9} fill={col} fontStyle="bold"/>
              </Group>}
              {b.elevation !== 0 && <Text x={msx-mW/2+6} y={msy+mH/2+3} text={`EL:${fmt(b.elevation)}`} fontSize={8} fill="#88aaff"/>}
            </Group>
          })}
          {columns.map(c => {
            const sel = selectedId === c.id
            const isDragging = dragState?.id === c.id
            const cx = isDragging ? dragState.curX : c.x
            const cy = isDragging ? dragState.curY : c.y
            const cw = Math.max(8, ws(c.width)), cd = Math.max(8, ws(c.depth))
            const color = isDragging ? '#f59e0b' : sel ? COLORS.selected : COLORS.column
            return <Group key={c.id+'_ol'}>
              <Text x={wx(cx)+cw/2+3} y={wy(cy)-cd/2} text={c.mark} fontSize={10} fill={color} />
              {(sel||isDragging||dimToggles.column) && <Text x={wx(cx)-cw/2} y={wy(cy)+cd/2+3} text={`${c.width}×${c.depth}`} fontSize={8} fill={isDragging?'#f59e0b88':'#556'} />}
            </Group>
          })}
        </Layer>
        <Layer listening={false}>
          {renderTributary()}
        </Layer>
        <Layer>
          {renderTribInfoBox()}
        </Layer>
        <Layer listening={false}>
          {/* Region fill preview while hovering in slab tool */}
          {hoverRegion && activeTool === 'slab' && !drawingState?.points?.length && (() => {
            const pts = hoverRegion.flatMap(p => [wx(p.x), wy(p.y)])
            const cx  = hoverRegion.reduce((s, p) => s + p.x, 0) / hoverRegion.length
            const cy  = hoverRegion.reduce((s, p) => s + p.y, 0) / hoverRegion.length
            return (
              <Group listening={false}>
                <Line points={pts} closed fill="#4a90d922" stroke="#4a90d9aa" strokeWidth={2} dash={[8,5]} />
                <Rect x={wx(cx)-42} y={wy(cy)-9} width={84} height={16} fill="#060c18cc" cornerRadius={3} />
                <Text x={wx(cx)-38} y={wy(cy)-5} text="Click to fill slab" fontSize={10} fill="#4a90d9" fontStyle="bold" />
              </Group>
            )
          })()}
          {renderGuidelines()}
          {renderPreview()}
          {renderCursor()}
        </Layer>
      </Stage>

      {/* Floating length input — direct distance entry */}
      {isDrawingLinear && cursorWorld && (
        <div style={{
          position: 'absolute',
          left: Math.min(wx(cursorWorld.x) + 18, canvasWidth - 210),
          top:  Math.max(wy(cursorWorld.y) - 52, 8),
          background: '#0d1828',
          border: `1px solid ${lengthOverrideMm ? '#2563eb' : '#2a3550'}`,
          borderRadius: 6,
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'auto',
          zIndex: 20,
          boxShadow: '0 3px 12px rgba(0,0,0,0.6)',
          minWidth: 160,
        }}>
          <span style={{ fontSize: 10, color: '#4a6fa5', flexShrink: 0 }}>Length</span>
          <input
            ref={lengthInputRef}
            value={lengthStr}
            onChange={e => setLengthStr(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitLength() }
              if (e.key === 'Escape') { e.preventDefault(); setLengthStr(''); e.currentTarget.blur() }
              e.stopPropagation()
            }}
            placeholder={primaryUnit === 'ft-in' ? 'e.g. 14-6' : 'mm'}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: lengthOverrideMm ? '#e0e0e0' : '#6b8db5',
              fontSize: 13, fontFamily: 'monospace', width: 80,
            }}
          />
          {lengthOverrideMm && (
            <span style={{ fontSize: 10, color: '#22c55e', flexShrink: 0 }}>↵ commit</span>
          )}
          {!lengthOverrideMm && (
            <span style={{ fontSize: 9, color: '#2a3550', flexShrink: 0 }}>type or click</span>
          )}
        </div>
      )}

      {/* Floating beam label editor — double-click a beam to open */}
      {labelEdit && (
        <div style={{
          position: 'absolute',
          left: Math.min(labelEdit.sx - 70, canvasWidth - 210),
          top:  Math.max(labelEdit.sy - 46, 8),
          background: '#0d1828',
          border: '1px solid #2563eb',
          borderRadius: 6,
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'auto',
          zIndex: 25,
          boxShadow: '0 3px 12px rgba(0,0,0,0.6)',
          minWidth: 180,
        }}>
          <span style={{ fontSize: 10, color: '#4a6fa5', flexShrink: 0 }}>Label</span>
          <input
            ref={labelInputRef}
            value={labelEdit.value}
            onChange={e => setLabelEdit(le => ({ ...le, value: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitLabelEdit() }
              if (e.key === 'Escape') { e.preventDefault(); setLabelEdit(null) }
              e.stopPropagation()
            }}
            onBlur={commitLabelEdit}
            placeholder="e.g. RB-1, B2-1, Lintel"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: '#e0e0e0', fontSize: 13, fontFamily: 'monospace', width: 110,
            }}
          />
          <span style={{ fontSize: 9, color: '#2563eb', flexShrink: 0 }}>↵ save</span>
        </div>
      )}

      {/* Status bar */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0,
        background:'rgba(10,12,18,0.9)', borderTop:'1px solid #1e2533',
        padding:'3px 12px', display:'flex', gap:20, fontSize:10, color:'#6b7fa8',
        userSelect:'none',
      }}>
        <span>Tool: <b style={{color:'#9aadcc'}}>{activeTool.toUpperCase()}</b></span>
        <span>Zoom: <b style={{color:'#9aadcc'}}>{Math.round(scale/0.06*100)}%</b></span>
        <span>Grid: <b style={{color:'#9aadcc'}}>{fmt(gridSize)}</b></span>
        {drawingState?.startPoint && <span style={{color:'#f0c060'}}>Click next point · Esc/dbl-click to finish</span>}
        <button onClick={() => setOrthoMode(m => !m)} style={{
          background: isOrtho ? '#22c55e22' : 'transparent',
          border: `1px solid ${isOrtho ? '#22c55e' : '#2a3a50'}`,
          borderRadius: 3, color: isOrtho ? '#22c55e' : '#4a6fa5',
          fontSize: 10, cursor: 'pointer', padding: '1px 6px', fontWeight: isOrtho ? 700 : 400,
        }}>⊞ ORTHO {isOrtho ? 'ON' : 'off'}</button>
        {!isOrtho && <span style={{ color: '#2a3a50', fontSize: 10 }}>O or Shift</span>}
        {drawingState?.points?.length > 0 && <span style={{color:'#f0c060'}}>{drawingState.points.length} pts · dbl-click or click 1st pt to close</span>}
        <span style={{marginLeft:'auto'}}>C:{columns.length} W:{walls.length} B:{beams.length} S:{slabs.length}</span>
        <span>Ctrl+Z undo</span>
      </div>
    </div>
  )
}
