---
"@viewstem/core": minor
---

Require a matching port with `required: true` for each required TypeScript input in `registerAction`. Treat Value ports with defaults as optional in inferred handler inputs. View events now apply those defaults only when the caller omits the input key.

`updateResource` rejects changes to a registered code Action's input or output contract with `TYPE_CONTRACT_MISMATCH`, including changes made through a referenced Type. Register the new contract and handler under a new Action ID, update its callers, and apply the configuration through a new View or `view.replace()`.
