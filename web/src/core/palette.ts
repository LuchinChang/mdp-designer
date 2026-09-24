import type { Id, MdpDocument } from './types'

/** Okabe–Ito palette: distinguishable under the common forms of colour blindness. */
export const PALETTE = ['#009E73', '#D55E00', '#0072B2', '#E69F00', '#CC79A7', '#56B4E9', '#F0E442', '#000000']

/** Colour of a label: the one stored in layout, else a palette colour by declaration order. */
export function labelColors(doc: MdpDocument): Map<Id, string> {
  const labels = doc.model.labels ?? []
  return new Map(labels.map((l, i) => [l.id, doc.layout?.labels?.[l.id]?.color ?? PALETTE[i % PALETTE.length]]))
}

export function nextLabelColor(doc: MdpDocument): string {
  const used = new Set(labelColors(doc).values())
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[(doc.model.labels?.length ?? 0) % PALETTE.length]
}

/**
 * Colours for telling a state's actions apart while it is hovered. Deliberately
 * saturated and ordered for contrast between neighbours.
 */
export const ACTION_PALETTE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#7F3C8D', '#11A579']

/** Colour of a choice: by its position among its state's choices, so it is stable across hovers. */
export function choiceColor(doc: MdpDocument, choiceId: Id): string {
  const c = doc.model.choices.find((x) => x.id === choiceId)
  if (!c) return ACTION_PALETTE[0]
  const i = doc.model.choices.filter((x) => x.state === c.state).indexOf(c)
  return ACTION_PALETTE[i % ACTION_PALETTE.length]
}
