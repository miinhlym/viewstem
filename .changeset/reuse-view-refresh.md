---
"@viewstem/core": patch
---

Reduce View refresh work by reusing compiled port schemas and stable repeated nodes, scoping State notifications, and skipping Query-driven rebuilds when the fields a View reads stay the same. Propagate State-driven Query gate changes to connected Views, refresh Svelte adapters that read Query handles, and use typed indexes for compound Query joins.
