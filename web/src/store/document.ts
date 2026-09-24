import { create } from 'zustand'
import type { MdpDocument } from '../core/types'
import { examples } from '../examples'

interface DocumentState {
  doc: MdpDocument
  setDoc: (doc: MdpDocument) => void
}

export const useDocument = create<DocumentState>((set) => ({
  doc: examples[0].doc,
  setDoc: (doc) => set({ doc }),
}))
