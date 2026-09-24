import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { StateFlowNode } from '../toFlow'

export function StateNode({ data, selected }: NodeProps<StateFlowNode>) {
  return (
    <div className={`state-node${selected ? ' selected' : ''}`} title={data.name}>
      {data.initialProb !== undefined && (
        <div className="initial-marker" aria-label="initial state">
          {data.initialProb !== '1' && <span>{data.initialProb}</span>}
        </div>
      )}
      <span className="state-name">{data.name}</span>
      {data.labels.length > 0 && (
        <div className="state-labels">
          {data.labels.map((l) => (
            <span key={l.id} className="label-badge" style={{ background: l.color }}>
              {l.id}
            </span>
          ))}
        </div>
      )}
      {/* Floating edges attach to the border; handles only exist to satisfy React Flow. */}
      <Handle type="target" position={Position.Top} className="hidden-handle" />
      <Handle type="source" position={Position.Bottom} className="hidden-handle" />
    </div>
  )
}
