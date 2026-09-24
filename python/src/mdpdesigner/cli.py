"""Command line: ``mdp-designer convert FILE --to prism|jani|explicit``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .export import ExportResult, export_explicit, export_jani, export_prism
from .io import load


def _base_name(path: Path) -> str:
    name = path.name
    for ext in (".mdp.json", ".json"):
        if name.endswith(ext):
            return name[: -len(ext)]
    return path.stem


def _convert(args: argparse.Namespace) -> int:
    doc = load(args.file)
    result: ExportResult
    if args.to == "prism":
        result = export_prism(doc)
    elif args.to == "jani":
        result = export_jani(doc, rewards=not args.no_rewards)
    else:
        result = export_explicit(doc)
    out_dir = Path(args.out_dir) if args.out_dir else args.file.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    base = _base_name(args.file)
    for f in result.files:
        path = out_dir / (base + f.suffix)
        path.write_text(f.content, encoding="utf-8")
        print(path)
    for w in result.warnings:
        print(f"warning: {w.code + ' ' if w.code else ''}{w.message}", file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mdp-designer", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    convert = sub.add_parser("convert", help="export a .mdp.json model to another format")
    convert.add_argument("file", type=Path, help="the .mdp.json file")
    convert.add_argument("--to", required=True, choices=["prism", "jani", "explicit"])
    convert.add_argument(
        "-o", "--out-dir", help="directory for the output files (default: next to FILE)"
    )
    convert.add_argument(
        "--no-rewards",
        action="store_true",
        help="JANI only: leave out reward structures (for QUASAR, whose state would "
        "otherwise include the last edge reward)",
    )
    args = parser.parse_args(argv)
    if args.no_rewards and args.to != "jani":
        parser.error("--no-rewards only applies to --to jani")
    try:
        return _convert(args)
    except (OSError, ValueError, KeyError) as e:
        print(f"mdp-designer: error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
