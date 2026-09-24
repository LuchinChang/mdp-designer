// TypeScript mirror of spec/schema/mdp-designer.v1.schema.json.
// Keep this file free of React imports (see CONTRIBUTING.md).

export type Id = string

/** A JSON number, or an exact rational string such as "3/10" (FORMAT.md §4.9). */
export type Num = number | string

export type ModelType = 'mdp' | 'dtmc'

export interface Metadata {
  name?: string
  description?: string
  authors?: string[]
  tags?: string[]
  source?: string
  created?: string
  modified?: string
}

export interface State {
  id: Id
  name?: string
  description?: string
  labels?: Id[]
}

export interface Action {
  id: Id
  name?: string
  description?: string
}

export interface Branch {
  target: Id
  prob: Num
}

export interface Choice {
  id: Id
  state: Id
  /** Required for MDPs, absent for DTMCs. */
  action?: Id
  branches: Branch[]
}

export interface Label {
  id: Id
  description?: string
}

export interface RewardStructure {
  id: Id
  description?: string
  state?: Record<Id, Num>
  /** Keyed by choice id. */
  choice?: Record<Id, Num>
  branch?: { choice: Id; target: Id; value: Num }[]
}

export type PropertyKind = 'pctl' | 'ltl' | 'pctl*' | 'other'

export interface Property {
  id: Id
  kind?: PropertyKind
  formula: string
  description?: string
}

export interface Model {
  type: ModelType
  states: State[]
  actions?: Action[]
  /** A state id (point mass) or a distribution. */
  initial: Id | Record<Id, Num>
  choices: Choice[]
  labels?: Label[]
  rewards?: RewardStructure[]
  properties?: Property[]
}

export interface Point {
  x: number
  y: number
}

export interface EdgeLayout {
  curvature?: number
  labelT?: number
  loopAngle?: number
}

export interface Layout {
  states?: Record<Id, Point>
  choices?: Record<Id, Point>
  /** Keyed by `${choiceId}->${targetStateId}`. */
  edges?: Record<string, EdgeLayout>
  labels?: Record<Id, { color?: string }>
  viewport?: { x: number; y: number; zoom: number }
  grid?: { snap?: boolean; size?: number }
}

export interface MdpDocument {
  format: 'mdp-designer'
  version: string
  metadata?: Metadata
  model: Model
  layout?: Layout
}

export const FORMAT_VERSION = '1.0'

export const edgeKey = (choice: Id, target: Id) => `${choice}->${target}`

export function initialDistribution(model: Model): Record<Id, Num> {
  return typeof model.initial === 'string' ? { [model.initial]: 1 } : model.initial
}
