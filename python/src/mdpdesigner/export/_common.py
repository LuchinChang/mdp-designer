"""Shared plumbing for the exporters (FORMAT.md §7).

Mirrors web/src/io/export/common.ts; keep them in step, since both implementations
must produce byte-identical output.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal
from fractions import Fraction

from ..model import Choice, Model


@dataclass
class ExportFile:
    suffix: str
    """Appended to the base file name, e.g. ``".prism"`` or ``".steps.srew"``."""
    content: str


@dataclass
class ExportWarning:
    message: str
    code: str | None = None


@dataclass
class ExportResult:
    files: list[ExportFile]
    warnings: list[ExportWarning] = field(default_factory=list)


@dataclass
class Row:
    state: int
    branches: list[tuple[int, Fraction]]
    """``(target index, probability)`` pairs."""
    choice: Choice | None = None
    """``None`` for the self-loop added to a deadlock state (FORMAT.md §6, W101)."""


@dataclass
class Indexed:
    model: Model
    state_ids: list[str]
    rows: list[Row]
    """Choices grouped by state index, in document order within a state (FORMAT.md §4.5)."""
    initial: list[tuple[int, Fraction]]
    """Sorted by state index."""
    labels: list[tuple[str, list[int]]]
    """Declared labels with the indices of their states."""


def index_model(model: Model) -> Indexed:
    """Integer-indexed view of a model (FORMAT.md §4.2). Raises on dangling state references."""
    state_ids = [s.id for s in model.states]
    index = {sid: i for i, sid in enumerate(state_ids)}

    def at(sid: str, where: str) -> int:
        if sid not in index:
            raise ValueError(f'{where}: unknown state "{sid}"')
        return index[sid]

    by_state: list[list[Row]] = [[] for _ in state_ids]
    for c in model.choices:
        state = at(c.state, f'Choice "{c.id}"')
        branches = [(at(b.target, f'Choice "{c.id}"'), b.prob) for b in c.branches]
        by_state[state].append(Row(state, branches, c))
    rows = [
        r for state, rs in enumerate(by_state) for r in (rs or [Row(state, [(state, Fraction(1))])])
    ]
    initial = sorted((at(sid, "Initial distribution"), p) for sid, p in model.initial.items())
    labels = [
        (lab.id, [i for i, s in enumerate(model.states) if lab.id in s.labels])
        for lab in model.labels
    ]
    return Indexed(model, state_ids, rows, initial, labels)


@dataclass
class Rewards:
    id: str
    state: dict[int, Fraction]
    """Non-zero state rewards by state index, sorted."""
    choice: dict[str, Fraction]
    """Choice reward r(s,a) by choice id."""
    branch: dict[str, dict[int, Fraction]]
    """Branch reward r(s,a,s') by choice id, then target index."""


def reward_structures(ix: Indexed) -> list[Rewards]:
    index = {sid: i for i, sid in enumerate(ix.state_ids)}
    out = []
    for r in ix.model.rewards:
        state: dict[int, Fraction] = {}
        for sid, v in r.state.items():
            if sid in index:
                state[index[sid]] = state.get(index[sid], Fraction(0)) + v
        branch: dict[str, dict[int, Fraction]] = {}
        for b in r.branch:
            if b.target in index:
                m = branch.setdefault(b.choice, {})
                m[index[b.target]] = m.get(index[b.target], Fraction(0)) + b.value
        out.append(
            Rewards(
                r.id,
                {i: v for i, v in sorted(state.items()) if v != 0},
                dict(r.choice),
                branch,
            )
        )
    return out


def has_branch_rewards(r: Rewards) -> bool:
    return any(v != 0 for m in r.branch.values() for v in m.values())


def branch_rewards(r: Rewards, row: Row) -> list[Fraction]:
    """Reward earned on each branch of a row: its choice reward plus its branch reward."""
    if row.choice is None:
        return [Fraction(0)] * len(row.branches)
    c = r.choice.get(row.choice.id, Fraction(0))
    b = r.branch.get(row.choice.id, {})
    return [c + b.get(t, Fraction(0)) for t, _ in row.branches]


def expected_reward(r: Rewards, row: Row) -> Fraction:
    """Σ P(s,a,s')·(r(s,a) + r(s,a,s')): branch rewards folded in (FORMAT.md §4.7)."""
    return sum(
        (p * v for (_, p), v in zip(row.branches, branch_rewards(r, row), strict=True)),
        Fraction(0),
    )


def _finite_decimal(r: Fraction) -> str | None:
    """Exact decimal string if ``r`` has a finite decimal expansion ("0.7", "-2"), else None."""
    d, twos, fives = r.denominator, 0, 0
    while d % 2 == 0:
        d, twos = d // 2, twos + 1
    while d % 5 == 0:
        d, fives = d // 5, fives + 1
    if d != 1:
        return None
    k = max(twos, fives)
    if k == 0:
        return str(r.numerator)
    scaled = r.numerator * 10**k // r.denominator
    digits = str(abs(scaled)).rjust(k + 1, "0")
    return f"{'-' if scaled < 0 else ''}{digits[:-k]}.{digits[-k:]}"


def _js_number(x: float) -> str:
    """Format a finite float the way JavaScript's ``String(x)`` does."""
    if x == 0:
        return "0"
    t = Decimal(repr(abs(x))).as_tuple()
    digits = "".join(map(str, t.digits))
    exp = int(t.exponent)
    stripped = digits.rstrip("0")
    exp += len(digits) - len(stripped)
    digits = stripped
    k = len(digits)
    n = exp + k
    sign = "-" if x < 0 else ""
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return f"{sign}{digits[:n]}.{digits[n:]}"
    if -6 < n <= 0:
        return f"{sign}0.{'0' * -n}{digits}"
    e = n - 1
    mantissa = digits if k == 1 else f"{digits[0]}.{digits[1:]}"
    return f"{sign}{mantissa}e{'+' if e > 0 else '-'}{abs(e)}"


def exact(r: Fraction) -> str:
    """Exact text for PRISM: "3" or "7/10"."""
    return str(r.numerator) if r.denominator == 1 else f"{r.numerator}/{r.denominator}"


def decimal(r: Fraction) -> str:
    """Decimal text: exact when finite, else the shortest round-tripping double."""
    return _finite_decimal(r) or _js_number(r.numerator / r.denominator)


_PRISM_KEYWORDS = set(
    (
        "A bool clock const ctmc C double dtmc E endinit endinvariant endmodule endobservables "
        "endplayer endrewards endsystem false formula filter func F global G init invariant I int "
        "label max mdp min module X nondeterministic observable observables of Pmax Pmin P player "
        "pomdp popta probabilistic prob pta rate rewards Rmax Rmin R S smg stochastic system true "
        "U W"
    ).split()
)
_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def prism_identifiers(ids: list[str], reserved: Iterable[str] = ()) -> dict[str, str]:
    """Map ids to distinct PRISM identifiers.

    Ids that are already valid keep their name; the rest have other characters
    replaced by "_" and get a numeric suffix on collision.
    """
    used = set(reserved)
    out: dict[str, str] = {}
    for i in ids:
        if _IDENT.fullmatch(i) and i not in _PRISM_KEYWORDS and i not in used:
            used.add(i)
            out[i] = i
    for i in ids:
        if i in out:
            continue
        base = re.sub(r"[^A-Za-z0-9_]", "_", i)
        if not re.match(r"[A-Za-z_]", base):
            base = f"_{base}"
        if base in _PRISM_KEYWORDS:
            base = f"{base}_"
        name, k = base, 2
        while name in used:
            name, k = f"{base}_{k}", k + 1
        used.add(name)
        out[i] = name
    return out


def rename_quoted(formula: str, names: dict[str, str]) -> str:
    """Rewrite the quoted names in a PRISM formula, e.g. "goal" -> "goal_2"."""
    return re.sub(
        r'"([^"]*)"',
        lambda m: f'"{names[m[1]]}"' if m[1] in names else m[0],
        formula,
    )


def runs(states: list[int]) -> list[tuple[int, int]]:
    """Sorted state indices as maximal runs ``(first, last)``."""
    out: list[list[int]] = []
    for s in states:
        if out and s == out[-1][1] + 1:
            out[-1][1] = s
        else:
            out.append([s, s])
    return [(a, b) for a, b in out]


def is_point_mass(ix: Indexed) -> bool:
    return len(ix.initial) == 1
