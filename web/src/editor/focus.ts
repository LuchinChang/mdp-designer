// What stays visible, and in which colour, when something is hovered in preview mode.
import { choiceColor } from '../core/palette'
import type { Choice, Id, MdpDocument } from '../core/types'
import { actionEdgeId, branchEdgeId, choiceNodeId, stateNodeId } from './ids'

export type Focus = { kind: 'state'; id: Id } | { kind: 'choice'; id: Id } | { kind: 'label'; id: Id }

export interface FocusView {
  /** Flow ids of the focused element and everything directly related to it. */
  ids: Set<string>
  /** Per-action colours for dots and edges, so a state's actions can be told apart. */
  colors: Map<string, string>
}

export function focusView(doc: MdpDocument, focus: Focus): FocusView {
  const ids = new Set<string>()
  const colors = new Map<string, string>()
  const { choices, states } = doc.model

  const addChoice = (c: Choice) => {
    const color = choiceColor(doc, c.id)
    ids.add(choiceNodeId(c.id)).add(actionEdgeId(c.id)).add(stateNodeId(c.state))
    colors.set(choiceNodeId(c.id), color).set(actionEdgeId(c.id), color)
    for (const b of c.branches) {
      ids.add(branchEdgeId(c.id, b.target)).add(stateNodeId(b.target))
      colors.set(branchEdgeId(c.id, b.target), color)
    }
  }

  if (focus.kind === 'label') {
    for (const s of states) if (s.labels?.includes(focus.id)) ids.add(stateNodeId(s.id))
  } else if (focus.kind === 'choice') {
    const c = choices.find((x) => x.id === focus.id)
    if (c) addChoice(c)
  } else {
    ids.add(stateNodeId(focus.id))
    for (const c of choices) {
      if (c.state === focus.id) addChoice(c)
      // Incoming: the branch into this state, its action dot, and the predecessor (uncoloured).
      else if (c.branches.some((b) => b.target === focus.id))
        ids.add(branchEdgeId(c.id, focus.id)).add(choiceNodeId(c.id)).add(actionEdgeId(c.id)).add(stateNodeId(c.state))
    }
  }
  return { ids, colors }
}
