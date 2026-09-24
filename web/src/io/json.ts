import type { MdpDocument } from '../core/types'

/** Parse a .mdp.json document. Structural checks only; semantic validation lives in core. */
export function parseDocument(text: string): MdpDocument {
  const doc = JSON.parse(text)
  if (doc?.format !== 'mdp-designer') throw new Error('Not an mdp-designer document (missing "format")')
  if (typeof doc.version !== 'string' || !doc.version.startsWith('1.'))
    throw new Error(`Unsupported format version: ${doc.version}`)
  return doc as MdpDocument
}

export function serializeDocument(doc: MdpDocument): string {
  return JSON.stringify(doc, null, 2) + '\n'
}
