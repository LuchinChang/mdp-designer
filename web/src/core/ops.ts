// Pure document operations used by the editor. Each returns a new document;
// the input is never mutated.
import { add, div, mul, parseNum, rat, sum, toNum, type Rat } from './rational'
import {
  FORMAT_VERSION,
  edgeKey,
  initialDistribution,
  type Action,
  type Choice,
  type Id,
  type Label,
  type MdpDocument,
  type Metadata,
  type ModelType,
  type Num,
  type Point,
  type State,
} from './types'

const clone = <T>(x: T): T => structuredClone(x)

export function nextId(prefix: string, taken: Iterable<Id>): Id {
  const used = new Set(taken)
  for (let i = 0; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`
}

/** a, b, …, z, a26, a27, … */
function nextActionId(taken: Set<Id>): Id {
  for (let i = 0; ; i++) {
    const id = i < 26 ? String.fromCharCode(97 + i) : `a${i}`
    if (!taken.has(id)) return id
  }
}

export function blankDocument(type: ModelType): MdpDocument {
  return {
    format: 'mdp-designer',
    version: FORMAT_VERSION,
    metadata: { name: type === 'mdp' ? 'Untitled MDP' : 'Untitled DTMC' },
    model: {
      type,
      states: [{ id: 's0' }],
      ...(type === 'mdp' ? { actions: [] } : {}),
      initial: 's0',
      choices: [],
      labels: [],
    },
    layout: { states: { s0: { x: 0, y: 0 } }, grid: { snap: true, size: 20 } },
  }
}

/** Scale positive values so they sum to 1, exactly. */
function normalized(values: Num[]): Num[] {
  const rs = values.map((v) => parseNum(v) ?? rat(0n))
  const total = sum(rs)
  if (total.n <= 0n) return values.map(() => toNum(rat(1n, BigInt(values.length))))
  return rs.map((r) => toNum(div(r, total)))
}

// ---------------------------------------------------------------- states

export function addState(doc: MdpDocument, pos: Point): { doc: MdpDocument; id: Id } {
  const d = clone(doc)
  const id = nextId('s', d.model.states.map((s) => s.id))
  d.model.states.push({ id })
  d.layout ??= {}
  d.layout.states = { ...d.layout.states, [id]: pos }
  return { doc: d, id }
}

export function updateState(doc: MdpDocument, id: Id, patch: Partial<Omit<State, 'id'>>): MdpDocument {
  const d = clone(doc)
  const s = d.model.states.find((x) => x.id === id)
  if (!s) return doc
  Object.assign(s, patch)
  for (const k of ['name', 'description'] as const) if (s[k] === '') delete s[k]
  if (s.labels?.length === 0) delete s.labels
  return d
}

/** Set a state's initial probability; `null` removes it, `'only'` makes it the sole initial state. */
export function setInitial(doc: MdpDocument, id: Id, prob: Num | null | 'only'): MdpDocument {
  const d = clone(doc)
  if (prob === 'only') {
    d.model.initial = id
    return d
  }
  const init = { ...initialDistribution(d.model) }
  if (prob === null) delete init[id]
  else init[id] = prob
  const keys = Object.keys(init)
  d.model.initial = keys.length === 1 && init[keys[0]] === 1 ? keys[0] : init
  return d
}

export function moveNodes(doc: MdpDocument, moves: { kind: 'state' | 'choice'; id: Id; pos: Point }[]): MdpDocument {
  const d = clone(doc)
  d.layout ??= {}
  const states = (d.layout.states ??= {})
  const choices = (d.layout.choices ??= {})
  for (const m of moves) (m.kind === 'state' ? states : choices)[m.id] = { x: m.pos.x, y: m.pos.y }
  return d
}

// ---------------------------------------------------------------- choices and branches

function choicePosition(doc: MdpDocument, from: Id, to: Id): Point {
  const p = doc.layout?.states?.[from] ?? { x: 0, y: 0 }
  const q = doc.layout?.states?.[to] ?? p
  // Stagger dots that would otherwise land on the same spot.
  const k = doc.model.choices.filter((c) => c.state === from && c.branches[0]?.target === to).length
  if (from === to) {
    const a = -Math.PI / 2 + k * 0.7
    return { x: p.x + 100 * Math.cos(a), y: p.y + 100 * Math.sin(a) }
  }
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.hypot(dx, dy) || 1
  const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 36
  return { x: p.x + dx * 0.4 - (dy / len) * off, y: p.y + dy * 0.4 + (dx / len) * off }
}

/**
 * The drag gesture state -> state.
 * MDP: create a new choice with the first action not yet enabled in `from`.
 * DTMC: add a branch to the state's only choice, creating it if needed.
 */
export function connectStates(doc: MdpDocument, from: Id, to: Id): { doc: MdpDocument; choice: Id } {
  const existing = doc.model.choices.find((c) => c.state === from)
  if (doc.model.type === 'dtmc' && existing) return { doc: addBranch(doc, existing.id, to), choice: existing.id }

  const d = clone(doc)
  const id = nextId('c', d.model.choices.map((c) => c.id))
  const choice: Choice = { id, state: from, branches: [{ target: to, prob: 1 }] }
  if (d.model.type === 'mdp') {
    const actions = (d.model.actions ??= [])
    const enabled = new Set(d.model.choices.filter((c) => c.state === from).map((c) => c.action))
    let action = actions.find((a) => !enabled.has(a.id))?.id
    if (!action) {
      action = nextActionId(new Set(actions.map((a) => a.id)))
      actions.push({ id: action })
    }
    choice.action = action
  }
  d.layout ??= {}
  d.layout.choices = { ...d.layout.choices, [id]: choicePosition(doc, from, to) }
  d.model.choices.push(choice)
  return { doc: d, choice: id }
}

/**
 * Add a branch to `target`, keeping the ratios of the existing branches:
 * with n branches, the new one gets 1/(n+1) and the others are scaled by n/(n+1).
 */
export function addBranch(doc: MdpDocument, choiceId: Id, target: Id): MdpDocument {
  const d = clone(doc)
  const c = d.model.choices.find((x) => x.id === choiceId)
  if (!c || c.branches.some((b) => b.target === target)) return doc
  const n = BigInt(c.branches.length)
  const scale = rat(n, n + 1n)
  for (const b of c.branches) b.prob = toNum(mul(parseNum(b.prob) ?? rat(0n), scale))
  c.branches.push({ target, prob: toNum(rat(1n, n + 1n)) })
  return d
}

export function setBranchProb(doc: MdpDocument, choiceId: Id, target: Id, prob: Num): MdpDocument {
  const d = clone(doc)
  const b = d.model.choices.find((c) => c.id === choiceId)?.branches.find((x) => x.target === target)
  if (!b) return doc
  b.prob = prob
  return d
}

export function normalizeChoice(doc: MdpDocument, choiceId: Id): MdpDocument {
  const d = clone(doc)
  const c = d.model.choices.find((x) => x.id === choiceId)
  if (!c) return doc
  const ps = normalized(c.branches.map((b) => b.prob))
  c.branches.forEach((b, i) => (b.prob = ps[i]))
  return d
}

export function setChoiceAction(doc: MdpDocument, choiceId: Id, action: Id): MdpDocument {
  const d = clone(doc)
  const c = d.model.choices.find((x) => x.id === choiceId)
  if (!c) return doc
  c.action = action
  return d
}

// ---------------------------------------------------------------- deletion

export interface Deletion {
  states?: Id[]
  choices?: Id[]
  branches?: { choice: Id; target: Id }[]
}

/**
 * Delete states, choices and branches. Removing branches renormalizes the remaining
 * ones of that choice (ratios kept); a choice left with no branches is removed.
 */
export function deleteElements(doc: MdpDocument, del: Deletion): MdpDocument {
  const d = clone(doc)
  const m = d.model
  const deadStates = new Set(del.states ?? [])
  const deadChoices = new Set(del.choices ?? [])
  const deadBranches = new Set((del.branches ?? []).map((b) => edgeKey(b.choice, b.target)))

  m.states = m.states.filter((s) => !deadStates.has(s.id))
  m.choices = m.choices.filter((c) => {
    if (deadChoices.has(c.id) || deadStates.has(c.state)) return (deadChoices.add(c.id), false)
    const kept = c.branches.filter((b) => !deadStates.has(b.target) && !deadBranches.has(edgeKey(c.id, b.target)))
    if (kept.length === 0) return (deadChoices.add(c.id), false)
    if (kept.length < c.branches.length) {
      const ps = normalized(kept.map((b) => b.prob))
      c.branches = kept.map((b, i) => ({ ...b, prob: ps[i] }))
    }
    return true
  })

  const init = Object.entries(initialDistribution(m)).filter(([s]) => !deadStates.has(s))
  if (init.length === 1) m.initial = init[0][0]
  else {
    const ps = normalized(init.map(([, p]) => p))
    m.initial = Object.fromEntries(init.map(([s], i) => [s, ps[i]]))
  }

  for (const r of m.rewards ?? []) {
    for (const s of deadStates) delete r.state?.[s]
    for (const c of deadChoices) delete r.choice?.[c]
    if (r.branch)
      r.branch = r.branch.filter(
        (b) => !deadChoices.has(b.choice) && !deadStates.has(b.target) && !deadBranches.has(edgeKey(b.choice, b.target)),
      )
  }

  const l = d.layout
  if (l) {
    for (const s of deadStates) delete l.states?.[s]
    for (const c of deadChoices) delete l.choices?.[c]
    if (l.edges) {
      const live = new Set(m.choices.flatMap((c) => c.branches.map((b) => edgeKey(c.id, b.target))))
      for (const k of Object.keys(l.edges)) if (!live.has(k)) delete l.edges[k]
    }
  }
  return d
}

// ---------------------------------------------------------------- actions, labels, metadata

export function addAction(doc: MdpDocument): { doc: MdpDocument; id: Id } {
  const d = clone(doc)
  const actions = (d.model.actions ??= [])
  const id = nextActionId(new Set(actions.map((a) => a.id)))
  actions.push({ id })
  return { doc: d, id }
}

export function updateAction(doc: MdpDocument, id: Id, patch: Partial<Omit<Action, 'id'>>): MdpDocument {
  const d = clone(doc)
  const a = d.model.actions?.find((x) => x.id === id)
  if (!a) return doc
  Object.assign(a, patch)
  if (a.name === '') delete a.name
  return d
}

export function addLabel(doc: MdpDocument, label: Label, color?: string): MdpDocument {
  if (doc.model.labels?.some((l) => l.id === label.id)) return doc
  const d = clone(doc)
  ;(d.model.labels ??= []).push(label)
  if (color) {
    d.layout ??= {}
    d.layout.labels = { ...d.layout.labels, [label.id]: { color } }
  }
  return d
}

export function setLabelColor(doc: MdpDocument, id: Id, color: string): MdpDocument {
  const d = clone(doc)
  d.layout ??= {}
  d.layout.labels = { ...d.layout.labels, [id]: { ...d.layout.labels?.[id], color } }
  return d
}

export function deleteLabel(doc: MdpDocument, id: Id): MdpDocument {
  const d = clone(doc)
  d.model.labels = d.model.labels?.filter((l) => l.id !== id)
  for (const s of d.model.states) {
    s.labels = s.labels?.filter((l) => l !== id)
    if (s.labels?.length === 0) delete s.labels
  }
  delete d.layout?.labels?.[id]
  return d
}

export function setMetadata(doc: MdpDocument, patch: Partial<Metadata>): MdpDocument {
  return { ...doc, metadata: { ...doc.metadata, ...patch } }
}

export function setGrid(doc: MdpDocument, snap: boolean): MdpDocument {
  return { ...doc, layout: { ...doc.layout, grid: { size: 20, ...doc.layout?.grid, snap } } }
}

/** Sum of a choice's probabilities, or null if some probability is unparseable. */
export function choiceSum(c: Choice): Rat | null {
  let total = rat(0n)
  for (const b of c.branches) {
    const r = parseNum(b.prob)
    if (!r) return null
    total = add(total, r)
  }
  return total
}
