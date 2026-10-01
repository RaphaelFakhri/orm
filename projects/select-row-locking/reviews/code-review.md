# Code review: row locking clauses on a select

## Subagent IDs

- Implementer: abb54d8e663e6f3c1 (Opus), spawned 2026-09-30 for D1, lost in the machine crash during D4 validation. Replaced by acb86568713bc4f82 (Opus), spawned 2026-09-30, which carried slice 1 D4 through slice 2 D3 and stalled twice (no progress for 600 s) during the slice 2 drive-review fix round on 2026-10-01 with commit 1 half-built on disk. Replaced by ae47e69e7cc1c0c61 (Opus) for the rest of that round; resume that one for later dispatches.
- Reviewer: a338d09d811f0797f (Opus), spawned 2026-09-30 for D1; resume for every later review.

## Scoreboard

| Dispatch | Round | Verdict |
|---|---|---|
| D1 | 1 | SATISFIED (0 findings) |
| D2 | 1 | ANOTHER ROUND NEEDED (3 findings: 2 should-fix, 1 low) |
| D2 | 2 | SATISFIED (D2-F1, D2-F2, D2-F3 closed) |
| D3 | 1 | SATISFIED (0 findings) |
| D4 | 1 | ANOTHER ROUND NEEDED (2 findings: 1 should-fix, 1 low) |
| D4 | 2 | SATISFIED (D4-F1, D4-F2 closed); slice 1 dispatch loop closed |
| D5 | 1 | SATISFIED (branch review SD01-SD09 and F01-F06 confirmed closed) |

### Slice 2 (TML-3415, branch `tml-3415-row-locking-orm-client`)

| Dispatch | Round | Verdict |
|---|---|---|
| S2-D1 | 1 | SATISFIED (0 findings) |
| S2-D2 | 1 | ANOTHER ROUND NEEDED (2 findings: 2 should-fix) |
| S2-D2 | 2 | SATISFIED (S2-D2-F1, S2-D2-F2 closed) |
| S2-D3 | 1 | SATISFIED (0 findings); slice 2 dispatch loop closed |
| S2-D4 | 1 | SATISFIED (branch review SD01-SD05 and F01-F04 confirmed closed) |

## Findings log

- D1 round 1: no findings.
- [closed in `b84be78549`] D2-F1 (should-fix), `packages/3-targets/6-adapters/postgres/src/core/descriptor-meta.ts:151-176`. The capability list is written out twice: once in the new `capabilities.ts`, which the runtime adapter profile and the renderer check use, and again inline in `descriptor-meta.ts`, which the emitted contract and so the builder types come from. Before this PR the two copies could drift harmlessly, because nothing at run time read the profile list. Now the renderer refuses a clause based on the profile list, so a drift gives a builder method that type-checks and then throws at run time. The test at `select-locking.test.ts:84-87` checks only that both contain the seven new keys, not that the lists are equal. Fix: declare `postgresAdapterCapabilities` with `as const` (literal `true` types, as `descriptor-meta.ts` needs) and set `capabilities: postgresAdapterCapabilities` in `descriptor-meta.ts`. Run `pnpm fixtures:check` to confirm the emitted contracts do not change. If the types make that impossible, add a test that asserts the two full lists are equal.
- [closed in `b84be78549`] D2-F2 (should-fix), `packages/3-targets/6-adapters/sqlite/src/core/adapter.ts:236-242` and `docs/reference/error-reference.md:1090-1093`. SQLite refuses a lock with a new code, `RUNTIME.LOCK_UNSUPPORTED`. The same renderer already uses `RUNTIME.AST_UNSUPPORTED` with `meta: { target: 'sqlite', feature }` for every other feature SQLite cannot render (`adapter.ts:346`, `:353`). The Postgres refusal in this PR also uses `RUNTIME.AST_UNSUPPORTED`, so the two targets refuse the same situation with two different codes. Fix: throw `RUNTIME.AST_UNSUPPORTED` with `meta: { target: 'sqlite', feature: 'locking-clause' }`, remove the `RUNTIME.LOCK_UNSUPPORTED` entry, add the locking case to the `RUNTIME.AST_UNSUPPORTED` description with its payload, and update the SQLite test.
- [closed in `b84be78549`] D2-F3 (low), `packages/3-targets/6-adapters/postgres/test/select-locking.test.ts:144-152` and `packages/3-targets/6-adapters/sqlite/test/select-locking.test.ts:65`. The refusal tests print as "LockingClause { …(4) } without sql.forUpdate" (see `wip/d2-red-pg.txt`), so the name starts with a stringified object. Pass each case as an object and name it with `$group.$flag`, or build the clause inside the test body. The SQLite test "reports no locking capability flags" checks only `sql.forUpdate`. Make it check that none of the seven keys is reported.
- D3 round 1: no findings.
- [closed in `40c9e42888`, partly applicable: only the `LIMIT 1` half applied; a single-table builder select renders unqualified `identifier-ref` columns, see `wip/d4c-render-sql.txt`] D4-F1 (should-fix), `docs/reference/query-patterns.md:183` and `:201`. The rendered-SQL comments under the two examples are not what the builder produces. The Postgres renderer qualifies every column with its table (`"product"."id" AS "id"`, `WHERE "product"."id" = $1`; see `packages/3-targets/6-adapters/postgres/test/adapter.test.ts:116` and `packages/3-extensions/sql-orm-client/test/order-by-relation.test.ts:76`). A number passed to `.limit(1)` stays a number (`query-impl.ts:90-93`) and renders as `LIMIT 1` (`sql-renderer.ts:206`), not `LIMIT $2`. The comments copy the design's illustrative SQL, which has the same errors. Fix: build both example queries against the real Postgres adapter, for example in a scratch test or a unit test, and paste the SQL it produces. Expect something like `SELECT "product"."id" AS "id", "product"."stock" AS "stock" FROM "public"."product" WHERE "product"."id" = $1 FOR UPDATE` and `... ORDER BY "job"."createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`.
- [closed in `40c9e42888`] D4-F2 (low), `test/integration/test/sql-builder/lock.test.ts:46`. The test is named "forUpdate of an alias on a joined select locks that table only", but it only checks the returned row. With one connection it cannot show which table was locked, and the brief said this file must not claim to prove lock behaviour. Rename it to what it checks, for example "forUpdate of an alias on a joined select returns the joined row".

- D5 (branch review in `reviews/branch-tml-3402/`): all fifteen findings confirmed closed.
  - SD01, SD02 and SD09: closed in `213f7739cf`. The rule is gone from the `SelectAst` constructor. The builder's `assertLockable` refuses `distinct`, `distinctOn`, `groupBy` and `having` under `ORM.LOCK_INCOMPATIBLE` with `meta.conflict`. `RUNTIME.LOCK_INCOMPATIBLE` is gone from the code and from the error reference. The slice spec names the code that ships.
  - SD03, F01 and SD04: closed in `4374fb57cf`. `renderLoweredSql` takes a required `CapabilityMatrix`, with no default and no import from the renderer to the adapter. All callers pass it. The Postgres refusal's `meta` has `feature: 'locking-clause'`. The runtime adapter passing the constant is an accepted deviation.
  - SD05: closed in `1651835eb0` (`waitPolicy` / `LockWaitPolicy`).
  - SD06: closed. It is recorded in the design's alternatives (`design.md:322`).
  - SD07: closed in `98915a4daf`. `isAggregateProjection` is in relational-core `ast/util.ts` with a test, and the builder uses it. `budgets.ts` is unchanged, which is an accepted deviation.
  - SD08, F02, F03, F04, F05 and F06: closed in `6bafdb3161`. SD08: the suite name and a `STATUS.md` line now state what PGlite can and cannot prove. F02: the extension note has two entries. F03: rendered SQL is asserted with `toBe`, and the `xmax` check shows the lock is held. F04: the test names use `$method` and `$group`. F05: `ORM.CAPABILITY_MISSING`, `ORM.ARGUMENT_INVALID` and the README are updated. F06: two new `@ts-expect-error` cases cover a renamed table and a qualified name.

- S2-D1 round 1: no findings.
- [closed in `9a0dcbcbc6`] S2-D2-F1 (should-fix), `packages/3-extensions/sql-orm-client/test/select-locking-plan.test.ts:34-45` and every refusal test that uses it. The `refusal()` helper catches the error with a manual `try`/`catch` and returns it, and the tests compare the result with `toEqual`. The rule `.agents/rules/prefer-to-throw.mdc` forbids that pattern, and the brief asked for `toThrow` on the structured error's `meta`. Fix: assert each case where it throws. Use `expect(() => lockedPosts().groupBy('userId')).toThrow(lockIncompatible('groupBy'))` for a synchronous throw, `await expect(lockedWhere().update(...)).rejects.toThrow(lockIncompatible('mutation'))` for a promise, and `await expect(lockedUsers().include('posts').all().toArray()).rejects.toThrow(...)` or the synchronous form for iterable terminals, whichever the code actually does. Then delete the helper.
- [closed in `9a0dcbcbc6`] S2-D2-F2 (should-fix), `packages/3-extensions/sql-orm-client/test/select-locking-plan.test.ts:115-128`. Polymorphism has only one test. It matches a regex rather than the whole SQL, and it does not show that the variant join is present and left out of `OF`. The case that most needs `OF` is not tested at all. That case is the base polymorphic model with no `variant()`: MTI variant tables are then joined with `LEFT JOIN` (`query-plan-source.ts:322-328`), and Postgres refuses to lock the nullable side of an outer join unless `OF` names only the base table. Fix: assert whole SQL with `toBe` for `Task.forUpdate()` (the `LEFT JOIN "public"."features"` form), for `variant('Feature')` (MTI, `INNER JOIN`), and for `variant('Bug')` (STI, same table), each ending `FOR UPDATE OF "tasks"`.

- S2-D3 round 1: no findings.

- S2-D4 (branch review in `reviews/branch-tml-3415/`): all nine findings confirmed closed.
  - SD01, SD02 and SD03: closed in `c64fd4155a`. `relational-core/src/ast/locking.ts` holds `LockConflict`, `lockIncompatible`, `lockStrengthCapabilities`, `lockOptionCapabilities`, `missingCapability`, `LockWaitOptions<Capabilities>`, `LockWaitRequest` and `lockWaitPolicyOf`. The builder, the ORM and the Postgres renderer import them, and no per-package copy remains. `OrmLockOptions` is deleted. Both conflict functions return `LockConflict`. `includeRefinement` is a value of its own. `LockedTerminalConflict` is renamed `LockDroppingCall`, and its parameter is now `call`.
  - SD04 and F01: closed in `3cd6f18b74`. `#lock` throws `includeRefinement` when called in refinement mode. `includeCarriesLock` now walks `nested`, the scalar state and every `combine` branch state recursively. `wip/s2d4-red-walk-only.txt` shows that the nested-under-combine-scalar case failed before the walk change.
  - SD05: closed in `5d0438daba`. The design table lists every ORM refusal with its conflict value.
  - F02: closed in `b938b34861`. The connection is released in an outer `finally`, and a transaction without `rollback` throws.
  - F03: closed in `b938b34861`, in `lock-capability.test.ts`. That file is where the widening was, so the pushback is right. `postsWith` is generic now. Each method case has its own `@ts-expect-error` on a contract that lacks only that flag. Each option case first calls `forUpdate()` with no arguments and no expectation, which proves the method itself is not gated out, so the `@ts-expect-error` covers only the option.
  - F04: closed in `b938b34861`. `ORM.CAPABILITY_MISSING` names the ORM collection methods and says the ORM never raises it for `sql.lockOf`.

## Round notes

### D1 round 1 (commit `d07ee9f26c`)

What I checked:

- The node against the design section "What the tree holds". `LockStrength` and `LockWait` have the design's values. `LockingClause` has `strength`, `of` and a single `wait`, a `kind`, calls `this.freeze()` like every neighbouring node in `types.ts`, copies and freezes `of`, and turns an empty `of` into `undefined`. `LockingClause.of(strength, { of?, wait? })` matches the style of `OrderByItem.asc(expr, { nulls? })`. The constructor input `LockingClauseOptions` uses required keys typed `| undefined`.
- Every place that lists `SelectAst` fields. `git grep "new SelectAst("` finds only `types.ts`, `builder-base.ts`, `where-binding.ts` and one test. In `types.ts` the constructor, `from()`, `noFrom()`, `toOptions()` and `rewrite()` all carry `locking`, and every `with...` method goes through `toOptions()`. No other code copies `toOptions()`. There is no serializer, equality or hashing helper for the select node. The runtime middleware (`lints.ts`, `budgets.ts`, `decoding.ts`) reads the tree but never rebuilds it. `collectColumnRefs` and `collectParamRefs` are right to skip `locking`, because it holds names, not expressions.
- The refusal covers exactly `distinct`, `distinctOn`, `groupBy` and `having`, and only when `locking` is non-empty. Its meta key `node` matches the payload documented for `RUNTIME.AST_INVALID` in `docs/reference/error-reference.md`.
- Tests. The saved red run (`wip/d1-red.txt`) fails when the file loads, because `LockingClause` did not exist, so it does not show each test red on its own. I checked each test by reading it: each would fail if its behaviour broke (a `with...` or `rewrite()` that dropped `locking`, a missing refusal, a missing freeze or copy). Refusals use `toThrow` on the code, message and meta. Clauses are built with `LockingClause.of`. No description uses "should". The file is 199 lines.
- Repo rules: no `any`, no bare `as` apart from `as const`, one terse doc comment, no import extensions, no new reexports. The saved lint output shows only existing `no-bare-cast` notices in other files.
- The two touches outside the package are one line each: `locking: undefined` in the builder's `buildSelectAst` (D3 fills it) and `locking: ast.locking` in the ORM's `bindSelectAst`, which carries the field through.

Observations that need no action in this dispatch:

- `LockingClause` does not check `strength` and `wait` at run time, while `OrderByItem` checks `dir`. A bad string can reach it only through a cast. The D2 renderer check must refuse an unknown strength, not look it up in a map and get `undefined`.
- Nothing refuses a schema-qualified name in `of`. The D3 builder types limit `of` to names in scope, and the renderer quotes each entry as one identifier, so `public.contact` would render as `"public.contact"`, which Postgres refuses. It would not lock another table.
- No test covers `bindSelectAst` carrying `locking`. That becomes relevant in the ORM slice.

What I did not check: I ran no commands. I relied on the implementer's saved test, typecheck, lint and build output under `wip/d1-*.txt`. I did not review the error code, which the orchestrator already moved to `RUNTIME.LOCK_INCOMPATIBLE` for D2.

### D2 round 1 (commits `58b963a579` and `244d1bc868`)

What I checked:

- The fixtures. The implementer claimed 476 regenerated files. The real number is 469: 243 JSON files and 226 `contract.d.ts` files. The other 12 changed files are source, tests, docs and upgrade notes. I parsed every changed JSON file at `7cf404ca60` and at `244d1bc868`, removed the seven keys from `capabilities`, and compared the results. All 243 files are equal apart from those keys, every file gained them, and every file's `target` is `postgres`. So no hash moved and no SQLite contract changed. In the pretty-printed files and every `.d.ts`, the only added lines are the seven keys and no line was removed. The 10 minified JSON files are covered by the parse check. The files cover examples, apps, extension contract spaces and their migration snapshots, example migration snapshots, and integration and e2e fixtures. `wip/d2-fixtures-check.txt` is clean.
- The default on `renderLoweredSql`'s fourth parameter. This is not a hole today. Every caller renders Postgres: the runtime adapter passes `this.profile.capabilities`, which is the same constant as the default, and the control adapter and the codec testkit render only their own statements, never a lock. No adapter narrows its profile. A future adapter that reuses this renderer with fewer flags would have to pass its own list. With D2-F1 fixed there is one list, so the default is the adapter's real list.
- Rendering. The locking clause comes after `offsetClause`. The clauses are joined in array order. `OF` quotes each name with `quoteIdentifier`, so a dotted name becomes one quoted identifier. Strength and wait go through exhaustive switches ending in `assertNever`, so an unknown value throws and never renders `undefined`. The strength flag is checked before `of`, and `of` before `wait`. The tests cover the four strengths, both waits, `OF` with one and two names, two clauses, order after `LIMIT` and `OFFSET`, and a refusal for each of the seven flags with code, message and meta. The saved red run shows all 16 Postgres tests failing before the change, and the SQLite refusal failing.
- The error code for the Postgres check. `RUNTIME.AST_UNSUPPORTED` fits the design's "an adapter error naming the flag": the entry says what it is for, the meta carries `capability`, and `adapterError` gained the subcode. The SQLite code is D2-F2.
- The upgrade notes follow the format of `engine-pin-moves-to-0-6-2`, with a detection rule and an empty extension declaration. They say the builder "gains four methods", which is not yet true on this branch. It becomes true when D3 lands in the same PR, and it must.
- The render-typescript round-trip failure. The test timed out at 8000 ms in the full adapter run (`wip/d2-postgres-test.txt`) and passes 5 of 5 alone (`wip/d2-postgres-roundtrip.txt`). It tests migration TypeScript rendering, which this change does not touch. It is unrelated.
- Repo rules. No `any`. The only casts are in tests. `requireCapability` avoids a cast with `Reflect.get`. No comments were added. The new test files follow the adapter tests' pattern of importing the contract serializer. Lint, typecheck, `lint:throws` (delta 0) and `check:upgrade-coverage` are clean in the saved output.

What I did not check: I ran no commands. I did not open every one of the 469 fixture files by eye; the parse comparison covers them all.

### D2 round 2 (commit `b84be78549`)

- D2-F1 is closed. `capabilities.ts` declares the list once with `as const`, and `descriptor-meta.ts` imports it. The commit changes no fixture, `wip/d3f-fixtures-check.txt` is clean, and the Postgres typecheck passes.
- D2-F2 is closed. SQLite throws `RUNTIME.AST_UNSUPPORTED` with `meta: { target: 'sqlite', feature: 'locking-clause' }`. The `RUNTIME.LOCK_UNSUPPORTED` entry is gone, the `RUNTIME.AST_UNSUPPORTED` entry names both locking cases and their payloads, and `check:error-reference` passes.
- D2-F3 is closed. The refusal tests are named `without $group.$flag`. The SQLite test checks all seven keys against both the adapter profile and the descriptor metadata.
- The render-typescript round-trip test timed out again in the full Postgres run (two tests this time). It passes 5 of 5 on its own (`wip/d3f-postgres-roundtrip.txt`), so it is unrelated to this work.

### D3 round 1 (commit `2853f1c3c1`)

What I checked:

- The `of` type. `Scope.namespaces` is keyed by the name the query can refer to. That is the bare table name for an unaliased table (`tableToScope(alias, ...)`, where the alias defaults to the table name). For `.as('c')`, `RebindScope` removes the old key and adds `c`, which is right, because Postgres only accepts the alias once one is given. Joins merge the namespaces through `MergeScopes`. Lateral joins and derived tables add their alias as a key. So every name a user can legitimately write is accepted. Inside a lateral subquery the scope also holds the parent's names, but a locked lateral subquery is refused at `buildAst()` anyway.
- The `joined-tables-impl.ts` cast. `LateralBuilder.from` is declared (`types/shared.ts:31-33`) to return `SelectQuery<QC, MergeScopes<ParentScope, Other[typeof JoinOuterScope]>, EmptyRow>`, and at run time the builder already used the merged scope. The old cast target, `SelectQuery<QC, AvailableScope, EmptyRow>`, was wrong but compiled while `SelectQuery` did not care which way the scope varied. The `of` parameter makes that matter, so the old target stopped compiling. The new target matches the declared type, so this is a real fix. Runtime behaviour did not change and no existing test was broken at run time. `lint:casts` delta is 0.
- The aggregate limitation. `buildSelectAst` looks only at top-level projection kinds (`aggregate`, `json-array-agg`, `window-func`). An aggregate or window function nested inside a cast, function call or JSON object is not caught at `build()`. This is safe: Postgres refuses `FOR UPDATE` on any query level that has aggregates or window functions anywhere in it, so the statement fails in the database rather than running without a lock. An aggregate inside a scalar subquery belongs to the subquery's level, so Postgres allows the outer lock, and the builder correctly allows it too.
- `build()` does not go through `buildAst()`: it calls `buildPlan` and then `buildSelectAst`. So `assertNotLocked` in `buildAst()` and `.as()` only affects places that use the query as a subquery (`exists`, `in`, derived tables, lateral joins). No code outside the package calls `buildAst()` on a select query.
- The type tests. `lock.types.test-d.ts` is compiled by the package `typecheck` (the tsconfig includes `test/**/*.ts`). The negative cases use `@ts-expect-error`. `toBeNever` is a real check. The positive `toBeFunction` checks are also real, because expect-type 1.4.0's `Extends` treats `never` specially (`utils.d.ts:97`), so they fail if a method turns into `never`.
- The run-time tests cover each strength, `of`, `nowait` and `skipLocked` on the clause, two calls appending in order, the lock surviving later calls, the aggregate and subquery refusals (through `.as()` and through `exists`), `distinct` and `distinctOn` reaching the caller as `RUNTIME.LOCK_INCOMPATIBLE`, the method capability error for each strength, the option capability error naming each option's flag, and `nowait` with `skipLocked` refused at run time.
- `README.md` and `STATUS.md`. The examples use the real API: `TableProxy.as`, namespaced join fields, `orderBy('id')`, `first()` and `all()`. The row-locking line moved from missing to supported. The error-reference entry for `ORM.LOCK_INCOMPATIBLE` matches the code and its payload.
- Repo rules. No `any`. No new bare `as` (delta 0); the only casts are the widened lateral target and casts in tests. The doc comments on the four methods and on `LockOptions` are short. `BuilderState.locking` is a required key typed `| undefined`. `LockRequest` uses optional keys, which is correct because it mirrors user-facing options. No reexports were added.

Observations that need no action:

- No red run was saved for D3. By reading, the tests would fail without the change, because the methods would not exist.
- The run-time refusal test covers only an `aggregate` projection. It does not cover `window-func` or `json-array-agg`, which share the same code path.
- A lock followed by `groupBy()` is allowed by the types and refused when the tree is built, by the `SelectAst` constructor. No builder test covers that path. The relational-core tests do cover the constructor refusal.

What I did not check: I ran no commands. I relied on `wip/d3-*.txt` and `wip/d3f-*.txt`.

### D4 round 1 (commit `eb4c4fbc10`)

What I checked:

- The integration test. It covers the four strengths, `skipLocked`, `nowait`, `of` on a single table, `of` on an alias in a joined select, and the work-queue shape (`where`, `orderBy`, `limit(1)`, `forUpdate({ skipLocked: true })`) returning one row. Every assertion is a whole-row `toEqual`. Each query runs inside `withTransaction(runtime(), ...)` from `@internal/sql-runtime`, the same helper `test/e2e/framework/test/transaction.test.ts` uses. Nine tests run in two vitest projects, which is where the 18 comes from. Apart from one test name (D4-F2), nothing claims that a second transaction waits.
- The docs section. All four statements from the design's "What the documentation must say" are present and correct: the lock lasts until the transaction ends, prefer `forNoKeyUpdate` for the foreign-key reason, `skipLocked` with `limit` is the work-queue pattern with the sharded-target warning, and `nowait` fails with `55P03`. The API in the examples is real: `db.transaction`, `tx.sql`, `tx.query` (an awaitable result, so `const [row] = await ...` works), `tx.execute` and `update(...).where(...)`. The section says nothing about the ORM. The refusal list matches the code. Only the rendered-SQL comments are wrong (D4-F1).
- The upgrade note describes what exists on the branch: the four builder methods, the seven keys, re-emitting, and no storage-hash change.
- The test additions do what the round notes asked. Window-function and `json-array-agg` projections are refused, tested by calling `buildSelectAst` with a hand-built state, because the builder has no public way to project them. A lock followed by `groupBy()` is refused through the tree. `distinctOn` followed by a lock is refused. The type test adds `groupBy().having().forKeyShare()` as an error.
- The snapshot. The change adds only `"locking": undefined` to seven serialized trees. That snapshot had been stale since D1: D1's checks covered only relational-core, so `test:packages` did not run it.
- The gates. The six failing files in `wip/d4-test-packages.txt` are: the stale snapshot (7 tests, green on rerun in `wip/d4-orm-snapshot-check.txt`); three cli-telemetry tests that hit the 5000 ms timeout (14 of 14 green on rerun in `wip/d4-cli-telemetry-rerun.txt`); and three tarball tests where `pnpm install` failed on "High-risk trust downgrade for @vercel/detect-agent@1.2.5". The tarball failures are environmental, because the branch changes no `package.json` and not the lockfile. `wip/d4b-typecheck.txt` shows 171 of 171 tasks successful. `wip/d4b-lock-integration.txt` passes. Lint (102 of 102), `lint:deps` (no violations), `lint:casts` and `lint:throws` (delta 0), `check:error-reference` and the fixtures check are clean.
- The slice done conditions. Every test the design lists for slice 1 exists and passes. The Postgres and SQLite adapter tests are in `select-locking.test.ts` files rather than `adapter.test.ts`, and the builder tests are in `test/runtime/select-locking.test.ts` rather than `builders.test.ts`, which is fine. The listed commands pass, apart from the environmental and flaky failures above. The `STATUS.md` line has moved. With D4-F1 and D4-F2 fixed, slice 1's done conditions are met.

For the orchestrator: `design.md:227` and `slices/1-sql-builder/spec.md:17` show the same unqualified columns and `LIMIT $2`. They are project documents, so I did not file them, but they are wrong in the same way as D4-F1.

What I did not check: I ran no commands. I relied on `wip/d4-*.txt` and `wip/d4b-*.txt`.

### D4 round 2 (commit `40c9e42888`)

- D4-F1 is closed, and only partly applied. The implementer is right about the columns. `wip/d4c-render-sql.txt` shows that the builder emits `identifier-ref` nodes for a single-table select, and those render unqualified (`SELECT "id" AS "id" ... WHERE "id" = $1`). Only a joined select emits `column-ref` nodes, which render qualified (`"u"."id"`). My evidence came from a different path: adapter tests that build `ColumnRef` nodes by hand, and ORM output. `query-patterns.md:183` matches the shape of the rendered read-then-write statement. `:201` now reads `ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`, which matches the rendered work-queue statement. The corrected lines in `design.md` and the slice spec match the rendered statements too, including the joined `FOR UPDATE OF "c" NOWAIT` form.
- D4-F2 is closed. The test is now named "forUpdate of an alias on a joined select returns the joined row".
- No finding is open. This closes the dispatch loop for slice 1.

### D5 round 1 (commits `213f7739cf`, `4374fb57cf`, `1651835eb0`, `98915a4daf`, `6bafdb3161`)

- Can a lock still reach the renderer alongside `distinct`, `distinctOn`, `groupBy` or `having` without `ORM.LOCK_INCOMPATIBLE`? Not from the builder. Its only `new SelectAst(` is `buildSelectAst` (`builder-base.ts`), and that runs `assertLockable` first. `build()`, `buildAst()` and `.as()` all go through it, for `SelectQuery` and `GroupedQuery` alike. No production code outside relational-core calls `withLocking`, `withDistinct`, `withGroupBy` or `withHaving`. The ORM's `bindSelectAst` only carries `locking` from an existing tree, and a locked builder subquery is refused before it becomes one. A tree built by hand with a lock and `distinct` now reaches the Postgres renderer and fails in Postgres. The design records that decision at line 320. The builder tests cover each conflict: lock then `distinct`, `distinctOn` or `groupBy`; `distinctOn` then lock; and `having`.
- The `xmax` test can fail. It compares the row's `xmax` with this transaction's 32-bit id, `pg_current_xact_id() % 2^32`. Postgres sets `xmax` to the locking transaction's id when `FOR UPDATE` locks a row. The control test runs a plain select in the same way and expects `locked: false`. So if the lock clause were dropped anywhere between the builder and the database, the lock test would fail. Both pass in `wip/d5-lock-integration.txt` (22 = 11 tests in two projects). The other integration tests now also assert the exact SQL the runtime sends, with `toBe`.
- The gates. `test:packages` has 1422 files passing. Three tarball files fail on the `@vercel/detect-agent` trust downgrade. They failed the same way on rerun, and the branch changes no lockfile, so this is environmental. The Postgres adapter's render-typescript round-trip timed out again in the full run and passes 5 of 5 on its own. Typecheck (171 of 171), lint (102 of 102), `lint:deps`, the cast and throw counts (delta 0), `check:error-reference` (361 codes, one fewer since `RUNTIME.LOCK_INCOMPATIBLE` went), fixtures and `check:upgrade-coverage` are clean.
- No new finding. Slice 1 is ready for final verification.

### Slice 2, D1 round 1 (commit `9782f16403`)

What I checked:

- The state and the types. `CollectionState.locking` is a required key typed `| undefined`, set to `undefined` in `emptyState()`. `OrmLockOptions<TContract>` sits beside `OrderOptions`. It is the same three-way union as the builder's `LockWaitOptions`, keyed by `sql.lockNowait` and `sql.lockSkipLocked`, with no `of`. `assertLockCapability` maps each of the six capability names to its own `[group, flag]` pair and throws `ORM.CAPABILITY_MISSING` with `meta: { capability, method }`. The test "checks the flag in its own group" proves that `postgres.forUpdate: true` does not satisfy `sql.forUpdate`.
- The methods. All four go through `#lock`. It checks the method's flag, then refuses `nowait` with `skipLocked` (`ORM.ARGUMENT_INVALID`), then checks the option's flag, then appends `LockingClause.of(strength, { of: [this.tableName], waitPolicy })` through `#clone`. The doc comments follow the `distinctOn` pattern: one sentence, "Requires the ... capability.", and one example on the first method.
- The rest-tuple signature. `lock-capability.test-d.ts` puts `@ts-expect-error` on a call with no arguments (`noForUpdate.forUpdate()`) for each of the four methods, and the package typecheck compiles the file (the tsconfig includes `test`). So a no-argument call without the flag is a type error, which is exactly what the rest tuple is for. Next to it, `noForUpdate.forShare()` compiles, so the gating applies to each method separately. The option cases, `nowait` with `skipLocked` together, and `of` are all negative cases.
- The `of: [this.tableName]` claim holds for the plain read path. `compileSelect` → `buildSelectAst` → `buildDedupedTableSource` returns `tableSourceForContract(contract, namespaceId, tableName)`, and with no alias that is `TableSource.named(tableName, undefined, ns)` (`storage-resolution.ts:60-68`). So `FROM` writes the bare table name. The collection passes `this.tableName` to `compileSelect` (`collection-dispatch.ts:91`).
  - Cursor pagination only adds `where` terms.
  - `distinctOn` sets `withDistinctOn` on the same unaliased source.
  - MTI polymorphism adds joins to the variant tables but leaves the base `FROM` unaliased. Naming `OF` the base table is what keeps Postgres from trying to lock the nullable side of those joins.
  - Only `distinct` wraps the source, as a derived table aliased back to `tableName`.
  - `compileSelectWithIncludes` uses the same `buildSelectAst`, and its `tableRef` is `tableName`.
  - `buildAggregateInput` wraps in a derived table aliased `tableName`.
  - `distinct`, `include` and `aggregate` are all refused in D2, so the claim's boundary is correct.
- The `where-binding` test. `bindWhereExpr` on an `exists` whose subquery has a literal to bind goes through `bindSelectAst`, which rebuilds the select. So the test fails if `where-binding.ts:235` passed `undefined`.
- Repo rules. No `any` and no bare `as` in `src`. The `@ts-expect-error` lines in the run-time test follow `distinct-on-capability.test.ts:31`. Lint is clean (15 existing notices). 90 files and 1020 tests pass, with no type errors.

For D2, not findings in D1:

- The four methods also exist on the nested collection that an `include()` refinement callback receives (`collection.ts:721-733`, `includeRefinementMode: true`). A lock recorded there sits on the child state. D2 must either refuse it or be sure the child's lowering never applies it. If `withLocking` lands in the shared `buildSelectAst`, which the child include selects may also reach, a lock inside a `json_agg` subquery would fail in Postgres. A test for this path belongs in D2.
- `mutation-executor.ts:1233` and `:1257` call `compileSelect` with a collection's state for read-backs. The mutation refusals in D2 must run before those calls.
- `LockRequest` and the wait-policy helper, with the same error text, now exist in both the builder and the ORM. That is small enough to leave, but slice 3 or a later change could move it to relational-core, as SD07 did for the aggregate check.
- `CollectionState` gained a required key, so the extension upgrade note needs an entry (already noted for D3).

### Slice 2, D2 round 1 (commit `ffb1a406bf`)

What I checked:

- Read paths. I grepped `buildSelectAst(`, `SelectAst.from(` and every `compile*` call in `src`:
  - `all()`, `first()` and prepared rows go through `describeExecutionRows` → `compileSelect` or `compileSelectWithIncludes`, and both now call `assertLockCompatible` first.
  - `aggregate()` and `prepared.aggregate` go through `#describeAggregate`, which is guarded before `compileAggregate`.
  - `compileGroupedAggregate` is reached only through `GroupedCollection`, and `groupBy()` is guarded.
  - The `SelectAst.from` sites in `query-plan-select.ts` (include lowering), `query-plan-source.ts` (distinct and aggregate wraps), `query-plan-aggregate.ts`, `query-plan-mutations.ts` and `model-accessor.ts` (relation filters, built from scopes, not collection states) never see a locked state, because either the guard ran first or they do not take a collection state.
  - `mutation-executor.ts:1228` and `:1252` build their read-back states from `emptyState()`.
  - The ORM package has no scalar aggregate terminal such as `count()` on `Collection`. `count()` exists only as an include scalar, and the recursive include walk covers it.
- The mutation refusal. `assertLockCompatible(this.state, 'mutation')` is the first statement in the implementation of all ten terminals (`create`, `createAll`, `createAndCount`, `upsert`, `update`, `updateAll`, `updateAndCount`, `delete`, `deleteAll`, `deleteAndCount`). It runs before argument splitting, capability checks and `withMutationScope`, so no nested create, `createAndCount` split or `upsert` path compiles anything first. The test "update runs no statement, including its read-back" confirms that no execution is recorded.
- `OF "tasks"` for polymorphism. It is correct for every lowering, from reading the code: `variant()` keeps `this.tableName` (the base table) and only adds a discriminator filter. MTI adds `INNER JOIN`s (with `variant()`) or `LEFT JOIN`s (without) to the variant tables, on an unaliased base `FROM`. STI adds no join. A variant model queried directly has no polymorphism info and reads its own table as `FROM`, which is also `this.tableName`. The test coverage for this is thin (S2-D2-F2).
- Wording. `lockWaitPolicyOf` in the ORM and in the builder both produce "`<method>() takes nowait or skipLocked, not both`" with `meta: { method }`. `assertLockCompatible` and the builder's `assertLockable` both produce "A locking clause cannot be combined with <conflict>" with `meta: { conflict }`. So users see one wording.
- Order of checks in `conflictOf`. A locked include is refused even when the parent is unlocked. That also covers the include-refinement point I raised in S2-D1, which is tested for nested, scalar and `combine` branches. `buildSelectAst` applies `withLocking` last. Because both compile entry points refuse a locked include before lowering, the shared `buildSelectAst` never applies a child's lock.
- The error-reference entry lists the eight `conflict` values and the ORM's raise sites. The saved red run shows all 28 tests failing before the change. The test file is 226 lines, and no name uses "should". Lint is clean, 1048 tests pass, and `check:error-reference` passes.
- `GroupedCollection` built by hand from a locked state. This is acceptable, not a finding. The constructor takes an internal `CollectionState`, the only supported way to get a `GroupedCollection` is `groupBy()`, which is guarded, and building the internal state by hand is outside the public API.

For D3: the integration test should run the base polymorphic query with a lock against PGlite if a polymorphic fixture exists there. Postgres's refusal to lock the nullable side of an outer join happens in Postgres, not in rendering.

### Slice 2, D2 round 2 and D3 round 1 (commits `9a0dcbcbc6`, `18da3f9fa3`, `91dc02fcdd`, `d6bb13320e`)

- S2-D2-F1 is closed. The `refusal()` helper is gone. Each refusal asserts where it happens: `toThrow` for `groupBy`, `distinct` and `distinctOn` (thrown at `.all()`) and for `createAll`, `updateAll` and `deleteAll`; `rejects.toThrow` for the promise terminals, `aggregate` and the include cases (thrown at `toArray()`). Every assertion carries `meta.conflict`.
- S2-D2-F2 is closed. Whole-SQL `toBe` covers the base `Task` (`LEFT JOIN "public"."features"`), `variant('Feature')` (`INNER JOIN`, discriminator filter) and `variant('Bug')` (STI, no join), each ending `FOR UPDATE OF "tasks"`.
- The ORM integration test (`test/integration/test/sql-orm-client/lock.test.ts`). It has nine tests, which run as 18 in two vitest projects.
  - It covers the four methods, `nowait`, `skipLocked`, the work-queue shape, the `xmax` check with its control, and the polymorphic base query with two `LEFT JOIN`s. That last test proves Postgres accepts `FOR UPDATE OF "tasks"` there.
  - Each test asserts the exact recorded SQL (`executions.at(-1).sql`) and the whole row.
  - The transaction is opened with `connection().transaction()` and rolled back in `finally`.
  - The `xmax` query runs through `runtime.query` rather than `tx`, because the ORM scope has no raw-SQL method. That is valid only because the harness uses one client and serialises every statement onto it (`runtime-helpers.ts:99-104`), so the check runs inside the open transaction. If a future harness pooled connections, the lock test would fail, not pass vacuously, because another session's `pg_current_xact_id()` differs.
- The `d6bb13320e` helper change is sound. `PgIntegrationRuntime extends RuntimeQueryable`, whose `connection?()` is optional, and so are `RuntimeConnection.transaction?()`, `release?()` and `RuntimeTransaction.rollback?()` (`sql-orm-client/src/types.ts:178-191`). The old helper derived its type through a method that might be absent, so it did not typecheck. The new one uses the declared optional methods and throws if no connection or transaction opens, so a missing transaction fails loudly. The only silent case is a transaction without a `rollback` method, and the real runtime has one.
- Docs.
  - The ORM examples in `query-patterns.md` render as stated: `WHERE "product"."id" = $1 LIMIT 1 FOR UPDATE OF "product"` has the same shape as the integration test's user query.
  - The page adds the ORM refusal list and the note on `OF` with polymorphism. The four design statements are already on the page.
  - The skill's "Workflow — Transactions" shows both clients and states how long a lock lasts. Pitfall 13 gives the `forNoKeyUpdate` advice correctly.
  - Nothing claims `of` on the ORM, `include` with a lock, or behaviour that was not built. The names are consistent: ORM client, collection, SQL builder.
- Upgrade notes.
  - The app note names the ORM methods, the missing `of`, and the refusals.
  - The extension note adds `collection-state-carries-locking`. `CollectionState` and `emptyState` are both exported from `src/exports/index.ts`, so the advice is usable.
  - Slice 1's correction (no `toOptions()`, which is private at `types.ts:1709`) survived the merge.
- Slice 2's done conditions are met. The plan-level tests live in `select-locking-plan.test.ts` rather than `query-plan-select.test.ts`. The integration file passes. Typecheck (171 of 171), lint, `lint:deps`, the cast and throw counts (delta 0), `check:error-reference` (363 codes), `check:upgrade-coverage` and the fixtures check are clean. `test:packages` has 1449 files passing. The eight failing files are the accepted environmental ones: three tarball trust checks, Supabase, cli-telemetry and the round-trip timeouts. None of them touches this change.

### Slice 2, D4 round 1 (commits `c64fd4155a`, `3cd6f18b74`, `b938b34861`; design `5d0438daba`)

- No message or payload changed. The builder and Postgres adapter tests are unchanged between `d6bb13320e` and `b938b34861` and pass (204 and the adapter suite), so their messages and `meta` are as before. In the ORM, `ormError` is a direct alias of `structuredError`, so moving to the shared `lockIncompatible` and `lockWaitPolicyOf` keeps the error class, code, message text and `meta`. The only deliberate change is the new `includeRefinement` value, which replaces `include` for a lock inside an include. The ORM tests were updated for that, and the error reference documents it with its raise sites.
- Hand-built states are still refused when lowered. The "a locked state an include refinement returns is refused when lowered" tests pass collections that were locked outside refinement mode, and a state injected with `includeRefinementMode: true`. Each test covers the include rows, an include under a scalar reducer, a `combine` rows branch, and an include under a `combine` scalar branch. Each is refused with `includeRefinement` when `toArray()` runs.
- Gates are clean in `wip/s2d4-gate-*.txt`: typecheck 171 of 171, lint, `lint:deps`, casts and throws delta 0, error reference 363 codes, fixtures, upgrade coverage, the package suites (relational-core 658, builder 204, ORM 1059), and both lock integration files. The failures in `test:packages` are the three tarball trust checks and the known Postgres round-trip timeouts, plus two `language-server` files. Those pass alone (`s2d4-gate-language-server-rerun.txt`, 236 tests) and the branch does not touch them.
- No new finding. Slice 2 is ready for final verification.

## Orchestrator notes

- 2026-09-30, after D1: the implementer asked which error namespace to use. Decided `RUNTIME.LOCK_INCOMPATIBLE` with an entry in `docs/reference/error-reference.md`, because ADR 239 closes the namespace list and the neighbouring node errors use `RUNTIME`. Carried into D2 as a fix. Design table amended.

- 2026-09-30, after D2 round 1: accepted D2-F1, F2, F3 as written. F2 changes the SQLite code from `RUNTIME.LOCK_UNSUPPORTED` to `RUNTIME.AST_UNSUPPORTED`; design table amended to match. Fixes carried into the D3 dispatch as a first, separate commit.
- 2026-09-30, after D3: accepted two implementer deviations, the `ORM.LOCK_INCOMPATIBLE` code (the builder has no `SQL_BUILDER` namespace) and refusing a locked subquery at `.as()`/`buildAst()` rather than at the outer `build()`. Design table amended.

## Slice 2 (TML-3415)

Branch `tml-3415-row-locking-orm-client` stacked on slice 1. Same implementer and reviewer resumed.
