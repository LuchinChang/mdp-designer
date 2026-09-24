import { useEffect } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { MdpDocument } from '../core/types'
import { ChoiceNode } from './nodes/ChoiceNode'
import { StateNode } from './nodes/StateNode'
import { MdpEdge } from './edges/MdpEdge'
import { toFlow, type ChoiceFlowNode, type MdpFlowEdge, type StateFlowNode } from './toFlow'

const nodeTypes: NodeTypes = { state: StateNode, choice: ChoiceNode }
const edgeTypes: EdgeTypes = { mdp: MdpEdge }

export function Canvas({ doc }: { doc: MdpDocument }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<StateFlowNode | ChoiceFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<MdpFlowEdge>([])

  useEffect(() => {
    const flow = toFlow(doc)
    setNodes(flow.nodes)
    setEdges(flow.edges)
  }, [doc, setNodes, setEdges])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={[0.5, 0.5]}
      nodesConnectable={false}
      snapToGrid={doc.layout?.grid?.snap ?? false}
      snapGrid={[doc.layout?.grid?.size ?? 20, doc.layout?.grid?.size ?? 20]}
      fitView
      minZoom={0.1}
    >
      <Background gap={20} />
      <MiniMap pannable zoomable nodeStrokeWidth={2} />
      <Controls />
    </ReactFlow>
  )
}
