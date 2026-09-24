# mdp-designer file format — v1.0

**Status:** draft, locked for v1 development.
**File extension:** `.mdp.json`
**Media type:** `application/vnd.mdp-designer+json`
**Machine-readable schema:** [`schema/mdp-designer.v1.schema.json`](schema/mdp-designer.v1.schema.json) (JSON Schema 2020-12)

This document is normative. In it, "MUST", "SHOULD" and "MAY" follow
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). The JSON Schema checks
structure. The rules in §6 (Validation) go beyond what the schema can check,
and a conforming reader MUST enforce the ones marked *error*.

---

## 1. Design principles

1. **Semantics apart from presentation.** `model` holds the mathematics and
   `layout` holds where things are drawn. Every consumer except the editor
   MAY ignore `layout`. Moving a node never changes `model`.
2. **Explicit and flat.** Every state, choice and branch is listed. There are
   no variables, guards or expressions. (Symbolic formats such as PRISM and
   JANI are *export* targets.)
3. **Stable identifiers.** Every entity has an immutable string `id`. Array
   order defines integer indices. Display names are separate and free-form.
4. **Exact when needed.** Probabilities MAY be exact rationals (`"1/3"`).
5. **Forward compatible.** Keys starting with `x-` are extensions. Readers
   MUST ignore them and SHOULD keep them when rewriting a file.

## 2. Mathematical model

An MDP is a tuple `M = (S, A, P, ι, L, R)`:

| Symbol | Meaning | Field |
|---|---|---|
| `S` | finite set of states | `model.states` |
| `A` | finite set of actions (the global alphabet) | `model.actions` |
| `A(s) ⊆ A` | actions enabled in `s` | the actions of the choices whose `state` is `s` |
| `P(s, a, ·)` | distribution over `S` for each `a ∈ A(s)` | `model.choices[*].branches` |
| `ι` | initial distribution over `S` | `model.initial` |
| `L : S → 2^AP` | state labelling (atomic propositions) | `model.states[*].labels`, declared in `model.labels` |
| `R` | named reward structures | `model.rewards` |

A **choice** is a pair `(s, a)` with `a ∈ A(s)`, together with its
distribution. A **branch** is one successor of a choice, `(s, a, s')` with
`P(s, a, s') > 0`.

A **DTMC** is the special case where every state has at most one choice and
that choice has no action. A DTMC uses the same structure with `type: "dtmc"`.

## 3. Top-level document

```jsonc
{
  "format": "mdp-designer",   // REQUIRED, constant
  "version": "1.0",           // REQUIRED, "MAJOR.MINOR" of this spec
  "metadata": { ... },        // OPTIONAL
  "model": { ... },           // REQUIRED
  "layout": { ... }           // OPTIONAL
}
```

### 3.1 `version`
- A reader for version `X.Y` MUST accept every `X.*` file. It MAY warn when
  the file's minor version is newer than its own.
- A new major version comes with a migration function in each
  implementation. Files from older versions keep loading.

### 3.2 `metadata`
Every field is optional.

| Key | Type | Notes |
|---|---|---|
| `name` | string | human-readable model name |
| `description` | string | Markdown allowed |
| `authors` | string[] | |
| `tags` | string[] | e.g. `["benchmark", "reachability"]` |
| `source` | string | citation, URL or DOI the model comes from |
| `created`, `modified` | string | RFC 3339 timestamps |

## 4. `model`

```jsonc
{
  "type": "mdp",                       // "mdp" | "dtmc"
  "states":     [State, ...],          // REQUIRED, non-empty
  "actions":    [Action, ...],         // REQUIRED for "mdp", MUST be absent or empty for "dtmc"
  "initial":    "s0" | { "s0": 1 },    // REQUIRED
  "choices":    [Choice, ...],         // REQUIRED (may be empty)
  "labels":     [Label, ...],          // OPTIONAL
  "rewards":    [RewardStructure, ...],// OPTIONAL
  "properties": [Property, ...]        // OPTIONAL
}
```

The values `"pomdp"`, `"smg"` (stochastic multiplayer game) and `"pmdp"`
(parametric MDP) are **reserved** for future minor versions. A v1.0 reader
MUST reject any other `type` with a clear error.

### 4.1 Identifiers
- An `id` MUST match `^[A-Za-z_][A-Za-z0-9_.-]*$`. Because `>` is not
  allowed, the edge key `"<choice>-><target>"` (§5) always splits
  unambiguously.
- IDs MUST be unique within their collection: states, actions, choices,
  labels, rewards and properties.
- The same string MAY appear in two different collections. For example, a
  state and a label may both be called `goal`.

### 4.2 `State`
```jsonc
{ "id": "s0", "name": "start", "labels": ["safe"], "description": "..." }
```
- `name` is optional and is used for display only. It defaults to `id`.
- `labels` is optional and defaults to `[]`. Every entry MUST be a declared
  label id.
- **Index:** the position of a state in `states` is its integer index
  (`s = 0 … |S|-1`). Exporters that need integers MUST use this order.

### 4.3 `Action`
```jsonc
{ "id": "a", "name": "left", "description": "..." }
```
- Actions form a global alphabet. An action need not be enabled anywhere; if
  it is enabled nowhere, validation gives a *warning*.
- **Index:** the position of an action in `actions` is its integer index.

### 4.4 `initial`
- It is either a single state id, which is shorthand for `{ "<id>": 1 }`, or
  an object that maps state ids to probabilities.
- The probabilities MUST be `> 0` and MUST sum to 1 (§4.9).

### 4.5 `Choice`
```jsonc
{
  "id": "c0", "state": "s0", "action": "a",
  "branches": [
    { "target": "s1", "prob": 0.7 },
    { "target": "s0", "prob": "3/10" }
  ]
}
```
- For `"mdp"`, `action` is REQUIRED. There MUST be at most one choice per
  `(state, action)` pair.
- For `"dtmc"`, `action` MUST be absent, and each state has at most one choice.
- `branches` MUST be non-empty. Every `target` MUST be distinct within one
  choice, and every `prob` MUST be `> 0`. Zero-probability branches are
  forbidden because the support of a distribution matters: almost-sure
  reachability and MEC decomposition both depend on it.
- The `prob` values of a choice MUST sum to 1 (§4.9).
- A **self-loop** is simply a branch whose `target` equals the choice's
  `state`. It needs no special handling.
- **Order:** choices are grouped by state in any order. For a given state,
  the relative order of its choices is the order of its enabled actions, and
  exporters SHOULD keep it.

### 4.6 `Label`
```jsonc
{ "id": "goal", "description": "target set T" }
```
- Labels are the atomic propositions used in `properties`.
- The ids `init` and `deadlock` are **reserved**, because PRISM defines them
  implicitly. Using them is an *error*.
- Label colors are presentation, so they live in `layout.labels`.

### 4.7 `RewardStructure`
```jsonc
{
  "id": "cost", "description": "...",
  "state":  { "s0": 1 },                                 // state rewards   r(s)
  "choice": { "c0": 2 },                                 // action rewards  r(s,a), keyed by choice id
  "branch": [ { "choice": "c0", "target": "s1", "value": 5 } ]  // transition rewards r(s,a,s')
}
```
- All three parts are optional. A missing entry means 0.
- Values are numbers or rationals (§4.9) and MAY be negative.
- PRISM has no `(s,a,s')` rewards, so exporting `branch` to PRISM gives a
  *warning*. The exporter folds each `branch` reward into the choice reward as
  its expected value, `Σ P(s,a,s')·r(s,a,s')`. Storm's explicit format keeps
  `branch` rewards as they are.

### 4.8 `Property`
```jsonc
{ "id": "reach", "kind": "pctl", "formula": "Pmax=? [ F \"goal\" ]", "description": "..." }
```
- `kind` is one of `"pctl"`, `"ltl"`, `"pctl*"` or `"other"`.
- `formula` is a string in **PRISM property syntax**. Labels are written in
  double quotes, and reward structures are named as `R{"cost"}`.
- v1 tools pass formulas through without parsing them. The one exception is
  the QUASAR/JANI route (§7), which recognizes the reachability form
  `P(max|min)=? [ F "<label>" ]`.

### 4.9 Numbers: probabilities and rewards
A `Number` is one of:
- a JSON number, such as `0.25`; or
- an exact rational string matching `^-?[0-9]+/[1-9][0-9]*$`, such as `"1/3"`.
  Probabilities MUST NOT be negative.

**Sum check.**
- When every term is rational or an integer, the sum MUST equal 1 exactly.
- Otherwise the terms are compared as IEEE-754 doubles, and
  `|Σ − 1| ≤ 1e-9` is required.
- JSON numbers with a finite decimal expansion (such as `0.7`) SHOULD be read
  as the exact decimal. That makes `0.7 + "3/10"` exact.

## 5. `layout` (editor-only)

```jsonc
{
  "states":  { "s0": { "x": 0, "y": 0 } },
  "choices": { "c0": { "x": 80, "y": 10 } },
  "edges":   { "c0->s1": { "curvature": 0.2, "labelT": 0.5 },
               "c0->s0": { "curvature": -0.4 } },
  "labels":  { "goal": { "color": "#2e7d32" } },
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "grid": { "snap": true, "size": 20 }
}
```
- Coordinates are in canvas units and give the **centre** of the node.
- Missing positions are computed by auto-layout.
- An edge key is `"<choiceId>-><targetStateId>"`. The key refers to the
  branch from the choice's action dot to the target. In DTMC mode, and for
  choices the editor draws without a dot, the same key refers to the
  state-to-state arrow.
- `curvature` is a signed bend factor, where 0 means straight. It is the
  perpendicular offset of the control point as a fraction of the edge length,
  and positive values bend to the left of the direction of travel. `labelT`
  is where the probability label sits along the edge, from 0 to 1.
- `loopAngle` applies only to edges drawn as a true self-loop, where the
  arrow starts and ends at the same state, as in DTMC mode. It is the
  direction of the loop in degrees clockwise from east, and defaults to -90
  (up). In MDP mode a self-loop branch goes from the action dot back to its
  state, so it is an ordinary edge and uses `curvature`.
- Readers MUST ignore unknown layout keys. Layout entries whose id does not
  exist in `model` give a *warning* and are dropped when the file is saved.

## 6. Validation

| Code | Level | Condition |
|---|---|---|
| `E001` | error | Duplicate id within a collection |
| `E002` | error | Dangling reference: a state, action, label or choice id that does not exist |
| `E003` | error | Choice probabilities do not sum to 1 (§4.9) |
| `E004` | error | A probability is ≤ 0, or a target is repeated within a choice |
| `E005` | error | Initial distribution is empty, has a non-positive entry, or does not sum to 1 |
| `E006` | error | MDP: two choices share a `(state, action)` pair, or a choice has no action |
| `E007` | error | DTMC: a state has more than one choice, or a choice has an action |
| `E008` | error | A label uses a reserved id (`init`, `deadlock`) |
| `W101` | warning | Deadlock state (no choices). Exporters add a self-loop, as PRISM's `-fixdl` does |
| `W102` | warning | State unreachable from the support of `initial` |
| `W103` | warning | Action enabled in no state, or label assigned to no state |
| `W104` | warning | Branch reward exported to a format without `(s,a,s')` rewards (§4.7) |
| `W105` | warning | Layout references an unknown id (§5) |

Implementations SHOULD report every issue they find, each with its code, a
message and the path of the offending entity (for example
`model.choices[3].branches[1]`). They SHOULD NOT stop at the first issue.

## 7. Export mappings (informative)

| Target | Notes |
|---|---|
| **PRISM language** (`.prism`, `.props`) | One variable `s : [0..|S|-1]` and one command per choice: `[a] s=i -> p1:(s'=j) + …;`. Labels become `label "l" = s=… \| …;` and reward structures become `rewards "r" … endrewards`. Action names are sanitized into identifiers. Deadlocks get `[] s=i -> (s'=i);`. |
| **JANI** (`.jani`) | The same single-variable encoding as one automaton. `properties` are emitted as JANI property expressions when they can be translated. |
| **Explicit** (`.tra`, `.lab`, `.srew`, `.trew`) | The PRISM/Storm explicit formats, using the integer indices from §4.2–4.3. |
| **NumPy / Python** | Sparse COO arrays `(src, act, dst, prob)` or dense `P[s,a,s']` with an action mask, plus `R[s,a]`. |
| **QUASAR** | Uses JANI with `"goal"` as the target label and requires a point-mass `initial`. A zero sink is a non-goal state whose every choice is a self-loop with probability 1; it can be derived, so it is not stored. |
| **TikZ / SVG** | Uses `layout`: states are circles, choices are filled dots, and branches are arrows labelled with `prob`. |

## 8. Minimal complete example

```json
{
  "format": "mdp-designer",
  "version": "1.0",
  "model": {
    "type": "mdp",
    "states": [{ "id": "s0" }, { "id": "s1", "labels": ["goal"] }],
    "actions": [{ "id": "go" }, { "id": "stay" }],
    "initial": "s0",
    "choices": [
      { "id": "c0", "state": "s0", "action": "go",
        "branches": [{ "target": "s1", "prob": "1/2" }, { "target": "s0", "prob": "1/2" }] },
      { "id": "c1", "state": "s1", "action": "stay",
        "branches": [{ "target": "s1", "prob": 1 }] }
    ],
    "labels": [{ "id": "goal" }],
    "properties": [{ "id": "reach", "kind": "pctl", "formula": "Pmax=? [ F \"goal\" ]" }]
  }
}
```
