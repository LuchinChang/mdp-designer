import { MarkerType, type Edge, type Node } from '@xyflow/react'
import { labelColors } from '../core/palette'
import { edgeKey, initialDistribution, type MdpDocument, type Point } from '../core/types'
import { actionEdgeId, branchEdgeId, choiceNodeId, stateNodeId } from './ids'

export type StateNodeData = {
  name: string
  /** Colours of the state's labels, in declaration order. */
  colors: string[]
  labels: string[]
  initialProb?: string
}
export type ChoiceNodeData = { action?: string; color?: string }
export type MdpEdgeData = {
  label: string
  curvature: number
  labelT: number
  loopAngle: number
  kind: 'action' | 'branch'
  dimmed?: boolean
  /** Highlight colour while the edge's action is focused. */
  color?: string
}

export type StateFlowNode = Node<StateNodeData, 'state'>
export type ChoiceFlowNode = Node<ChoiceNodeData, 'choice'>
export type FlowNode = StateFlowNode | ChoiceFlowNode
export type MdpFlowEdge = Edge<MdpEdgeData, 'mdp'>

const DEFAULT_CURVE = 0.25

/**
 * Convert a document into React Flow nodes and edges.
 * MDP: state -> choice dot -> successors. DTMC: state -> successors directly.
 * Node positions are centres (the canvas uses nodeOrigin [0.5, 0.5]).
 */
export function toFlow(doc: MdpDocument): { nodes: FlowNode[]; edges: MdpFlowEdge[] } {
  const { model, layout = {} } = doc
  const isMdp = model.type === 'mdp'
  const actionName = new Map((model.actions ?? []).map((a) => [a.id, a.name ?? a.id]))
  const colors = labelColors(doc)
  const labelOrder = new Map((model.labels ?? []).map((l, i) => [l.id, i]))
  const init = initialDistribution(model)

  const cols = Math.ceil(Math.sqrt(model.states.length))
  const statePos = new Map<string, Point>(
    model.states.map((s, i) => [s.id, layout.states?.[s.id] ?? { x: (i % cols) * 200, y: Math.floor(i / cols) * 200 }]),
  )

  const nodes: FlowNode[] = model.states.map((s) => {
    const labels = [...(s.labels ?? [])].sort((a, b) => (labelOrder.get(a) ?? 0) - (labelOrder.get(b) ?? 0))
    return {
      id: stateNodeId(s.id),
      type: 'state',
      position: statePos.get(s.id)!,
      data: {
        name: s.name ?? s.id,
        labels,
        colors: labels.map((l) => colors.get(l) ?? '#888'),
        initialProb: s.id in init ? String(init[s.id]) : undefined,
      },
    }
  })

  const edges: MdpFlowEdge[] = []
  const edgeData = (key: string, label: string, kind: MdpEdgeData['kind']): MdpEdgeData => {
    const e = layout.edges?.[key] ?? {}
    return { label, kind, curvature: e.curvature ?? 0, labelT: e.labelT ?? 0.5, loopAngle: e.loopAngle ?? -90 }
  }

  for (const c of model.choices) {
    if (!statePos.has(c.state)) continue
    const action = (c.action && actionName.get(c.action)) ?? c.action ?? ''
    if (isMdp) {
      const src = statePos.get(c.state)!
      const first = statePos.get(c.branches[0]?.target) ?? src
      nodes.push({
        id: choiceNodeId(c.id),
        type: 'choice',
        position: layout.choices?.[c.id] ?? { x: (src.x * 2 + first.x) / 3, y: (src.y * 2 + first.y) / 3 },
        data: { action },
      })
      edges.push({
        id: actionEdgeId(c.id),
        type: 'mdp',
        source: stateNodeId(c.state),
        target: choiceNodeId(c.id),
        data: edgeData(`${c.state}->${c.id}`, action, 'action'),
      })
    }
    for (const b of c.branches) {
      if (!statePos.has(b.target)) continue
      edges.push({
        id: branchEdgeId(c.id, b.target),
        type: 'mdp',
        source: isMdp ? choiceNodeId(c.id) : stateNodeId(c.state),
        target: stateNodeId(b.target),
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        data: edgeData(edgeKey(c.id, b.target), String(b.prob), 'branch'),
      })
    }
  }

  // Separate antiparallel edges that have no explicit curvature, e.g. s1 -> dot -> s1.
  const pairs = new Set(edges.map((e) => `${e.source}\u0000${e.target}`))
  for (const e of edges) {
    const key = e.id.slice(2)
    const explicit = layout.edges?.[key]?.curvature !== undefined
    if (!explicit && e.source !== e.target && pairs.has(`${e.target}\u0000${e.source}`)) e.data!.curvature = DEFAULT_CURVE
  }

  return { nodes, edges }
}
