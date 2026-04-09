/**
 * Planar face detection — finds the closed structural region containing a click point.
 *
 * Key design decisions:
 *  1. Endpoint snapping: beam endpoints drawn at wall faces (~115 mm off the wall
 *     centreline) are projected onto the nearest segment before graph construction.
 *  2. Smallest-face selection: both half-edge directions of the first hit edge are
 *     traced; the smallest polygon that still contains the click point is returned.
 */

const EPS         = 1e-8
const SNAP_TOL    = 150    // mm — merge nodes closer than this
const CONNECT_TOL = 400    // mm — snap endpoint to nearest segment if within this

function addNode(nodes, x, y) {
  for (let i = 0; i < nodes.length; i++)
    if (Math.hypot(nodes[i].x - x, nodes[i].y - y) < SNAP_TOL) return i
  nodes.push({ x, y })
  return nodes.length - 1
}

function findNode(nodes, x, y) {
  let best = -1, bestD = SNAP_TOL * 2
  for (let i = 0; i < nodes.length; i++) {
    const d = Math.hypot(nodes[i].x - x, nodes[i].y - y)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

function intersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const dAx = bx - ax, dAy = by - ay
  const dBx = dx - cx, dBy = dy - cy
  const det = dAx * dBy - dAy * dBx
  if (Math.abs(det) < EPS) return null
  const t = ((cx - ax) * dBy - (cy - ay) * dBx) / det
  const s = ((cx - ax) * dAy - (cy - ay) * dAx) / det
  return { t, s }
}

function polygonArea(poly) {
  let area = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y
  return Math.abs(area) / 2
}

function pointInPolygon(pt, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    if (((yi > pt.y) !== (yj > pt.y)) &&
        pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// Project each endpoint onto the nearest other segment within CONNECT_TOL.
// Bridges the gap between beam endpoints (wall face) and wall centrelines.
function snapSegEndpoints(raw) {
  return raw.map(([ax, ay, bx, by], i) => {
    let nax = ax, nay = ay, nbx = bx, nby = by
    for (const [isStart, px, py] of [[true, ax, ay], [false, bx, by]]) {
      let bestDist = CONNECT_TOL, bestX = px, bestY = py
      for (let j = 0; j < raw.length; j++) {
        if (j === i) continue
        const [cx, cy, dx, dy] = raw[j]
        const jDx = dx - cx, jDy = dy - cy
        const len2 = jDx * jDx + jDy * jDy
        if (len2 < EPS) continue
        const t = ((px - cx) * jDx + (py - cy) * jDy) / len2
        if (t < 0 || t > 1) continue
        const projX = cx + t * jDx, projY = cy + t * jDy
        const dist  = Math.hypot(px - projX, py - projY)
        if (dist > 0 && dist < bestDist) { bestDist = dist; bestX = projX; bestY = projY }
      }
      if (isStart) { nax = bestX; nay = bestY }
      else         { nbx = bestX; nby = bestY }
    }
    return [nax, nay, nbx, nby]
  })
}

// Trace the face on the left of half-edge sN0→sN1 using smallest-CW-rotation rule.
function traceFace(sN0, sN1, nodes, adj) {
  const poly = [{ x: nodes[sN0].x, y: nodes[sN0].y }]
  let prev = sN0, cur = sN1
  for (let step = 0; step < 80; step++) {
    if (cur === sN0) break
    if (poly.length > 40) return null
    poly.push({ x: nodes[cur].x, y: nodes[cur].y })
    const fwd = Math.atan2(nodes[cur].y - nodes[prev].y, nodes[cur].x - nodes[prev].x)
    const rev = fwd + Math.PI
    let bestTo = -1, bestCW = Infinity
    for (const e of (adj[cur] ?? [])) {
      if (e.to === prev) continue
      let cw = (rev - e.angle + 2 * Math.PI) % (2 * Math.PI)
      if (cw < 1e-9) cw += 2 * Math.PI
      if (cw < bestCW) { bestCW = cw; bestTo = e.to }
    }
    if (bestTo < 0) return null
    prev = cur; cur = bestTo
  }
  return poly.length >= 3 ? poly : null
}

export function detectRegion(clickPt, walls, beams) {
  const raw = []
  walls.forEach(w => raw.push([w.start.x, w.start.y, w.end.x, w.end.y]))
  beams.forEach(b => { if (b.start && b.end) raw.push([b.start.x, b.start.y, b.end.x, b.end.y]) })
  if (raw.length < 2) return null

  const snapped = snapSegEndpoints(raw)

  // Split at intersections
  const split = []
  for (let i = 0; i < snapped.length; i++) {
    const [ax, ay, bx, by] = snapped[i]
    const ts = [0, 1]
    for (let j = 0; j < snapped.length; j++) {
      if (i === j) continue
      const [cx, cy, dx, dy] = snapped[j]
      const r = intersect(ax, ay, bx, by, cx, cy, dx, dy)
      if (!r) continue
      if (r.t > EPS && r.t < 1 - EPS && r.s >= -EPS && r.s <= 1 + EPS) ts.push(r.t)
    }
    ts.sort((a, b) => a - b)
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1]
      if (t1 - t0 < EPS) continue
      split.push([
        ax + t0 * (bx - ax), ay + t0 * (by - ay),
        ax + t1 * (bx - ax), ay + t1 * (by - ay),
      ])
    }
  }

  // Build planar graph
  const nodes = [], adj = []
  split.forEach(([x0, y0, x1, y1]) => {
    const n0 = addNode(nodes, x0, y0), n1 = addNode(nodes, x1, y1)
    if (n0 === n1) return
    while (adj.length <= Math.max(n0, n1)) adj.push([])
    adj[n0].push({ to: n1, angle: Math.atan2(y1 - y0, x1 - x0) })
    adj[n1].push({ to: n0, angle: Math.atan2(y0 - y1, x0 - x1) })
  })

  // Ray in +x direction from click point
  const { x: cx, y: cy } = clickPt
  let hitN0 = -1, hitN1 = -1, hitX = Infinity
  split.forEach(([x0, y0, x1, y1]) => {
    const dy = y1 - y0
    if (Math.abs(dy) < EPS) return
    const t = (cy - y0) / dy
    if (t <= EPS || t >= 1 - EPS) return
    const xHit = x0 + t * (x1 - x0)
    if (xHit <= cx + EPS || xHit >= hitX) return
    const n0 = findNode(nodes, x0, y0), n1 = findNode(nodes, x1, y1)
    if (n0 < 0 || n1 < 0 || n0 === n1) return
    hitX = xHit; hitN0 = n0; hitN1 = n1
  })

  if (hitN0 < 0) return null

  // Try both half-edge directions; return smallest polygon containing click
  const candidates = []
  for (const [n0, n1] of [[hitN0, hitN1], [hitN1, hitN0]]) {
    const poly = traceFace(n0, n1, nodes, adj)
    if (poly && poly.length >= 3 && pointInPolygon(clickPt, poly)) candidates.push(poly)
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => polygonArea(a) - polygonArea(b))
  return candidates[0]
}
