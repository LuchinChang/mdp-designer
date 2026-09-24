import type { MdpDocument } from '../core/types'
import { parseDocument, serializeDocument } from './json'

export function slug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model'
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadDocument(doc: MdpDocument) {
  const stamped: MdpDocument = { ...doc, metadata: { ...doc.metadata, modified: new Date().toISOString() } }
  downloadBlob(new Blob([serializeDocument(stamped)], { type: 'application/json' }), `${slug(doc.metadata?.name ?? '')}.mdp.json`)
}

export async function readDocumentFile(file: File): Promise<MdpDocument> {
  return parseDocument(await file.text())
}

/** Show the browser's file picker; resolves with the chosen file, or null if cancelled. */
export function pickFile(accept = '.json,.mdp.json,application/json'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept })
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
