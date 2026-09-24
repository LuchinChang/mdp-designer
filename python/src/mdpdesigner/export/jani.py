"""JANI export (FORMAT.md §7): the PRISM encoding as one automaton with one location.

Labels and rewards are transient variables, as in Storm's and the QVBS models.
QUASAR (env/convert_jani_to_mdp.py) reads this: it needs a global "s" with an
initial value, one sync per action, and reachability as {"op": "U", "left": true}.

Mirrors web/src/io/export/jani.ts.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from ..model import Document
from ._common import (
    ExportFile,
    ExportResult,
    ExportWarning,
    Rewards,
    branch_rewards,
    index_model,
    is_point_mass,
    reward_structures,
    runs,
)

Expr = Any


def _value(r: Fraction) -> Expr:
    """Integers as JSON numbers, other rationals as an exact division."""
    if r.denominator == 1:
        return r.numerator
    return {"op": "/", "left": r.numerator, "right": r.denominator}


def _is_state(i: int) -> Expr:
    return {"op": "=", "left": "s", "right": i}


def _balanced(xs: list[Expr]) -> Expr:
    """Balanced disjunction, so nesting depth grows with log n."""
    if not xs:
        return False
    if len(xs) == 1:
        return xs[0]
    mid = (len(xs) + 1) // 2
    return {"op": "∨", "left": _balanced(xs[:mid]), "right": _balanced(xs[mid:])}


def _in_states(states: list[int]) -> Expr:
    """True when s is one of ``states`` (sorted); runs of three or more become a range."""
    parts: list[Expr] = []
    for a, b in runs(states):
        if b - a >= 2:
            parts.append(
                {
                    "op": "∧",
                    "left": {"op": "≤", "left": a, "right": "s"},
                    "right": {"op": "≤", "left": "s", "right": b},
                }
            )
        else:
            parts.extend(_is_state(s) for s in sorted({a, b}))
    return _balanced(parts)


def _select(groups: list[tuple[Fraction, list[int]]]) -> Expr:
    """s -> r(s) as if-then-else over the groups of states sharing a value; 0 elsewhere."""
    if not groups:
        return 0
    if len(groups) == 1:
        value, states = groups[0]
        return {"op": "ite", "if": _in_states(states), "then": _value(value), "else": 0}
    mid = (len(groups) + 1) // 2
    left = sorted(s for _, states in groups[:mid] for s in states)
    return {
        "op": "ite",
        "if": _in_states(left),
        "then": _select(groups[:mid]),
        "else": _select(groups[mid:]),
    }


def _group_by_value(state: dict[int, Fraction]) -> list[tuple[Fraction, list[int]]]:
    groups: dict[Fraction, list[int]] = {}
    for s, v in state.items():
        groups.setdefault(v, []).append(s)
    return list(groups.items())


# ---------------------------------------------------------------- properties

_TOKEN = re.compile(r'\s*(?:"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*)|(=\?|[\[\]{}()!&|]))\s*')


def _tokenize(s: str) -> list[tuple[str, str]] | None:
    s = s.strip()
    out: list[tuple[str, str]] = []
    pos = 0
    while pos < len(s):
        m = _TOKEN.match(s, pos)
        if not m:
            return None
        if m[1] is not None:
            out.append(("str", m[1]))
        elif m[2] is not None:
            out.append(("word", m[2]))
        else:
            out.append(("sym", m[3]))
        pos = m.end()
    return out


@dataclass
class _Names:
    labels: dict[str, str]
    rewards: dict[str, tuple[str, list[str]]]
    first_reward: str | None
    dtmc: bool


def _translate(formula: str, names: _Names) -> Expr | None:
    """Translate ``P(max|min)=? [ F φ ]``, ``P(max|min)=? [ φ U ψ ]`` and
    ``R{"r"}(max|min)=? [ F φ ]``, where φ, ψ combine quoted labels with
    ! & | ( ) true false. Returns None for anything else.
    """
    ts = _tokenize(formula)
    if ts is None:
        return None
    i = 0

    def peek(text: str) -> bool:
        return i < len(ts) and ts[i][1] == text and ts[i][0] != "str"

    def eat(text: str) -> bool:
        nonlocal i
        if peek(text):
            i += 1
            return True
        return False

    def atom() -> Expr | None:
        nonlocal i
        if i >= len(ts):
            return None
        kind, text = ts[i]
        i += 1
        if kind == "str":
            return names.labels.get(text)
        if text == "true":
            return True
        if text == "false":
            return False
        if text == "!":
            e = atom()
            return None if e is None else {"op": "¬", "exp": e}
        if text == "(":
            e = disj()
            return e if e is not None and eat(")") else None
        return None

    def chain(sub, sym: str, op: str):
        def parse() -> Expr | None:
            e = sub()
            while e is not None and eat(sym):
                r = sub()
                e = None if r is None else {"op": op, "left": e, "right": r}
            return e

        return parse

    conj = chain(atom, "&", "∧")
    disj = chain(conj, "|", "∨")

    # Operator: P, Pmax, Pmin, R, Rmax, Rmin, optionally followed by {"r"} and/or min|max.
    if not ts or ts[0][0] != "word" or not re.fullmatch(r"[PR](max|min)?", ts[0][1]):
        return None
    kind, direction = ts[0][1][0], ts[0][1][1:]
    i = 1
    reward = names.first_reward
    if kind == "R" and eat("{"):
        if i >= len(ts) or ts[i][0] != "str":
            return None
        reward = ts[i][1]
        i += 1
        if not eat("}"):
            return None
    if not direction and (peek("max") or peek("min")):
        direction = ts[i][1]
        i += 1
    if not direction:
        if not names.dtmc:
            return None
        direction = "min"  # a DTMC has one value; Storm writes P=? as Pmin too
    if not eat("=?") or not eat("["):
        return None

    reach = None
    if eat("F"):
        reach = disj()
        path = None if reach is None else {"op": "U", "left": True, "right": reach}
    else:
        left = disj()
        right = disj() if left is not None and eat("U") else None
        path = None if right is None else {"op": "U", "left": left, "right": right}
    if path is None or not eat("]") or i != len(ts):
        return None

    if kind == "P":
        values = {"op": f"P{direction}", "exp": path}
    else:
        r = names.rewards.get(reward) if reward is not None else None
        if r is None or reach is None:
            return None
        values = {"op": f"E{direction}", "exp": r[0], "accumulate": r[1], "reach": reach}
    return {"op": "filter", "fun": "values", "values": values, "states": {"op": "initial"}}


# ---------------------------------------------------------------- model


def export_jani(doc: Document, rewards: bool = True) -> ExportResult:
    """Export to JANI.

    ``rewards=False`` leaves out reward structures. QUASAR keeps transient variables
    in its state, so edge rewards split states by their last reward; use it for QUASAR.
    """
    m = doc.model
    ix = index_model(m)
    warnings: list[ExportWarning] = []
    structures = reward_structures(ix) if rewards else []

    # Labels and rewards share the variable namespace with s.
    used = {"s"}

    def fresh(name: str) -> str:
        out, k = name, 2
        while out in used:
            out, k = f"{name}_{k}", k + 1
        used.add(out)
        return out

    label_var = {lab: fresh(lab) for lab, _ in ix.labels}
    reward_var: dict[str, tuple[str, list[str], Rewards]] = {}
    for r in structures:
        on_edges = any(v != 0 for row in ix.rows for v in branch_rewards(r, row))
        accumulate = (["steps"] if on_edges or not r.state else []) + (["exit"] if r.state else [])
        reward_var[r.id] = (fresh(r.id), accumulate, r)

    point = is_point_mass(ix)
    if not point:
        warnings.append(
            ExportWarning(
                "JANI has no initial distributions: every state in the support of "
                "model.initial becomes initial (QUASAR needs a single initial state)"
            )
        )

    s_var: dict[str, Expr] = {
        "name": "s",
        "type": {
            "kind": "bounded",
            "base": "int",
            "lower-bound": 0,
            "upper-bound": len(ix.state_ids) - 1,
        },
    }
    if point:
        s_var["initial-value"] = ix.initial[0][0]
    variables: list[Expr] = [
        s_var,
        *(
            {"name": label_var[lab], "type": "bool", "transient": True, "initial-value": False}
            for lab, _ in ix.labels
        ),
        *(
            {"name": name, "type": "real", "transient": True, "initial-value": 0}
            for name, _, _ in reward_var.values()
        ),
    ]

    transient_values: list[Expr] = [
        *({"ref": label_var[lab], "value": _in_states(states)} for lab, states in ix.labels),
        *(
            {"ref": name, "value": _select(_group_by_value(r.state))}
            for name, _, r in reward_var.values()
            if r.state
        ),
    ]

    edges: list[Expr] = []
    for row in ix.rows:
        rs = [(name, branch_rewards(r, row)) for name, _, r in reward_var.values()]
        edge: dict[str, Expr] = {"location": "l"}
        if row.choice is not None and row.choice.action is not None:
            edge["action"] = row.choice.action
        edge["guard"] = {"exp": _is_state(row.state)}
        edge["destinations"] = [
            {
                "location": "l",
                "probability": {"exp": _value(p)},
                "assignments": [
                    {"ref": "s", "value": t},
                    *({"ref": name, "value": _value(vs[j])} for name, vs in rs if vs[j] != 0),
                ],
            }
            for j, (t, p) in enumerate(row.branches)
        ]
        edge["comment"] = row.choice.id if row.choice else f"deadlock {ix.state_ids[row.state]}"
        edges.append(edge)

    names = _Names(
        labels=label_var,
        rewards={rid: (name, acc) for rid, (name, acc, _) in reward_var.items()},
        first_reward=structures[0].id if structures else None,
        dtmc=m.type == "dtmc",
    )
    properties: list[Expr] = []
    for p in m.properties:
        expression = _translate(p.formula, names)
        if expression is None and not rewards and re.match(r"\s*R", p.formula):
            warnings.append(
                ExportWarning(
                    f'Property "{p.id}" needs rewards, which this export leaves out; skipped'
                )
            )
        elif expression is None:
            warnings.append(
                ExportWarning(
                    f'Property "{p.id}" is not a reachability property JANI export can '
                    "translate; skipped"
                )
            )
        else:
            prop: dict[str, Expr] = {"name": p.id, "expression": expression}
            if p.description:
                prop["comment"] = p.description
            properties.append(prop)

    action_ids = [a.id for a in m.actions] if m.type == "mdp" else []
    location: dict[str, Expr] = {"name": "l"}
    if transient_values:
        location["transient-values"] = transient_values
    jani: dict[str, Expr] = {
        "jani-version": 1,
        "name": doc.metadata.get("name", "model"),
        "type": m.type,
    }
    if any("exit" in acc for _, acc, _ in reward_var.values()):
        jani["features"] = ["state-exit-rewards"]
    if action_ids:
        jani["actions"] = [{"name": a} for a in action_ids]
    system: dict[str, Expr] = {"elements": [{"automaton": "M"}]}
    if action_ids:
        system["syncs"] = [{"result": a, "synchronise": [a]} for a in action_ids]
    jani |= {
        "variables": variables,
        "restrict-initial": {"exp": True if point else _in_states([s for s, _ in ix.initial])},
        "properties": properties,
        "automata": [
            {"name": "M", "locations": [location], "initial-locations": ["l"], "edges": edges}
        ],
        "system": system,
    }
    content = json.dumps(jani, indent=2, ensure_ascii=False) + "\n"
    return ExportResult([ExportFile(".jani", content)], warnings)
