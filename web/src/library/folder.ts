// Optional mirror of the library into a folder on disk (File System Access API;
// Chromium browsers only). Each model is written as <name>.<id>.mdp.json.
import type { MdpDocument } from '../core/types'
import { parseDocument, serializeDocument } from '../io/json'

type Permission = 'granted' | 'denied' | 'prompt'
interface DirHandle {
  name: string
  queryPermission(opts: { mode: 'readwrite' }): Promise<Permission>
  requestPermission(opts: { mode: 'readwrite' }): Promise<Permission>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    getFile(): Promise<File>
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
  removeEntry(name: string): Promise<void>
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>
}
export type FolderHandle = DirHandle

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function pickFolder(): Promise<FolderHandle | null> {
  try {
    const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker
    return await picker.call(window, { id: 'mdp-designer-library', mode: 'readwrite' })
  } catch {
    return null // cancelled
  }
}

export async function hasPermission(h: FolderHandle, ask: boolean): Promise<boolean> {
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return ask && (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export function fileNameFor(doc: MdpDocument, id: string): string {
  const slug = (doc.metadata?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model'
  return `${slug}.${id.slice(0, 8)}.mdp.json`
}

export async function writeModel(h: FolderHandle, fileName: string, doc: MdpDocument) {
  const w = await (await h.getFileHandle(fileName, { create: true })).createWritable()
  await w.write(serializeDocument(doc))
  await w.close()
}

export async function removeModel(h: FolderHandle, fileName: string) {
  await h.removeEntry(fileName).catch(() => undefined)
}

/** All parseable .mdp.json files in the folder. */
export async function readModels(h: FolderHandle): Promise<{ fileName: string; doc: MdpDocument }[]> {
  const out: { fileName: string; doc: MdpDocument }[] = []
  for await (const entry of h.values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.mdp.json')) continue
    try {
      const file = await (await h.getFileHandle(entry.name)).getFile()
      out.push({ fileName: entry.name, doc: parseDocument(await file.text()) })
    } catch {
      // Not a valid model; leave it alone.
    }
  }
  return out
}
