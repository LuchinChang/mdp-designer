import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'
import type { MdpFlowEdge } from '../toFlow'

type Vec = { x: number; y: number }

function geometry(node: InternalNode): { c: Vec; r: number } {
  const w = node.measured.width ?? 0
  const h = node.measured.height ?? 0
  const p = node.internals.positionAbsolute
  return { c: { x: p.x + w / 2, y: p.y + h / 2 }, r: Math.min(w, h) / 2 }
}

const along = (from: Vec, to: Vec, d: number): Vec => {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: from.x + ((to.x - from.x) / len) * d, y: from.y + ((to.y - from.y) / len) * d }
}

const quad = (a: Vec, k: Vec, b: Vec, t: number): Vec => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * k.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * k.y + t ** 2 * b.y,
})

/** Floating edge between circular nodes: straight/curved (quadratic) or a self-loop. */
export function MdpEdge({ id, source, target, data, markerEnd, style, selected }: EdgeProps<MdpFlowEdge>) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t || !data) return null
  const S = geometry(s)
  const T = geometry(t)

  let path: string
  let labelPos: Vec

  if (source === target) {
    const a = (data.loopAngle * Math.PI) / 180
    const spread = 0.45
    const p1 = { x: S.c.x + S.r * Math.cos(a - spread), y: S.c.y + S.r * Math.sin(a - spread) }
    const p2 = { x: S.c.x + S.r * Math.cos(a + spread), y: S.c.y + S.r * Math.sin(a + spread) }
    const k = S.r * 2.6
    const k1 = { x: S.c.x + k * Math.cos(a - spread * 1.4), y: S.c.y + k * Math.sin(a - spread * 1.4) }
    const k2 = { x: S.c.x + k * Math.cos(a + spread * 1.4), y: S.c.y + k * Math.sin(a + spread * 1.4) }
    path = `M ${p1.x} ${p1.y} C ${k1.x} ${k1.y} ${k2.x} ${k2.y} ${p2.x} ${p2.y}`
    labelPos = { x: S.c.x + S.r * 2.2 * Math.cos(a), y: S.c.y + S.r * 2.2 * Math.sin(a) }
  } else {
    const dx = T.c.x - S.c.x
    const dy = T.c.y - S.c.y
    const mid = { x: (S.c.x + T.c.x) / 2, y: (S.c.y + T.c.y) / 2 }
    // Positive curvature bends left of travel direction (screen y points down).
    const k = { x: mid.x + dy * data.curvature, y: mid.y - dx * data.curvature }
    const p1 = along(S.c, k, S.r)
    const p2 = along(T.c, k, T.r + 2)
    path = `M ${p1.x} ${p1.y} Q ${k.x} ${k.y} ${p2.x} ${p2.y}`
    labelPos = quad(p1, k, p2, data.labelT)
  }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className={selected ? 'selected' : undefined} />
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label edge-label-${data.kind}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
