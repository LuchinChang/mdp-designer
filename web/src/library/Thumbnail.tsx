import { memo, useMemo } from 'react'
import { labelColors } from '../core/palette'
import { initialDistribution, type MdpDocument, type Point } from '../core/types'

const R = 26 // state radius in canvas units (state nodes are 64px across)
const PAD = 60

/** A text-free sketch of a model's shape, drawn from its layout. */
export const Thumbnail = memo(function Thumbnail({ doc }: { doc: MdpDocument }) {
  const svg = useMemo(() => {
    const { model, layout = {} } = doc
    const cols = Math.ceil(Math.sqrt(model.states.length))
    const pos = new Map<string, Point>(
      model.states.map((s, i) => [s.id, layout.states?.[s.id] ?? { x: (i % cols) * 200, y: Math.floor(i / cols) * 200 }]),
    )
    const colors = labelColors(doc)
    const init = initialDistribution(model)
    const isMdp = model.type === 'mdp'

    const lines: [Point, Point][] = []
    const loops: Point[] = []
    const dots: Point[] = []
    for (const c of model.choices) {
      const src = pos.get(c.state)
      if (!src) continue
      const first = pos.get(c.branches[0]?.target) ?? src
      const dot = isMdp ? (layout.choices?.[c.id] ?? { x: (src.x * 2 + first.x) / 3, y: (src.y * 2 + first.y) / 3 }) : src
      if (isMdp) {
        dots.push(dot)
        lines.push([src, dot])
      }
      for (const b of c.branches) {
        const t = pos.get(b.target)
        if (!t) continue
        if (!isMdp && b.target === c.state) loops.push(t)
        else lines.push([dot, t])
      }
    }

    const xs = [...pos.values()].map((p) => p.x).concat(dots.map((d) => d.x))
    const ys = [...pos.values()].map((p) => p.y).concat(dots.map((d) => d.y))
    const minX = Math.min(...xs) - PAD - 30 // room for the initial arrow
    const minY = Math.min(...ys) - PAD
    const w = Math.max(...xs) - minX + PAD
    const h = Math.max(...ys) - minY + PAD
    return { pos, colors, init, lines, loops, dots, viewBox: `${minX} ${minY} ${w} ${h}` }
  }, [doc])

  return (
    <svg className="thumbnail" viewBox={svg.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g className="thumb-edges">
        {svg.lines.map(([a, b], i) => (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        ))}
        {svg.loops.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y - R * 1.3} r={R * 0.6} fill="none" />
        ))}
      </g>
      {svg.dots.map((d, i) => (
        <circle key={i} className="thumb-dot" cx={d.x} cy={d.y} r={7} />
      ))}
      {doc.model.states.map((s) => {
        const p = svg.pos.get(s.id)!
        const color = s.labels?.length ? svg.colors.get(s.labels[0]) : undefined
        const initial = s.id in svg.init
        return (
          <g key={s.id}>
            {initial && (
              <>
                <circle className="thumb-initial-ring" cx={p.x} cy={p.y} r={R + 7} />
                <line className="thumb-initial-arrow" x1={p.x - R - 44} y1={p.y} x2={p.x - R - 12} y2={p.y} />
              </>
            )}
            <circle
              className="thumb-state"
              cx={p.x}
              cy={p.y}
              r={R}
              style={color ? { fill: `color-mix(in srgb, ${color} 45%, var(--state-fill))`, stroke: color } : undefined}
            />
          </g>
        )
      })}
    </svg>
  )
})
