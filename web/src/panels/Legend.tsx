import { Panel } from '@xyflow/react'
import { useMemo } from 'react'
import { labelColors } from '../core/palette'
import { useDocument } from '../store/document'

/** Canvas legend: label colours (hover to highlight), plus the notation. */
export function Legend() {
  const doc = useDocument((s) => s.doc)
  const setFocus = useDocument((s) => s.setFocus)
  const colors = useMemo(() => labelColors(doc), [doc])
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const s of doc.model.states) for (const l of s.labels ?? []) c.set(l, (c.get(l) ?? 0) + 1)
    return c
  }, [doc])
  const labels = doc.model.labels ?? []

  return (
    <Panel position="top-left" className="legend">
      {labels.length > 0 && (
        <ul className="legend-labels">
          {labels.map((l) => (
            <li
              key={l.id}
              onMouseEnter={() => setFocus({ kind: 'label', id: l.id })}
              onMouseLeave={() => setFocus(null)}
              title={l.description}
            >
              <span className="legend-swatch" style={{ background: colors.get(l.id) }} />
              <span className="legend-name">{l.id}</span>
              <span className="legend-count">{counts.get(l.id) ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="legend-notation">
        <li>
          <span className="legend-glyph legend-initial" /> initial
        </li>
        {doc.model.type === 'mdp' && (
          <li>
            <span className="legend-glyph legend-dot" /> action
          </li>
        )}
      </ul>
    </Panel>
  )
}
