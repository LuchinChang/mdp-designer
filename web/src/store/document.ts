import { create } from 'zustand'
import type { MdpDocument } from '../core/types'
import type { Focus } from '../editor/focus'
import { examples } from '../examples'
import { parseDocument, serializeDocument } from '../io/json'
import { newId, useLibrary } from '../library/store'

export type Mode = 'edit' | 'preview'

export interface Selection {
  nodes: string[] // flow ids
  edges: string[]
}

interface DocumentState {
  doc: MdpDocument
  /** Library id of the open model; null until an unsaved document (example, new) is first edited. */
  currentId: string | null
  /** Bumped when a different document is loaded, so the canvas refits. */
  docKey: number
  /** Bumped on every user edit (apply, undo, redo); drives autosave. */
  editSeq: number
  past: MdpDocument[]
  future: MdpDocument[]
  mode: Mode
  selection: Selection
  /** Selection requested from outside the canvas (inspector, problems list). */
  selectRequest: Selection | null
  focus: Focus | null
  sidebarOpen: boolean
  libraryOpen: boolean

  /** Apply an undoable change. */
  apply: (fn: (doc: MdpDocument) => MdpDocument) => void
  /** Load a different document; clears history. `id` is its library id, if it has one. */
  load: (doc: MdpDocument, id?: string | null) => void
  /** Forget the library id of the open document (e.g. after deleting it from the library). */
  detach: () => void
  undo: () => void
  redo: () => void
  setMode: (mode: Mode) => void
  setSelection: (sel: Selection) => void
  select: (sel: Selection) => void
  setFocus: (focus: Focus | null) => void
  toggleSidebar: () => void
  setLibraryOpen: (open: boolean) => void
}

const AUTOSAVE_KEY = 'mdp-designer:autosave'
const CURRENT_KEY = 'mdp-designer:current'
const MODE_KEY = 'mdp-designer:mode'
const SIDEBAR_KEY = 'mdp-designer:sidebar'
const HISTORY_LIMIT = 200

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function persist(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not persisted; fine.
  }
}

/** The document open in the last session, restored synchronously for a fast start. */
function restore(): { doc: MdpDocument; currentId: string | null } {
  const saved = read(AUTOSAVE_KEY)
  if (saved) {
    try {
      const doc = parseDocument(saved)
      // '' means "not in the library" (an unedited example). A missing key is an autosave
      // from before the library existed: give it an id so it is kept.
      let stored = read(CURRENT_KEY)
      if (stored === null) {
        stored = newId()
        persist(CURRENT_KEY, stored)
      }
      return { doc, currentId: stored || null }
    } catch {
      // Corrupt autosave: fall back to an example.
    }
  }
  return { doc: examples[0].doc, currentId: null }
}

const EMPTY: Selection = { nodes: [], edges: [] }
const sameSelection = (a: Selection, b: Selection) =>
  a.nodes.length === b.nodes.length &&
  a.edges.length === b.edges.length &&
  a.nodes.every((x, i) => x === b.nodes[i]) &&
  a.edges.every((x, i) => x === b.edges[i])

const initial = restore()

export const useDocument = create<DocumentState>((set, get) => ({
  doc: initial.doc,
  currentId: initial.currentId,
  docKey: 0,
  editSeq: 0,
  past: [],
  future: [],
  mode: read(MODE_KEY) === 'preview' ? 'preview' : 'edit',
  selection: EMPTY,
  selectRequest: null,
  focus: null,
  sidebarOpen: read(SIDEBAR_KEY) !== 'closed',
  libraryOpen: false,

  apply: (fn) => {
    const { doc, past, editSeq } = get()
    const next = fn(doc)
    if (next === doc) return
    set({ doc: next, past: [...past.slice(-HISTORY_LIMIT + 1), doc], future: [], editSeq: editSeq + 1 })
  },
  load: (doc, id = null) => {
    persist(AUTOSAVE_KEY, serializeDocument(doc))
    persist(CURRENT_KEY, id ?? '')
    set((s) => ({
      doc,
      currentId: id,
      docKey: s.docKey + 1,
      past: [],
      future: [],
      selection: EMPTY,
      selectRequest: null,
      focus: null,
    }))
  },
  detach: () => {
    persist(CURRENT_KEY, '')
    set({ currentId: null })
  },
  undo: () => {
    const { doc, past, future, editSeq } = get()
    if (!past.length) return
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], editSeq: editSeq + 1 })
  },
  redo: () => {
    const { doc, past, future, editSeq } = get()
    if (!future.length) return
    set({ doc: future[0], past: [...past, doc], future: future.slice(1), editSeq: editSeq + 1 })
  },
  setMode: (mode) => {
    persist(MODE_KEY, mode)
    set({ mode, focus: null })
  },
  setSelection: (sel) => {
    if (!sameSelection(sel, get().selection)) set({ selection: sel })
  },
  select: (sel) => set({ selection: sel, selectRequest: sel }),
  setFocus: (focus) => set({ focus }),
  toggleSidebar: () => {
    const open = !get().sidebarOpen
    persist(SIDEBAR_KEY, open ? 'open' : 'closed')
    set({ sidebarOpen: open })
  },
  setLibraryOpen: (open) => set({ libraryOpen: open, focus: null }),
}))

/** Save the open document: to localStorage (fast restore) and to the library (IndexedDB, optional folder). */
function saveNow() {
  const { doc, currentId } = useDocument.getState()
  let id = currentId
  if (!id) {
    id = newId()
    useDocument.setState({ currentId: id })
  }
  persist(AUTOSAVE_KEY, serializeDocument(doc))
  persist(CURRENT_KEY, id)
  void useLibrary.getState().save(id, doc)
}

// Autosave every edit, debounced.
let timer: ReturnType<typeof setTimeout> | undefined
useDocument.subscribe((s, prev) => {
  if (s.editSeq === prev.editSeq) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    saveNow()
  }, 400)
})

// Make sure the model that was open last session is in the library once it has loaded.
void useLibrary
  .getState()
  .init()
  .then(() => {
    const { doc, currentId } = useDocument.getState()
    if (currentId && !useLibrary.getState().entries.some((e) => e.id === currentId)) void useLibrary.getState().save(currentId, doc)
  })

// Flush a pending autosave when the tab is closed or hidden.
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    saveNow()
  })
