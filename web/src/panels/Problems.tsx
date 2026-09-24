import type { Issue } from '../core/validate'
import { branchEdgeId, choiceNodeId, stateNodeId } from '../editor/ids'
import { useDocument, type Selection } from '../store/document'

function selectionFor(issue: Issue): Selection | null {
  const r = issue.ref
  if (r.kind === 'state') return { nodes: [stateNodeId(r.id)], edges: [] }
  if (r.kind === 'choice') return { nodes: [choiceNodeId(r.id)], edges: [] }
  if (r.kind === 'branch') return { nodes: [], edges: [branchEdgeId(r.choice, r.target)] }
  return null
}

export function Problems({ issues }: { issues: Issue[] }) {
  const select = useDocument((s) => s.select)
  return (
    <section className="problems">
      <h3>
        Problems <span className="muted">({issues.length})</span>
      </h3>
      {issues.length === 0 ? (
        <p className="hint">No problems — the model is valid.</p>
      ) : (
        <ul>
          {issues.map((i, k) => {
            const sel = selectionFor(i)
            return (
              <li key={k} className={`issue ${i.level}`}>
                <button disabled={!sel} onClick={() => sel && select(sel)} title={i.path}>
                  <span className="issue-code">{i.code}</span>
                  <span>{i.message}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
