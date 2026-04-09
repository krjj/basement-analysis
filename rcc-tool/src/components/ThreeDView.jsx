import React, { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '../store/useStore'

// mm → Three.js metres
const mm = (v) => v / 1000

// ── Concrete materials (normal) ────────────────────────────────
const MAT = {
  wall:    new THREE.MeshStandardMaterial({ color: '#8090a0', roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.85 }),
  column:  new THREE.MeshStandardMaterial({ color: '#b0c0d0', roughness: 0.5, metalness: 0.2 }),
  beamB1:  new THREE.MeshStandardMaterial({ color: '#FFD700', roughness: 0.4, metalness: 0.3 }),
  beamB2:  new THREE.MeshStandardMaterial({ color: '#FF8C00', roughness: 0.4, metalness: 0.3 }),
  beamB3:  new THREE.MeshStandardMaterial({ color: '#00CED1', roughness: 0.4, metalness: 0.3 }),
  beamB4:  new THREE.MeshStandardMaterial({ color: '#FF4444', roughness: 0.4, metalness: 0.3 }),
  beamC:   new THREE.MeshStandardMaterial({ color: '#bb99ff', roughness: 0.4, metalness: 0.3 }),
  slab:    new THREE.MeshStandardMaterial({ color: '#4a6080', roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.7 }),
  selected: new THREE.MeshStandardMaterial({ color: '#ff6b35', roughness: 0.4, metalness: 0.4, emissive: '#ff3300', emissiveIntensity: 0.2 }),
}

// ── Concrete materials (xray — when steel is visible) ──────────
const MX = {
  wall:    new THREE.MeshStandardMaterial({ color: '#6a7a8a', roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  column:  new THREE.MeshStandardMaterial({ color: '#8a9aaa', roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.30, depthWrite: false }),
  beamB1:  new THREE.MeshStandardMaterial({ color: '#c0a000', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  beamB2:  new THREE.MeshStandardMaterial({ color: '#c07000', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  beamB3:  new THREE.MeshStandardMaterial({ color: '#009898', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  beamB4:  new THREE.MeshStandardMaterial({ color: '#c03030', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  beamC:   new THREE.MeshStandardMaterial({ color: '#8e7db0', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
  slab:    new THREE.MeshStandardMaterial({ color: '#3a5070', roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.08, depthWrite: false }),
  selected: new THREE.MeshStandardMaterial({ color: '#ff6b35', roughness: 0.4, metalness: 0.4, emissive: '#ff3300', emissiveIntensity: 0.1, transparent: true, opacity: 0.35, depthWrite: false }),
}

// ── Steel materials ────────────────────────────────────────────
const S = {
  bot:   new THREE.MeshStandardMaterial({ color: '#4a90e0', roughness: 0.3, metalness: 0.8 }),  // blue  — tension
  top:   new THREE.MeshStandardMaterial({ color: '#e06040', roughness: 0.3, metalness: 0.8 }),  // orange — hogging / top
  curt:  new THREE.MeshStandardMaterial({ color: '#50c050', roughness: 0.3, metalness: 0.8 }),  // green  — curtailed
  stir:  new THREE.MeshStandardMaterial({ color: '#b0b0b0', roughness: 0.4, metalness: 0.6 }),  // gray   — stirrups/ties
  vert:  new THREE.MeshStandardMaterial({ color: '#e0c060', roughness: 0.3, metalness: 0.8 }),  // gold   — column vert
  slab:  new THREE.MeshStandardMaterial({ color: '#60c870', roughness: 0.3, metalness: 0.7 }),  // green  — slab bottom
  slabT: new THREE.MeshStandardMaterial({ color: '#e07830', roughness: 0.3, metalness: 0.7 }),  // orange — slab top
  hook:  new THREE.MeshStandardMaterial({ color: '#ffe040', roughness: 0.2, metalness: 0.9, emissive: '#806000', emissiveIntensity: 0.3 }),  // bright yellow — hook/bend
  embOk: new THREE.MeshStandardMaterial({ color: '#40e0a0', roughness: 0.3, metalness: 0.7 }),  // teal — embedment OK (≥ Ld)
  embShort: new THREE.MeshStandardMaterial({ color: '#ff4040', roughness: 0.3, metalness: 0.7 }),  // red — embedment short (< Ld)
}

const beamMat  = (mark, xray) => {
  const src = xray ? MX : MAT
  return { B1: src.beamB1, B2: src.beamB2, B3: src.beamB3, B4: src.beamB4 }[mark] || src.beamC
}

// ── Sphere marker at a point (bend corners, etc.) ─────────────
function Dot({ pos, dia, mat }) {
  return (
    <mesh position={pos} material={mat}>
      <sphereGeometry args={[mm(dia * 0.7), 6, 6]} />
    </mesh>
  )
}

// ── Bar: cylinder between two 3D points ────────────────────────
function Bar({ start, end, dia, mat }) {
  const s   = new THREE.Vector3(...start)
  const e   = new THREE.Vector3(...end)
  const dir = e.clone().sub(s)
  const len = dir.length()
  if (len < 0.0005) return null
  dir.normalize()
  const up   = new THREE.Vector3(0, 1, 0)
  const quat = dir.dot(up) < -0.9999
    ? new THREE.Quaternion(1, 0, 0, 0)   // 180° flip (downward bar edge case)
    : new THREE.Quaternion().setFromUnitVectors(up, dir)
  const mid  = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]
  return (
    <mesh position={mid} quaternion={quat.toArray()} material={mat}>
      <cylinderGeometry args={[mm(dia / 2), mm(dia / 2), len, 6, 1]} />
    </mesh>
  )
}

// ── Helpers ────────────────────────────────────────────────────
function distributeZ(count, bw, cv, dia) {
  // Returns array of Z offsets (mm, relative to beam-width centroid)
  if (count <= 0) return []
  if (count === 1) return [0]
  const innerW = bw - 2 * cv - dia
  return Array.from({ length: count }, (_, i) => -(bw / 2 - cv - dia / 2) + i * innerW / (count - 1))
}

// ── Layer stacking for bottom (or top) bars ────────────────────
// Returns array of layers: [{ yOffset_m, zOffsets_m[], dia, mat, group }]
// Packs groups (full bars first, then curtailed) into rows respecting
// max bars per row = f(bw, cv, maxDia, minGap=25mm IS 456 Cl.26.3.2).
// Layers numbered from face outward: layer 0 = outermost (closest to face).
function stackLayers(groups, bw, cv, fromBottom) {
  // groups: [{ count, dia, mat }]
  const MIN_GAP = 25  // IS 456 Cl. 26.3.2
  const layers  = []
  let rem = groups.map(g => ({ ...g }))

  while (rem.some(g => g.count > 0)) {
    const active   = rem.filter(g => g.count > 0)
    const maxDia   = Math.max(...active.map(g => g.dia))
    const barsPerRow = Math.max(1, Math.floor((bw - 2 * cv - maxDia) / (maxDia + MIN_GAP)) + 1)

    const layerBars = []  // { z_mm, dia, mat }
    let slots = barsPerRow
    for (const g of active) {
      if (slots <= 0) break
      const take = Math.min(g.count, slots)
      // distribute 'take' bars across slots in this row, centred
      const zOffsets = distributeZ(take, bw, cv, g.dia)
      for (const z of zOffsets) layerBars.push({ z_mm: z, dia: g.dia, mat: g.mat, group: g.id })
      g.count -= take
      slots   -= take
    }

    // Y offset from beam face (bottom cover + dia/2 of this layer)
    // layer 0: outermost
    const layerIdx = layers.length
    const prevDia  = layers.length > 0 ? Math.max(...layers[layers.length - 1].bars.map(b => b.dia)) : 0
    const prevGap  = layers.length > 0 ? 25 : 0  // 25mm between layers
    const yFromFace = layers.length === 0
      ? cv + maxDia / 2
      : layers[layers.length - 1].yFromFace + prevDia / 2 + prevGap + maxDia / 2
    layers.push({ yFromFace, layerIdx, bars: layerBars, maxDia })
  }
  return layers   // yFromFace in mm from face; caller converts sign based on fromBottom
}

function getStirrupPositions(L_mm, stir, maxCount = 18) {
  const nos  = stir.supportNos    || 6
  const svs  = stir.supportSpacing || 100
  const svm  = stir.midSpacing    || 200
  const pos  = []
  for (let i = 0; i < nos; i++) pos.push((i + 0.5) * svs)
  for (let i = 0; i < nos; i++) pos.push(L_mm - (i + 0.5) * svs)
  const mS = nos * svs, mE = L_mm - nos * svs
  for (let x = mS + svm / 2; x < mE; x += svm) pos.push(x)
  const unique = [...new Set(pos.map(p => Math.round(p)))]
    .sort((a, b) => a - b).filter(p => p > 0 && p < L_mm)
  if (unique.length <= maxCount) return unique
  return Array.from({ length: maxCount }, (_, i) => unique[Math.round(i * (unique.length - 1) / (maxCount - 1))])
}

function getColBarPositions(count, cw, cd, cv, dia) {
  if (count <= 0) return []
  const hx = cw / 2 - cv - dia / 2
  const hz = cd / 2 - cv - dia / 2
  const corners = [{ x: -hx, z: -hz }, { x: hx, z: -hz }, { x: hx, z: hz }, { x: -hx, z: hz }]
  if (count <= 4) return corners.slice(0, count)
  const pos = [...corners]
  const pf = Math.ceil((count - 4) / 4)
  const add = (p) => { if (pos.length < count) pos.push(p) }
  for (let i = 1; i <= pf; i++) add({ x: -hx + i * 2 * hx / (pf + 1), z: -hz })
  for (let i = 1; i <= pf; i++) add({ x: hx,  z: -hz + i * 2 * hz / (pf + 1) })
  for (let i = 1; i <= pf; i++) add({ x: hx - i * 2 * hx / (pf + 1), z: hz })
  for (let i = 1; i <= pf; i++) add({ x: -hx, z: hz - i * 2 * hz / (pf + 1) })
  return pos.slice(0, count)
}

// ── Beam steel ─────────────────────────────────────────────────
function BeamSteel3D({ beam, wallH, showHooks = true, columns = [] }) {
  const st   = beam.steel || {}
  const cv   = st.cover || 25
  const bf   = st.bottomFull       || { count: 2, dia: 16 }
  const bc   = st.bottomCurtail    || { count: 0, dia: 16 }
  const ts   = st.topSteel         || { count: 2, dia: 12 }
  const ext  = st.extraTopSupport  || { count: 0, dia: 12 }
  const stir = st.stirrups         || { dia: 8, supportSpacing: 100, midSpacing: 200, supportNos: 6 }
  const ss   = st.startSupport
  const es   = st.endSupport

  const bw  = beam.width || 230
  const D   = beam.depth || 450
  const dx  = beam.end.x - beam.start.x
  const dy  = beam.end.y - beam.start.y
  const L   = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)

  const cx3d  = mm((beam.start.x + beam.end.x) / 2)
  const cz3d  = mm((beam.start.y + beam.end.y) / 2)
  const beamY = mm(wallH - D / 2 + (beam.elevation || 0))

  const halfL = mm(L / 2)
  const halfD = mm(D / 2)
  const halfW = mm(bw / 2)

  // ── Curtailment cutoff: IS 456 bars curtailed at L/7 from support face ──
  // Curtailed bars run from -(halfL - L/7) to +(halfL - L/7) = middle 5/7 of span
  const curtStart = -(halfL - halfL * 2 / 7)   // = -5L/14
  const curtEnd   =  (halfL - halfL * 2 / 7)   // = +5L/14

  // ── Wall embedment ──
  const sW = ss?.type === 'wall', eW = es?.type === 'wall'
  const sEmb = sW ? mm(ss.embedmentDepth ?? 230) : 0
  const eEmb = eW ? mm(es.embedmentDepth ?? 230) : 0
  // Suppress L-bends if the support point falls inside a column bounding box
  const ptInCol = (px, py) => columns.some(c =>
    Math.abs(px - c.x) < c.width / 2 + 10 && Math.abs(py - c.y) < c.depth / 2 + 10)
  const sLB = sW && ss.lBend && !ptInCol(beam.start.x, beam.start.y) ? mm(ss.lBendLength ?? 150) : 0
  const eLB = eW && es.lBend && !ptInCol(beam.end.x,   beam.end.y)   ? mm(es.lBendLength ?? 150) : 0

  // Approx Ld for bottom bars (visual only — fy=550, fck=30, deformed)
  const Ld_approx = mm(bf.dia * 0.87 * 550 / (4 * 1.4 * 1.6))
  const sEmbOk = sEmb >= Ld_approx
  const eEmbOk = eEmb >= Ld_approx

  const botStart = -(halfL + sEmb)
  const botEnd   =  (halfL + eEmb)

  // ── Bottom bar layer stacking ──
  // Full bars (layer 0) + curtailed bars (layer 0 if space, else layer 1)
  const botLayers = stackLayers([
    { id: 'full', count: bf.count, dia: bf.dia, mat: S.bot },
    { id: 'curt', count: bc.count, dia: bc.dia, mat: S.curt },
  ], bw, cv, true)

  // ── Top bar layer stacking ──
  const topLayers = stackLayers([
    { id: 'top', count: ts.count, dia: ts.dia, mat: S.top },
    { id: 'ext', count: ext.count, dia: ext.dia, mat: S.top },
  ], bw, cv, false)

  // Support zone length
  const supZone = mm((stir.supportNos || 6) * (stir.supportSpacing || 100))

  // Stirrups
  const stirPs = getStirrupPositions(L, stir)
  const sh = halfD - mm(cv + stir.dia / 2)
  const sw = halfW - mm(cv + stir.dia / 2)

  // Convert layer yFromFace → Y in local centroid frame
  // Bottom layers: Y = -halfD + mm(yFromFace)
  // Top layers:    Y = +halfD - mm(yFromFace)
  const botLayerY = (lyr) => -halfD + mm(lyr.yFromFace)
  const topLayerY = (lyr) =>  halfD - mm(lyr.yFromFace)

  // Pin/spacer bar diameter (max dia + 2 for visibility)
  const pinDia = stir.dia

  return (
    <group position={[cx3d, beamY, cz3d]} rotation={[0, -angle, 0]}>

      {/* ── BOTTOM LAYERS ── */}
      {botLayers.map((lyr) => {
        const lyrY = botLayerY(lyr)
        const isCurt = lyr.bars.some(b => b.group === 'curt')
        const isFull = lyr.bars.some(b => b.group === 'full')
        return (
          <React.Fragment key={`bl-${lyr.layerIdx}`}>
            {lyr.bars.map((bar, i) => {
              const z = mm(bar.z_mm)
              const isCurtBar = bar.group === 'curt'
              const xStart = isCurtBar ? curtStart : -halfL
              const xEnd   = isCurtBar ? curtEnd   : halfL
              return (
                <React.Fragment key={`b-${i}`}>
                  <Bar start={[xStart, lyrY, z]} end={[xEnd, lyrY, z]} dia={bar.dia} mat={bar.mat} />
                  {/* Embedment — only full bars extend into wall */}
                  {!isCurtBar && sW && (
                    <Bar start={[-halfL, lyrY, z]} end={[botStart, lyrY, z]} dia={bar.dia} mat={sEmbOk ? S.embOk : S.embShort} />
                  )}
                  {!isCurtBar && eW && (
                    <Bar start={[halfL, lyrY, z]} end={[botEnd, lyrY, z]} dia={bar.dia} mat={eEmbOk ? S.embOk : S.embShort} />
                  )}
                  {/* L-bends at start */}
                  {showHooks && !isCurtBar && sLB > 0 && (
                    <>
                      <Bar start={[botStart, lyrY, z]} end={[botStart, lyrY + sLB + halfD, z]} dia={bar.dia} mat={S.hook} />
                      <Dot pos={[botStart, lyrY, z]} dia={bar.dia} mat={S.hook} />
                    </>
                  )}
                  {/* L-bends at end */}
                  {showHooks && !isCurtBar && eLB > 0 && (
                    <>
                      <Bar start={[botEnd, lyrY, z]} end={[botEnd, lyrY + eLB + halfD, z]} dia={bar.dia} mat={S.hook} />
                      <Dot pos={[botEnd, lyrY, z]} dia={bar.dia} mat={S.hook} />
                    </>
                  )}
                </React.Fragment>
              )
            })}

            {/* Pin bar between bottom layers */}
            {lyr.layerIdx > 0 && (() => {
              const prevY = botLayerY(botLayers[lyr.layerIdx - 1])
              const pinY  = (lyrY + prevY) / 2
              const pinPositions = [-halfL * 0.5, 0, halfL * 0.5]
              return pinPositions.map((px, pi) => (
                <Bar key={`pin-${pi}`} start={[px, pinY, -halfW * 0.7]} end={[px, pinY, halfW * 0.7]} dia={pinDia} mat={S.stir} />
              ))
            })()}
          </React.Fragment>
        )
      })}

      {/* ── TOP LAYERS ── */}
      {topLayers.map((lyr) => {
        const lyrY = topLayerY(lyr)
        return (
          <React.Fragment key={`tl-${lyr.layerIdx}`}>
            {lyr.bars.map((bar, i) => {
              const z    = mm(bar.z_mm)
              const isExt = bar.group === 'ext'
              return (
                <React.Fragment key={`t-${i}`}>
                  {isExt ? (
                    <>
                      <Bar start={[-halfL, lyrY, z]} end={[-halfL + supZone, lyrY, z]} dia={bar.dia} mat={bar.mat} />
                      <Bar start={[ halfL - supZone, lyrY, z]} end={[halfL, lyrY, z]} dia={bar.dia} mat={bar.mat} />
                    </>
                  ) : (
                    <Bar start={[-halfL, lyrY, z]} end={[halfL, lyrY, z]} dia={bar.dia} mat={bar.mat} />
                  )}
                </React.Fragment>
              )
            })}

            {/* Pin bar between top layers */}
            {lyr.layerIdx > 0 && (() => {
              const prevY = topLayerY(topLayers[lyr.layerIdx - 1])
              const pinY  = (lyrY + prevY) / 2
              return [-halfL * 0.5, 0, halfL * 0.5].map((px, pi) => (
                <Bar key={`tpin-${pi}`} start={[px, pinY, -halfW * 0.7]} end={[px, pinY, halfW * 0.7]} dia={pinDia} mat={S.stir} />
              ))
            })()}
          </React.Fragment>
        )
      })}

      {/* Stirrups */}
      {stirPs.map((pos, i) => {
        const sx = mm(pos) - halfL
        return (
          <group key={`stir-${i}`}>
            <Bar start={[sx, -sh, -sw]} end={[sx, -sh,  sw]} dia={stir.dia} mat={S.stir} />
            <Bar start={[sx,  sh, -sw]} end={[sx,  sh,  sw]} dia={stir.dia} mat={S.stir} />
            <Bar start={[sx, -sh, -sw]} end={[sx,  sh, -sw]} dia={stir.dia} mat={S.stir} />
            <Bar start={[sx, -sh,  sw]} end={[sx,  sh,  sw]} dia={stir.dia} mat={S.stir} />
          </group>
        )
      })}
    </group>
  )
}

// ── Column steel ───────────────────────────────────────────────
function ColumnSteel3D({ col, wallH }) {
  const st  = col.steel || {}
  const cv  = st.cover || 40
  const vb  = st.vertBars || { count: 4, dia: 16 }
  const tie = st.ties     || { dia: 8, spacing: 150 }

  const halfH  = mm(wallH / 2)
  const barPos = getColBarPositions(vb.count, col.width, col.depth, cv, vb.dia)

  // Show a realistic number of ties — cap at 12 evenly across height
  const nTies = Math.min(12, Math.max(3, Math.floor(wallH / tie.spacing)))
  const tieYs = Array.from({ length: nTies }, (_, i) => mm(wallH * (i + 0.5) / nTies) - halfH)

  const th = mm(col.depth / 2 - cv - tie.dia / 2)
  const tw = mm(col.width  / 2 - cv - tie.dia / 2)

  // Visual diameter: full scale for bars (they ARE φ16 in a 355mm column ≈ 4.5%)
  // Ties rendered at actual dia
  return (
    <group position={[mm(col.x), halfH, mm(col.y)]}>
      {/* Vertical bars — full column height */}
      {barPos.map((p, i) => (
        <Bar key={`vb-${i}`} start={[mm(p.x), -halfH, mm(p.z)]} end={[mm(p.x), halfH, mm(p.z)]} dia={vb.dia} mat={S.vert} />
      ))}
      {/* Tie hoops */}
      {tieYs.map((ty, i) => (
        <group key={`tie-${i}`}>
          <Bar start={[-tw, ty, -th]} end={[ tw, ty, -th]} dia={tie.dia} mat={S.stir} />
          <Bar start={[ tw, ty, -th]} end={[ tw, ty,  th]} dia={tie.dia} mat={S.stir} />
          <Bar start={[ tw, ty,  th]} end={[-tw, ty,  th]} dia={tie.dia} mat={S.stir} />
          <Bar start={[-tw, ty,  th]} end={[-tw, ty, -th]} dia={tie.dia} mat={S.stir} />
        </group>
      ))}
    </group>
  )
}

// ── Slab steel ─────────────────────────────────────────────────
function SlabSteel3D({ slab, wallH }) {
  const st    = slab.steel || {}
  const cv    = st.cover || 15
  const mb    = st.mainBar  || { dia: 12, spacing: 150 }
  const db    = st.distBar  || { dia: 12, spacing: 150 }
  const tsTop = st.topSteel || { dia: 8, spacing: 200, enabled: false }
  const depth = st.depth || 230
  const { points, elevation = 0 } = slab
  if (!points || points.length < 3) return null

  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  const slabY = mm(wallH - depth / 2 + elevation)
  const halfD = mm(depth / 2)

  // Bar Y positions from slab centroid
  const mbY  = -halfD + mm(cv + mb.dia / 2)
  const dbY  = -halfD + mm(cv + mb.dia + 5 + db.dia / 2)
  const tsY  =  halfD - mm(cv + tsTop.dia / 2)

  const MAX = 16
  // Always distribute evenly across full span — avoids clustering at one end when capping
  const nMain = Math.min(MAX, Math.max(1, Math.floor((maxY - minY) / mb.spacing)))
  const nDist = Math.min(MAX, Math.max(1, Math.floor((maxX - minX) / db.spacing)))

  const mainZs = Array.from({ length: nMain }, (_, i) => minY + ((maxY - minY) * (i + 0.5)) / nMain)
  const distXs = Array.from({ length: nDist }, (_, i) => minX + ((maxX - minX) * (i + 0.5)) / nDist)

  return (
    <group position={[0, slabY, 0]}>
      {/* Main bars (along X, spaced in Z) */}
      {mainZs.map((z, i) => (
        <Bar key={`mb-${i}`} start={[mm(minX), mbY, mm(z)]} end={[mm(maxX), mbY, mm(z)]} dia={mb.dia} mat={S.slab} />
      ))}
      {/* Distribution bars (along Z, spaced in X) */}
      {distXs.map((x, i) => (
        <Bar key={`db-${i}`} start={[mm(x), dbY, mm(minY)]} end={[mm(x), dbY, mm(maxY)]} dia={db.dia} mat={S.slab} />
      ))}
      {/* Top steel (if enabled) */}
      {tsTop.enabled && mainZs.map((z, i) => (
        <Bar key={`ts-${i}`} start={[mm(minX), tsY, mm(z)]} end={[mm(maxX), tsY, mm(z)]} dia={tsTop.dia} mat={S.slabT} />
      ))}
    </group>
  )
}

// ── Corner map ─────────────────────────────────────────────────
function buildCornerMap(walls) {
  const map = {}
  const key = (pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`
  walls.forEach(w => {
    const sk = key(w.start), ek = key(w.end)
    if (!map[sk]) map[sk] = { x: w.start.x, y: w.start.y, thickness: 0, count: 0 }
    if (!map[ek]) map[ek] = { x: w.end.x,   y: w.end.y,   thickness: 0, count: 0 }
    map[sk].count++; map[sk].thickness = Math.max(map[sk].thickness, w.thickness)
    map[ek].count++; map[ek].thickness = Math.max(map[ek].thickness, w.thickness)
  })
  return map
}

// ── Concrete components ────────────────────────────────────────
function CornerPost3D({ corner, wallH, xray }) {
  return (
    <mesh position={[mm(corner.x), mm(wallH / 2), mm(corner.y)]} material={xray ? MX.wall : MAT.wall} castShadow receiveShadow>
      <boxGeometry args={[mm(corner.thickness), mm(wallH), mm(corner.thickness)]} />
    </mesh>
  )
}

function Wall3D({ wall, wallH, startTrim, endTrim, isSelected, onClick, xray }) {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const newLen = len - startTrim - endTrim
  if (newLen <= 0) return null
  const ux = dx / len, uy = dy / len
  const cx = (wall.start.x + ux * startTrim + wall.end.x - ux * endTrim) / 2
  const cy = (wall.start.y + uy * startTrim + wall.end.y - uy * endTrim) / 2
  const mat = isSelected ? (xray ? MX.selected : MAT.selected) : (xray ? MX.wall : MAT.wall)
  return (
    <mesh position={[mm(cx), mm(wallH / 2), mm(cy)]} rotation={[0, -Math.atan2(dy, dx), 0]} material={mat} onClick={onClick} castShadow receiveShadow>
      <boxGeometry args={[mm(newLen), mm(wallH), mm(wall.thickness)]} />
    </mesh>
  )
}

const MAT_COL_EDGE = new THREE.LineBasicMaterial({ color: '#b0c8e8', linewidth: 1 })

function Column3D({ col, wallH, isSelected, onClick, xray }) {
  const mat = isSelected ? (xray ? MX.selected : MAT.selected) : (xray ? MX.column : MAT.column)
  const geo = [mm(col.width), mm(wallH), mm(col.depth)]
  return (
    <group position={[mm(col.x), mm(wallH / 2), mm(col.y)]} onClick={onClick}>
      <mesh material={mat} castShadow receiveShadow>
        <boxGeometry args={geo} />
      </mesh>
      {xray && (
        <lineSegments material={MAT_COL_EDGE}>
          <edgesGeometry args={[new THREE.BoxGeometry(...geo)]} />
        </lineSegments>
      )}
    </group>
  )
}

function Beam3D({ beam, wallH, isSelected, onClick, xray }) {
  const dx = beam.end.x - beam.start.x, dy = beam.end.y - beam.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const cx  = (beam.start.x + beam.end.x) / 2, cy = (beam.start.y + beam.end.y) / 2
  const beamY = wallH - beam.depth / 2 + (beam.elevation || 0)
  const mat = isSelected ? (xray ? MX.selected : MAT.selected) : beamMat(beam.mark, xray)
  return (
    <mesh position={[mm(cx), mm(beamY), mm(cy)]} rotation={[0, -Math.atan2(dy, dx), 0]} material={mat} onClick={onClick} castShadow>
      <boxGeometry args={[mm(len), mm(beam.depth), mm(beam.width)]} />
    </mesh>
  )
}

function Slab3D({ slab, wallH, isSelected, onClick, xray }) {
  const { points, steel, elevation = 0 } = slab
  if (!points || points.length < 3) return null
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const cx = xs.reduce((a, b) => a + b) / xs.length, cy = ys.reduce((a, b) => a + b) / ys.length
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  const depth = steel?.depth || 230
  const mat = isSelected ? (xray ? MX.selected : MAT.selected) : (xray ? MX.slab : MAT.slab)
  return (
    <mesh position={[mm(cx), mm(wallH - depth / 2 + elevation), mm(cy)]} material={mat} onClick={onClick} receiveShadow>
      <boxGeometry args={[mm(w), mm(depth), mm(h)]} />
    </mesh>
  )
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color="#0d1520" roughness={1} />
    </mesh>
  )
}

// ── Scene ──────────────────────────────────────────────────────
function Scene({ showSteel, showHooks }) {
  const { columns, walls, beams, slabs, wallHeightMm, selectedId, selectedType, setSelected } = useStore()
  const sel = (id, type) => (e) => { e.stopPropagation(); setSelected(id, type) }
  const cornerMap = buildCornerMap(walls)
  const ckey = (pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`
  const xray = showSteel

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-5, 8, -5]} intensity={0.5} />
      <Ground />
      <Grid args={[50, 50]} cellSize={0.5} cellThickness={0.3}
        cellColor="#1e3050" sectionSize={2.5} sectionThickness={0.8}
        sectionColor="#2a4a70" fadeDistance={40} fadeStrength={1} />

      {/* Walls */}
      {walls.map(w => {
        const sc = cornerMap[ckey(w.start)], ec = cornerMap[ckey(w.end)]
        return (
          <Wall3D key={w.id} wall={w} wallH={wallHeightMm}
            startTrim={sc?.count >= 2 ? sc.thickness / 2 : 0}
            endTrim={ec?.count >= 2 ? ec.thickness / 2 : 0}
            isSelected={selectedId === w.id && selectedType === 'wall'}
            onClick={sel(w.id, 'wall')} xray={xray} />
        )
      })}
      {Object.entries(cornerMap).filter(([, c]) => c.count >= 2).map(([k, corner]) => (
        <CornerPost3D key={k} corner={corner} wallH={wallHeightMm} xray={xray} />
      ))}

      {/* Columns */}
      {columns.map(c => (
        <Column3D key={c.id} col={c} wallH={wallHeightMm}
          isSelected={selectedId === c.id && selectedType === 'column'}
          onClick={sel(c.id, 'column')} xray={xray} />
      ))}

      {/* Beams */}
      {beams.map(b => (
        <Beam3D key={b.id} beam={b} wallH={wallHeightMm}
          isSelected={selectedId === b.id && selectedType === 'beam'}
          onClick={sel(b.id, 'beam')} xray={xray} />
      ))}

      {/* Slabs */}
      {slabs.map(s => (
        <Slab3D key={s.id} slab={s} wallH={wallHeightMm}
          isSelected={selectedId === s.id && selectedType === 'slab'}
          onClick={sel(s.id, 'slab')} xray={xray} />
      ))}

      {/* Steel reinforcement */}
      {showSteel && <>
        {beams.map(b   => <BeamSteel3D   key={`bs-${b.id}`} beam={b}   wallH={wallHeightMm} showHooks={showHooks} columns={columns} />)}
        {columns.map(c => <ColumnSteel3D key={`cs-${c.id}`} col={c}    wallH={wallHeightMm} />)}
        {slabs.map(s   => <SlabSteel3D   key={`ss-${s.id}`} slab={s}   wallH={wallHeightMm} />)}
      </>}

      <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={1} maxDistance={80} target={[0, 2, 0]} />
    </>
  )
}

// ── Main 3D view ───────────────────────────────────────────────
export default function ThreeDView({ onClose }) {
  const [showSteel, setShowSteel] = useState(false)
  const [showHooks, setShowHooks] = useState(false)
  const wH = useStore.getState().wallHeightMm

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#070b12', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#0f1525', borderBottom: '1px solid #1e2533', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#9aadcc', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: '#f0c060', fontWeight: 600 }}>3D View</span>
          <span>Drag to orbit · Scroll to zoom · Right-drag to pan</span>
          <span style={{ color: '#6b7fa8' }}>{wH}mm ({(wH / 304.8).toFixed(1)}ft) wall height</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>

          <button
            onClick={() => setShowSteel(v => !v)}
            style={{
              background: showSteel ? '#1a3a1a' : '#131929',
              border: `1px solid ${showSteel ? '#22c55e' : '#2a3a50'}`,
              borderRadius: 6, color: showSteel ? '#22c55e' : '#5a7a9a',
              padding: '5px 14px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            {showSteel ? '◉ Steel ON' : '◎ Steel OFF'}
          </button>
          <button onClick={onClose} style={{ background: '#2563eb', border: 'none', borderRadius: 6, color: '#fff', padding: '5px 16px', cursor: 'pointer', fontSize: 12 }}>
            ← Back to 2D
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1 }}>
        <Canvas shadows camera={{ position: [8, 6, 8], fov: 60 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
          <Scene showSteel={showSteel} showHooks={showHooks} />
        </Canvas>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 20, left: 20,
        background: 'rgba(10,15,25,0.90)', borderRadius: 8,
        border: '1px solid #1e2533', padding: '8px 14px',
        display: 'flex', gap: 14, fontSize: 10, color: '#9aadcc', flexWrap: 'wrap', maxWidth: 600,
      }}>
        {[['B1', '#FFD700'], ['B2', '#FF8C00'], ['B3', '#00CED1'], ['B4', '#FF4444']].map(([m, c]) => (
          <span key={m}><span style={{ color: c }}>■</span> {m}</span>
        ))}
        <span><span style={{ color: '#8090a0' }}>■</span> Wall</span>
        <span><span style={{ color: '#b0c0d0' }}>■</span> Column</span>
        <span><span style={{ color: '#4a6080' }}>■</span> Slab</span>
        <span><span style={{ color: '#ff6b35' }}>■</span> Selected</span>
        {showSteel && <>
          <span style={{ color: '#4a6fa5' }}>|</span>
          <span><span style={{ color: '#4a90e0' }}>─</span> Bot bars</span>
          <span><span style={{ color: '#e06040' }}>─</span> Top bars</span>
          <span><span style={{ color: '#50c050' }}>─</span> Curtailed</span>
          <span><span style={{ color: '#b0b0b0' }}>□</span> Stirrups/ties</span>
          <span><span style={{ color: '#e0c060' }}>─</span> Col vert</span>
          <span><span style={{ color: '#60c870' }}>─</span> Slab bars</span>
          <span><span style={{ color: '#ffe040' }}>⌐</span> Hook/L-bend</span>
          <span><span style={{ color: '#40e0a0' }}>─</span> Embed OK</span>
          <span><span style={{ color: '#ff4040' }}>─</span> Embed short</span>
        </>}
      </div>
    </div>
  )
}
