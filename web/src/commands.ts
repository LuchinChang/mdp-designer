// Menu and keyboard commands.
import { blankDocument, setGrid } from './core/ops'
import { validate } from './core/validate'
import type { MdpDocument } from './core/types'
import type { ExportResult } from './io/export/common'
import { exportExplicit } from './io/export/explicit'
import { exportJani } from './io/export/jani'
import { exportPrism } from './io/export/prism'
import { downloadBlob, downloadDocument, pickFile, readDocumentFile, slug } from './io/files'
import { zip } from './io/zip'
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

export type ExportFormat = 'prism' | 'jani' | 'jani-quasar' | 'explicit'

const exporters: Record<ExportFormat, (doc: MdpDocument) => ExportResult> = {
  prism: exportPrism,
  jani: (doc) => exportJani(doc),
  'jani-quasar': (doc) => exportJani(doc, { rewards: false }),
  explicit: exportExplicit,
}

/** Export the open model (SPEC F3). Errors need a confirmation; warnings are reported afterwards (SPEC V3). */
export function exportModel(format: ExportFormat) {
  const doc = store().doc
  const errors = validate(doc).filter((i) => i.level === 'error')
  if (errors.length) {
    const list = errors.slice(0, 5).map((e) => `• ${e.code} ${e.message}`)
    if (errors.length > 5) list.push(`• … and ${errors.length - 5} more`)
    if (!confirm(`This model has ${errors.length} validation error${errors.length > 1 ? 's' : ''}:\n${list.join('\n')}\n\nExport anyway?`)) return
  }
  let result: ExportResult
  try {
    result = exporters[format](doc)
  } catch (e) {
    alert(`Export failed: ${(e as Error).message}`)
    return
  }
  const base = slug(doc.metadata?.name ?? '')
  const files = result.files.map((f) => ({ name: base + f.suffix, content: f.content }))
  // The explicit format is up to 2 + 2·|rewards| files: bundle them rather than trigger a burst of downloads.
  if (format === 'explicit') downloadBlob(zip(files), `${base}.${format}.zip`)
  else for (const f of files) downloadBlob(new Blob([f.content], { type: 'text/plain' }), f.name)
  if (result.warnings.length)
    alert(`Exported with ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}:\n${result.warnings.map((w) => `• ${w.code ? `${w.code} ` : ''}${w.message}`).join('\n')}`)
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
