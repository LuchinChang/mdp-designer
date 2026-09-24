# ADR 0001 — Represent MDP transitions with explicit choice nodes

**Status:** accepted (2026-09-24)

## Context
An MDP transition is a map `(s, a) ↦ distribution over S`. Drawing plain
state-to-state arrows, each labelled `a : p`, loses the grouping. The reader
cannot see which branches belong to the same nondeterministic choice, and
editing the probability of one branch has no visible "sibling" to rebalance.

## Decision
- A **choice** `(s, a)` is a first-class entity in both the data model and
  the canvas. On the canvas it is a small filled dot, the "action dot".
- An edge goes from `s` to the dot and is labelled with the action.
- Branches go from the dot to each successor and are labelled with
  probabilities.
- In a DTMC, each state has at most one choice, the choice has no action, and
  the dot is hidden.

## Consequences
- Choices map one-to-one to PRISM commands and JANI edges, and each one
  becomes a row block of `P[s, a, :]`.
- Validation of probability sums happens per choice, and the inspector shows
  one choice at a time.
- The canvas has two kinds of nodes, states and choices. Choices have their
  own positions (`layout.choices`), which the user can drag.
- Dense MDPs, with many actions per state, draw many dots. Auto-placement of
  the dots, with the option to collapse them, is a future improvement.
