---
"@viewstem/core": minor
"@viewstem/ui": minor
"@viewstem/svelte": minor
---

Unify the DOM and Svelte host APIs around a synchronous mount handle and explicit application completion. This pre-1.0 release changes View creation, mounting, registration, and disposal signatures. Core prepares Registry and State changes together and handles URL cleanup after the View commits.

The browser UI package exports the shared renderer types and ships declarations for the built-in catalog and stylesheet import. Mount errors distinguish invalid targets from reserved targets and identify literal inputs that fail port validation.

Svelte's existing `ViewstemView` can create and own a View from `source` and initial `inputs`. `ViewstemViewProps` still describes borrowed Views. Types inferred from the component itself include both forms.
