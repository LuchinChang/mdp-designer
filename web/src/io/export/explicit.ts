// PRISM/Storm explicit export (FORMAT.md §7), in the layout of PRISM's -exportmodel:
// .tra transitions, .lab labels, and per reward structure .srew (state) and .trew (transition).
import type { MdpDocument } from '../../core/types'
import { branchRewards, decimal, indexModel, isPointMass, rewardStructures, type ExportFile, type ExportResult, type ExportWarning } from './common'

export function exportExplicit(doc: MdpDocument): ExportResult {
  const m = doc.model
  const ix = indexModel(m)
  const warnings: ExportWarning[] = []
  const mdp = m.type === 'mdp'
  const n = ix.stateIds.length
  const transitions = ix.rows.reduce((k, row) => k + row.branches.length, 0)

  // Local choice index k of each row within its state.
  const local: number[] = []
  ix.rows.forEach((row, i) => local.push(i > 0 && ix.rows[i - 1].state === row.state ? local[i - 1] + 1 : 0))
  const src = (i: number) => (mdp ? `${ix.rows[i].state} ${local[i]}` : `${ix.rows[i].state}`)
  const header = (count: number) => (mdp ? `${n} ${ix.rows.length} ${count}` : `${n} ${count}`)

  const tra = [header(transitions)]
  ix.rows.forEach((row, i) => {
    const action = mdp && row.choice?.action !== undefined ? ` ${row.choice.action}` : ''
    for (const b of row.branches) tra.push(`${src(i)} ${b.target} ${decimal(b.prob)}${action}`)
  })

  if (!isPointMass(ix)) warnings.push({ message: 'The explicit format has no initial distributions: every state in the support of model.initial is labelled "init"' })
  const deadlocks = ix.rows.filter((row) => !row.choice).map((row) => row.state)
  const labels = [
    { id: 'init', states: ix.initial.map((x) => x.state) },
    { id: 'deadlock', states: deadlocks },
    ...ix.labels,
  ]
  const perState: number[][] = ix.stateIds.map(() => [])
  labels.forEach((l, j) => l.states.forEach((s) => perState[s].push(j)))
  const lab = [labels.map((l, j) => `${j}="${l.id}"`).join(' ')]
  perState.forEach((js, s) => js.length && lab.push(`${s}: ${js.join(' ')}`))

  const files: ExportFile[] = [
    { suffix: '.tra', content: tra.join('\n') + '\n' },
    { suffix: '.lab', content: lab.join('\n') + '\n' },
  ]
  for (const r of rewardStructures(ix)) {
    const title = `# Reward structure "${r.id}"`
    if (r.state.size) {
      const lines = [...r.state].map(([s, v]) => `${s} ${decimal(v)}`)
      files.push({ suffix: `.${r.id}.srew`, content: [title, `${n} ${lines.length}`, ...lines].join('\n') + '\n' })
    }
    const lines: string[] = []
    ix.rows.forEach((row, i) =>
      branchRewards(r, row).forEach((v, j) => {
        if (v.n !== 0n) lines.push(`${src(i)} ${row.branches[j].target} ${decimal(v)}`)
      }),
    )
    if (lines.length) files.push({ suffix: `.${r.id}.trew`, content: [title, header(lines.length), ...lines].join('\n') + '\n' })
  }
  return { files, warnings }
}
