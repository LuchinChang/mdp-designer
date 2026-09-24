# ADR 0002 — Separate `model` (semantics) from `layout` (presentation)

**Status:** accepted (2026-09-24)

## Context
Researchers commit models to git and load them from experiment code.
Positions change constantly while editing, but the MDP itself does not.

## Decision
- The file has two top-level objects. `model` is pure semantics. `layout` is
  positions, curvature, colors and viewport, keyed by entity id.
- Loaders and exporters ignore `layout`.
- Integer indices come from the order of the `states` and `actions` arrays,
  never from layout.

## Consequences
- Moving nodes produces diffs only inside `layout`.
- The Python package can skip `layout` entirely.
- Imported or generated models may have no layout. The editor then runs
  auto-layout and fills it in.
- Deleting an entity must also delete its layout entries. Stray entries give
  warning `W105`.
