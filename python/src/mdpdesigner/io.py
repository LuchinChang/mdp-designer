"""Reading ``.mdp.json`` files."""

from __future__ import annotations

import json
from os import PathLike
from pathlib import Path
from typing import Any

from .model import (
    Action,
    Branch,
    BranchReward,
    Choice,
    Document,
    Label,
    Model,
    Property,
    RewardStructure,
    State,
    parse_number,
)

SUPPORTED_MAJOR = 1


class FormatError(ValueError):
    """The input is not a structurally valid mdp-designer document."""


def load(path: str | PathLike[str]) -> Document:
    """Load a ``.mdp.json`` file."""
    return from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def loads(text: str) -> Document:
    """Parse a ``.mdp.json`` document from a string."""
    return from_dict(json.loads(text))


def from_dict(data: dict[str, Any]) -> Document:
    if data.get("format") != "mdp-designer":
        raise FormatError('not an mdp-designer document (missing "format": "mdp-designer")')
    version = data.get("version", "")
    if not isinstance(version, str) or version.split(".")[0] != str(SUPPORTED_MAJOR):
        raise FormatError(f"unsupported format version: {version!r}")

    m = data["model"]
    if m.get("type") not in ("mdp", "dtmc"):
        raise FormatError(f"unsupported model type: {m.get('type')!r}")

    initial = m["initial"]
    if isinstance(initial, str):
        initial = {initial: 1}

    model = Model(
        type=m["type"],
        states=[
            State(s["id"], s.get("name"), s.get("description"), list(s.get("labels", [])))
            for s in m["states"]
        ],
        initial={k: parse_number(v) for k, v in initial.items()},
        choices=[
            Choice(
                id=c["id"],
                state=c["state"],
                action=c.get("action"),
                branches=[Branch(b["target"], parse_number(b["prob"])) for b in c["branches"]],
            )
            for c in m["choices"]
        ],
        actions=[
            Action(a["id"], a.get("name"), a.get("description")) for a in m.get("actions", [])
        ],
        labels=[Label(lab["id"], lab.get("description")) for lab in m.get("labels", [])],
        rewards=[
            RewardStructure(
                id=r["id"],
                description=r.get("description"),
                state={k: parse_number(v) for k, v in r.get("state", {}).items()},
                choice={k: parse_number(v) for k, v in r.get("choice", {}).items()},
                branch=[
                    BranchReward(b["choice"], b["target"], parse_number(b["value"]))
                    for b in r.get("branch", [])
                ],
            )
            for r in m.get("rewards", [])
        ],
        properties=[
            Property(p["id"], p["formula"], p.get("kind"), p.get("description"))
            for p in m.get("properties", [])
        ],
    )
    return Document(
        model=model,
        version=version,
        metadata=dict(data.get("metadata", {})),
        layout=dict(data.get("layout", {})),
    )
