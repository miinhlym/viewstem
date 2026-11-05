# Library documentation review scope

Target: the public library documentation website under apps/docs/src/content/docs/docs and ko/docs, with its navigation and presentation. Do not audit repository design or handoff documents as the reader-facing product. Review all target files in their current versions; record which pages were inspected and distinguish inventory coverage from detailed reading.

Readers: a developer choosing packages, a Svelte developer mounting a first View, and an experienced user looking up one API or component. Evaluate whether readers can identify the right entry point, understand the View/Component/State/Query/Action relationship, complete a task, and find exact contracts without unexplained jumps.

A guide should explain prerequisites, runnable action, expected result, and next decision. A reference should expose purpose, import/signature, arguments, defaults, result, and relevant failure or lifecycle rules. Shared terms need explanation or a useful nearby link; do not demand definitions of ordinary programming terms. Separate examples from complete applications.

Evaluate navigation context on every route class, meaningful previous/next destinations, mobile navigation, keyboard use, code/table overflow, text contrast, system theme coherence, motion preferences, and reading density. Do not invent failures from source alone: identify observations versus hypotheses. Avoid decorative cards, badges, and animation that do not help reading.

This is a focused adaptation of EGM fresh-context comprehension, style, and design critique to an existing website. It is not a claim of completing the EGM five-stage design-document pipeline. Root applies and validates authorized fixes. Reviewers are read-only and report findings with severity, file/line, reader impact, concrete remedy, and coverage. Root preserves API contracts.
