# Status and handoff

Read this first when you resume the project. It records where the work stands and the context that is not in the spec, design or plan. Update it at the end of every slice.

## State on 2026-09-29

- Planning is finished. No slice has merged.
- PR #30349 (the binder) merged on 2026-09-25 and PR #30381 (block specs) on 2026-09-28. Nothing outside the project blocks it.
- Slice 2a (TML-3296) is implemented on branch `tml-3296-sql-expression-data-type`, which also carries these project files. It is not pushed and has no pull request yet. The implementer's report is in the dispatch conversation; the verification logs are under the gitignored `wip/v/`.
- Slice 2a changed nothing in `examples/` or `packages/3-extensions/`, so `check:upgrade-coverage` required no declaration; the two fragments under `upgrade-instructions/pending/sql-is-a-data-type/` are the ones design section 20 names.
- The three publish-shell tarball tests (`all-shells-tarball`, `module-identity`, `cross-shell-tarball`) fail on this machine because `pnpm install` in the scratch project refuses `@vercel/detect-agent@1.2.5` as a "high-risk trust downgrade". That is the registry, not this branch. Check them in CI.

## Slice order and tickets

| Order | Plan slice | Ticket | State |
| --- | --- | --- | --- |
| 1 | 2a: `sql` is the data type `sql/expression` | TML-3296 | Implemented; PR not opened |
| 2 | 2t: an argument declares the data type it receives | TML-3367 | Waiting for 2a |
| 3 | 2b: the six places take `sql` literals | TML-3288 | Waiting for 2t |
| 4 | 3: the TypeScript builder takes `sql` values | TML-3289 | Waiting for 2b |
| On the side | 1: line comments in raw SQL | TML-3287 | Not started; depends on nothing |
| Last | 4: migration files write template literals | TML-3290 | Waiting for 1 |
| Stretch | 5: migration files write `sql` values | TML-3297 | Waiting for 3 and 4 |

TML-3282 was the decision ticket and is done.

## Why slices 2a and 2t go first

The Linear project "Data types own column types" finishes ADR 254. Its last slice types default-function arguments by data type, for example the `8` in `@default(nanoid(8))`. Will decided on 2026-09-29 that this project builds the argument type `dataTypeValue` and that project reuses it. That project is blocked until TML-3367 merges. Its requirements are listed in TML-3367 and in design-notes decision 14.

Two notes were sent to that project's agent:

- `dataTypeValue` must not be a direct arm of `oneOf`. Inside a function call signature it works, and slice 2t tests a function call that is an arm of `oneOf`.
- `dataTypeValue` throws an internal error when the stack does not register the named data type. A family spec must choose the type id from the stack, not hard-code one target's id.

## The design is older than `main`

The design was written against commit `47d727b70d`, the head of PR #30381 before its author rebuilt it. After that, 57 files changed in `psl-parser`, the SQL PSL interpreter, the language server and the Postgres policy code. Only section 9.1 was rewritten for the merged code. So each slice starts by re-checking its own design sections against `main`:

- A file, line or function that moved: correct the design and continue.
- A difference in behaviour or in a type the design depends on: stop and raise it with Will.

What is known about `main` on 2026-09-29 (commit `d13613775f`):

- Policy blocks are `structBlock` specs in `packages/3-targets/3-targets/postgres/src/core/authoring.ts`. `using` and `withCheck` are `optional(str())`. The design calls them `fixedBlock` specs in one place; the name on `main` is `structBlock`.
- Block values are parsed by `interpretExtensionBlocks` in `psl-parser/src/block-spec/interpret.ts`. Only the SQL interpreter (`contract-psl/src/interpreter.ts`, about line 2104) and the Mongo interpreter (about line 1190) call it. The symbol table no longer parses block values, so the language server does not parse them either.
- `BlockSpecContext` is `{ symbols, block }`. It has no `dataTypes` field. Slice 2b adds it.
- `interpretExtensionBlocks` takes a `binder`. The design does not mention the binder.
- The largest changes are in `contract-psl/src/interpreter.ts`, `psl-column-resolution.ts` and `psl-field-resolution.ts`, which slices 2a, 2t and 2b edit.

## Related work outside the project

- **TML-3302** (date and time defaults are stored as different text by PSL and TypeScript) is not addressed by this project. It may edit `readDataTypeDefault` in `contract-psl/src/data-type-default.ts`, which slice 2t moves into the framework. If it does, it should merge before slice 2t, or slice 2t rebases on it.
- **TML-3286** removes `.defaultSql()` at 8.0.0. It is a non-goal here.
- The open PRs that touch the same files are listed at the end of [plan.md](plan.md). That list is from 2026-09-25; check it again before each slice.

## Proposals discussed but not decided

Will has not agreed to these. Do not act on them without asking.

- Run slice 3's `SqlExpression` class in parallel with slice 2b, and add the parity fixture in whichever merges second.
- Move slices 4 and 5 out of this project into their own tickets, so the project closes when slice 3 merges.
- Skip a second full verification pass of the design.

## Rules from Will that apply to every slice

- Plain strings are refused everywhere; there is no fallback.
- A `sql` literal is a value of a data type. Other literals are refused by the cast rule, never by a syntax check. Prisma never parses the SQL inside a literal.
- Checks on SQL content, such as "no SELECT", belong to the place that receives the value. Only `@default` has them.
- The tag is `sql` only. There is no `pg.sql` or `sqlite.sql`.
- The implementer has no design freedom. The design fixes every name, signature and message.
- Commits carry no AI attribution lines. Never amend, squash, rebase or force-push. Pull request titles are "TML-NNNN: sentence".

## History

- 2026-09-24: decisions made with Will; first design; architect and principal-engineer reviews (in [research/](research/)); design rewritten.
- 2026-09-25: design verification found 23 issues ([research/design-verification.md](research/design-verification.md)); 21 applied. Project put on hold until PR #30349 and PR #30381 merged.
- 2026-09-29: both merged. Section 9.1 rewritten to one path, which closed the last two findings. Slice 2t split out of slice 2b as TML-3367. Slice 2a started and implemented; design file and line references corrected against `main`.
