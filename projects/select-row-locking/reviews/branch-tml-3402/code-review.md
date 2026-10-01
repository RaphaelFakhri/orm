# Code review: branch tml-3402-row-locking-sql-builder

Range: `origin/main...HEAD` (14 commits, tip `40c9e42888`). Reviewer persona: principal engineer. The persona file under the home directory was not read, because the worktree boundary forbids reading outside the worktree; the review follows the brief's probes instead.

## Summary

The slice does what the design and the slice spec ask. The syntax tree carries `LockingClause`, the Postgres renderer prints it after `OFFSET`, SQLite refuses it, the adapter reports seven flags from one list, and the builder exposes the four methods under those flags in both the types and at run time. Every path I traced that turns a builder query into a subquery goes through `as()` or `buildAst()`, and both refuse a lock. Every `with...` method and `rewrite()` rebuilds through the constructor, so the constructor's refusal of `distinct`, `distinctOn`, `groupBy` and `having` holds on every path. The `of` names are escaped by `quoteIdentifier`, so they cannot inject SQL or lock a different table.

Six findings, none of them a correctness defect in shipped behaviour today. The two that matter most: the renderer's capability parameter defaults to the full Postgres list, which fails open for any future caller, and the extension upgrade note declares no change although `SelectAstOptions` gained a required key that this branch had to add in `packages/3-extensions`. The integration test also cannot fail if the locking clause is lost on the way to the database.

Focused runs I did: `select-locking.test.ts` in sql-builder (24 passed), Postgres (16 passed) and SQLite (8 passed); relational-core `builders.test.ts` and `select.test.ts` (43 passed); sql-orm-client `aggregate-plan-baseline.test.ts` (7 passed).

## What looks solid

- One capability list. `packages/3-targets/6-adapters/postgres/src/core/capabilities.ts` feeds both the runtime profile and `descriptor-meta.ts`, so the emitted contract (which drives the builder types and `_gate`) and the renderer check cannot drift.
- The run-time checks match the type checks. `_gate` checks the method flag; `lock()` checks `sql.lockOf` only when `of` is non-empty, and the wait flags only for the wait that was asked for. `lockWaitOf` refuses `nowait` with `skipLocked` before a clause is built, and `LockingClause` has a single `wait` field, so the tree cannot hold both by any path.
- Subquery refusal covers every entry point. `JoinedTablesImpl` join sources come from `as()`, lateral subqueries go through `buildAst()` (`joined-tables-impl.ts` line 215), and `in`, `exists` and `notExists` call `buildAst()` in `functions.ts`. `build()` intentionally skips `assertNotLocked`, because the top-level select is the one that may be locked.
- The constructor refusal cannot be bypassed through the fluent API. `withLocking` on a tree that already has `groupBy`, and `withGroupBy` on a locked tree, both construct a new `SelectAst` through `toOptions()` and are refused. The builder test covers lock-then-`groupBy()` and `distinctOn`-then-lock.
- Both renderers route every nested select (derived tables, scalar subqueries, `exists`) through their single `renderSelect`, so the SQLite refusal and the Postgres flag check apply at every depth.
- The `joined-tables-impl.ts` cast change is a real fix. `LateralBuilder.from` is declared (`types/shared.ts` lines 31-33) to return the merged scope, and the runtime already built the query with `parentMerged`. The old cast target named the parent scope only; it compiled only while nothing read the scope contravariantly. No scope bug is hidden: runtime behaviour is unchanged, and the lateral subquery still cannot be locked because `buildAst()` refuses it.
- ORM side effects are limited to `bindSelectAst` carrying `ast.locking` and seven `"locking": undefined` lines in one snapshot. Nothing in `packages/3-extensions/sql-orm-client/src` creates a `LockingClause`, so the ORM cannot build a locked tree by accident.
- Fixtures: a spot check of one `contract.json` and one `contract.d.ts` shows only the seven added keys; the totals are 3223 added and 10 removed lines across 469 files, consistent with the in-loop parse check. Migration snapshots are verified by storage hash only (`packages/1-framework/3-tooling/migration/src/contract-snapshot-store.ts` lines 67-83), and capabilities are not part of that hash, so a consumer's older snapshots stay valid.
- Repo rules: no `any`; no new bare `as` in production code (`lint:casts` delta 0 in `wip/d4-lint-casts.txt`; the only production cast change is the retargeted lateral cast); `LockingClauseOptions`, `SelectAstOptions.locking` and `BuilderState.locking` are required keys typed `| undefined`; `LockRequest` uses optional keys because it mirrors user input; no import extensions; no new reexports; doc comments are short and on public surfaces only; no test name uses "should"; every new test file is under 300 lines.

## Findings

### F01: the renderer's capability parameter fails open

`packages/3-targets/6-adapters/postgres/src/core/sql-renderer.ts` lines 157-162; callers at `packages/3-targets/6-adapters/postgres/src/core/control-adapter.ts` lines 198-203 and 227, `packages/3-targets/6-adapters/postgres-codec-testkit/src/index.ts` line 255.

Issue: `renderLoweredSql` takes `capabilities` with a default of `postgresAdapterCapabilities`. I traced every caller. The runtime adapter passes `this.profile.capabilities`, which is the same constant, and no adapter option narrows it. The control adapter (both `lower()` and `lowerToExecuteRequest()`, used by migration `dataTransform`) and the codec testkit take the default. So today no tree reaches the renderer with capabilities other than the real Postgres profile, and there is no live defect. But the design says this check "is what protects a tree someone built by hand", and the function is exported through `@internal/adapter-postgres/sql-renderer`. The first caller that renders for a target with fewer flags (the design names Cockroach, Yugabyte and Neki as adapters that would reuse this renderer) and forgets the argument gets the full list and renders clauses its target never reported. A missing argument should not mean "everything is allowed".

Suggestion: make the parameter required. The control adapter and the testkit pass `postgresAdapterCapabilities` explicitly. The roughly twenty test call sites can pass it through a small local helper or pass it inline.

```ts
export function renderLoweredSql(
  ast: AnyQueryAst,
  contract: PostgresContract,
  codecDescriptorRegistry: PostgresCodecDescriptorRegistry,
  capabilities: Record<string, unknown>,
): { readonly sql: string; readonly params: readonly LoweredParam[] } {
```

### F02: the extension upgrade note declares no change, but `SelectAstOptions` gained a required key

`upgrade-instructions/pending/select-row-locking-capabilities/extension/instructions.md` lines 1-3; the change it misses is `packages/2-sql/4-lanes/relational-core/src/ast/types.ts` line 1647 and the matching fix in `packages/3-extensions/sql-orm-client/src/where-binding.ts` line 235.

Issue: `SelectAstOptions.locking` is a required key. Any extension that calls `new SelectAst({...})` with an options literal stops compiling, which is exactly what happened to `bindSelectAst` in `packages/3-extensions/sql-orm-client`. The `record-upgrade-instructions` skill routes an edit under `packages/3-extensions/` that fixes a framework break to the extension audience, and says `changes: []` is only for consumer-invisible changes. There is also a quiet trap: an author who fixes the compile error with `locking: undefined` while rebuilding an existing select drops the caller's lock without any error.

Suggestion: replace `changes: []` with one entry.

```md
---
changes:
  - id: select-ast-options-carry-locking
    summary: "SelectAstOptions has a new required key, locking; when rebuilding a select from an existing SelectAst, carry ast.locking so a row lock is not dropped."
    detection:
      glob: "**/*.ts"
      contains:
        - "new SelectAst("
---

## `select-ast-options-carry-locking`

`SelectAstOptions` now has a required `locking: ReadonlyArray<LockingClause> | undefined`. Where you construct `new SelectAst({ ... })` from an existing select's fields, add `locking: ast.locking`, or spread `ast.toOptions()` and override only what you change. Pass `locking: undefined` only for a select you build from nothing. Setting it to `undefined` while rebuilding an existing select removes the caller's `FOR UPDATE` without an error.
```

### F03: the integration test passes even if the locking clause never reaches the database

`test/integration/test/sql-builder/lock.test.ts` lines 17-69.

Issue: every test checks only the returned rows. With one PGlite connection a second transaction cannot be shown to wait, which the design states and the test names now respect (D4-F2). But the tests would also pass if the runtime, a middleware or the lowering step dropped `locking`, because the same rows come back with or without `FOR UPDATE`. The adapter tests lower hand-built trees, and the builder tests stop at the tree, so no test covers the whole path from builder to rendered SQL. The `non-vacuous-verification` rule asks that each verification can fail. The file also does not say, anywhere, that it cannot show a second transaction waiting; the limitation is stated only in the design.

Suggestion: the setup already returns `lower`, documented as "the SQL and bound params a plan lowers to, exactly as the runtime sends them" (`test/integration/test/sql-builder/setup.ts` line 179). Assert the rendered clause next to each row check. For one test, also prove the lock is held: inside the same transaction, the locked row's `xmax` equals the current transaction id.

```ts
const { db, runtime, lower } = setupIntegrationTest();

it.each([
  ['forUpdate', 'FOR UPDATE'],
  ['forNoKeyUpdate', 'FOR NO KEY UPDATE'],
  ['forShare', 'FOR SHARE'],
  ['forKeyShare', 'FOR KEY SHARE'],
] as const)('%s renders %s and returns the locked row', async (method, keyword) => {
  const plan = alice()[method]().build();
  expect(lower(plan).sql).toMatch(new RegExp(`${keyword}$`));
  expect(await inTransaction(plan)).toEqual([{ id: 1, name: 'Alice' }]);
});
```

### F04: four capability test names print "undefined"

`packages/2-sql/4-lanes/sql-builder/test/runtime/select-locking.test.ts` lines 225-236.

Issue: the name template `'%s throws without %s.%s'` has three placeholders and each row has two values. The test run prints "forUpdate throws without sql.undefined", "forNoKeyUpdate throws without postgres.undefined", and so on. The assertion itself is right, because it builds the capability from `group` and `method`. This is the same class of defect as D2-F3, which was fixed in the adapter tests and not swept into this file.

Suggestion: use objects and name them by key, as the option test below it does.

```ts
it.each([
  { method: 'forUpdate', group: 'sql' },
  { method: 'forShare', group: 'sql' },
  { method: 'forNoKeyUpdate', group: 'postgres' },
  { method: 'forKeyShare', group: 'postgres' },
] as const)('$method throws without $group.$method', ({ method, group }) => {
```

### F05: three docs do not describe the new raise sites or refusals completely

`docs/reference/error-reference.md` lines 858-864; `packages/2-sql/4-lanes/sql-builder/README.md` line 84.

Issue:
- `ORM.CAPABILITY_MISSING` says it is "currently the `returning` capability" and lists the payload `capability`, `action`. The builder's locking methods and options now raise it with the payload `method`, `capability`. (The wording was already stale for `distinctOn`; this branch adds seven more flags that raise it.)
- `ORM.ARGUMENT_INVALID` does not mention the new case: `nowait` and `skipLocked` passed together to a locking method.
- The README says `build()` refuses a lock with `distinct`, `distinctOn` or an aggregate or window function, and that `groupBy()` returns a query without the locking methods. It does not say that a lock followed by `groupBy()` or `having()` is also refused at `build()`, which the builder test covers.

Suggestion: add the locking methods and options, and the `method` payload key, to `ORM.CAPABILITY_MISSING`; add "a row-locking method given both `nowait` and `skipLocked`" to the `ORM.ARGUMENT_INVALID` list; change the README sentence to "`build()` refuses a lock together with `distinct`, `distinctOn`, `groupBy`, `having`, or an aggregate or window function in the projection."

### F06: the `of` type test has no negative case for a renamed table or a qualified name

`packages/2-sql/4-lanes/sql-builder/test/types/lock.types.test-d.ts` lines 63-76.

Issue: the design requires that `of` accepts only names in scope, and Postgres requires the alias once one is given and refuses a schema-qualified name. The test's only negative case is a table that is not in the query at all. Nothing fails if `RebindScope` stops removing the original name after `.as('u')`, or if the `of` type widens to `string`. At run time a wrong name is not dangerous (it is quoted as one identifier and Postgres refuses it with "relation not found in FROM clause"), so the types are the only early check for the user.

Suggestion: add two negative cases.

```ts
// @ts-expect-error after as('u') only the alias is in scope
db.public.users.as('u').select('id').forUpdate({ of: ['users'] });
// @ts-expect-error of takes unqualified names
db.public.users.select('id').forUpdate({ of: ['public.users'] });
```

## Deferred

- Two namespaces for one class of builder mistake. A lock with `distinct` reaches the caller as `RUNTIME.LOCK_INCOMPATIBLE` from the tree, and a lock with an aggregate as `ORM.LOCK_INCOMPATIBLE` from the builder. The orchestrator accepted this after D3 and the design table records it. Out of scope because it is a recorded design decision.
- The aggregate refusal looks only at top-level projection kinds. A nested aggregate or window function is left to Postgres, which refuses the statement. The in-loop D3 notes explain why that is safe. Out of scope as a design choice.
- Mapping SQLSTATE `55P03` to a structured code, and any test that a second transaction waits. Out of scope by the design; the second needs a real Postgres server.
- The ORM methods, the ORM refusals and a test that `bindSelectAst` carries `locking`. Owned by slice 2 and recorded in the project plan (`7cf404ca60`).

## Already addressed

| Finding | What it was | Closed in |
|---|---|---|
| D2-F1 | Capability list written twice (`capabilities.ts` and `descriptor-meta.ts`) | `b84be78549` |
| D2-F2 | SQLite used a new code instead of `RUNTIME.AST_UNSUPPORTED` | `b84be78549` |
| D2-F3 | Postgres and SQLite refusal test names printed an object; SQLite test checked one flag | `b84be78549` |
| D4-F1 | Rendered SQL in `query-patterns.md` did not match the adapter's output (the `LIMIT 1` half applied; the column half did not apply) | `40c9e42888` |
| D4-F2 | Integration test named as if it proved which table was locked | `40c9e42888` |
| Orchestrator | Error namespace for the tree refusal moved to `RUNTIME.LOCK_INCOMPATIBLE` | `58b963a579`, `7618c522cc` |
| Orchestrator | Builder refusals use `ORM.LOCK_INCOMPATIBLE`; locked subquery refused at `as()` and `buildAst()` | `2853f1c3c1`, `c687155838` |

## Acceptance-criteria verification

| # | Acceptance criterion | Source | Result | Evidence |
|---|---|---|---|---|
| 1 | `withLocking` keeps clauses through the other `with...` calls and `rewrite()`; the constructor refuses a lock with `distinct`, `distinctOn`, `groupBy`, `having` | design, Tests Slice 1 | PASS | `relational-core/test/ast/builders.test.ts` "select locking"; ran green |
| 2 | Postgres renders each strength, `nowait`, `skipLocked`, unqualified quoted `of`, two clauses in order, after `LIMIT` and `OFFSET`; refuses an unreported flag | design, Tests Slice 1 | PASS | `postgres/test/select-locking.test.ts`; ran green |
| 3 | SQLite refuses a locked select with a structured error | design, Tests Slice 1 | PASS | `sqlite/test/select-locking.test.ts`; ran green |
| 4 | Each builder method puts its clause on the tree; two calls append; `build()` refuses an aggregate projection and a locked subquery | design, Tests Slice 1 | PASS | `sql-builder/test/runtime/select-locking.test.ts`; ran green (test names, F04) |
| 5 | Type tests: methods on a Postgres `SelectQuery`, not on `GroupedQuery`, not on SQLite; `of` only names in scope; `nowait` with `skipLocked` is a type error; each option absent without its flag | design, Tests Slice 1 | PASS | `lock.types.test-d.ts`; `wip/d4b-typecheck.txt` 171 of 171 (negative cases thin, F06) |
| 6 | Integration test: each variant runs in a transaction against PGlite and returns the expected row | design, Tests Slice 1 | WEAK | `wip/d4b-lock-integration.txt` 18 passed; passes even if the clause is dropped (F03) |
| 7 | Method without its flag, builder: capability error from `_gate` | design, refusal table | PASS | `ORM.CAPABILITY_MISSING` with `meta.capability`; runtime test |
| 8 | Option without its flag, builder: same error naming the option's flag | design, refusal table | PASS | `lock()` in `query-impl.ts`; runtime test per option |
| 9 | Lock with `distinct`, `distinctOn`, `groupBy`, `having`: `RUNTIME.LOCK_INCOMPATIBLE` from the constructor | design, refusal table | PASS | `checkLockCompatible`; relational-core and builder tests |
| 10 | Lock with aggregate or window projection: `ORM.LOCK_INCOMPATIBLE`, `conflict: 'aggregate'` | design, refusal table | PASS | `assertLockableProjection`; three projection kinds tested |
| 11 | Locked select as subquery: `ORM.LOCK_INCOMPATIBLE`, `conflict: 'subquery'` | design, refusal table | PASS | `assertNotLocked` in `as()` and `buildAst()`; `as()` and `exists` tested; lateral and `in` share `buildAst()` |
| 12 | Unreported strength or option in a tree: `RUNTIME.AST_UNSUPPORTED` with `target`, `capability` | design, refusal table | PASS | `requireCapability`; seven cases tested (default parameter, F01) |
| 13 | Any lock on SQLite: `RUNTIME.AST_UNSUPPORTED` with `target: 'sqlite'`, `feature: 'locking-clause'` | design, refusal table | PASS | `sqlite/src/core/adapter.ts` `renderSelect`; tested |
| 14 | `nowait` on a locked row surfaces SQLSTATE `55P03` as the driver error | design, refusal table | NOT VERIFIED | needs a second connection; PGlite has one |
| 15 | Postgres reports the seven flags, SQLite none, documented in `capabilities.md` | design, capability flags | PASS | `capabilities.ts`; both adapter tests; `docs/reference/capabilities.md` |
| 16 | `STATUS.md` row-locking line moved to supported; `README.md` shows the four methods | slice spec, done conditions | PASS | diff of both files (README refusal sentence incomplete, F05) |
| 17 | `query-patterns.md` has a locking section with the read-then-write and work-queue examples | slice spec, part 5 | PASS | `docs/reference/query-patterns.md` "Locking the rows a select reads" |
| 18 | `pnpm typecheck`, `pnpm lint`, `pnpm lint:deps` pass | slice spec, done conditions | PASS | `wip/d4b-typecheck.txt`, `wip/d4-lint.txt`, `wip/d4-lint-deps.txt` |
| 19 | `pnpm test:packages` passes | slice spec, done conditions | NOT VERIFIED | last full run (`wip/d4-test-packages.txt`) exits 1: stale snapshot since fixed, timeouts green on rerun, tarball install failure attributed to the environment; no full green run saved after `40c9e42888` |
| 20 | Upgrade notes accurate for consumers | repo conventions | FAIL | app note accurate; extension note misses the required `SelectAstOptions.locking` key (F02) |

| Result | Count |
|---|---|
| PASS | 16 |
| WEAK | 1 |
| NOT VERIFIED | 2 |
| FAIL | 1 |
| Total | 20 |
