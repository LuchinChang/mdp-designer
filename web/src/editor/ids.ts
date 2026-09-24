// React Flow ids are namespaced, because states and choices may share ids in a document.
import type { Id } from '../core/types'

export const stateNodeId = (id: Id) => `s:${id}`
export const choiceNodeId = (id: Id) => `c:${id}`
export const actionEdgeId = (choice: Id) => `a:${choice}`
export const branchEdgeId = (choice: Id, target: Id) => `b:${choice}->${target}`

export type FlowRef =
  | { kind: 'state'; id: Id }
  | { kind: 'choice'; id: Id }
  | { kind: 'action'; choice: Id }
  | { kind: 'branch'; choice: Id; target: Id }

export function parseFlowId(fid: string): FlowRef | null {
  const rest = fid.slice(2)
  switch (fid.slice(0, 2)) {
    case 's:':
      return { kind: 'state', id: rest }
    case 'c:':
      return { kind: 'choice', id: rest }
    case 'a:':
      return { kind: 'action', choice: rest }
    case 'b:': {
      const i = rest.indexOf('->')
      return { kind: 'branch', choice: rest.slice(0, i), target: rest.slice(i + 2) }
    }
  }
  return null
}
