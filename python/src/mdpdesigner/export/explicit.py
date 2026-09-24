"""PRISM/Storm explicit export (FORMAT.md §7), in the layout of PRISM's -exportmodel:
.tra transitions, .lab labels, and per reward structure .srew (state) and .trew (transition).

Mirrors web/src/io/export/explicit.ts.
"""

from __future__ import annotations

from ..model import Document
from ._common import (
    ExportFile,
    ExportResult,
    ExportWarning,
    branch_rewards,
    decimal,
    index_model,
    is_point_mass,
    reward_structures,
)


def export_explicit(doc: Document) -> ExportResult:
    m = doc.model
    ix = index_model(m)
    warnings: list[ExportWarning] = []
    mdp = m.type == "mdp"
    n = len(ix.state_ids)
    transitions = sum(len(row.branches) for row in ix.rows)

    # Local choice index k of each row within its state.
    local: list[int] = []
    for i, row in enumerate(ix.rows):
        same = i > 0 and ix.rows[i - 1].state == row.state
        local.append(local[i - 1] + 1 if same else 0)

    def src(i: int) -> str:
        return f"{ix.rows[i].state} {local[i]}" if mdp else f"{ix.rows[i].state}"

    def header(count: int) -> str:
        return f"{n} {len(ix.rows)} {count}" if mdp else f"{n} {count}"

    tra = [header(transitions)]
    for i, row in enumerate(ix.rows):
        has_action = mdp and row.choice is not None and row.choice.action is not None
        action = f" {row.choice.action}" if has_action else ""
        tra += [f"{src(i)} {t} {decimal(p)}{action}" for t, p in row.branches]

    if not is_point_mass(ix):
        warnings.append(
            ExportWarning(
                "The explicit format has no initial distributions: every state in the "
                'support of model.initial is labelled "init"'
            )
        )
    deadlocks = [row.state for row in ix.rows if row.choice is None]
    labels = [("init", [s for s, _ in ix.initial]), ("deadlock", deadlocks), *ix.labels]
    per_state: list[list[int]] = [[] for _ in ix.state_ids]
    for j, (_, states) in enumerate(labels):
        for s in states:
            per_state[s].append(j)
    lab = [" ".join(f'{j}="{name}"' for j, (name, _) in enumerate(labels))]
    lab += [f"{s}: {' '.join(map(str, js))}" for s, js in enumerate(per_state) if js]

    files = [
        ExportFile(".tra", "\n".join(tra) + "\n"),
        ExportFile(".lab", "\n".join(lab) + "\n"),
    ]
    for r in reward_structures(ix):
        title = f'# Reward structure "{r.id}"'
        if r.state:
            lines = [f"{s} {decimal(v)}" for s, v in r.state.items()]
            content = [title, f"{n} {len(lines)}", *lines]
            files.append(ExportFile(f".{r.id}.srew", "\n".join(content) + "\n"))
        lines = [
            f"{src(i)} {row.branches[j][0]} {decimal(v)}"
            for i, row in enumerate(ix.rows)
            for j, v in enumerate(branch_rewards(r, row))
            if v != 0
        ]
        if lines:
            content = [title, header(len(lines)), *lines]
            files.append(ExportFile(f".{r.id}.trew", "\n".join(content) + "\n"))
    return ExportResult(files, warnings)
