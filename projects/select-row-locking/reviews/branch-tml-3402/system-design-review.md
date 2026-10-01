# System design review: row locking in the typed SQL builder (TML-3402)

Branch `tml-3402-row-locking-sql-builder` against `origin/main`, 14 commits. Reviewer lens: architect (names, types, module boundaries, layering, conceptual integrity). Correctness, failure modes and scope are listed at the end and left to the code review.

Verdict: **satisfied with concerns.** The shape is right. The node sits in the right package, the capability split follows the repository's existing rule, the capability list now has one home, and the builder's typing follows the `distinctOn` precedent exactly. The concerns are about where one set of rules lives and how its refusals are named: the shared, dialect-neutral select node enforces Postgres's rules, and the same kind of refusal surfaces under two codes with two metadata shapes. Neither blocks the slice, but both become harder to change once the ORM slice builds on them.

## What the branch does

Before this branch, no Prisma 8 query surface could express `SELECT ... FOR UPDATE`. The branch adds it to the typed SQL builder:

```ts
db.sql.public.job
  .select('id')
  .where((f, fns) => fns.eq(f.state, 'queued'))
  .limit(1)
  .forUpdate({ skipLocked: true })
  .build();
// SELECT ... WHERE ... LIMIT ... FOR UPDATE SKIP LOCKED
```

New types, modules and guarantees:

- **`LockingClause` node** (`packages/2-sql/4-lanes/relational-core/src/ast/types.ts:1583-1613`). A frozen AST class with `kind: 'locking-clause'`, `strength: LockStrength` (`'forUpdate' | 'forNoKeyUpdate' | 'forShare' | 'forKeyShare'`), `of: ReadonlyArray<string> | undefined` and `wait: LockWait | undefined` (`'nowait' | 'skipLocked'`). `SelectAst` gains `locking: ReadonlyArray<LockingClause> | undefined`, carried by the constructor, `from()`, `noFrom()`, `toOptions()` and `rewrite()`, plus `withLocking()`. New invariant: a `SelectAst` cannot hold a lock together with `distinct`, `distinctOn`, `groupBy` or `having`; the constructor throws `RUNTIME.LOCK_INCOMPATIBLE`.
- **Seven capability flags.** `sql.forUpdate`, `sql.forShare`, `sql.lockOf`, `sql.lockNowait`, `sql.lockSkipLocked`, `postgres.forNoKeyUpdate`, `postgres.forKeyShare`. The Postgres adapter reports all seven from a single constant, `postgresAdapterCapabilities` in `packages/3-targets/6-adapters/postgres/src/core/capabilities.ts`, which both the runtime adapter and `descriptor-meta.ts` now import instead of keeping two copies. SQLite reports none. 469 emitted contract fixtures gained the seven keys.
- **Renderer checks.** The Postgres renderer prints each clause after `OFFSET` and refuses a clause whose strength or option needs a flag it was not given (`RUNTIME.AST_UNSUPPORTED`, `meta: { target, capability }`). `renderLoweredSql` gains a `capabilities` parameter that defaults to `postgresAdapterCapabilities`. The SQLite renderer refuses any lock (`RUNTIME.AST_UNSUPPORTED`, `meta: { target: 'sqlite', feature: 'locking-clause' }`).
- **Four builder methods.** `forUpdate`, `forNoKeyUpdate`, `forShare`, `forKeyShare` on `SelectQuery` (not on `GroupedQuery`), each a `GatedMethod` on its flag. The option type `LockOptions = LockOf & LockWaitOptions` offers each key only under its flag, and makes `nowait` and `skipLocked` exclusive. At run time each method goes through `_gate`, checks the option flags with `assertCapability`, and appends a clause to `BuilderState.locking`. `build()` refuses an aggregate or window function in the projection, and `as()` / `buildAst()` refuse a locked select used as a subquery (`ORM.LOCK_INCOMPATIBLE`, `meta.conflict`).

## Subsystem fit and boundaries

**The node belongs in `sql-relational-core`.** Every SQL lane produces `SelectAst`, and the ORM slice will set `locking` on the same tree. Putting the node anywhere higher would force the ORM to depend on the builder or duplicate the node. The node follows the frozen-class AST pattern (`AstNode` base, `freeze()` in the constructor, static `of()` factory, string `kind`), like `OrderByItem` and `JoinAst`. It is not a service, so the interface-plus-factory pattern does not apply, and the branch correctly does not hide the class. It does not take part in the expression visitor, which is right: it holds names, not expressions, and `rewrite()` passes it through unchanged.

**The capability split matches the repository's rule.** `docs/reference/capabilities.md` describes `sql` as the naming convention for keys shared across dialects and `postgres` for Postgres-only keys. Existing precedent is `postgres.distinctOn` (Postgres-only) and `sql.insertOnConflictSkip` / `sql.insertOnConflictWithoutTarget` (an option and its sub-option as two `sql` flags). The design's survey table justifies each placement: `FOR UPDATE`, `FOR SHARE`, `OF`, `NOWAIT` and `SKIP LOCKED` exist in at least MySQL as well; `FOR NO KEY UPDATE` and `FOR KEY SHARE` exist only in Postgres and its derivatives. The split is consistent.

**`capabilities.ts` is the right home, and the import does not cross planes.** `architecture.config.json` maps `packages/3-targets/6-adapters/postgres/src/core/**` to the shared plane, so `adapter.ts`, `descriptor-meta.ts` and `sql-renderer.ts` all import within one plane. `wip/d4-lint-deps.txt` records `pnpm lint:deps` passing with no violations. Removing the duplicated literal from `adapter.ts` and `descriptor-meta.ts` fixes a real drift risk: before this branch the two copies had to be edited together.

**The renderer's capability parameter is the weakest boundary.** See SD03.

## Naming and typology

Each introduced name, read cold:

- **`LockingClause`, `strength`, `LockStrength`.** These match the names Postgres uses in its own parse tree (`LockingClause`, `LockClauseStrength`) and in its `SELECT` reference ("locking clause", "lock strength"). A fresh contributor with Postgres knowledge reads them correctly. No other name for this concept exists in the repository; a search for `RowLock`, `rowLock` and `lockStrength` finds only the new code.
- **`LockWait`, `wait`.** Weaker. A field named `wait` holding the value `'nowait'` reads as a contradiction. Postgres calls this concept the wait policy (`LockWaitPolicy`). See SD05.
- **`LockOptions`, `LockOf`, `LockWaitOptions`.** Consistent with each other and with the design. `LockOf` names the `of` option, which reads oddly alone but is private to `shared.ts`. Acceptable.
- **`of` field and `static of()` factory.** `LockingClause.of('forUpdate', { of: ['c'] })` uses `of` twice with two meanings. The factory name is a repository-wide convention and the field name mirrors the SQL keyword, and the design requires one name across tree, builder and ORM. Both reasons are good; no change asked.
- **Strength values `'forUpdate'` and so on.** These carry the `for` keyword into a value on a node that already says it is a locking clause, and they differ from the precedent `JoinAst.joinType: 'inner' | 'left' | ...`, where the value drops the `Join` suffix the builder method `innerJoin()` has. The design chose method-name parity on purpose. See SD06.
- **Flag names.** `sql.forUpdate`, `sql.forShare`, `postgres.forNoKeyUpdate`, `postgres.forKeyShare` equal the method names they unlock, which is the pattern `distinctOn` set. The three option flags share a `lock` prefix (`lockOf`, `lockNowait`, `lockSkipLocked`), so they sort together and do not collide with any future non-locking `of` or `nowait`. Consistent.
- **Method names.** `forUpdate()` and the others mirror the SQL words, as `distinctOn()`, `groupBy()` and `orderBy()` do. Consistent.
- **`kind: 'locking-clause'`.** Kebab case like every other `kind`. Consistent.
- **Error codes.** `RUNTIME.LOCK_INCOMPATIBLE` (AST constructor), `ORM.LOCK_INCOMPATIBLE` (builder), `RUNTIME.AST_UNSUPPORTED` with `meta.capability` (Postgres) or `meta.feature` (SQLite). The builder's use of the `ORM` namespace is pre-existing (it already throws `ORM.CAPABILITY_MISSING` and `ORM.ARGUMENT_INVALID`), so the branch follows the neighbouring code as the design intends. The problem is that one kind of refusal has two codes and two metadata shapes. See SD02 and SD04.

## The design's rejected alternatives, through the architect lens

- **One method `lock(strength, options)`, rejected.** Agree. Four methods mirror the SQL words and give each strength its own flag in the types, which a string argument cannot do.
- **One flag or two flags, rejected in favour of seven.** Agree. The survey shows each of the seven varies independently across real databases, so any coarser flag would have to be split when a second adapter ships, and splitting a published capability key breaks contracts. The cost is that each new flag forces every contract to be re-emitted (469 fixtures here, and an upgrade note for users); that cost is the same for any new flag and is paid once.
- **`wait: 'nowait' | 'skipLocked'` in the public API, rejected; booleans with a union type instead.** Agree for the API: `{ skipLocked: true }` reads as the SQL, and the union type in `LockWaitOptions` makes passing both a type error. Keeping a single `wait` field in the tree so the tree cannot hold both is the right call. Only the field's name is questioned (SD05).
- **Postgres syntax in the tree, rejected in favour of camel-case names.** Agree with the principle: a SQL Server renderer must not parse Postgres words. The same principle is not applied to the rules the node enforces (SD01).
- **The ORM's automatic `OF <model table>` rule (slice 2).** The node supports it: `of` is an optional list of unqualified names, and `withLocking()` can attach a clause to the outermost select. Nothing in this slice blocks it. One point for slice 2: the ORM will set `of` from its own alias, so a tree rewrite that renames table sources (`AstRewriter.tableSource`) would leave `of` stale. `rewrite()` passes `locking` through unchanged by design. Today no rewriter renames aliases, so this is a note for slice 2, not a finding.

## Findings

### SD01. The shared select node enforces Postgres's locking rules (medium)

`packages/2-sql/4-lanes/relational-core/src/ast/types.ts:1615-1633` (`checkLockCompatible`), called from the `SelectAst` constructor. `docs/reference/error-reference.md`, entry `RUNTIME.LOCK_INCOMPATIBLE`.

The project spec says the node is target-neutral and renderers own the syntax. The design applies that to the node's values but then puts a Postgres rule in the node's constructor: a lock with `DISTINCT`, `DISTINCT ON`, `GROUP BY` or `HAVING` is refused because "Postgres refuses" it (the error reference says exactly this). That rule is not universal. MySQL accepts `SELECT DISTINCT ... FOR UPDATE` and `GROUP BY ... FOR UPDATE`, and SQL Server's lock hints sit on the `FROM` item regardless of grouping. A future MySQL renderer could never receive such a tree, because the shared node refuses to exist. The node now answers "is this legal Postgres?", which is the renderer's question.

The builder's own refusals (aggregate projection, locked subquery) are the same kind of dialect rule, but they sit in a lane, which may choose to be conservative in its first version. The node is shared by every lane and every target.

Suggestion: move the four-field check out of the `SelectAst` constructor. Put the user-facing check in the builder's `build()` beside `assertLockableProjection` (the builder already knows `distinct` and `distinctOn` from its state, and `GroupedQuery` already keeps `groupBy` and `having` out of the types), and put the Postgres rule in the Postgres renderer as a refusal with the same code the renderer uses for other trees it cannot print. Keep the node free of rules that depend on a dialect.

### SD02. One kind of refusal has two codes and two metadata shapes (medium)

`packages/2-sql/4-lanes/relational-core/src/ast/types.ts:1627-1631` (`RUNTIME.LOCK_INCOMPATIBLE`, `meta: { node, field }`). `packages/2-sql/4-lanes/sql-builder/src/runtime/builder-base.ts:172-185` (`ORM.LOCK_INCOMPATIBLE`, `meta: { conflict }`).

A builder user writes `.distinct().forUpdate().build()` and gets `RUNTIME.LOCK_INCOMPATIBLE` with `meta.field: 'distinct'`. The same user writes `.select(count).forUpdate().build()` and gets `ORM.LOCK_INCOMPATIBLE` with `meta.conflict: 'aggregate'`. Both mean "this lock cannot be combined with that part of the query". ADR 239 says a namespace answers "what went wrong", not "which package said so", and that codes should stay stable if a check moves between layers. Here the code changes with the layer that happens to detect the conflict, and the metadata key changes with it. Slice 2 will add a third producer (the ORM) and must pick one of the two shapes.

Suggestion: use one code and one metadata key for every "lock combined with X" refusal. Since the builder and the ORM both use `ORM.*` for query-shape misuse, and SD01 moves the user-facing distinct check into the builder, `ORM.LOCK_INCOMPATIBLE` with `meta.conflict` (`'distinct' | 'distinctOn' | 'groupBy' | 'having' | 'aggregate' | 'subquery'`) covers all builder cases. The renderer's refusal, if kept, uses `RUNTIME.AST_UNSUPPORTED` like its other unrenderable trees. Then remove `RUNTIME.LOCK_INCOMPATIBLE` from the code and from `docs/reference/error-reference.md`, and update the design's "What is refused, and where" table.

### SD03. The renderer's capability parameter has a default and checks a constant (low to medium)

`packages/3-targets/6-adapters/postgres/src/core/sql-renderer.ts:54`, `:157-161`, `:285-320`. `packages/3-targets/6-adapters/postgres/src/core/adapter.ts:74`.

`renderLoweredSql` takes `capabilities: Record<string, unknown> = postgresAdapterCapabilities`. Three problems:

1. The only non-default caller, `PostgresAdapterImpl.lower`, passes `this.profile.capabilities`, which is the same frozen constant. Every other caller (the control adapter, the codec testkit, many tests) takes the default. So in production the check can never fail. The design says this check "protects a tree someone built by hand", but a hand-built tree carrying `forNoKeyUpdate` renders on Postgres because Postgres reports the flag. The check only fires in the test that passes a reduced set.
2. The default makes the renderer import the adapter's capability declaration, so a renderer (a pure function from tree to SQL) now depends on the adapter's profile. The dependency should run the other way: the adapter tells the renderer what it reports.
3. `Record<string, unknown>` is looser than the builder's `Record<string, Record<string, boolean>>` for the same data, so `requireCapability` has to probe with `typeof` and `Reflect.get`.

The builder checks against `contract.capabilities`; the renderer checks against the adapter profile. That split is defensible (the renderer checks what it can print), but it should be explicit.

Suggestion: make `capabilities` a required parameter typed as the adapter's capability record, remove the default and the import of `postgresAdapterCapabilities` from `sql-renderer.ts`, and pass the set explicitly from the control adapter and the testkit. Then any future adapter that reuses this renderer with a narrower set (a derived Postgres target) gets a working check, and the design's sentence about hand-built trees can say what the check actually protects.

### SD04. `RUNTIME.AST_UNSUPPORTED` metadata differs between the two renderers (low)

`packages/3-targets/6-adapters/postgres/src/core/sql-renderer.ts:296-301` (`meta: { target: 'postgres', capability }`). `packages/3-targets/6-adapters/sqlite/src/core/adapter.ts:236-241` (`meta: { target: 'sqlite', feature: 'locking-clause' }`).

ADR 239 says a renderer refusal uses `RUNTIME` with `meta.target` and `meta.feature` identifying the target-specific condition. SQLite follows it. Postgres drops `feature` and adds `capability`, so a consumer that switches on `meta.feature` cannot recognise the Postgres refusal as a locking refusal.

Suggestion: Postgres sends `meta: { target: 'postgres', feature: 'locking-clause', capability }`. `feature` is always present; `capability` is an extra detail when a missing flag is the cause. Update the `RUNTIME.AST_UNSUPPORTED` payload sentence in `docs/reference/error-reference.md` to match.

### SD05. `wait: 'nowait'` reads as a contradiction (low)

`packages/2-sql/4-lanes/relational-core/src/ast/types.ts:1584`, `:1587-1591`, `:1597`.

Read cold, `clause.wait === 'nowait'` says "the wait is no wait". The concept is how the statement behaves when a row is already locked: block, fail, or skip. Postgres names it the wait policy (`LockWaitPolicy` with `LockWaitBlock`, `LockWaitError`, `LockWaitSkip`). `LockWait` as a type name also reads as "a wait on a lock", an event, not a policy.

Suggestion: rename the type to `LockWaitPolicy` and the field to `waitPolicy`, keeping the values `'nowait' | 'skipLocked'` so they still equal the builder's option keys. Do it before slice 2 adds a second producer. If the team prefers to keep `wait`, record the reason in the design's alternatives section.

### SD06. Strength values carry the `for` keyword, unlike `JoinAst.joinType` (low)

`packages/2-sql/4-lanes/relational-core/src/ast/types.ts:1583` against `:1498`.

`JoinAst.joinType` stores `'inner'` for the builder method `innerJoin()`; `LockingClause.strength` stores `'forUpdate'` for `forUpdate()`. Siblings in one AST follow two rules for turning a method name into a node value. The design explains its choice ("one name serves the AST, the builder and the ORM"), which is a real benefit, and `'update' | 'noKeyUpdate' | 'share' | 'keyShare'` would lose it.

Suggestion: keep the values, and add one sentence to the design's "Postgres syntax in the tree" alternative saying that the strength values deliberately match method names, unlike `joinType`, so the asymmetry is recorded rather than accidental.

### SD07. "Aggregate in the projection" is now defined twice, differently (low)

`packages/2-sql/4-lanes/sql-builder/src/runtime/builder-base.ts:160-176` (`LOCK_INCOMPATIBLE_PROJECTION_KINDS`: `aggregate`, `json-array-agg`, `window-func`). `packages/2-sql/5-runtime/src/middleware/budgets.ts:23-28` (`hasAggregateWithoutGroupBy`: `aggregate` only).

Two modules now classify "does this select aggregate?" with two different sets of node kinds, both looking only at the top-level expression of each projection item. Slice 2 needs the same classification for the ORM. The concept belongs to the AST, next to `isAggregateFn` in `relational-core`.

Suggestion: add one predicate in `packages/2-sql/4-lanes/relational-core/src/ast/` (for example `projectionAggregates(select)` or an expression walker `containsAggregate(expr)`) and use it from the builder now and the ORM in slice 2. Whether the budgets middleware should switch to it is a separate decision. Whether nested aggregates must be caught is a correctness question for the code review.

### SD08. The integration test names claim more than PGlite can prove (low)

`test/integration/test/sql-builder/lock.test.ts:6`, `:17-22`, and the other `it` titles. `packages/2-sql/4-lanes/sql-builder/STATUS.md`, "Tests" section.

The tests are titled "`%s` returns the locked row" and "the work-queue shape claims one row". PGlite serves one connection, so these tests prove that Postgres accepts each rendered statement inside a transaction. They cannot prove that a second transaction waits, fails under `nowait`, or skips under `skipLocked`. The design states this limitation; nothing that ships does.

Suggestion: name the suite for what it proves, for example `describe('integration: Postgres accepts each row-locking clause', ...)`, and add one line under "Tests" in `STATUS.md` saying that lock contention is not covered because the embedded database has one connection. No code comment is needed.

### SD09. The slice spec names error codes the code does not use (low)

`projects/select-row-locking/slices/1-sql-builder/spec.md:26` (`AST.LOCK_INCOMPATIBLE`) and `:29` (`SQL_BUILDER.LOCK_INCOMPATIBLE`).

Neither namespace exists in ADR 239's closed list. The design was corrected in commit `7618c522cc`; the slice spec was not. A reader of the slice spec alone gets the wrong codes.

Suggestion: update both lines to the codes the branch ships (or to the single code SD02 settles on).

## Test strategy at the architectural level

The property to prove is: a method or option exists only when its flag is reported, and a tree carrying an unreported clause is refused. It is proven at three layers, each at the right one:

- **Types.** `packages/2-sql/4-lanes/sql-builder/test/types/lock.types.test-d.ts` checks that the four methods exist on a Postgres `SelectQuery`, are absent on `GroupedQuery` (including after `having()`), are `never` on a contract without the flags, that `of` accepts only names in scope, that `nowait` with `skipLocked` is a type error, and that each option key disappears without its flag. This covers the types side fully.
- **Builder run time.** `packages/2-sql/4-lanes/sql-builder/test/runtime/select-locking.test.ts` checks each method and each option throws `ORM.CAPABILITY_MISSING` without its flag, plus the refusals.
- **Renderer.** `packages/3-targets/6-adapters/postgres/test/select-locking.test.ts` checks each of the seven flags is required at render time; `packages/3-targets/6-adapters/sqlite/test/select-locking.test.ts` checks SQLite refuses any lock. The Postgres renderer test proves the check works when given a reduced set, which (per SD03) is the only way it can fire today.
- **Node.** `packages/2-sql/4-lanes/relational-core/test/ast/builders.test.ts` covers `withLocking` survival and the constructor refusals. If SD01 is adopted these tests move to the builder and the renderer.

The PGlite single-connection limitation is stated in the design but not in the shipped test or status document (SD08).

## Out of scope for this review (routed to the code review)

These came up while reading. They are about correctness, failure modes or scope, not structure.

- `assertLockableProjection` looks only at the top-level `kind` of each projection item. An aggregate nested inside an operation, or an aggregate descriptor whose `lower` hook produces a non-`AggregateExpr` node, passes the check and reaches Postgres.
- `LockOf` accepts every name in `S['namespaces']`, which includes derived-table, lateral and function-source aliases. Whether Postgres accepts `FOR UPDATE OF` each of those source kinds should be checked.
- The branch regenerated 21 contract files under `migrations/snapshots/<hash>/`. Whether historical snapshots should change when capabilities are added, and whether the directory hash still matches, is a question for the code review and the migration owners.
- `packages/3-extensions/sql-orm-client/src/where-binding.ts` carries `locking` through `bindSelectAst` without a test; the project plan records that slice 2 owes it.
- The builder refuses both `nowait` and `skipLocked` at run time with `ORM.ARGUMENT_INVALID`, while the type already refuses it. Whether that run-time check is reachable without a cast is a code-review question.
