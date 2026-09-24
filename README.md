# mdp-designer

**A visual editor for Markov decision processes.** You draw states, drag
arrows to create actions and probabilistic transitions, and export the result
for model checkers (PRISM, Storm, JANI) or for RL experiments (NumPy,
Gymnasium).

It is built for researchers in **formal methods** and **reinforcement
learning** who need to:
- visualize an MDP for a paper or a talk;
- hand-craft small benchmark MDPs to stress-test an algorithm, such as end
  components, zero sinks or hard exploration instances;
- share models as plain, diff-friendly files.

> **Status: pre-alpha.** The file format (v1.0) is specified. The editor
> currently renders models read-only; interactive editing comes next. See the
> [roadmap](docs/SPEC.md).

## How MDPs are drawn

```
 (s0) ──a──▶ ● ──0.7──▶ (s1)
             └──0.3──▶ (s0)
```
Each nondeterministic choice `(s, a)` is a small **action dot**, and its
probabilistic branches fan out from the dot. To create a choice, drag from a
state to a target state, which can be the state itself. To add a branch, drag
from the dot. In DTMC mode there are no dots and arrows go directly from state
to state. See [ADR 0001](docs/adr/0001-choice-nodes.md).

## File format

Models are stored as `.mdp.json`. The `model` part holds the mathematics
(states, actions, choices, labels, rewards, PCTL/LTL properties). The
`layout` part holds positions. Probabilities can be exact rationals (`"1/3"`).

- Specification: [`spec/FORMAT.md`](spec/FORMAT.md)
- JSON Schema: [`spec/schema/mdp-designer.v1.schema.json`](spec/schema/mdp-designer.v1.schema.json)
- Examples: [`spec/examples/`](spec/examples/)

## Getting models into your experiments

| Target | How | Status |
|---|---|---|
| Python | `pip install mdp-designer`, then `mdpdesigner.load("model.mdp.json")` | loader ✅ |
| NumPy | `model.to_sparse()` / `model.to_dense()` | planned |
| Gymnasium | `pip install mdp-designer[gym]` → `MDPEnv` with action masks | planned |
| PRISM / Storm | export `.prism` + `.props`, or explicit `.tra/.lab` | planned |
| JANI | export `.jani` (also works with QVBS-style tooling) | planned |
| Papers | SVG / PNG / TikZ export | planned |

## Repository layout

```
spec/     file-format spec, JSON Schema, example models
docs/     product requirements (SPEC.md) and design decisions (adr/)
web/      browser editor — Vite + React + TypeScript + React Flow
python/   Python package `mdpdesigner`
```

## Development

```bash
pnpm -C web install && pnpm -C web dev      # editor at http://localhost:5173
cd python && uv sync                         # Python package
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Citing

If this tool helps your research, please cite it using [`CITATION.cff`](CITATION.cff).

## License

[MIT](LICENSE)
