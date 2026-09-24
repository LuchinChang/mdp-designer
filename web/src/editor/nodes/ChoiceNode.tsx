import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useDocument } from '../../store/document'
import type { ChoiceFlowNode } from '../toFlow'

export function ChoiceNode({ data, selected }: NodeProps<ChoiceFlowNode>) {
  const editing = useDocument((s) => s.mode === 'edit')
  return (
    <div
      className={`choice-node${selected ? ' selected' : ''}${data.color ? ' focused' : ''}`}
      style={data.color ? { background: data.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${data.color} 25%, transparent)` } : undefined}
      title={data.action}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="hidden-handle" />
      <Handle
        type="source"
        position={Position.Right}
        className={editing ? 'choice-source-handle' : 'hidden-handle'}
        title="Drag to a state to add a branch"
      />
    </div>
  )
}
