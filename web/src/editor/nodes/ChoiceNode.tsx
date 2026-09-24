import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ChoiceFlowNode } from '../toFlow'

export function ChoiceNode({ data, selected }: NodeProps<ChoiceFlowNode>) {
  return (
    <div className={`choice-node${selected ? ' selected' : ''}`} title={data.action}>
      <Handle type="target" position={Position.Top} className="hidden-handle" />
      <Handle type="source" position={Position.Bottom} className="hidden-handle" />
    </div>
  )
}
