// Semantic validation, FORMAT.md §6.
import { cmp, isExactInput, ONE, parseNum, sub, sum, toFloat, type Rat } from './rational'
import { initialDistribution, type Id, type MdpDocument, type Num } from './types'

export type IssueRef =
  | { kind: 'state'; id: Id }
  | { kind: 'choice'; id: Id }
  | { kind: 'branch'; choice: Id; target: Id }
  | { kind: 'model' }

export interface Issue {
  code: string
  level: 'error' | 'warning'
  message: string
  path: string
  ref: IssueRef
}

const RESERVED_LABELS = new Set(['init', 'deadlock'])
const TOLERANCE = 1e-9

/** Check that `values` sum to 1: exactly if every value is exact, else within 1e-9. */
function sumsToOne(values: Num[]): { ok: boolean; total: Rat | null } {
  const rs = values.map(parseNum)
  if (rs.some((r) => r === null)) return { ok: false, total: null }
  const total = sum(rs as Rat[])
  const ok = values.every(isExactInput) ? cmp(total, ONE) === 0 : Math.abs(toFloat(sub(total, ONE))) <= TOLERANCE
  return { ok, total }
}

const show = (r: Rat | null) => (r === null ? '?' : r.d === 1n ? String(r.n) : `${r.n}/${r.d} ≈ ${toFloat(r).toPrecision(6)}`)

export function validate(doc: MdpDocument): Issue[] {
  const issues: Issue[] = []
  const m = doc.model
  const push = (code: string, message: string, path: string, ref: IssueRef = { kind: 'model' }) =>
    issues.push({ code, level: code.startsWith('E') ? 'error' : 'warning', message, path, ref })

  // E001 duplicate ids
  const collections = {
    states: m.states,
    actions: m.actions ?? [],
    choices: m.choices,
    labels: m.labels ?? [],
    rewards: m.rewards ?? [],
    properties: m.properties ?? [],
  }
  for (const [name, items] of Object.entries(collections)) {
    const seen = new Set<Id>()
    items.forEach((x, i) => {
      if (seen.has(x.id)) push('E001', `Duplicate ${name.slice(0, -1)} id "${x.id}"`, `model.${name}[${i}]`)
      seen.add(x.id)
    })
  }

  const stateIds = new Set(m.states.map((s) => s.id))
  const actionIds = new Set((m.actions ?? []).map((a) => a.id))
  const labelIds = new Set((m.labels ?? []).map((l) => l.id))
  const choiceIds = new Set(m.choices.map((c) => c.id))

  // E008 reserved labels
  ;(m.labels ?? []).forEach((l, i) => {
    if (RESERVED_LABELS.has(l.id)) push('E008', `Label id "${l.id}" is reserved by PRISM`, `model.labels[${i}]`)
  })

  // E002 state labels
  m.states.forEach((s, i) =>
    (s.labels ?? []).forEach((l, j) => {
      if (!labelIds.has(l))
        push('E002', `State "${s.id}" uses undeclared label "${l}"`, `model.states[${i}].labels[${j}]`, { kind: 'state', id: s.id })
    }),
  )

  // Choices
  const byStateAction = new Map<string, Id>()
  const choicesPerState = new Map<Id, number>()
  m.choices.forEach((c, i) => {
    const path = `model.choices[${i}]`
    const ref: IssueRef = { kind: 'choice', id: c.id }
    if (!stateIds.has(c.state)) push('E002', `Choice "${c.id}" belongs to unknown state "${c.state}"`, `${path}.state`, ref)
    choicesPerState.set(c.state, (choicesPerState.get(c.state) ?? 0) + 1)

    if (m.type === 'mdp') {
      if (c.action === undefined) push('E006', `Choice "${c.id}" has no action`, path, ref)
      else {
        if (!actionIds.has(c.action)) push('E002', `Choice "${c.id}" uses unknown action "${c.action}"`, `${path}.action`, ref)
        const key = `${c.state}\u0000${c.action}`
        const other = byStateAction.get(key)
        if (other) push('E006', `State "${c.state}" has two choices with action "${c.action}" ("${other}", "${c.id}")`, path, ref)
        byStateAction.set(key, c.id)
      }
    } else if (c.action !== undefined) {
      push('E007', `DTMC choice "${c.id}" must not have an action`, `${path}.action`, ref)
    }

    const targets = new Set<Id>()
    c.branches.forEach((b, j) => {
      const bpath = `${path}.branches[${j}]`
      const bref: IssueRef = { kind: 'branch', choice: c.id, target: b.target }
      if (!stateIds.has(b.target)) push('E002', `Branch of "${c.id}" targets unknown state "${b.target}"`, `${bpath}.target`, bref)
      if (targets.has(b.target)) push('E004', `Choice "${c.id}" has two branches to "${b.target}"`, bpath, bref)
      targets.add(b.target)
      const p = parseNum(b.prob)
      if (!p) push('E004', `Probability "${b.prob}" is not a number`, `${bpath}.prob`, bref)
      else if (p.n <= 0n) push('E004', `Probability must be > 0 (got ${b.prob})`, `${bpath}.prob`, bref)
    })
    if (c.branches.length === 0) push('E004', `Choice "${c.id}" has no branches`, path, ref)
    else {
      const { ok, total } = sumsToOne(c.branches.map((b) => b.prob))
      if (!ok && total) push('E003', `Probabilities of "${c.id}" sum to ${show(total)}, not 1`, `${path}.branches`, ref)
    }
  })

  if (m.type === 'dtmc')
    for (const [s, n] of choicesPerState)
      if (n > 1) push('E007', `DTMC state "${s}" has ${n} choices (at most 1 allowed)`, 'model.choices', { kind: 'state', id: s })

  // E005 initial distribution
  const init = initialDistribution(m)
  const initKeys = Object.keys(init)
  if (initKeys.length === 0) push('E005', 'No initial state', 'model.initial')
  for (const s of initKeys) {
    if (!stateIds.has(s)) push('E002', `Initial distribution references unknown state "${s}"`, 'model.initial')
    const p = parseNum(init[s])
    if (!p || p.n <= 0n) push('E005', `Initial probability of "${s}" must be > 0`, 'model.initial', { kind: 'state', id: s })
  }
  if (initKeys.length > 0) {
    const { ok, total } = sumsToOne(Object.values(init))
    if (!ok && total) push('E005', `Initial distribution sums to ${show(total)}, not 1`, 'model.initial')
  }

  // Rewards references
  ;(m.rewards ?? []).forEach((r, i) => {
    for (const s of Object.keys(r.state ?? {}))
      if (!stateIds.has(s)) push('E002', `Reward "${r.id}" references unknown state "${s}"`, `model.rewards[${i}].state`)
    for (const c of Object.keys(r.choice ?? {}))
      if (!choiceIds.has(c)) push('E002', `Reward "${r.id}" references unknown choice "${c}"`, `model.rewards[${i}].choice`)
    ;(r.branch ?? []).forEach((b, j) => {
      if (!choiceIds.has(b.choice) || !stateIds.has(b.target))
        push('E002', `Reward "${r.id}" references unknown branch ${b.choice}->${b.target}`, `model.rewards[${i}].branch[${j}]`)
    })
  })

  // W101 deadlocks
  m.states.forEach((s, i) => {
    if (!choicesPerState.has(s.id))
      push('W101', `State "${s.name ?? s.id}" has no outgoing transitions (deadlock)`, `model.states[${i}]`, { kind: 'state', id: s.id })
  })

  // W102 unreachable
  const succ = new Map<Id, Id[]>()
  for (const c of m.choices) succ.set(c.state, [...(succ.get(c.state) ?? []), ...c.branches.map((b) => b.target)])
  const seen = new Set(initKeys.filter((s) => stateIds.has(s)))
  const stack = [...seen]
  while (stack.length) {
    for (const t of succ.get(stack.pop()!) ?? []) {
      if (seen.has(t)) continue
      seen.add(t)
      stack.push(t)
    }
  }
  if (initKeys.length > 0)
    m.states.forEach((s, i) => {
      if (!seen.has(s.id))
        push('W102', `State "${s.name ?? s.id}" is unreachable from the initial state`, `model.states[${i}]`, { kind: 'state', id: s.id })
    })

  // W103 unused actions and labels
  const usedActions = new Set(m.choices.map((c) => c.action))
  ;(m.actions ?? []).forEach((a, i) => {
    if (!usedActions.has(a.id)) push('W103', `Action "${a.name ?? a.id}" is not enabled in any state`, `model.actions[${i}]`)
  })
  const usedLabels = new Set(m.states.flatMap((s) => s.labels ?? []))
  ;(m.labels ?? []).forEach((l, i) => {
    if (!usedLabels.has(l.id)) push('W103', `Label "${l.id}" is not assigned to any state`, `model.labels[${i}]`)
  })

  // W105 stray layout entries
  for (const s of Object.keys(doc.layout?.states ?? {}))
    if (!stateIds.has(s)) push('W105', `Layout references unknown state "${s}"`, `layout.states.${s}`)
  for (const c of Object.keys(doc.layout?.choices ?? {}))
    if (!choiceIds.has(c)) push('W105', `Layout references unknown choice "${c}"`, `layout.choices.${c}`)

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
}
