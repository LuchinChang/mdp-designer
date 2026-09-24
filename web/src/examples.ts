import type { MdpDocument } from './core/types'

const modules = import.meta.glob<MdpDocument>('../../spec/examples/*.mdp.json', { eager: true, import: 'default' })

const FIRST = 'simple-reachability.mdp.json'

/** Example gallery, loaded from spec/examples at build time. */
export const examples = Object.entries(modules)
  .map(([path, doc]) => ({ file: path.split('/').pop()!, doc }))
  .sort((a, b) => Number(b.file === FIRST) - Number(a.file === FIRST) || a.file.localeCompare(b.file))
