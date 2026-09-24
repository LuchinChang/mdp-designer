// PRISM language export (FORMAT.md §7): one module, one variable s = state index.
import type { MdpDocument } from '../../core/types'
import {
  exact,
  expectedReward,
  hasBranchRewards,
  indexModel,
  isPointMass,
  prismIdentifiers,
  renameQuoted,
  rewardStructures,
  runs,
  type ExportResult,
  type ExportWarning,
} from './common'

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export function exportPrism(doc: MdpDocument): ExportResult {
  const m = doc.model
  const ix = indexModel(m)
  const warnings: ExportWarning[] = []
  const actions = prismIdentifiers((m.actions ?? []).map((a) => a.id))
  const labels = prismIdentifiers(ix.labels.map((l) => l.id))
  const rewards = rewardStructures(ix)
  const rewardNames = prismIdentifiers(rewards.map((r) => r.id))
  const act = (id?: string) => (id === undefined ? '' : (actions.get(id) ?? prismIdentifiers([id]).get(id)!))

  const out: string[] = [`// ${oneLine(doc.metadata?.name ?? 'Untitled')}`, '// Exported by mdp-designer. State s=i is model.states[i]:']
  ix.stateIds.forEach((id, i) => out.push(`//   ${i}  ${id}`))
  out.push('', m.type, '', 'module M')

  const guard = (s: number) => `s=${s}`
  // Runs of three or more states become a range.
  const any = (states: number[]) =>
    states.length ? runs(states).flatMap(([a, b]) => (b - a >= 2 ? [`(s>=${a} & s<=${b})`] : a === b ? [guard(a)] : [guard(a), guard(b)])).join(' | ') : 'false'
  const point = isPointMass(ix)
  out.push(`  s : [0..${ix.stateIds.length - 1}]${point ? ` init ${ix.initial[0].state}` : ''};`, '')
  for (const row of ix.rows) {
    const update =
      row.branches.length === 1 && row.branches[0].prob.n === row.branches[0].prob.d
        ? `(s'=${row.branches[0].target})`
        : row.branches.map((b) => `${exact(b.prob)}:(s'=${b.target})`).join(' + ')
    out.push(`  [${act(row.choice?.action)}] ${guard(row.state)} -> ${update};${row.choice ? '' : ' // deadlock'}`)
  }
  out.push('endmodule')

  if (!point) {
    const dist = ix.initial.map((x) => `${ix.stateIds[x.state]}: ${exact(x.prob)}`).join(', ')
    out.push(
      '',
      '// PRISM has no initial distributions. model.initial is {' + dist + '};',
      '// this block makes those states initial and drops their probabilities.',
      `init ${any(ix.initial.map((x) => x.state))} endinit`,
    )
    warnings.push({ message: 'PRISM has no initial distributions: every state in the support of model.initial becomes initial' })
  }

  if (ix.labels.length) out.push('')
  for (const l of ix.labels) out.push(`label "${labels.get(l.id)}" = ${any(l.states)};`)

  for (const r of rewards) {
    if (hasBranchRewards(r))
      warnings.push({
        code: 'W104',
        message: `Reward "${r.id}": PRISM has no (s,a,s') rewards, so branch rewards are folded into their expected value`,
      })
    out.push('', `rewards "${rewardNames.get(r.id)}"`)
    for (const [s, v] of r.state) out.push(`  ${guard(s)} : ${exact(v)};`)
    for (const row of ix.rows) {
      const v = expectedReward(r, row)
      if (v.n !== 0n) out.push(`  [${act(row.choice?.action)}] ${guard(row.state)} : ${exact(v)};`)
    }
    out.push('endrewards')
  }

  const files = [{ suffix: '.prism', content: out.join('\n') + '\n' }]
  const props = m.properties ?? []
  if (props.length) {
    const names = new Map([...new Map([...rewardNames, ...labels])].filter(([id, to]) => id !== to))
    const lines = props.flatMap((p) => [`// ${p.id}${p.description ? `: ${oneLine(p.description)}` : ''}`, renameQuoted(oneLine(p.formula), names)])
    files.push({ suffix: '.props', content: lines.join('\n') + '\n' })
  }
  return { files, warnings }
}
