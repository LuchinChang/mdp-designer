import { MarkerType, type Edge, type Node } from '@xyflow/react'
import { edgeKey, initialDistribution, type MdpDocument, type Point } from '../core/types'

export type StateNodeData = {
  name: string
  labels: { id: string; color: string }[]
  initialProb?: string
}
export type ChoiceNodeData = { action?: string }
export type MdpEdgeData = {
  label: string
  curvature: number
  labelT: number
  loopAngle: number
  kind: 'action' | 'branch'
}

export type StateFlowNode = Node<StateNodeData, 'state'>
export type ChoiceFlowNode = Node<ChoiceNodeData, 'choice'>
export type MdpFlowEdge = Edge<MdpEdgeData, 'mdp'>

const DEFAULT_LABEL_COLOR = '#607d8b'
const DEFAULT_CURVE = 0.25

/**
 * Convert a document into React Flow nodes and edges.
 * MDP: state -> choice dot -> successors. DTMC: state -> successors directly.
 * Node positions are centres (the canvas uses nodeOrigin [0.5, 0.5]).
 */
export function toFlow(doc: MdpDocument): { nodes: (StateFlowNode | ChoiceFlowNode)[]; edges: MdpFlowEdge[] } {
  const { model, layout = {} } = doc
  const isMdp = model.type === 'mdp'
  const actionName = new Map((model.actions ?? []).map((a) => [a.id, a.name ?? a.id]))
  const labelColor = (id: string) => layout.labels?.[id]?.color ?? DEFAULT_LABEL_COLOR
  const init = initialDistribution(model)

  const cols = Math.ceil(Math.sqrt(model.states.length))
  const statePos = new Map<string, Point>(
    model.states.map((s, i) => [s.id, layout.states?.[s.id] ?? { x: (i % cols) * 200, y: Math.floor(i / cols) * 200 }]),
  )

  const nodes: (StateFlowNode | ChoiceFlowNode)[] = model.states.map((s) => ({
    id: s.id,
    type: 'state',
    position: statePos.get(s.id)!,
    data: {
      name: s.name ?? s.id,
      labels: (s.labels ?? []).map((l) => ({ id: l, color: labelColor(l) })),
      initialProb: s.id in init ? String(init[s.id]) : undefined,
    },
  }))

  const edges: MdpFlowEdge[] = []
  const edgeData = (key: string, label: string, kind: MdpEdgeData['kind']): MdpEdgeData => {
    const e = layout.edges?.[key] ?? {}
    return { label, kind, curvature: e.curvature ?? 0, labelT: e.labelT ?? 0.5, loopAngle: e.loopAngle ?? -90 }
  }

  for (const c of model.choices) {
    if (isMdp) {
      const src = statePos.get(c.state)!
      const first = statePos.get(c.branches[0]?.target) ?? src
      nodes.push({
        id: c.id,
        type: 'choice',
        position: layout.choices?.[c.id] ?? { x: (src.x * 2 + first.x) / 3, y: (src.y * 2 + first.y) / 3 },
        data: { action: c.action && actionName.get(c.action) },
      })
      edges.push({
        id: `${c.state}->${c.id}`,
        type: 'mdp',
        source: c.state,
        target: c.id,
        data: edgeData(`${c.state}->${c.id}`, (c.action && actionName.get(c.action)) ?? '', 'action'),
      })
    }
    for (const b of c.branches) {
      const key = edgeKey(c.id, b.target)
      edges.push({
        id: key,
        type: 'mdp',
        source: isMdp ? c.id : c.state,
        target: b.target,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        data: edgeData(key, String(b.prob), 'branch'),
      })
    }
  }

  // Separate antiparallel edges that have no explicit curvature, e.g. s1 -> dot -> s1.
  const pairs = new Set(edges.map((e) => `${e.source}\u0000${e.target}`))
  for (const e of edges) {
    const explicit = layout.edges?.[e.id]?.curvature !== undefined
    if (!explicit && e.source !== e.target && pairs.has(`${e.target}\u0000${e.source}`)) e.data!.curvature = DEFAULT_CURVE
  }

  return { nodes, edges }
}
