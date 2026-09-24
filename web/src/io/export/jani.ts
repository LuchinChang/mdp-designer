// JANI export (FORMAT.md §7): the PRISM encoding as one automaton with one location.
// Labels and rewards are transient variables, as in Storm's and the QVBS models.
// QUASAR (env/convert_jani_to_mdp.py) reads this: it needs a global "s" with an
// initial value, one sync per action, and reachability as {"op": "U", "left": true}.
import type { Rat } from '../../core/rational'
import type { MdpDocument } from '../../core/types'
import { branchRewards, indexModel, isPointMass, rewardStructures, runs, type ExportResult, type ExportWarning, type Rewards } from './common'

type Expr = number | boolean | string | { [key: string]: Expr | Expr[] }

/** Integers as JSON numbers, other rationals as an exact division. */
const value = (r: Rat): Expr => (r.d === 1n ? Number(r.n) : { op: '/', left: Number(r.n), right: Number(r.d) })

const isState = (i: number): Expr => ({ op: '=', left: 's', right: i })

/** Balanced disjunction, so nesting depth grows with log n. */
function balanced(xs: Expr[]): Expr {
  if (xs.length === 0) return false
  if (xs.length === 1) return xs[0]
  const mid = Math.ceil(xs.length / 2)
  return { op: '∨', left: balanced(xs.slice(0, mid)), right: balanced(xs.slice(mid)) }
}

/** "s is one of `states`" (sorted); runs of three or more states become a range. */
const inStates = (states: number[]): Expr =>
  balanced(
    runs(states).flatMap(([a, b]): Expr[] =>
      b - a >= 2
        ? [{ op: '∧', left: { op: '≤', left: a, right: 's' }, right: { op: '≤', left: 's', right: b } }]
        : a === b
          ? [isState(a)]
          : [isState(a), isState(b)],
    ),
  )

/** s ↦ r(s) as if-then-else over the groups of states sharing a value; 0 elsewhere. */
function select(groups: { value: Rat; states: number[] }[]): Expr {
  if (groups.length === 0) return 0
  if (groups.length === 1) return { op: 'ite', if: inStates(groups[0].states), then: value(groups[0].value), else: 0 }
  const mid = Math.ceil(groups.length / 2)
  const left = groups.slice(0, mid).flatMap((g) => g.states).sort((a, b) => a - b)
  return { op: 'ite', if: inStates(left), then: select(groups.slice(0, mid)), else: select(groups.slice(mid)) }
}

function groupByValue(state: Map<number, Rat>) {
  const groups = new Map<string, { value: Rat; states: number[] }>()
  for (const [s, v] of state) {
    const key = `${v.n}/${v.d}`
    const g = groups.get(key) ?? { value: v, states: [] }
    g.states.push(s)
    groups.set(key, g)
  }
  return [...groups.values()]
}

// ---------------------------------------------------------------- properties

type Token = { kind: 'str' | 'word' | 'sym'; text: string }

function tokenize(s: string): Token[] | null {
  const out: Token[] = []
  const re = /\s*(?:"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*)|(=\?|[[\]{}()!&|]))\s*/y
  s = s.trim()
  while (re.lastIndex < s.length) {
    const m = re.exec(s)
    if (!m) return null
    if (m[1] !== undefined) out.push({ kind: 'str', text: m[1] })
    else if (m[2] !== undefined) out.push({ kind: 'word', text: m[2] })
    else out.push({ kind: 'sym', text: m[3] })
  }
  return out
}

interface Names {
  labels: Map<string, string>
  rewards: Map<string, { name: string; accumulate: string[] }>
  firstReward?: string
  dtmc: boolean
}

/**
 * Translate `P(max|min)=? [ F φ ]`, `P(max|min)=? [ φ U ψ ]` and `R{"r"}(max|min)=? [ F φ ]`,
 * where φ, ψ combine quoted labels with ! & | ( ) true false. Returns null for anything else.
 */
function translate(formula: string, names: Names): Expr | null {
  const ts = tokenize(formula)
  if (!ts) return null
  let i = 0
  const peek = (text: string) => ts[i]?.text === text && ts[i].kind !== 'str'
  const eat = (text: string) => (peek(text) ? (i++, true) : false)

  const atom = (): Expr | null => {
    const t = ts[i++]
    if (!t) return null
    if (t.kind === 'str') return names.labels.get(t.text) ?? null
    if (t.text === 'true') return true
    if (t.text === 'false') return false
    if (t.text === '!') {
      const e = atom()
      return e === null ? null : { op: '¬', exp: e }
    }
    if (t.text === '(') {
      const e = or()
      return e !== null && eat(')') ? e : null
    }
    return null
  }
  const chain = (sub: () => Expr | null, sym: string, op: string) => (): Expr | null => {
    let e = sub()
    while (e !== null && eat(sym)) {
      const r = sub()
      e = r === null ? null : { op, left: e, right: r }
    }
    return e
  }
  const and = chain(atom, '&', '∧')
  const or = chain(and, '|', '∨')

  // Operator: P, Pmax, Pmin, R, Rmax, Rmin, optionally followed by {"r"} and/or min|max.
  const head = ts[i++]
  if (head?.kind !== 'word') return null
  const kind = head.text[0]
  if ((kind !== 'P' && kind !== 'R') || !/^[PR](max|min)?$/.test(head.text)) return null
  let dir = head.text.slice(1)
  let reward = names.firstReward
  if (kind === 'R' && eat('{')) {
    const t = ts[i++]
    if (t?.kind !== 'str' || !eat('}')) return null
    reward = t.text
  }
  if (!dir && (peek('max') || peek('min'))) dir = ts[i++].text
  if (!dir) {
    if (!names.dtmc) return null
    dir = 'min' // a DTMC has one value; Storm writes P=? as Pmin too
  }
  if (!eat('=?') || !eat('[')) return null

  let path: Expr | null
  let reach: Expr | null = null
  if (eat('F')) {
    reach = or()
    path = reach === null ? null : { op: 'U', left: true, right: reach }
  } else {
    const left = or()
    const right = left !== null && eat('U') ? or() : null
    path = right === null ? null : { op: 'U', left: left!, right }
  }
  if (path === null || !eat(']') || i !== ts.length) return null

  let values: Expr
  if (kind === 'P') values = { op: `P${dir}`, exp: path }
  else {
    const r = reward === undefined ? undefined : names.rewards.get(reward)
    if (!r || reach === null) return null
    values = { op: `E${dir}`, exp: r.name, accumulate: r.accumulate, reach }
  }
  return { op: 'filter', fun: 'values', values, states: { op: 'initial' } }
}

// ---------------------------------------------------------------- model

export interface JaniOptions {
  /**
   * Include reward structures (default true). QUASAR keeps transient variables in its
   * state, so edge rewards split states by their last reward; turn this off for QUASAR.
   */
  rewards?: boolean
}

export function exportJani(doc: MdpDocument, options: JaniOptions = {}): ExportResult {
  const m = doc.model
  const ix = indexModel(m)
  const warnings: ExportWarning[] = []
  const rewards = options.rewards === false ? [] : rewardStructures(ix)

  // Labels and rewards share the variable namespace with s.
  const used = new Set(['s'])
  const fresh = (id: string) => {
    let name = id
    for (let k = 2; used.has(name); k++) name = `${id}_${k}`
    used.add(name)
    return name
  }
  const labelVar = new Map(ix.labels.map((l) => [l.id, fresh(l.id)]))
  const rewardVar = new Map<string, { name: string; accumulate: string[]; r: Rewards }>()
  for (const r of rewards) {
    const onEdges = ix.rows.some((row) => branchRewards(r, row).some((v) => v.n !== 0n))
    const accumulate = [...(onEdges || r.state.size === 0 ? ['steps'] : []), ...(r.state.size ? ['exit'] : [])]
    rewardVar.set(r.id, { name: fresh(r.id), accumulate, r })
  }

  const point = isPointMass(ix)
  if (!point)
    warnings.push({
      message: 'JANI has no initial distributions: every state in the support of model.initial becomes initial (QUASAR needs a single initial state)',
    })

  const variables: Expr[] = [
    {
      name: 's',
      type: { kind: 'bounded', base: 'int', 'lower-bound': 0, 'upper-bound': ix.stateIds.length - 1 },
      ...(point ? { 'initial-value': ix.initial[0].state } : {}),
    },
    ...ix.labels.map((l) => ({ name: labelVar.get(l.id)!, type: 'bool', transient: true, 'initial-value': false })),
    ...[...rewardVar.values()].map((v) => ({ name: v.name, type: 'real', transient: true, 'initial-value': 0 })),
  ]

  const transientValues: Expr[] = [
    ...ix.labels.map((l) => ({ ref: labelVar.get(l.id)!, value: inStates(l.states) })),
    ...[...rewardVar.values()].filter((v) => v.r.state.size).map((v) => ({ ref: v.name, value: select(groupByValue(v.r.state)) })),
  ]

  const edges: Expr[] = ix.rows.map((row) => {
    const rs = [...rewardVar.values()].map((v) => ({ name: v.name, values: branchRewards(v.r, row) }))
    return {
      location: 'l',
      ...(row.choice?.action !== undefined ? { action: row.choice.action } : {}),
      guard: { exp: isState(row.state) },
      destinations: row.branches.map((b, j) => ({
        location: 'l',
        probability: { exp: value(b.prob) },
        assignments: [
          { ref: 's', value: b.target },
          ...rs.filter((r) => r.values[j].n !== 0n).map((r) => ({ ref: r.name, value: value(r.values[j]) })),
        ],
      })),
      comment: row.choice ? row.choice.id : `deadlock ${ix.stateIds[row.state]}`,
    }
  })

  const names: Names = {
    labels: labelVar,
    rewards: new Map([...rewardVar].map(([id, v]) => [id, { name: v.name, accumulate: v.accumulate }])),
    firstReward: rewards[0]?.id,
    dtmc: m.type === 'dtmc',
  }
  const properties: Expr[] = []
  for (const p of m.properties ?? []) {
    const expression = translate(p.formula, names)
    if (expression === null && options.rewards === false && /^\s*R/.test(p.formula))
      warnings.push({ message: `Property "${p.id}" needs rewards, which this export leaves out; skipped` })
    else if (expression === null)
      warnings.push({ message: `Property "${p.id}" is not a reachability property JANI export can translate; skipped` })
    else properties.push({ name: p.id, expression, ...(p.description ? { comment: p.description } : {}) })
  }

  const actionIds = m.type === 'mdp' ? (m.actions ?? []).map((a) => a.id) : []
  const exitRewards = [...rewardVar.values()].some((v) => v.accumulate.includes('exit'))
  const jani: Expr = {
    'jani-version': 1,
    name: doc.metadata?.name ?? 'model',
    type: m.type,
    ...(exitRewards ? { features: ['state-exit-rewards'] } : {}),
    ...(actionIds.length ? { actions: actionIds.map((name) => ({ name })) } : {}),
    variables,
    'restrict-initial': { exp: point ? true : inStates(ix.initial.map((x) => x.state)) },
    properties,
    automata: [
      {
        name: 'M',
        locations: [{ name: 'l', ...(transientValues.length ? { 'transient-values': transientValues } : {}) }],
        'initial-locations': ['l'],
        edges,
      },
    ],
    system: {
      elements: [{ automaton: 'M' }],
      ...(actionIds.length ? { syncs: actionIds.map((a) => ({ result: a, synchronise: [a] })) } : {}),
    },
  }
  return { files: [{ suffix: '.jani', content: JSON.stringify(jani, null, 2) + '\n' }], warnings }
}
