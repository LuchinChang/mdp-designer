import { useEffect, useRef, useState } from 'react'
import { commands, exportModel, MOD, SHIFT } from '../commands'
import { useDocument } from '../store/document'

type Item =
  | { label: string; run: () => void; shortcut?: string; disabled?: boolean; checked?: boolean }
  | { separator: true }
  | { heading: string }
  | { label: string; submenu: Item[] }

const REPO = 'https://github.com/LuchinChang/mdp-designer'

function Menu({ name, items, open, anyOpen, onOpen, onClose }: {
  name: string
  items: Item[]
  open: boolean
  /** Another menu is open: hovering switches menus, as in desktop menu bars. */
  anyOpen: boolean
  onOpen: () => void
  onClose: () => void
}) {
  return (
    <div className="menu">
      <button
        className={`menu-trigger${open ? ' open' : ''}`}
        onClick={open ? onClose : onOpen}
        onMouseEnter={() => anyOpen && !open && onOpen()}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {name}
      </button>
      {open && <Dropdown items={items} onClose={onClose} />}
    </div>
  )
}

function Dropdown({ items, onClose, sub }: { items: Item[]; onClose: () => void; sub?: boolean }) {
  return (
    <div className={`menu-dropdown${sub ? ' submenu' : ''}`} role="menu">
      {items.map((it, i) =>
        'separator' in it ? (
          <div key={i} className="menu-separator" role="separator" />
        ) : 'heading' in it ? (
          <div key={i} className="menu-heading">
            {it.heading}
          </div>
        ) : 'submenu' in it ? (
          // Opens on hover or keyboard focus, as in desktop menus.
          <div key={i} className="menu-submenu">
            <button role="menuitem" className="menu-item" aria-haspopup="menu">
              <span className="menu-check" />
              <span className="menu-label">{it.label}</span>
              <span className="menu-shortcut">▸</span>
            </button>
            <Dropdown items={it.submenu} onClose={onClose} sub />
          </div>
        ) : (
          <button
            key={i}
            role="menuitem"
            className="menu-item"
            disabled={it.disabled}
            onClick={() => {
              onClose()
              it.run()
            }}
          >
            <span className="menu-check">{it.checked ? '✓' : ''}</span>
            <span className="menu-label">{it.label}</span>
            {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}

export function MenuBar({ errors, warnings }: { errors: number; warnings: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)
  const doc = useDocument((s) => s.doc)
  const mode = useDocument((s) => s.mode)
  const canUndo = useDocument((s) => s.past.length > 0)
  const canRedo = useDocument((s) => s.future.length > 0)
  const sidebarOpen = useDocument((s) => s.sidebarOpen)
  const libraryOpen = useDocument((s) => s.libraryOpen)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  const menus: [string, Item[]][] = [
    [
      'File',
      [
        { label: 'New MDP', run: commands.newMdp },
        { label: 'New DTMC', run: commands.newDtmc },
        { label: 'Library…', run: commands.toggleLibrary, shortcut: `${MOD}L` },
        { separator: true },
        { label: 'Import .mdp.json…', run: commands.open, shortcut: `${MOD}O` },
        { label: 'Download .mdp.json', run: commands.save, shortcut: `${MOD}S` },
        {
          label: 'Export',
          submenu: [
            { label: 'PRISM (.prism + .props)', run: () => exportModel('prism') },
            { label: 'JANI (.jani)', run: () => exportModel('jani') },
            { label: 'JANI for QUASAR (no rewards)', run: () => exportModel('jani-quasar') },
            { label: 'Explicit (.tra .lab .srew .trew, zip)', run: () => exportModel('explicit') },
          ],
        },
      ],
    ],
    [
      'Edit',
      [
        { label: 'Undo', run: commands.undo, shortcut: `${MOD}Z`, disabled: !canUndo },
        { label: 'Redo', run: commands.redo, shortcut: `${SHIFT}${MOD}Z`, disabled: !canRedo },
      ],
    ],
    [
      'View',
      [
        { label: 'Edit mode', run: () => useDocument.getState().setMode('edit'), checked: mode === 'edit', shortcut: `${MOD}E` },
        { label: 'Preview mode', run: () => useDocument.getState().setMode('preview'), checked: mode === 'preview' },
        { separator: true },
        { label: 'Side panel', run: commands.toggleSidebar, checked: sidebarOpen, shortcut: `${MOD}\\` },
        { label: 'Snap to grid', run: commands.toggleSnap, checked: doc.layout?.grid?.snap ?? false },
      ],
    ],
    [
      'Help',
      [
        { label: 'File format spec', run: () => window.open(`${REPO}/blob/main/spec/FORMAT.md`, '_blank') },
        { label: 'Report an issue', run: () => window.open(`${REPO}/issues`, '_blank') },
        { label: 'Source on GitHub', run: () => window.open(REPO, '_blank') },
      ],
    ],
  ]

  return (
    <header className="menubar" ref={ref}>
      <strong className="brand">mdp-designer</strong>
      <button
        className={`menu-trigger library-trigger${libraryOpen ? ' open' : ''}`}
        onClick={commands.toggleLibrary}
        title={`Library (${MOD}L)`}
        aria-pressed={libraryOpen}
      >
        Library <span className="menu-shortcut">{MOD}L</span>
      </button>
      <nav className="menus">
        {menus.map(([name, items]) => (
          <Menu key={name} name={name} items={items} open={open === name} anyOpen={open !== null} onOpen={() => setOpen(name)} onClose={() => setOpen(null)} />
        ))}
      </nav>
      <span className="doc-name">{doc.metadata?.name ?? 'Untitled'}</span>
      <span className="doc-type">{doc.model.type.toUpperCase()}</span>
      <span className="spacer" />
      <span className={`status ${errors ? 'has-errors' : warnings ? 'has-warnings' : 'ok'}`}>
        {errors ? `${errors} error${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : 'valid'}
      </span>
      <div className="mode-switch" role="group" aria-label="Mode">
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => useDocument.getState().setMode('edit')}>
          Edit
        </button>
        <button className={mode === 'preview' ? 'active' : ''} onClick={() => useDocument.getState().setMode('preview')}>
          Preview
        </button>
      </div>
    </header>
  )
}
