# rename-hints

A `@@hint(was: "...")` / `@hint(was: "...")` attribute in the contract source tells the migration planner that a model or field used to have another storage name, so a rename plans as a rename instead of a drop and a create, with nothing hand-written.

- [`spec.md`](./spec.md) — purpose, settled decisions, cross-cutting requirements, project DoD.
- [`plan.md`](./plan.md) — slice sequencing.
- [`design-notes.md`](./design-notes.md) — the reasoning behind each decision and the alternatives rejected.
- **Linear:** [Rename hints in the contract source](https://linear.app/prisma-company/project/rename-hints-in-the-contract-source-7626c0107cd9) · plan issue [TML-3421](https://linear.app/prisma-company/issue/TML-3421) · **Branch:** `tml-3421-rename-hints`

Transient project artifact. Deletes at close-out; the durable decisions land as an ADR and in the Data Contract and Migration System subsystem docs.
