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

Export to PRISM, JANI or the explicit format, from Python or the command line
(the output is identical to the web editor's File → Export):

```python
from mdpdesigner.export import export_jani

result = export_jani(doc)              # rewards=False for QUASAR
open("model.jani", "w").write(result.files[0].content)
```

```bash
mdp-designer convert simple-reachability.mdp.json --to prism     # also: jani, explicit
```

**Status: pre-alpha.** Loading and export work. These are planned (see [`docs/SPEC.md`](../docs/SPEC.md)):
- validation;
- `to_sparse()` / `to_dense()` NumPy arrays;
- a dependency-free `Simulator`;
- an optional Gymnasium env (`pip install mdp-designer[gym]`);
- `mdp-designer validate` and `--to npz`.
