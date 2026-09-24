# mdp-designer (Python)

Load MDPs and DTMCs saved by the [mdp-designer](https://github.com/LuchinChang/mdp-designer)
editor (`.mdp.json`, spec in [`spec/FORMAT.md`](../spec/FORMAT.md)).

```python
import mdpdesigner

doc = mdpdesigner.load("simple-reachability.mdp.json")
m = doc.model
print(m.type, len(m.states), "states")
for c in m.choices_of("s1"):
    print(c.action, [(b.target, b.prob) for b in c.branches])  # probabilities are exact Fractions
```

**Status: pre-alpha.** Loading works. These are planned (see [`docs/SPEC.md`](../docs/SPEC.md)):
- validation;
- `to_sparse()` / `to_dense()` NumPy arrays;
- a dependency-free `Simulator`;
- an optional Gymnasium env (`pip install mdp-designer[gym]`);
- PRISM, JANI and explicit exporters;
- a CLI.
