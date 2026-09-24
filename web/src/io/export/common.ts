// Shared plumbing for the exporters (FORMAT.md §7). Pure: no DOM, no React.
// python/src/mdpdesigner/export/_common.py mirrors this file; keep them in step,
// since both implementations must produce byte-identical output.
import { add, mul, ONE, parseNum, toFloat, ZERO, type Rat } from '../../core/rational'
import { initialDistribution, type Choice, type Id, type Model, type Num } from '../../core/types'

export interface ExportFile {
  /** Appended to the base file name, e.g. ".prism" or ".steps.srew". */
  suffix: string
  content: string
}

export interface ExportWarning {
  code?: string
  message: string
}

export interface ExportResult {
  files: ExportFile[]
  warnings: ExportWarning[]
}

export interface Row {
  state: number
  /** Absent for the self-loop added to a deadlock state (FORMAT.md §6, W101). */
  choice?: Choice
  branches: { target: number; prob: Rat }[]
}

export interface Indexed {
  model: Model
  stateIds: Id[]
  /** Choices grouped by state index, in document order within a state (FORMAT.md §4.5). */
  rows: Row[]
  /** Sorted by state index. */
  initial: { state: number; prob: Rat }[]
  /** Declared labels with the indices of their states. */
  labels: { id: Id; states: number[] }[]
}

function num(v: Num, where: string): Rat {
  const r = parseNum(v)
  if (!r) throw new Error(`${where}: "${v}" is not a number`)
  return r
}

/** Integer-indexed view of a model (FORMAT.md §4.2). Throws on dangling state references. */
export function indexModel(model: Model): Indexed {
  const stateIds = model.states.map((s) => s.id)
  const index = new Map(stateIds.map((id, i) => [id, i]))
  const at = (id: Id, where: string) => {
    const i = index.get(id)
    if (i === undefined) throw new Error(`${where}: unknown state "${id}"`)
    return i
  }
  const byState: Row[][] = stateIds.map(() => [])
  for (const c of model.choices) {
    const state = at(c.state, `Choice "${c.id}"`)
    const branches = c.branches.map((b) => ({ target: at(b.target, `Choice "${c.id}"`), prob: num(b.prob, `Choice "${c.id}"`)}))
    byState[state].push({ state, choice: c, branches })
  }
  const rows = byState.flatMap((rs, state) => (rs.length ? rs : [{ state, branches: [{ target: state, prob: ONE }] }]))
  const initial = Object.entries(initialDistribution(model))
    .map(([id, p]) => ({ state: at(id, 'Initial distribution'), prob: num(p, 'Initial distribution') }))
    .sort((a, b) => a.state - b.state)
  const labels = (model.labels ?? []).map((l) => ({
    id: l.id,
    states: model.states.flatMap((s, i) => ((s.labels ?? []).includes(l.id) ? [i] : [])),
  }))
  return { model, stateIds, rows, initial, labels }
}

export interface Rewards {
  id: Id
  /** Non-zero state rewards by state index. */
  state: Map<number, Rat>
  /** Choice reward r(s,a) by choice id. */
  choice: Map<Id, Rat>
  /** Branch reward r(s,a,s') by choice id, then target index. */
  branch: Map<Id, Map<number, Rat>>
}

export function rewardStructures(ix: Indexed): Rewards[] {
  const index = new Map(ix.stateIds.map((id, i) => [id, i]))
  return (ix.model.rewards ?? []).map((r) => {
    const where = `Reward "${r.id}"`
    const state = new Map<number, Rat>()
    for (const [id, v] of Object.entries(r.state ?? {})) {
      const i = index.get(id)
      if (i !== undefined) state.set(i, add(state.get(i) ?? ZERO, num(v, where)))
    }
    const choice = new Map<Id, Rat>()
    for (const [id, v] of Object.entries(r.choice ?? {})) choice.set(id, add(choice.get(id) ?? ZERO, num(v, where)))
    const branch = new Map<Id, Map<number, Rat>>()
    for (const b of r.branch ?? []) {
      const t = index.get(b.target)
      if (t === undefined) continue
      const m = branch.get(b.choice) ?? new Map<number, Rat>()
      m.set(t, add(m.get(t) ?? ZERO, num(b.value, where)))
      branch.set(b.choice, m)
    }
    return { id: r.id, state: new Map([...state].filter(([, v]) => v.n !== 0n).sort((a, b) => a[0] - b[0])), choice, branch }
  })
}

export const hasBranchRewards = (r: Rewards) => [...r.branch.values()].some((m) => [...m.values()].some((v) => v.n !== 0n))

/** Reward earned on each branch of a row: its choice reward plus its branch reward. */
export function branchRewards(r: Rewards, row: Row): Rat[] {
  if (!row.choice) return row.branches.map(() => ZERO)
  const c = r.choice.get(row.choice.id) ?? ZERO
  const b = r.branch.get(row.choice.id)
  return row.branches.map((br) => add(c, b?.get(br.target) ?? ZERO))
}

/** Expected reward of a row, Σ P(s,a,s')·(r(s,a) + r(s,a,s')): branch rewards folded in (FORMAT.md §4.7). */
export function expectedReward(r: Rewards, row: Row): Rat {
  return branchRewards(r, row).reduce((acc, v, i) => add(acc, mul(row.branches[i].prob, v)), ZERO)
}

/** Exact decimal string if `r` has a finite decimal expansion ("0.7", "-2"), else null. */
function finiteDecimal(r: Rat): string | null {
  let d = r.d
  let twos = 0
  let fives = 0
  while (d % 2n === 0n) [d, twos] = [d / 2n, twos + 1]
  while (d % 5n === 0n) [d, fives] = [d / 5n, fives + 1]
  if (d !== 1n) return null
  const k = Math.max(twos, fives)
  if (k === 0) return r.n.toString()
  const scaled = (r.n * 10n ** BigInt(k)) / r.d
  const digits = (scaled < 0n ? -scaled : scaled).toString().padStart(k + 1, '0')
  return `${scaled < 0n ? '-' : ''}${digits.slice(0, -k)}.${digits.slice(-k)}`
}

/** Exact text for PRISM: "3" or "7/10". */
export const exact = (r: Rat) => (r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`)

/** Decimal text for formats without rationals: exact when finite, else the shortest round-tripping double. */
export const decimal = (r: Rat) => finiteDecimal(r) ?? String(toFloat(r))

const PRISM_KEYWORDS = new Set(
  (
    'A bool clock const ctmc C double dtmc E endinit endinvariant endmodule endobservables endplayer endrewards endsystem ' +
    'false formula filter func F global G init invariant I int label max mdp min module X nondeterministic observable ' +
    'observables of Pmax Pmin P player pomdp popta probabilistic prob pta rate rewards Rmax Rmin R S smg stochastic ' +
    'system true U W'
  ).split(' '),
)

/**
 * Map ids to distinct PRISM identifiers. Ids that are already valid keep their name;
 * the rest have other characters replaced by "_" and get a numeric suffix on collision.
 */
export function prismIdentifiers(ids: Id[], reserved: Iterable<string> = []): Map<Id, string> {
  const valid = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !PRISM_KEYWORDS.has(s)
  const used = new Set(reserved)
  const out = new Map<Id, string>()
  for (const id of ids)
    if (valid(id) && !used.has(id)) {
      used.add(id)
      out.set(id, id)
    }
  for (const id of ids) {
    if (out.has(id)) continue
    let base = id.replace(/[^A-Za-z0-9_]/g, '_')
    if (!/^[A-Za-z_]/.test(base)) base = `_${base}`
    if (PRISM_KEYWORDS.has(base)) base = `${base}_`
    let name = base
    for (let k = 2; used.has(name); k++) name = `${base}_${k}`
    used.add(name)
    out.set(id, name)
  }
  return out
}

/** Rewrite the quoted names in a PRISM formula, e.g. "goal" → "goal_2". */
export function renameQuoted(formula: string, names: Map<Id, string>): string {
  return formula.replace(/"([^"]*)"/g, (m, id: string) => {
    const to = names.get(id)
    return to === undefined ? m : `"${to}"`
  })
}

/** Sorted state indices as maximal runs [first, last]. */
export function runs(states: number[]): [number, number][] {
  const out: [number, number][] = []
  for (const s of states) {
    const last = out[out.length - 1]
    if (last && s === last[1] + 1) last[1] = s
    else out.push([s, s])
  }
  return out
}

export const isPointMass = (ix: Indexed) => ix.initial.length === 1
