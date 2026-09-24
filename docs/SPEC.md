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
| C9 | The initial state is marked with an incoming arrow and an outer ring, both in a dedicated colour (violet) that no label uses. States are **filled with their label's colour** (equal pie slices when a state has several labels), explained by a **legend** on the canvas. Hovering a legend entry dims every state without that label. |
| C10 | Two modes, toggled from the canvas controls (the button that replaces React Flow's lock), the menu bar, or ⌘E. **Edit mode**: everything above. **Preview mode**: read-only. Hovering a state or action dot dims everything unrelated to it. For a state, the related elements are its actions, their successors, and its incoming branches with their predecessors. Its own actions are **colour-coded, one colour per action**, so you can pick one out and then hover it. Hovering an action dot **or any of its edges** focuses that action: its state, its successors and all of its edges, in the action's colour. |
| C11 | Dropping a connection on empty canvas creates a new state there and connects to it. |

### Inspector
| ID | Requirement |
|---|---|
| I1 | **State:** edit name, labels, initial probability and description. List its choices. |
| I2 | **Choice:** edit the action (pick one or create one), edit branch probabilities (accepts `0.3` or `3/10`), and show the running sum. A "normalize" button fixes the sum. |
| I3 | **Model:** edit metadata, type (mdp/dtmc), actions, labels (with colors), reward structures and properties. |
| I5 | The side panel (inspector + problems) collapses to a thin rail (⌘\ or the » button); the rail shows the problem count. |
| I4 | **Reward overlay:** choose a reward structure and show its values on states and edges. |

### Validation
| ID | Requirement |
|---|---|
| V1 | Run validation live. Every issue from FORMAT.md §6 is listed in a panel, with its code, message and entity. |
| V2 | Clicking an issue selects and focuses the entity. Invalid entities are outlined on the canvas. |
| V3 | Export stays available when there are warnings. Exporting with errors requires a confirmation. |

### Menu bar
| ID | Requirement |
|---|---|
| M1 | **Library** (⌘L) slot. **File**: New MDP, New DTMC, Library…, Import .mdp.json… (⌘O), Download .mdp.json (⌘S). **Edit**: Undo (⌘Z), Redo (⇧⌘Z). **View**: Edit/Preview mode (⌘E), Side panel (⌘\), Snap to grid. **Help**: format spec, issues, source. |
| M2 | The status (valid / N warnings / N errors) and an Edit/Preview switch are always visible in the menu bar. |

### Files and interop
| ID | Requirement |
|---|---|
| F1 | Open and save `.mdp.json`, by file picker or drag-and-drop of the file onto the canvas. |
| F2 | Autosave every edit to the library (see L3). The last open model reopens on the next visit. |
| F3 | Export: PRISM (`.prism` + `.props`), JANI, explicit (`.tra/.lab/.srew/.trew`), SVG, PNG and TikZ. |
| F4 | Import: explicit (`.tra` + `.lab`) and flat JANI. Positions come from auto-layout (ELK). |
| F5 | The example models from `spec/examples/` appear in the library. |

### Library
| ID | Requirement |
|---|---|
| L1 | **Library** has its own slot in the menu bar and opens with ⌘L (also File → Library…). It covers the workspace; Esc closes it. |
| L2 | Each model is a **card**: a **thumbnail of the MDP's shape** (states, action dots and edges drawn from `layout`, label colours, the initial state in violet, no text), plus its **name**, type, size, last-edited time and **tags**. |
| L3 | **Everything is autosaved.** Every edited model is stored in IndexedDB, on disk in the browser profile, with persistent storage requested. Opening an example does not add it to the library until it is edited. |
| L4 | **Optional folder mirror** (Chromium): "Link folder…" writes every model to `<name>.<id>.mdp.json` in a chosen folder and imports `.mdp.json` files already there. Renames and deletes follow. After a reload the browser asks to reconnect. |
| L5 | Card actions: Open, Rename (F2), Edit tags, Duplicate, Download .mdp.json, Delete (with Undo). Example cards offer Open, Duplicate to My models, and Download. |
| L6 | Search by name, description or tag. Filter by type (MDP/DTMC) and by tag. Arrow keys move between cards and Enter opens. Dropping `.mdp.json` files on the library imports them. |
| L7 | Thumbnails are rendered from the document, not stored as images, so they always match the file. |

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
