import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  addAction,
  addLabel,
  choiceSum,
  deleteElements,
  deleteLabel,
  normalizeChoice,
  setBranchProb,
  setChoiceAction,
  setInitial,
  setLabelColor,
  setMetadata,
  updateAction,
  updateState,
} from '../core/ops'
import { labelColors, nextLabelColor } from '../core/palette'
import { cmp, ONE, parseUserNum, toFloat } from '../core/rational'
import { initialDistribution, type Choice, type Id, type MdpDocument, type State } from '../core/types'
import { branchEdgeId, choiceNodeId, parseFlowId, stateNodeId } from '../editor/ids'
import { useDocument } from '../store/document'

const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

/** Text input that commits on blur or Enter, and reverts on Escape. */
function Field({ value, onCommit, placeholder, invalid, mono, ariaLabel }: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  invalid?: (v: string) => boolean
  mono?: boolean
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  const bad = draft !== null && invalid?.(draft)
  return (
    <input
      className={`field${mono ? ' mono' : ''}${bad ? ' invalid' : ''}`}
      value={shown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value && !bad) onCommit(draft)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="row">
    <span className="row-label">{label}</span>
    {children}
  </label>
)

const stateName = (doc: MdpDocument, id: Id) => doc.model.states.find((s) => s.id === id)?.name ?? id

function StateInspector({ doc, state }: { doc: MdpDocument; state: State }) {
  const { apply, select } = useDocument.getState()
  const colors = labelColors(doc)
  const init = initialDistribution(doc.model)
  const isInitial = state.id in init
  const choices = doc.model.choices.filter((c) => c.state === state.id)
  const [newLabel, setNewLabel] = useState('')
  const actionName = (c: Choice) => doc.model.actions?.find((a) => a.id === c.action)?.name ?? c.action ?? '(transition)'

  const toggleLabel = (l: Id) => {
    const has = state.labels?.includes(l)
    apply((d) => updateState(d, state.id, { labels: has ? state.labels!.filter((x) => x !== l) : [...(state.labels ?? []), l] }))
  }
  const createLabel = () => {
    const id = newLabel.trim()
    if (!ID_PATTERN.test(id) || id === 'init' || id === 'deadlock') return
    apply((d) => updateState(addLabel(d, { id }, nextLabelColor(d)), state.id, { labels: [...(state.labels ?? []), id] }))
    setNewLabel('')
  }

  return (
    <>
      <h3>State <code>{state.id}</code></h3>
      <Row label="Name">
        <Field key={state.id} value={state.name ?? ''} placeholder={state.id} onCommit={(v) => apply((d) => updateState(d, state.id, { name: v }))} />
      </Row>
      <Row label="Initial">
        <span className="inline">
          <input
            type="checkbox"
            checked={isInitial}
            onChange={() => apply((d) => setInitial(d, state.id, isInitial ? null : Object.keys(init).length ? 1 : 'only'))}
          />
          {isInitial && Object.keys(init).length > 1 && (
            <Field
              key={`${state.id}-init`}
              mono
              ariaLabel="Initial probability"
              value={String(init[state.id])}
              invalid={(v) => parseUserNum(v) === null}
              onCommit={(v) => apply((d) => setInitial(d, state.id, parseUserNum(v)!))}
            />
          )}
          {!isInitial || Object.keys(init).length === 1 ? null : (
            <button className="link" onClick={() => apply((d) => setInitial(d, state.id, 'only'))}>
              make sole initial
            </button>
          )}
        </span>
      </Row>
      <div className="section-label">Labels</div>
      <div className="chips">
        {(doc.model.labels ?? []).map((l) => {
          const on = state.labels?.includes(l.id)
          return (
            <button
              key={l.id}
              className={`chip${on ? ' on' : ''}`}
              style={{ '--chip': colors.get(l.id) } as CSSProperties}
              onClick={() => toggleLabel(l.id)}
              aria-pressed={on}
            >
              {l.id}
            </button>
          )
        })}
        <input
          className={`field chip-input${newLabel && !ID_PATTERN.test(newLabel.trim()) ? ' invalid' : ''}`}
          placeholder="+ label"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createLabel()}
          onBlur={createLabel}
        />
      </div>
      <div className="section-label">{doc.model.type === 'mdp' ? 'Actions' : 'Transitions'}</div>
      {choices.length === 0 ? (
        <p className="hint">No outgoing transitions. Drag from the handle on the state's right edge to add one.</p>
      ) : (
        <ul className="list">
          {choices.map((c) => (
            <li key={c.id}>
              <button className="link" onClick={() => select({ nodes: [choiceNodeId(c.id)], edges: [] })}>
                {actionName(c)}
              </button>{' '}
              <span className="muted">→ {c.branches.map((b) => stateName(doc, b.target)).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      <button className="danger" onClick={() => apply((d) => deleteElements(d, { states: [state.id] }))}>
        Delete state
      </button>
    </>
  )
}

function ChoiceInspector({ doc, choice }: { doc: MdpDocument; choice: Choice }) {
  const { apply, select } = useDocument.getState()
  const total = choiceSum(choice)
  const ok = total !== null && cmp(total, ONE) === 0
  const enabledElsewhere = new Set(doc.model.choices.filter((c) => c.state === choice.state && c.id !== choice.id).map((c) => c.action))

  return (
    <>
      <h3>{doc.model.type === 'mdp' ? 'Action' : 'Transition'} <code>{choice.id}</code></h3>
      <Row label="From">
        <button className="link" onClick={() => select({ nodes: [stateNodeId(choice.state)], edges: [] })}>
          {stateName(doc, choice.state)}
        </button>
      </Row>
      {doc.model.type === 'mdp' && (
        <Row label="Action">
          <select
            value={choice.action}
            onChange={(e) =>
              apply((d) => {
                if (e.target.value !== '__new__') return setChoiceAction(d, choice.id, e.target.value)
                const { doc: d2, id } = addAction(d)
                return setChoiceAction(d2, choice.id, id)
              })
            }
          >
            {(doc.model.actions ?? []).map((a) => (
              <option key={a.id} value={a.id} disabled={enabledElsewhere.has(a.id)}>
                {a.name ?? a.id}
                {a.name ? ` (${a.id})` : ''}
              </option>
            ))}
            <option value="__new__">+ new action</option>
          </select>
        </Row>
      )}
      <div className="section-label">Branches</div>
      <table className="branches">
        <tbody>
          {choice.branches.map((b) => (
            <tr key={b.target}>
              <td>
                <button className="link" onClick={() => select({ nodes: [], edges: [branchEdgeId(choice.id, b.target)] })}>
                  {stateName(doc, b.target)}
                </button>
              </td>
              <td>
                <Field
                  key={`${choice.id}-${b.target}-${b.prob}`}
                  mono
                  ariaLabel={`Probability to ${b.target}`}
                  value={String(b.prob)}
                  invalid={(v) => parseUserNum(v) === null}
                  onCommit={(v) => apply((d) => setBranchProb(d, choice.id, b.target, parseUserNum(v)!))}
                />
              </td>
              <td>
                <button
                  className="icon"
                  title="Remove branch"
                  onClick={() => apply((d) => deleteElements(d, { branches: [{ choice: choice.id, target: b.target }] }))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`sum ${ok ? 'ok' : 'bad'}`}>
        Σ = {total === null ? '?' : total.d === 1n ? String(total.n) : `${total.n}/${total.d} (≈ ${toFloat(total).toFixed(4)})`}
        {!ok && (
          <button className="link" onClick={() => apply((d) => normalizeChoice(d, choice.id))}>
            normalize
          </button>
        )}
      </div>
      <p className="hint">Probabilities accept decimals (0.3) or exact fractions (3/10). Drag from the dot's handle to add a branch.</p>
      <button className="danger" onClick={() => apply((d) => deleteElements(d, { choices: [choice.id] }))}>
        Delete {doc.model.type === 'mdp' ? 'action' : 'transition'}
      </button>
    </>
  )
}

function ModelInspector({ doc }: { doc: MdpDocument }) {
  const { apply } = useDocument.getState()
  const colors = labelColors(doc)
  const [newLabel, setNewLabel] = useState('')
  const createLabel = () => {
    const id = newLabel.trim()
    if (!ID_PATTERN.test(id) || id === 'init' || id === 'deadlock') return
    apply((d) => addLabel(d, { id }, nextLabelColor(d)))
    setNewLabel('')
  }

  return (
    <>
      <h3>Model</h3>
      <Row label="Name">
        <Field value={doc.metadata?.name ?? ''} placeholder="Untitled" onCommit={(v) => apply((d) => setMetadata(d, { name: v }))} />
      </Row>
      <Row label="Type">
        <span>{doc.model.type === 'mdp' ? 'MDP' : 'DTMC'}</span>
      </Row>
      <Row label="Tags">
        <Field
          value={(doc.metadata?.tags ?? []).join(', ')}
          placeholder="comma, separated"
          onCommit={(v) => apply((d) => setMetadata(d, { tags: [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))] }))}
        />
      </Row>
      <Row label="Size">
        <span className="muted">
          {doc.model.states.length} states · {doc.model.choices.length} {doc.model.type === 'mdp' ? 'choices' : 'transitions'} ·{' '}
          {doc.model.choices.reduce((n, c) => n + c.branches.length, 0)} branches
        </span>
      </Row>

      <div className="section-label">Labels</div>
      <ul className="list">
        {(doc.model.labels ?? []).map((l) => (
          <li key={l.id} className="label-row">
            <input
              type="color"
              value={colors.get(l.id)}
              aria-label={`Colour of ${l.id}`}
              onChange={(e) => apply((d) => setLabelColor(d, l.id, e.target.value))}
            />
            <span>{l.id}</span>
            <button className="icon" title="Delete label" onClick={() => apply((d) => deleteLabel(d, l.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        className={`field${newLabel && !ID_PATTERN.test(newLabel.trim()) ? ' invalid' : ''}`}
        placeholder="+ new label (e.g. goal)"
        value={newLabel}
        onChange={(e) => setNewLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && createLabel()}
      />

      {doc.model.type === 'mdp' && (
        <>
          <div className="section-label">Actions</div>
          <ul className="list">
            {(doc.model.actions ?? []).map((a) => (
              <li key={a.id} className="label-row">
                <code>{a.id}</code>
                <Field value={a.name ?? ''} placeholder="display name" onCommit={(v) => apply((d) => updateAction(d, a.id, { name: v }))} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">
        Double-click the canvas to add a state. Drag from a state's handle to another state — or back to itself — to add an
        action. Select and press Delete to remove.
      </p>
    </>
  )
}

export function Inspector() {
  const doc = useDocument((s) => s.doc)
  const selection = useDocument((s) => s.selection)
  const editing = useDocument((s) => s.mode === 'edit')

  const target = useMemo(() => {
    const ids = [...selection.nodes, ...selection.edges]
    if (ids.length > 1) return { kind: 'many' as const, count: ids.length }
    const r = ids.length ? parseFlowId(ids[0]) : null
    if (r?.kind === 'state') {
      const state = doc.model.states.find((s) => s.id === r.id)
      if (state) return { kind: 'state' as const, state }
    }
    if (r && r.kind !== 'state') {
      const id = r.kind === 'choice' ? r.id : r.choice
      const choice = doc.model.choices.find((c) => c.id === id)
      if (choice) return { kind: 'choice' as const, choice }
    }
    return { kind: 'model' as const }
  }, [doc, selection])

  return (
    <fieldset className="inspector" disabled={!editing}>
      {target.kind === 'state' && <StateInspector key={target.state.id} doc={doc} state={target.state} />}
      {target.kind === 'choice' && <ChoiceInspector key={target.choice.id} doc={doc} choice={target.choice} />}
      {target.kind === 'model' && <ModelInspector doc={doc} />}
      {target.kind === 'many' && (
        <>
          <h3>{target.count} items selected</h3>
          <p className="hint">Press Delete to remove them. Drag to move them together.</p>
        </>
      )}
    </fieldset>
  )
}
