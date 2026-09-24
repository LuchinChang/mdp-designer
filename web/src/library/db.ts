// Minimal IndexedDB wrapper. Everything the user makes is kept here, on disk,
// under the browser's storage for this site.
import type { MdpDocument } from '../core/types'

export interface LibraryEntry {
  id: string
  doc: MdpDocument
  createdAt: number
  updatedAt: number
  /** File name in the linked folder, when one is linked. */
  fileName?: string
}

const DB_NAME = 'mdp-designer'
const VERSION = 1
const MODELS = 'models'
const KV = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(MODELS)) d.createObjectStore(MODELS, { keyPath: 'id' })
      if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = op(d.transaction(store, mode).objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const allEntries = () => run<LibraryEntry[]>(MODELS, 'readonly', (s) => s.getAll())
export const putEntry = (e: LibraryEntry) => run(MODELS, 'readwrite', (s) => s.put(e))
export const deleteEntry = (id: string) => run(MODELS, 'readwrite', (s) => s.delete(id))
export const getKv = <T>(key: string) => run<T | undefined>(KV, 'readonly', (s) => s.get(key))
export const setKv = (key: string, value: unknown) => run(KV, 'readwrite', (s) => s.put(value, key))
export const deleteKv = (key: string) => run(KV, 'readwrite', (s) => s.delete(key))

/** Ask the browser not to evict our storage under pressure. Best-effort. */
export function requestPersistence() {
  void navigator.storage?.persist?.().catch(() => false)
}
