import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { useDocument } from '../../store/document'
import type { StateFlowNode } from '../toFlow'

/** Fill for a state coloured by its labels: one tint, or equal pie slices for several. */
function fillStyle(colors: string[]): CSSProperties {
  if (colors.length === 0) return {}
  const tint = (c: string) => `color-mix(in srgb, ${c} 30%, var(--state-fill))`
  if (colors.length === 1) return { background: tint(colors[0]), borderColor: colors[0] }
  const step = 360 / colors.length
  const stops = colors.map((c, i) => `${tint(c)} ${i * step}deg ${(i + 1) * step}deg`).join(', ')
  return { background: `conic-gradient(${stops})` }
}

export function StateNode({ data, selected }: NodeProps<StateFlowNode>) {
  const editing = useDocument((s) => s.mode === 'edit')
  const connecting = useConnection((c) => c.inProgress)

  return (
    <div
      className={`state-node${selected ? ' selected' : ''}${data.initialProb !== undefined ? ' initial' : ''}`}
      style={fillStyle(data.colors)}
      title={data.labels.length ? `${data.name} — ${data.labels.join(', ')}` : data.name}
    >
      {data.initialProb !== undefined && (
        <div className="initial-marker" aria-label="initial state">
          {data.initialProb !== '1' && <span>{data.initialProb}</span>}
        </div>
      )}
      <span className="state-name">{data.name}</span>
      {/* The whole circle is a drop target, but only while a connection is being dragged. */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        className={`state-target-handle${connecting ? ' active' : ''}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={editing ? 'state-source-handle' : 'hidden-handle'}
        title="Drag to a state (or back to this one) to add an action"
      />
    </div>
  )
}
