# mdp-designer — product requirements (v1)

This document says **what** the tool does. The file format is specified
separately in [`spec/FORMAT.md`](../spec/FORMAT.md).

## Audience
- **Formal-methods researchers.** They need to draw small or medium MDPs and
  DTMCs for papers, check them with PRISM or Storm, and share them as
  reproducible artifacts.
- **RL researchers.** They build hand-crafted MDPs to test algorithms, such
  as hard exploration instances or end-component traps. They then need those
  MDPs as NumPy arrays or Gymnasium environments.
- **Teachers.** They visualize textbook examples.

The target scale is up to a few hundred states in the editor. Larger models
go through the Python package and never need to be drawn.

## Editor (web, v1)

### Canvas
| ID | Requirement |
|---|---|
| C1 | Add a state by double-clicking the canvas or with a toolbar button. New states get ids `s0, s1, …`. |
| C2 | Drag states to move them. Snap to grid (toggleable). Pan and zoom. Show a minimap. |
| C3 | Drag from a state's handle to another state **or to the same state**. This creates a new choice `(s, a)` with a single branch of probability 1. The action gets the first unused action id for that state (`a`, `b`, …), and the new action dot is drawn between source and target. |
| C4 | Drag from an action dot to a state to add a branch. The editor proposes probabilities: it asks the user or splits the remaining mass evenly. |
| C5 | Self-loops are drawn as loops. The user can rotate them (`loopAngle`). |
| C6 | Branches between the same pair of nodes are drawn curved so they don't overlap. The user can adjust `curvature`. |
| C7 | DTMC mode hides action dots and draws arrows from state to state. Switching MDP → DTMC is only allowed when every state has at most one choice. |
| C8 | Multi-select (box and shift-click), delete, copy/paste, and undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z). |
| C9 | The initial state is marked with an incoming arrow. Labels appear as colored badges on states. |

### Inspector
| ID | Requirement |
|---|---|
| I1 | **State:** edit name, labels, initial probability and description. List its choices. |
| I2 | **Choice:** edit the action (pick one or create one), edit branch probabilities (accepts `0.3` or `3/10`), and show the running sum. A "normalize" button fixes the sum. |
| I3 | **Model:** edit metadata, type (mdp/dtmc), actions, labels (with colors), reward structures and properties. |
| I4 | **Reward overlay:** choose a reward structure and show its values on states and edges. |

### Validation
| ID | Requirement |
|---|---|
| V1 | Run validation live. Every issue from FORMAT.md §6 is listed in a panel, with its code, message and entity. |
| V2 | Clicking an issue selects and focuses the entity. Invalid entities are outlined on the canvas. |
| V3 | Export stays available when there are warnings. Exporting with errors requires a confirmation. |

### Files and interop
| ID | Requirement |
|---|---|
| F1 | Open and save `.mdp.json`, by file picker or drag-and-drop of the file onto the canvas. |
| F2 | Autosave to localStorage and offer to restore it on the next visit. |
| F3 | Export: PRISM (`.prism` + `.props`), JANI, explicit (`.tra/.lab/.srew/.trew`), SVG, PNG and TikZ. |
| F4 | Import: explicit (`.tra` + `.lab`) and flat JANI. Positions come from auto-layout (ELK). |
| F5 | A gallery with the example models from `spec/examples/`. |

### Non-functional
- The editor is a static site with no server or account, hosted on GitHub Pages.
- It works offline once loaded.
- `web/src/core` (types, validation, operations) has no React dependency.
- It should be keyboard-accessible where practical, and its colors should be
  distinguishable by colour-blind users.

## Python package (v1)
| ID | Requirement |
|---|---|
| P1 | `mdpdesigner.load(path)` and `save(model, path)` read and write `.mdp.json`. `validate(model)` reports the issues from FORMAT.md §6. |
| P2 | `model.to_sparse()` returns COO arrays `src, act, dst, prob` plus index maps. `model.to_dense()` returns `P[S,A,S]`, an action mask `[S,A]` and `R[S,A]` for each reward structure. |
| P3 | `Simulator(model, seed)` provides `reset()`, `step(a)` and `enabled_actions(s)`. It has no dependencies and returns Gymnasium-shaped tuples. |
| P4 | The `[gym]` extra provides `MDPEnv(gymnasium.Env)`, with `Discrete` observation and action spaces and `info["action_mask"]`. |
| P5 | Exporters for PRISM, JANI and explicit formats that match the web exporters. |
| P6 | A CLI: `mdp-designer validate FILE`, and `mdp-designer convert FILE --to prism\|jani\|explicit\|npz`. |
| P7 | The only core dependency is `numpy`. Python ≥ 3.10. |

## Deferred (v1.x / v2)
- In-browser value iteration and reachability analysis, with a heatmap overlay and highlighted MECs.
- Animation of policies and trajectories.
- Share-by-URL, with the model compressed into the URL hash.
- POMDPs (observations), stochastic games (state ownership) and parametric MDPs.
- Importing the full PRISM language, which needs state-space exploration (possibly through stormpy).
- A generator API for parametrized families of models, such as chains of length n.
