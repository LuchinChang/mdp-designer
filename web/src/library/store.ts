import { create } from 'zustand'
import type { MdpDocument } from '../core/types'
import { allEntries, deleteEntry, deleteKv, getKv, putEntry, requestPersistence, setKv, type LibraryEntry } from './db'
import { fileNameFor, hasPermission, pickFolder, readModels, removeModel, writeModel, type FolderHandle } from './folder'

export type FolderStatus = 'none' | 'linked' | 'needs-permission'

interface LibraryState {
  entries: LibraryEntry[]
  ready: boolean
  folder: FolderHandle | null
  folderStatus: FolderStatus
  /** The most recently deleted entry, kept for undo. */
  lastDeleted: LibraryEntry | null

  init: () => Promise<void>
  /** Insert or update a model. */
  save: (id: string, doc: MdpDocument) => Promise<void>
  /** Add a new model and return its id. */
  add: (doc: MdpDocument) => string
  update: (id: string, fn: (doc: MdpDocument) => MdpDocument) => void
  duplicate: (id: string) => string | null
  remove: (id: string) => void
  undoRemove: () => void
  linkFolder: () => Promise<void>
  reconnectFolder: () => Promise<void>
  unlinkFolder: () => Promise<void>
}

const FOLDER_KEY = 'folder'
const byRecent = (a: LibraryEntry, b: LibraryEntry) => b.updatedAt - a.updatedAt
export const newId = () => crypto.randomUUID()

export const useLibrary = create<LibraryState>((set, get) => {
  /** Persist an entry to IndexedDB and, if linked, to the folder. */
  async function persist(entry: LibraryEntry, previousFileName?: string) {
    const { folder, folderStatus } = get()
    if (folder && folderStatus === 'linked') {
      const fileName = fileNameFor(entry.doc, entry.id)
      try {
        await writeModel(folder, fileName, entry.doc)
        if (previousFileName && previousFileName !== fileName) await removeModel(folder, previousFileName)
        entry = { ...entry, fileName }
        set((s) => ({ entries: s.entries.map((e) => (e.id === entry.id ? { ...e, fileName } : e)) }))
      } catch {
        set({ folderStatus: 'needs-permission' })
      }
    }
    await putEntry(entry)
  }

  function upsert(entry: LibraryEntry) {
    set((s) => ({ entries: [entry, ...s.entries.filter((e) => e.id !== entry.id)].sort(byRecent) }))
  }

  /** Two-way first sync: import folder files we don't know, write out entries the folder lacks. */
  async function syncFolder(folder: FolderHandle) {
    const known = new Set(get().entries.map((e) => e.fileName).filter(Boolean))
    const files = await readModels(folder)
    const onDisk = new Set(files.map((f) => f.fileName))
    for (const { fileName, doc } of files) {
      if (known.has(fileName)) continue
      const now = Date.now()
      const entry = { id: newId(), doc, createdAt: now, updatedAt: now, fileName }
      upsert(entry)
      await putEntry(entry)
    }
    for (const e of get().entries) if (!e.fileName || !onDisk.has(e.fileName)) await persist(e)
  }

  return {
    entries: [],
    ready: false,
    folder: null,
    folderStatus: 'none',
    lastDeleted: null,

    init: async () => {
      requestPersistence()
      try {
        set({ entries: (await allEntries()).sort(byRecent) })
        const folder = await getKv<FolderHandle>(FOLDER_KEY)
        if (folder) set({ folder, folderStatus: (await hasPermission(folder, false)) ? 'linked' : 'needs-permission' })
      } finally {
        set({ ready: true })
      }
    },

    save: async (id, doc) => {
      const prev = get().entries.find((e) => e.id === id)
      const now = Date.now()
      const entry: LibraryEntry = { id, doc, createdAt: prev?.createdAt ?? now, updatedAt: now, fileName: prev?.fileName }
      upsert(entry)
      await persist(entry, prev?.fileName)
    },

    add: (doc) => {
      const id = newId()
      void get().save(id, doc)
      return id
    },

    update: (id, fn) => {
      const e = get().entries.find((x) => x.id === id)
      if (e) void get().save(id, fn(e.doc))
    },

    duplicate: (id) => {
      const e = get().entries.find((x) => x.id === id)
      if (!e) return null
      const name = e.doc.metadata?.name ?? 'Untitled'
      return get().add({ ...structuredClone(e.doc), metadata: { ...e.doc.metadata, name: `${name} (copy)` } })
    },

    remove: (id) => {
      const e = get().entries.find((x) => x.id === id)
      if (!e) return
      set((s) => ({ entries: s.entries.filter((x) => x.id !== id), lastDeleted: e }))
      void deleteEntry(id)
      const { folder, folderStatus } = get()
      if (folder && folderStatus === 'linked' && e.fileName) void removeModel(folder, e.fileName)
    },

    undoRemove: () => {
      const e = get().lastDeleted
      if (!e) return
      set({ lastDeleted: null })
      upsert(e)
      void persist({ ...e, fileName: undefined })
    },

    linkFolder: async () => {
      const folder = await pickFolder()
      if (!folder) return
      await setKv(FOLDER_KEY, folder)
      set({ folder, folderStatus: 'linked' })
      await syncFolder(folder)
    },

    reconnectFolder: async () => {
      const { folder } = get()
      if (!folder || !(await hasPermission(folder, true))) return
      set({ folderStatus: 'linked' })
      await syncFolder(folder)
    },

    unlinkFolder: async () => {
      await deleteKv(FOLDER_KEY)
      set({ folder: null, folderStatus: 'none' })
    },
  }
})
