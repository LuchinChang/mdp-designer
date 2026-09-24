// Menu and keyboard commands.
import { blankDocument, setGrid } from './core/ops'
import { downloadDocument, pickFile, readDocumentFile } from './io/files'
import { useLibrary } from './library/store'
import { useDocument } from './store/document'

const store = () => useDocument.getState()

export async function openFile(file?: File | null) {
  const f = file ?? (await pickFile())
  if (!f) return
  try {
    // Imported files join the library and open straight away.
    const doc = await readDocumentFile(f)
    store().load(doc, useLibrary.getState().add(doc))
    store().setLibraryOpen(false)
  } catch (e) {
    alert(`Could not open ${f.name}: ${(e as Error).message}`)
  }
}

export const commands = {
  newMdp: () => store().load(blankDocument('mdp')),
  newDtmc: () => store().load(blankDocument('dtmc')),
  open: () => openFile(),
  save: () => downloadDocument(store().doc),
  toggleLibrary: () => store().setLibraryOpen(!store().libraryOpen),
  undo: () => store().undo(),
  redo: () => store().redo(),
  toggleMode: () => store().setMode(store().mode === 'edit' ? 'preview' : 'edit'),
  toggleSidebar: () => store().toggleSidebar(),
  toggleSnap: () => store().apply((d) => setGrid(d, !(d.layout?.grid?.snap ?? false))),
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl+'
export const SHIFT = isMac ? '⇧' : 'Shift+'

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** Global shortcuts. Returns true if handled. */
export function handleShortcut(e: KeyboardEvent): boolean {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (!mod) return false
  const k = e.key.toLowerCase()
  if (k === 's') commands.save()
  else if (k === 'o') void commands.open()
  else if (k === 'l') commands.toggleLibrary()
  else if (k === 'e') commands.toggleMode()
  else if (k === '\\') commands.toggleSidebar()
  else if (isTyping(e.target)) return false // let inputs keep their own undo
  else if (k === 'z' && e.shiftKey) commands.redo()
  else if (k === 'z') commands.undo()
  else if (k === 'y') commands.redo()
  else return false
  e.preventDefault()
  return true
}
