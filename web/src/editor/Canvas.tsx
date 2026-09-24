import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type FinalConnectionState,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { addState, connectStates, addBranch, deleteElements, moveNodes, type Deletion } from '../core/ops'
import type { MdpDocument } from '../core/types'
import { useDocument } from '../store/document'
import { MdpEdge } from './edges/MdpEdge'
import { focusView } from './focus'
import { parseFlowId, stateNodeId } from './ids'
import { ChoiceNode } from './nodes/ChoiceNode'
import { StateNode } from './nodes/StateNode'
import { toFlow, type FlowNode, type MdpFlowEdge } from './toFlow'
import { Legend } from '../panels/Legend'

const nodeTypes: NodeTypes = { state: StateNode, choice: ChoiceNode }
const edgeTypes: EdgeTypes = { mdp: MdpEdge }
const DELETE_KEYS = ['Backspace', 'Delete']
// Extra room so the initial-state arrow, which sits outside the node, is not clipped.
const FIT_OPTIONS = { padding: 0.2 }

/** Apply a state -> state or choice -> state connection to the document. */
function connect(doc: MdpDocument, source: string, target: string): MdpDocument {
  const s = parseFlowId(source)
  const t = parseFlowId(target)
  if (t?.kind !== 'state') return doc
  if (s?.kind === 'state') return connectStates(doc, s.id, t.id).doc
  if (s?.kind === 'choice') return addBranch(doc, s.id, t.id)
  return doc
}

function toDeletion(nodes: { id: string }[], edges: { id: string }[]): Deletion {
  const del: Required<Deletion> = { states: [], choices: [], branches: [] }
  for (const x of [...nodes, ...edges]) {
    const r = parseFlowId(x.id)
    if (r?.kind === 'state') del.states.push(r.id)
    else if (r?.kind === 'choice') del.choices.push(r.id)
    else if (r?.kind === 'action') del.choices.push(r.choice)
    else if (r?.kind === 'branch') del.branches.push({ choice: r.choice, target: r.target })
  }
  return del
}

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
  </svg>
)
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export function Canvas() {
  const doc = useDocument((s) => s.doc)
  const mode = useDocument((s) => s.mode)
  const focus = useDocument((s) => s.focus)
  const selectRequest = useDocument((s) => s.selectRequest)
  const { apply, setMode, setSelection, setFocus } = useDocument.getState()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const editing = mode === 'edit'

  const base = useMemo(() => toFlow(doc), [doc])
  const [nodes, setNodes] = useState<FlowNode[]>(base.nodes)
  const [edges, setEdges] = useState<MdpFlowEdge[]>(base.edges)

  // Re-derive from the document, keeping what React Flow owns: measured sizes,
  // selection, and the position of a node that is being dragged.
  // (State adjusted during render, per https://react.dev/learn/you-might-not-need-an-effect)
  const [syncedBase, setSyncedBase] = useState(base)
  if (syncedBase !== base) {
    setSyncedBase(base)
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]))
      return base.nodes.map((n) => {
        const p = old.get(n.id)
        if (!p) return n
        return { ...n, measured: p.measured, selected: p.selected, position: p.dragging ? p.position : n.position }
      })
    })
    setEdges((prev) => {
      const sel = new Set(prev.filter((e) => e.selected).map((e) => e.id))
      return base.edges.map((e) => (sel.has(e.id) ? { ...e, selected: true } : e))
    })
  }

  // Selection requested from the inspector or the problems list: select, then frame it.
  const [handledRequest, setHandledRequest] = useState(selectRequest)
  const [fitIds, setFitIds] = useState<string[] | null>(null)
  if (selectRequest && handledRequest !== selectRequest) {
    setHandledRequest(selectRequest)
    const ns = new Set(selectRequest.nodes)
    const es = new Set(selectRequest.edges)
    setNodes((prev) => prev.map((n) => (n.selected === ns.has(n.id) ? n : { ...n, selected: ns.has(n.id) })))
    setEdges((prev) => prev.map((e) => (e.selected === es.has(e.id) ? e : { ...e, selected: es.has(e.id) })))
    // For a branch, frame both of its endpoints.
    const endpoints = base.edges.filter((e) => es.has(e.id)).flatMap((e) => [e.source, e.target])
    setFitIds([...selectRequest.nodes, ...endpoints])
  }
  useEffect(() => {
    if (fitIds?.length) void fitView({ nodes: fitIds.map((id) => ({ id })), duration: 300, maxZoom: 1.5, padding: 0.6 })
  }, [fitIds, fitView])

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)), [])
  const onEdgesChange = useCallback((changes: EdgeChange<MdpFlowEdge>[]) => setEdges((es) => applyEdgeChanges(changes, es)), [])

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) =>
      apply((d) =>
        moveNodes(
          d,
          dragged.flatMap((n) => {
            const r = parseFlowId(n.id)
            return r?.kind === 'state' || r?.kind === 'choice' ? [{ kind: r.kind, id: r.id, pos: n.position }] : []
          }),
        ),
      ),
    [apply],
  )

  const onSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) =>
      setSelection({ nodes: nodes.map((n) => n.id).sort(), edges: edges.map((e) => e.id).sort() }),
    [setSelection],
  )

  const isValidConnection: IsValidConnection = useCallback((c) => c.target.startsWith('s:'), [])
  const onConnect = useCallback((c: Connection) => apply((d) => connect(d, c.source, c.target)), [apply])

  // Dropping a connection on empty canvas creates a state there and connects to it.
  const onConnectEnd = useCallback(
    (event: globalThis.MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || state.toNode || !state.fromNode) return
      const target = (event.target as Element | null)?.closest('.react-flow__pane')
      if (!target) return
      const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event
      const from = state.fromNode.id
      apply((d) => {
        const { doc: d2, id } = addState(d, screenToFlowPosition({ x: clientX, y: clientY }))
        return connect(d2, from, stateNodeId(id))
      })
    },
    [apply, screenToFlowPosition],
  )

  const onPaneClick = useCallback(
    (e: MouseEvent) => {
      if (!editing || e.detail !== 2) return
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const grid = doc.layout?.grid
      const snap = (v: number) => (grid?.snap ? Math.round(v / (grid.size ?? 20)) * (grid.size ?? 20) : v)
      apply((d) => addState(d, { x: snap(pos.x), y: snap(pos.y) }).doc)
    },
    [editing, doc.layout?.grid, apply, screenToFlowPosition],
  )

  const onDelete = useCallback(
    ({ nodes, edges }: { nodes: Node[]; edges: MdpFlowEdge[] }) => apply((d) => deleteElements(d, toDeletion(nodes, edges))),
    [apply],
  )

  // Preview mode: hovering a state, an action dot, or any edge of an action focuses it.
  const onNodeMouseEnter = useCallback(
    (_: MouseEvent, n: Node) => {
      if (editing) return
      const r = parseFlowId(n.id)
      if (r?.kind === 'state' || r?.kind === 'choice') setFocus({ kind: r.kind, id: r.id })
    },
    [editing, setFocus],
  )
  const onEdgeMouseEnter = useCallback(
    (_: MouseEvent, e: MdpFlowEdge) => {
      if (editing) return
      const r = parseFlowId(e.id)
      if (r?.kind === 'action' || r?.kind === 'branch') setFocus({ kind: 'choice', id: r.choice })
    },
    [editing, setFocus],
  )
  const clearFocus = useCallback(() => setFocus(null), [setFocus])

  // Dim everything unrelated to the focused element and colour the actions involved.
  const view = useMemo(() => (focus ? focusView(doc, focus) : null), [doc, focus])
  const shownNodes = useMemo(
    () =>
      view
        ? nodes.map((n) => {
            if (!view.ids.has(n.id)) return { ...n, className: 'dimmed' }
            const color = view.colors.get(n.id)
            return color && n.type === 'choice' ? { ...n, data: { ...n.data, color } } : n
          })
        : nodes,
    [nodes, view],
  )
  const shownEdges = useMemo(
    () =>
      view
        ? edges.map((e) => {
            if (!view.ids.has(e.id)) return { ...e, data: { ...e.data!, dimmed: true } }
            const color = view.colors.get(e.id)
            if (!color) return e
            const markerEnd = typeof e.markerEnd === 'object' ? { ...e.markerEnd, color } : e.markerEnd
            return { ...e, markerEnd, data: { ...e.data!, color } }
          })
        : edges,
    [edges, view],
  )

  const grid = doc.layout?.grid
  return (
    <ReactFlow
      nodes={shownNodes}
      edges={shownEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onSelectionChange={onSelectionChange}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      isValidConnection={isValidConnection}
      onDelete={onDelete}
      onPaneClick={onPaneClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={clearFocus}
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseLeave={clearFocus}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={[0.5, 0.5]}
      nodesDraggable={editing}
      nodesConnectable={editing}
      deleteKeyCode={editing ? DELETE_KEYS : null}
      zoomOnDoubleClick={!editing}
      connectionRadius={30}
      snapToGrid={editing && (grid?.snap ?? false)}
      snapGrid={[grid?.size ?? 20, grid?.size ?? 20]}
      className={editing ? 'mode-edit' : 'mode-preview'}
      fitView
      fitViewOptions={FIT_OPTIONS}
      minZoom={0.1}
    >
      <Background gap={grid?.size ?? 20} />
      <Legend />
      <MiniMap pannable zoomable nodeStrokeWidth={2} />
      <Controls showInteractive={false}>
        <ControlButton
          onClick={() => setMode(editing ? 'preview' : 'edit')}
          title={editing ? 'Switch to preview mode (⌘E)' : 'Switch to edit mode (⌘E)'}
          aria-label={editing ? 'Switch to preview mode' : 'Switch to edit mode'}
          className={editing ? 'mode-toggle editing' : 'mode-toggle'}
        >
          {editing ? <EditIcon /> : <EyeIcon />}
        </ControlButton>
      </Controls>
    </ReactFlow>
  )
}
