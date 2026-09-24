import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { MOD } from '../commands'
import { blankDocument, setMetadata } from '../core/ops'
import type { MdpDocument } from '../core/types'
import { examples } from '../examples'
import { downloadDocument, pickFile, readDocumentFile } from '../io/files'
import { useDocument } from '../store/document'
import { folderSupported } from './folder'
import { useLibrary } from './store'
import { Thumbnail } from './Thumbnail'

type Card =
  | { kind: 'mine'; key: string; id: string; doc: MdpDocument; updatedAt: number }
  | { kind: 'example'; key: string; file: string; doc: MdpDocument }

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(t).toLocaleDateString()
}

const tagsOf = (doc: MdpDocument) => doc.metadata?.tags ?? []
const parseTags = (text: string) => [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]

function matches(doc: MdpDocument, query: string, type: string, tag: string | null) {
  if (type !== 'all' && doc.model.type !== type) return false
  if (tag && !tagsOf(doc).includes(tag)) return false
  if (!query) return true
  const q = query.toLowerCase()
  return [doc.metadata?.name, doc.metadata?.description, ...tagsOf(doc)].some((x) => x?.toLowerCase().includes(q))
}

/** Change a library model's metadata; if it is the open model, change it in the editor so undo covers it. */
function editMetadata(id: string, patch: Parameters<typeof setMetadata>[1]) {
  const docStore = useDocument.getState()
  if (docStore.currentId === id) docStore.apply((d) => setMetadata(d, patch))
  else useLibrary.getState().update(id, (d) => setMetadata(d, patch))
}

function CardMenu({ card, onClose, onRename, onTags }: {
  card: Card
  onClose: () => void
  onRename: () => void
  onTags: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])
  useEffect(() => ref.current?.querySelector('button')?.focus(), [])

  const lib = useLibrary.getState()
  const docStore = useDocument.getState()
  const item = (label: string, run: () => void, danger = false) => (
    <button
      role="menuitem"
      className={`menu-item${danger ? ' danger-item' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
        run()
      }}
    >
      <span className="menu-label">{label}</span>
    </button>
  )
  return (
    <div className="menu-dropdown card-menu" role="menu" ref={ref} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      {item('Open', () => openCard(card))}
      {card.kind === 'mine' && item('Rename', onRename)}
      {card.kind === 'mine' && item('Edit tags', onTags)}
      {item(card.kind === 'mine' ? 'Duplicate' : 'Duplicate to My models', () =>
        card.kind === 'mine' ? lib.duplicate(card.id) : lib.add(structuredClone(card.doc)),
      )}
      {item('Download .mdp.json', () => downloadDocument(card.doc))}
      {card.kind === 'mine' && <div className="menu-separator" role="separator" />}
      {card.kind === 'mine' &&
        item(
          'Delete',
          () => {
            lib.remove(card.id)
            if (docStore.currentId === card.id) docStore.detach()
          },
          true,
        )}
    </div>
  )
}

function openCard(card: Card) {
  const docStore = useDocument.getState()
  if (card.kind === 'mine') {
    // The open model may be newer than the library copy while an autosave is pending.
    if (docStore.currentId !== card.id) docStore.load(card.doc, card.id)
  } else docStore.load(card.doc, null)
  docStore.setLibraryOpen(false)
}

function CardView({ card, index, isOpen }: { card: Card; index: number; isOpen: boolean }) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState<'name' | 'tags' | null>(null)
  const [draft, setDraft] = useState('')
  const name = card.doc.metadata?.name ?? 'Untitled'
  const tags = tagsOf(card.doc)

  const startEdit = (what: 'name' | 'tags') => {
    setDraft(what === 'name' ? name : tags.join(', '))
    setEditing(what)
  }
  const commit = () => {
    if (card.kind === 'mine' && editing === 'name' && draft.trim() && draft.trim() !== name) editMetadata(card.id, { name: draft.trim() })
    if (card.kind === 'mine' && editing === 'tags') editMetadata(card.id, { tags: parseTags(draft) })
    setEditing(null)
  }

  return (
    <div
      className={`card${isOpen ? ' current' : ''}`}
      role="listitem"
      tabIndex={0}
      data-card={index}
      onClick={() => !editing && openCard(card)}
      onKeyDown={(e) => {
        if (editing || e.target !== e.currentTarget) return
        if (e.key === 'Enter') openCard(card)
        if (card.kind === 'mine' && e.key === 'F2') startEdit('name')
      }}
      aria-label={`Open ${name}`}
    >
      <div className="card-thumb">
        <Thumbnail doc={card.doc} />
        {isOpen && <span className="card-badge">open</span>}
        <button
          className="card-more"
          aria-label={`Actions for ${name}`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={(e) => {
            e.stopPropagation()
            setMenu((m) => !m)
          }}
        >
          ⋯
        </button>
        {menu && <CardMenu card={card} onClose={() => setMenu(false)} onRename={() => startEdit('name')} onTags={() => startEdit('tags')} />}
      </div>
      <div className="card-body" onClick={(e) => editing && e.stopPropagation()}>
        {editing === 'name' ? (
          <input
            className="field"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <div className="card-name" title={name}>
            {name}
          </div>
        )}
        <div className="card-meta">
          {card.doc.model.type.toUpperCase()} · {card.doc.model.states.length} states
          {card.kind === 'mine' && ` · ${ago(card.updatedAt)}`}
        </div>
        {editing === 'tags' ? (
          <input
            className="field"
            autoFocus
            placeholder="comma, separated, tags"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <div className="card-tags">
            {tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Move focus to the card nearest in the pressed arrow's direction. */
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
  const from = (e.target as HTMLElement).closest<HTMLElement>('[data-card], .card-new')
  if (!dir || !from || (e.target as HTMLElement).tagName === 'INPUT') return
  e.preventDefault()
  const a = from.getBoundingClientRect()
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of e.currentTarget.querySelectorAll<HTMLElement>('[data-card], .card-new')) {
    if (el === from) continue
    const b = el.getBoundingClientRect()
    const dx = b.left + b.width / 2 - (a.left + a.width / 2)
    const dy = b.top + b.height / 2 - (a.top + a.height / 2)
    const along = dx * dir[0] + dy * dir[1]
    if (along <= 1) continue
    const score = along + 2 * Math.abs(dx * dir[1] + dy * dir[0])
    if (score < bestScore) {
      best = el
      bestScore = score
    }
  }
  best?.focus()
}

export function Library() {
  const entries = useLibrary((s) => s.entries)
  const folder = useLibrary((s) => s.folder)
  const folderStatus = useLibrary((s) => s.folderStatus)
  const lastDeleted = useLibrary((s) => s.lastDeleted)
  const currentId = useDocument((s) => s.currentId)
  const liveDoc = useDocument((s) => s.doc)
  const setLibraryOpen = useDocument((s) => s.setLibraryOpen)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [tag, setTag] = useState<string | null>(null)
  // Undo toast for a few seconds after a delete; the chance to undo ends when the library closes.
  const toast = lastDeleted ? (lastDeleted.doc.metadata?.name ?? 'Untitled') : null
  useEffect(() => {
    if (!lastDeleted) return
    const t = setTimeout(() => useLibrary.setState({ lastDeleted: null }), 6000)
    return () => clearTimeout(t)
  }, [lastDeleted])
  useEffect(() => () => useLibrary.setState({ lastDeleted: null }), [])

  // Esc closes the library wherever focus is. Inline editors and card menus stop the event first.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setLibraryOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setLibraryOpen])

  // The open model's card shows the live document, which can be ahead of its pending autosave.
  const mine: Card[] = entries
    .map((e) => (e.id === currentId ? { ...e, doc: liveDoc } : e))
    .filter((e) => matches(e.doc, query, type, tag))
    .map((e) => ({ kind: 'mine', key: e.id, id: e.id, doc: e.doc, updatedAt: e.updatedAt }))
  const builtIn: Card[] = examples
    .filter((e) => matches(e.doc, query, type, tag))
    .map((e) => ({ kind: 'example', key: e.file, file: e.file, doc: e.doc }))
  const allTags = useMemo(
    () => [...new Set([...entries.map((e) => e.doc), ...examples.map((e) => e.doc)].flatMap(tagsOf))].sort(),
    [entries],
  )

  const importFiles = async (files: FileList | File[]) => {
    for (const f of files) {
      try {
        useLibrary.getState().add(await readDocumentFile(f))
      } catch (err) {
        alert(`Could not import ${f.name}: ${(err as Error).message}`)
      }
    }
  }
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    void importFiles(e.dataTransfer.files)
  }
  const newModel = (t: 'mdp' | 'dtmc') => {
    useDocument.getState().load(blankDocument(t), null)
    setLibraryOpen(false)
  }

  return (
    <div
      className="library"
      role="dialog"
      aria-label="Library"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <header className="library-header">
        <h2>Library</h2>
        <input
          className="field library-search"
          autoFocus
          placeholder="Search models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'ArrowDown' && (e.preventDefault(), document.querySelector<HTMLElement>('.library [data-card]')?.focus())}
        />
        <div className="chip-group" role="group" aria-label="Type">
          {['all', 'mdp', 'dtmc'].map((t) => (
            <button key={t} className={`chip${type === t ? ' on' : ''}`} onClick={() => setType(t)}>
              {t === 'all' ? 'All' : t.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="toolbar-button" onClick={async () => { const f = await pickFile(); if (f) void importFiles([f]) }}>
          Import…
        </button>
        {folderSupported() &&
          (folderStatus === 'linked' ? (
            <span className="folder-status" title="Every model is mirrored to this folder as a .mdp.json file">
              ⛁ {folder?.name}{' '}
              <button className="link" onClick={() => void useLibrary.getState().unlinkFolder()}>
                unlink
              </button>
            </span>
          ) : folderStatus === 'needs-permission' ? (
            <button className="toolbar-button warn" onClick={() => void useLibrary.getState().reconnectFolder()}>
              Reconnect folder “{folder?.name}”
            </button>
          ) : (
            <button className="toolbar-button" onClick={() => void useLibrary.getState().linkFolder()} title="Mirror every model to a folder on disk">
              Link folder…
            </button>
          ))}
        <button className="icon close" onClick={() => setLibraryOpen(false)} aria-label="Close library" title="Close (Esc)">
          ✕
        </button>
      </header>
      {allTags.length > 0 && (
        <div className="library-tags" role="group" aria-label="Tags">
          {allTags.map((t) => (
            <button key={t} className={`chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="library-body" onKeyDown={moveFocus}>
        <h3>
          My models <span className="muted">({mine.length})</span>
        </h3>
        <div className="card-grid" role="list">
          <div className="card card-new" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && newModel('mdp')}>
            <div className="card-new-plus">+</div>
            <button className="link" onClick={() => newModel('mdp')}>
              New MDP
            </button>
            <button className="link" onClick={() => newModel('dtmc')}>
              New DTMC
            </button>
          </div>
          {mine.map((c, i) => (
            <CardView key={c.key} card={c} index={i} isOpen={c.kind === 'mine' && c.id === currentId} />
          ))}
        </div>

        <h3>
          Examples <span className="muted">({builtIn.length})</span>
        </h3>
        <div className="card-grid" role="list">
          {builtIn.map((c, i) => (
            <CardView key={c.key} card={c} index={mine.length + i} isOpen={false} />
          ))}
        </div>
      </div>

      <footer className="library-footer">
        ↑↓←→ move · Enter open · F2 rename · Esc close · drop .mdp.json files to import · {MOD}L toggle
      </footer>

      {toast && (
        <div className="toast" role="status">
          Deleted “{toast}”
          <button
            className="link"
            onClick={() => {
              useLibrary.getState().undoRemove()
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
