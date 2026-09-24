"""In-memory model mirroring spec/FORMAT.md (v1).

Probabilities and rewards are stored as :class:`fractions.Fraction`, so rational
inputs such as ``"1/3"`` stay exact. Decimal JSON numbers are read as their exact
decimal value (``0.7`` -> ``7/10``), per FORMAT.md §4.9.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any, Literal

ModelType = Literal["mdp", "dtmc"]


def parse_number(value: int | float | str) -> Fraction:
    """Parse a FORMAT.md §4.9 number: a JSON number or an exact rational string."""
    if isinstance(value, bool):
        raise TypeError("booleans are not numbers")
    if isinstance(value, float):
        return Fraction(repr(value))
    return Fraction(value)


@dataclass
class State:
    id: str
    name: str | None = None
    description: str | None = None
    labels: list[str] = field(default_factory=list)


@dataclass
class Action:
    id: str
    name: str | None = None
    description: str | None = None


@dataclass
class Branch:
    target: str
    prob: Fraction


@dataclass
class Choice:
    id: str
    state: str
    branches: list[Branch]
    action: str | None = None


@dataclass
class Label:
    id: str
    description: str | None = None


@dataclass
class BranchReward:
    choice: str
    target: str
    value: Fraction


@dataclass
class RewardStructure:
    id: str
    description: str | None = None
    state: dict[str, Fraction] = field(default_factory=dict)
    choice: dict[str, Fraction] = field(default_factory=dict)
    branch: list[BranchReward] = field(default_factory=list)


@dataclass
class Property:
    id: str
    formula: str
    kind: str | None = None
    description: str | None = None


@dataclass
class Model:
    type: ModelType
    states: list[State]
    initial: dict[str, Fraction]
    choices: list[Choice]
    actions: list[Action] = field(default_factory=list)
    labels: list[Label] = field(default_factory=list)
    rewards: list[RewardStructure] = field(default_factory=list)
    properties: list[Property] = field(default_factory=list)

    def state_index(self) -> dict[str, int]:
        """Integer index of each state (its position in ``states``, FORMAT.md §4.2)."""
        return {s.id: i for i, s in enumerate(self.states)}

    def action_index(self) -> dict[str, int]:
        """Integer index of each action (its position in ``actions``, FORMAT.md §4.3)."""
        return {a.id: i for i, a in enumerate(self.actions)}

    def choices_of(self, state: str) -> list[Choice]:
        return [c for c in self.choices if c.state == state]

    def states_with_label(self, label: str) -> list[str]:
        return [s.id for s in self.states if label in s.labels]


@dataclass
class Document:
    """A full ``.mdp.json`` document. ``layout`` is kept verbatim and never interpreted."""

    model: Model
    version: str = "1.0"
    metadata: dict[str, Any] = field(default_factory=dict)
    layout: dict[str, Any] = field(default_factory=dict)
