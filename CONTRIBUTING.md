# Contributing

Thanks for your interest! The project is at an early, exploratory stage, and
the file format ([`spec/FORMAT.md`](spec/FORMAT.md)) is the most stable part.

## Repository layout
| Path | What |
|---|---|
| `spec/` | Normative file-format spec, JSON Schema, example models |
| `docs/` | Product requirements (`SPEC.md`) and architecture decision records (`adr/`) |
| `web/` | Browser editor (Vite + React + TypeScript + React Flow) |
| `python/` | Python package `mdpdesigner` (loader, arrays, simulator, exporters) |

## Development
```bash
# web editor
pnpm -C web install
pnpm -C web dev        # http://localhost:5173

# python package
cd python
uv sync
uv run python -c "import mdpdesigner"
```

## Changing the file format
Any change to `spec/FORMAT.md` or the schema needs an issue first. The change
must also:
- bump `version`: minor for additive changes, major for breaking ones;
- update the schema, the TypeScript types (`web/src/core/types.ts`) and the
  Python model (`python/src/mdpdesigner/model.py`) in the same PR;
- come with a migration function if the change is breaking.

Record any non-obvious design decision as a new ADR in `docs/adr/`.

## Style
- TypeScript: ESLint config in `web/`. Keep `web/src/core` free of React imports.
- Python: `ruff check` and `ruff format`.
