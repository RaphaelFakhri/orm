# Code review: branch tml-3415-row-locking-orm-client

Range: `bot/tml-3402-row-locking-sql-builder...HEAD` (tip `d6bb13320e`), so only slice 2 is in scope. Reviewer persona: principal engineer. As in the slice 1 review, the persona file is outside the worktree and was not read; the review follows the coordinator's probes.

## Summary

The ORM slice does what the slice spec asks. Every path that compiles a select from a `CollectionState` either applies the lock on the outermost select or refuses before any statement runs. `OF "<this.tableName>"` matches the outermost `FROM` on every path that is not refused. All ten mutation terminals refuse a locked collection as their first statement. The integration test asserts the exact SQL and proves the lock is held with an `xmax` check that has a control.

Four findings. One is a real gap: a lock placed on a nested include inside a scalar reducer (`count()`, `sum()` and the like) is neither refused nor rendered, so it is dropped without an error. The other three are small: a test helper that can leak its connection, a misleading `@ts-expect-error` reason, and an error-reference entry that does not name the ORM's locking methods.

Focused runs I did: `select-locking-plan.test.ts`, `lock-capability.test.ts` and `where-binding.test.ts` in sql-orm-client (86 passed). I tried to confirm F01 with an inline script, but the package's imports resolve only under vitest; F01 is from reading the code.

## What looks solid

- Read paths. `compileSelect` and `compileSelectWithIncludes` both call `assertLockCompatible(state)` first, and they are the only callers of the private `buildSelectAst`. `describeExecutionRows` in `collection-dispatch.ts` sends every `all()`, `first()` and prepared read through one of the two; there is no multi-query include strategy that strips `includes` and compiles the parent separately. `aggregate()` is refused on the public method, which the prepared aggregate also goes through. `groupBy()` is refused before a `GroupedCollection` exists, so `compileGroupedAggregate` never sees a lock. The mutation read-backs at `mutation-executor.ts` lines 1233 and 1257 build their states from `emptyState()`. The other `SelectAst.from` sites (include lowering, the distinct wrap, aggregate inputs, mutations, relation filters in `model-accessor.ts`) are built from scopes or run only after the refusal.
- `OF` names. `tableSourceForContract` writes the model's table unaliased, so `OF "<tableName>"` matches on the plain path, with cursor pagination (which only adds `where` terms), and with polymorphism. With MTI and no `variant()`, the variant tables are `LEFT JOIN`ed onto an unaliased base `FROM`, and naming only the base table is exactly what keeps Postgres from refusing to lock the nullable side. `variant()` on an MTI model adds an `INNER JOIN`; on an STI model it adds only a filter. A variant model queried directly has no discriminator, so `resolvePolymorphismInfo` returns `undefined` and the query reads only its own table. The one lowering that renames the `FROM` is `distinct`, which wraps the table in a derived table with a window function (`query-plan-source.ts` lines 242-283), and it is refused before lowering. So is `distinctOn`. Whole-SQL tests cover the plain, cursor, `first()`, MTI base, MTI variant and STI variant cases, and the integration test runs the MTI base case against PGlite.
- Mutations. `assertLockCompatible(this.state, 'mutation')` is the first statement of `create`, `createAll`, `createAndCount`, `upsert`, `update`, `updateAll`, `updateAndCount`, `delete`, `deleteAll` and `deleteAndCount`, ahead of argument splitting, capability checks and `withMutationScope`. Nested-create callbacks receive relation mutators, not collections, so they have no locking methods. The test "update runs no statement, including its read-back" checks that nothing executes.
- Rest-tuple signatures. On a contract without the flag, the parameter list is `never`, so even a call with no arguments is a type error; the type test checks all four methods, and checks that one missing flag does not remove the other methods. A contract typed as the wide `Contract<SqlStorage>` also gets `never`, because `boolean` does not extend `true`. Only a contract typed `any` would let the call compile, and `src` has no `Collection<any>`.
- The `xmax` check. The harness uses one `pg` client and states why (`test/integration/test/sql-orm-client/runtime-helpers.ts` lines 99-106), so `runtime.query` runs inside the open transaction. Under a pooled harness the check would run in another session: `pg_current_xact_id()` would return that session's new transaction id, the comparison would be false, and the test would fail rather than pass without checking anything. The control test ("holds no row lock after a plain read") shows the check can return false.
- The `d6bb13320e` helper change is sound for what it fixes: `connection`, `transaction`, `rollback` and `release` are optional on the declared types, and the helper now throws if no transaction opens instead of failing to compile. See F02 for the two edges it opens.
- The extension upgrade note is accurate. `CollectionState` and `emptyState` are both exported from `packages/3-extensions/sql-orm-client/src/exports/index.ts` (lines 20 and 44), so "start from `{ ...emptyState(), ... }`" is usable advice, and the warning about setting `locking: undefined` while deriving from a locked state is the right one.
- Repo rules. No `any` in `src`; `lint:casts` and `lint:throws` delta 0 (`wip/s2d3-lint-casts.txt`, `wip/s2d3-lint-throws.txt`); `CollectionState.locking` is a required key typed `| undefined`; `LockRequest` uses optional keys because it mirrors user input; doc comments are short and follow the `distinctOn` pattern; refusals use `toThrow` and `rejects.toThrow` with `meta.conflict`; SQL assertions are whole strings; no test name uses "should"; the largest new file is 250 lines.

## Findings

### F01: a lock on an include nested under a scalar reducer is dropped without an error

`packages/3-extensions/sql-orm-client/src/lock-guards.ts` lines 6-16.

Issue: `includeCarriesLock` walks `include.nested` and `rows` combine branches recursively, but checks only the top-level `locking` of a scalar include (`include.scalar?.state.locking`) and of a `scalar` combine branch (`branch.selector.state.locking`). A scalar reducer's state keeps the refinement's own includes, because `#includeScalarReducer` passes `this.state` to `createIncludeScalar` (`collection.ts` lines 345-352). The scalar lowering (`query-plan-select.ts` from line 985) reads only that state's `where`, `distinctOn` and ordering, never its `includes`. So in

```ts
db.orm.public.User.include('posts', (posts) =>
  posts.include('comments', (comments) => comments.forUpdate()).count(),
);
```

the lock is on `comments`, the walk does not reach it, and the lowering ignores it. The query runs without the lock and without an error. The design's rule is that dropping a requested lock silently is the worst outcome; that is why SQLite refuses the clause instead of ignoring it. (The nested include under a scalar is itself ignored today, which is outside this slice; the lock on it is what this slice adds.)

Suggestion: walk the scalar states the same way as the others, and add a refusal test for both shapes.

```ts
function includeCarriesLock(include: IncludeExpr): boolean {
  if (stateCarriesLock(include.nested) || (include.scalar !== undefined && stateCarriesLock(include.scalar.state))) {
    return true;
  }
  return Object.values(include.combine ?? {}).some((branch) =>
    stateCarriesLock(branch.kind === 'rows' ? branch.state : branch.selector.state),
  );
}
```

### F02: the integration helper can leak its connection or leave a transaction open

`test/integration/test/sql-orm-client/lock.test.ts` lines 8-23.

Issue: after `d6bb13320e`, if `connection()` returns a connection but `transaction` is absent, the helper throws before the `try`, so `release()` never runs. And `tx.rollback?.()` does nothing when `rollback` is absent, so the connection is released with the transaction still open. Neither happens with today's harness, which has all four methods, so this is not hiding a failure. But a test helper that assumes the methods exist should say so rather than skip them.

Suggestion: release in an outer `finally`, and treat a missing `rollback` as an error.

```ts
const connection = await runtime.connection?.();
if (connection === undefined) throw new Error('the integration runtime opens no connection');
try {
  const tx = await connection.transaction?.();
  if (tx?.rollback === undefined) throw new Error('the integration runtime opens no transaction it can roll back');
  try {
    return await fn(tx);
  } finally {
    await tx.rollback();
  }
} finally {
  await connection.release?.();
}
```

### F03: the option capability test's `@ts-expect-error` gives the wrong reason

`packages/3-extensions/sql-orm-client/test/lock-capability.test.ts` lines 112-124 (and the same pattern at lines 90-110).

Issue: `postsWith` takes `capabilities: Record<string, Record<string, boolean>>`, so every collection it returns has a contract whose flags are `boolean`, and all four methods take `never`. The `@ts-expect-error` in "an option throws without sql.$flag" is therefore satisfied because `forUpdate` itself is gated out, not because the option is, as the comment says. The run-time assertions are correct, and the option-level type behaviour is covered separately in `lock-capability.test-d.ts`, so nothing is untested. The comment just states a reason that is not the one the compiler uses.

Suggestion: change the comment to "the wide capabilities type gates out every locking method", or make `postsWith` generic as the type test's version is, so the expectation covers only the option.

### F04: the error reference does not name the ORM's locking methods under `ORM.CAPABILITY_MISSING`

`docs/reference/error-reference.md` line 880.

Issue: the entry lists the locking flags only "on the `sql()` builder". The ORM's `forUpdate()`, `forNoKeyUpdate()`, `forShare()` and `forKeyShare()`, and their `nowait` and `skipLocked` options, raise the same code with the same payload (`capability`, `method`), through `assertLockCapability`. The last sentence says the code is raised by both clients, but a reader looking up an ORM locking error will not find the ORM methods named.

Suggestion: change "on the `sql()` builder, the flag a gated method or option needs" to "on the `sql()` builder or an ORM collection, the flag a gated method or option needs", and note that the ORM has no `of` option and so never raises it for `sql.lockOf`.

## Deferred

- `LockRequest` and the wait-policy helper, with the same error text, exist in both the builder and the ORM. They could move to relational-core. Out of scope; the in-loop reviewer noted it for a later change.
- Locking together with `include`, and `of` on the ORM. Out of scope by the design (slice 3, only if asked).
- Porting the Prisma 7 test "high concurrency with SET FOR UPDATE". The design makes this conditional on the suite gaining a real Postgres server, which it has not.
- Mapping SQLSTATE `55P03` to a structured code. Out of scope by the design.

## Already addressed

| Finding | What it was | Closed in |
|---|---|---|
| S2-D2-F1 | Refusal tests caught errors with a manual `try`/`catch` helper instead of `toThrow` and `rejects.toThrow` | `9a0dcbcbc6` |
| S2-D2-F2 | Polymorphism had one regex test; the base MTI query (`LEFT JOIN`), the MTI variant and the STI variant needed whole-SQL tests ending `FOR UPDATE OF "tasks"` | `9a0dcbcbc6` |
| S2-D1 note | Locks inside `include()` refinements (nested, scalar and `combine`) must be refused or never applied | `ffb1a406bf` |
| S2-D1 note | Mutation read-backs must not compile a locked state | `ffb1a406bf` |
| S2-D1 note | The extension upgrade note needs an entry for `CollectionState.locking` | `18da3f9fa3` |

## Acceptance-criteria verification

| # | Acceptance criterion | Source | Result | Evidence |
|---|---|---|---|---|
| 1 | Each method exists only with its flag and throws `ORM.CAPABILITY_MISSING` with `meta.capability` without it (run-time) | spec done conditions; design slice 2 tests | PASS | `lock-capability.test.ts`; ran green |
| 2 | The same, in the types; options gated per flag; `nowait` with `skipLocked` and `of` are type errors | spec done conditions; design slice 2 tests | PASS | `lock-capability.test-d.ts`; `wip/s2d3-typecheck.txt` 171 of 171 |
| 3 | `CollectionState.locking`, `undefined` in `emptyState()`; each method appends a clause `OF` the model's table | spec, chosen design 1-2 | PASS | `types.ts`, `collection.ts` `#lock`; state tests |
| 4 | `buildSelectAst` applies the lock on the outermost select; each method renders `OF` the model's table, after `LIMIT` and `OFFSET` | spec, chosen design 3; design slice 2 tests | PASS | whole-SQL tests in `select-locking-plan.test.ts`, including `first()` and three polymorphic cases |
| 5 | A lock with `include` is refused with `ORM.LOCK_INCOMPATIBLE` | spec, chosen design 4 | WEAK | top-level, refinement, scalar and `combine` cases refused and tested; a lock on an include nested under a scalar reducer is dropped (F01) |
| 6 | A lock with `groupBy`, `aggregate`, `distinct`, `distinctOn` is refused with `meta.conflict` | spec, chosen design 4 | PASS | one test per conflict |
| 7 | All ten mutation terminals refuse a locked collection before any statement | spec, chosen design 4 | PASS | first statement of each terminal; ten tests plus the no-execution test |
| 8 | A lock outside a transaction is not refused | spec, chosen design 5 | PASS | no transaction check in the code path; plan tests run without a transaction |
| 9 | `bindSelectAst` carries `locking` | spec, chosen design 6 | PASS | `where-binding.test.ts` "preserves locking clauses"; ran green |
| 10 | Integration test asserts the rendered SQL, runs the work-queue query in a transaction against PGlite, and checks with `xmax` that the lock is held | spec done conditions | PASS | `wip/s2d3-orm-lock-integration.txt` 18 passed; exact SQL, row, `xmax` with control, polymorphic base query |
| 11 | Docs: ORM examples in `query-patterns.md`; the skill's "Workflow — Transactions" and pitfall; upgrade note names the ORM methods | spec, chosen design 7 | PASS | diffs of the three files (error-reference gap, F04) |
| 12 | `pnpm typecheck`, `lint`, `lint:deps`, `lint:throws`, `lint:casts`, `check:error-reference`, `check:upgrade-coverage`, `fixtures:check` pass | spec done conditions | PASS | `wip/s2d3-*.txt` |
| 13 | `pnpm test:packages` passes | spec done conditions | NOT VERIFIED | `wip/s2d3-test-packages.txt`: 1449 passed, 8 files failed (the Postgres render-typescript round-trip timeout, cli-telemetry, three Supabase files, and three publish-shell tarball files); none touches this change, and the reruns are incomplete |

| Result | Count |
|---|---|
| PASS | 11 |
| WEAK | 1 |
| NOT VERIFIED | 1 |
| FAIL | 0 |
| Total | 13 |
