# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The file format (`spec/FORMAT.md`)
is versioned independently.

## [Unreleased]

### Added
- File format spec v1.0 (`spec/FORMAT.md`) and JSON Schema.
- Example models: simple reachability, Knuth–Yao die, 3×3 gridworld.
- Web editor with interactive editing:
  - double-click to add a state;
  - drag from a state's handle to a state, or to itself, to create an action;
  - drag from an action dot to add a branch;
  - drop on empty canvas to create and connect a new state;
  - delete, with branch probabilities renormalized;
  - undo/redo;
  - autosave to browser storage;
  - open, save, or drop a `.mdp.json` file.
- Inspector for states (name, labels, initial), actions (action, exact probabilities, normalize) and the model (labels with colours, action names).
- Live validation (FORMAT.md §6) with a problems list; click a problem to select and frame the entity.
- States are filled with their label colours, with a legend. Hovering a legend entry highlights its states.
- Edit/preview mode toggle. In preview mode, hovering a state or action dims everything unrelated to it.
- Menu bar (Library, File, Edit, View, Help) with keyboard shortcuts.
- Library (⌘L):
  - thumbnail cards, with search and tag and type filters;
  - card actions: open, rename, edit tags, duplicate, download, delete with undo;
  - keyboard navigation;
  - drag-and-drop import.
- Every edited model is autosaved to IndexedDB. An optional linked folder mirrors the library as `.mdp.json` files.
- Preview mode:
  - hovering a state colours each of its actions distinctly;
  - hovering any edge of an action focuses that action.
- The initial state has a dedicated colour (ring and arrow).
- Collapsible side panel (⌘\).
- Python package skeleton (`mdpdesigner`) with a JSON loader.
- Exporters (File → Export), matching FORMAT.md §7:
  - **PRISM** (`.prism` + `.props`): one variable `s`, one command per choice, exact rational
    probabilities, sanitized action/label names, labels and reward structures, self-loops on
    deadlocks. Branch rewards are folded into their expected value (W104). A non-point initial
    distribution becomes an `init … endinit` block.
  - **JANI** (`.jani`): the same encoding as one automaton, labels and rewards as transient
    variables, and reachability properties (`P(max|min)=? [F φ]`, `[φ U ψ]`, `R{"r"}…=? [F φ]`)
    translated; other properties are skipped with a warning. Loads in QUASAR's
    `convert_jani_to_mdp`. *JANI for QUASAR* leaves rewards out, since QUASAR would otherwise
    split states by their last edge reward.
  - **Explicit** (`.tra`, `.lab`, `.srew`, `.trew`) in the layout of PRISM's `-exportmodel`,
    downloaded as one zip.
  - Exporting a model with validation errors asks for confirmation. Export warnings are
    shown after the download.
- Python exporters `mdpdesigner.export.export_prism / export_jani / export_explicit`, with
  byte-identical output to the web exporters, and a CLI:
  `mdp-designer convert FILE --to prism|jani|explicit [-o DIR] [--no-rewards]`.
