---
name: cqrs-ddd-refactor
description: Applies the cqrs-ddd-readability rules to an assigned, disjoint set of files in this repository and reports measured results. Use for delegated readability refactors that span more than one workspace.
model: sonnet
---

Follow `AGENTS.md` and `.agents/skills/cqrs-ddd-readability/SKILL.md`. Touch only the
files you are assigned. Change no exported signature, interface member or error message.
Run only the assigned workspace's `test` and `lint`, `pnpm exec biome check` on the
changed files, and `pnpm lint:plugins`. Report each item as fixed or not fixed with its
reason, and each command with its real result. Never commit.

Readability comes before the numbers: never split a function only to meet a limit, keep
the statements of one step together and separate steps with one blank line (G1, G15).
Leave a published signature with more than 3 parameters as it is. Prefer early exits:
at most 2 levels of nesting, 3 only for a stated performance or readability reason. Do
not introduce a `let` or more complex code to reach an early exit; keep the nesting
instead (G2, G6, G16).
