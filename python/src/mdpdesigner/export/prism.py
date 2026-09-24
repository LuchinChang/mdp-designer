"""PRISM language export (FORMAT.md §7): one module, one variable s = state index.

Mirrors web/src/io/export/prism.ts.
"""

from __future__ import annotations

import re

from ..model import Document
from ._common import (
    ExportFile,
    ExportResult,
    ExportWarning,
    exact,
    expected_reward,
    has_branch_rewards,
    index_model,
    is_point_mass,
    prism_identifiers,
    rename_quoted,
    reward_structures,
    runs,
)


def _one_line(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _guard(s: int) -> str:
    return f"s={s}"


def _any(states: list[int]) -> str:
    """Runs of three or more states become a range."""
    if not states:
        return "false"
    parts: list[str] = []
    for a, b in runs(states):
        if b - a >= 2:
            parts.append(f"(s>={a} & s<={b})")
        else:
            parts.extend(_guard(s) for s in sorted({a, b}))
    return " | ".join(parts)


def export_prism(doc: Document) -> ExportResult:
    m = doc.model
    ix = index_model(m)
    warnings: list[ExportWarning] = []
    actions = prism_identifiers([a.id for a in m.actions])
    labels = prism_identifiers([lab for lab, _ in ix.labels])
    rewards = reward_structures(ix)
    reward_names = prism_identifiers([r.id for r in rewards])

    def act(a: str | None) -> str:
        if a is None:
            return ""
        return actions.get(a) or prism_identifiers([a])[a]

    out = [
        f"// {_one_line(doc.metadata.get('name', 'Untitled'))}",
        "// Exported by mdp-designer. State s=i is model.states[i]:",
    ]
    out += [f"//   {i}  {sid}" for i, sid in enumerate(ix.state_ids)]
    out += ["", m.type, "", "module M"]

    point = is_point_mass(ix)
    init = f" init {ix.initial[0][0]}" if point else ""
    out += [f"  s : [0..{len(ix.state_ids) - 1}]{init};", ""]
    for row in ix.rows:
        if len(row.branches) == 1 and row.branches[0][1] == 1:
            update = f"(s'={row.branches[0][0]})"
        else:
            update = " + ".join(f"{exact(p)}:(s'={t})" for t, p in row.branches)
        action = act(row.choice.action if row.choice else None)
        comment = "" if row.choice else " // deadlock"
        out.append(f"  [{action}] {_guard(row.state)} -> {update};{comment}")
    out.append("endmodule")

    if not point:
        dist = ", ".join(f"{ix.state_ids[s]}: {exact(p)}" for s, p in ix.initial)
        out += [
            "",
            "// PRISM has no initial distributions. model.initial is {" + dist + "};",
            "// this block makes those states initial and drops their probabilities.",
            f"init {_any([s for s, _ in ix.initial])} endinit",
        ]
        warnings.append(
            ExportWarning(
                "PRISM has no initial distributions: every state in the support of "
                "model.initial becomes initial"
            )
        )

    if ix.labels:
        out.append("")
    out += [f'label "{labels[lab]}" = {_any(states)};' for lab, states in ix.labels]

    for r in rewards:
        if has_branch_rewards(r):
            warnings.append(
                ExportWarning(
                    f'Reward "{r.id}": PRISM has no (s,a,s\') rewards, so branch rewards '
                    "are folded into their expected value",
                    "W104",
                )
            )
        out += ["", f'rewards "{reward_names[r.id]}"']
        out += [f"  {_guard(s)} : {exact(v)};" for s, v in r.state.items()]
        for row in ix.rows:
            v = expected_reward(r, row)
            if v != 0:
                action = act(row.choice.action if row.choice else None)
                out.append(f"  [{action}] {_guard(row.state)} : {exact(v)};")
        out.append("endrewards")

    files = [ExportFile(".prism", "\n".join(out) + "\n")]
    if m.properties:
        names = {k: v for k, v in {**reward_names, **labels}.items() if k != v}
        lines: list[str] = []
        for p in m.properties:
            desc = f": {_one_line(p.description)}" if p.description else ""
            lines += [f"// {p.id}{desc}", rename_quoted(_one_line(p.formula), names)]
        files.append(ExportFile(".props", "\n".join(lines) + "\n"))
    return ExportResult(files, warnings)
