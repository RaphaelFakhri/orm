# System design review: row locking on the ORM client (TML-3415)

Branch `tml-3415-row-locking-orm-client` against `bot/tml-3402-row-locking-sql-builder` (slice 1), so only slice 2's changes are in scope: 18 files, commits listed in `commits.txt` next to this file. Reviewer lens: architect (names, types, module boundaries, layering, conceptual integrity). Correctness, failure modes and scope are listed at the end and left to the code review.

Verdict: **satisfied with concerns.** Slice 2 fits the ORM cleanly. The four methods copy the `distinctOn` precedent: a rest parameter typed `never` without the flag, plus a run-time capability check. The new state field, the single `withLocking` call in lowering and the refusal module are each in the right place. `lock-guards.ts` is the right home and the right name, next to the existing `order-by-guards.ts`. The concerns are about duplication and vocabulary, not shape. The builder and the ORM now each hold their own copy of four locking concepts, and the strength-to-flag mapping exists three times in three encodings. The `conflict` vocabulary is an untyped string in both packages, and one value in it names two different situations. The design's refusal table no longer matches the code.

## What slice 2 adds

```ts
const job = await tx.orm.public.Job.where({ state: 'queued' })
  .orderBy((j) => j.createdAt.asc())
  .forUpdate({ skipLocked: true })
  .first();
// ... ORDER BY "job"."createdAt" ASC LIMIT 1 FOR UPDATE OF "job" SKIP LOCKED
```

- **Four methods on `Collection`** (`packages/3-extensions/sql-orm-client/src/collection.ts:1125-1179`). Each method's rest parameter is `[options?: OrmLockOptions<TContract>]` when the contract carries the method's flag, and `never` when it does not. All four go through `#lock` (`:2760-2778`). `#lock` calls `assertLockCapability` for the method's flag and the wait-policy flag. It then appends `LockingClause.of(strength, { of: [this.tableName], waitPolicy })` to the state.
- **`OrmLockOptions`** (`packages/3-extensions/sql-orm-client/src/types.ts:223-231`). Offers `nowait` and `skipLocked` under their flags, as a union so the two keys exclude each other. It has no `of`.
- **`assertLockCapability` and `LockCapability`** (`packages/3-extensions/sql-orm-client/src/collection-contract.ts:654-684`). `LockCapability` is a string union of six dotted flag names. A private map turns each name into a `[group, flag]` pair. A missing flag throws `ORM.CAPABILITY_MISSING` with `meta.capability`.
- **`CollectionState.locking`** (`types.ts:101`, set to `undefined` in `emptyState()`). `buildSelectAst` in `query-plan-select.ts:1443-1445` applies it with `withLocking` on the outermost select.
- **`lock-guards.ts`** (new). `assertLockCompatible(state, terminal?)` walks the state and every nested include state (refinements, scalar reducers, combine branches). It throws `ORM.LOCK_INCOMPATIBLE` with `meta.conflict`: `include`, `distinct` or `distinctOn` when called from `compileSelect` and `compileSelectWithIncludes`, and `groupBy`, `aggregate` or `mutation` when a method passes that value as `terminal`.
- **`LOCK_INCOMPATIBLE`** added to `OrmSubcode` in `orm-errors.ts`. Slice 1's builder already threw `ORM.LOCK_INCOMPATIBLE` through the generic `structuredError`. Now the ORM, which owns the namespace, declares the code.
- **Docs.** ORM examples in `docs/reference/query-patterns.md`, the `prisma-8` skill, the pending upgrade notes (including an extension note for the new required `CollectionState` key), and the `ORM.LOCK_INCOMPATIBLE` entry in `docs/reference/error-reference.md`, which now lists both producers and eight `conflict` values.

## Subsystem fit and boundaries

**The methods follow the ORM's own precedent.** `distinctOn` uses the same rest-parameter technique (`...fields: TContract['capabilities'] extends { postgres: { distinctOn: true } } ? ... : never`). The lock methods apply it to a single optional parameter, so a call with no arguments is still a type error without the flag. The run-time check sits beside `assertDistinctOnCapability` in `collection-contract.ts`, as the design asks.

**The refusals run in two places, and the split has a clear reason.** State conflicts (`include`, `distinct`, `distinctOn`) are checked when the state is lowered, because the user can add them in any order before the terminal. `groupBy()`, `aggregate()` and the ten mutation terminals are checked when the method is called, because each of them leaves the `Collection` type or runs a statement, and the lock is not visible afterwards. That rule is sound. The design's refusal table does not state it and does not match it (SD05).

**`lock-guards.ts` is the right home and name.** `order-by-guards.ts` already holds `assertDistinctOnCompatibleOrder`, so `<topic>-guards.ts` with `assert...` functions is an established pattern in this package. The nested walk belongs there too. It exists only to answer "does any state in this tree carry a lock?". `collection-dispatch.ts` and `query-plan-select.ts` walk the same include shape for other reasons, but a shared visitor over include states does not exist, and adding one for a 15-line walk would not earn its keep.

**Recording `of` when the method is called, not during lowering.** `#lock` writes `of: [this.tableName]` into the state, and lowering copies the clause through unchanged. So the state holds an identifier that is only correct if lowering writes the model's table unaliased in `FROM`. The code review traced every read path and confirmed this holds today. It also follows existing practice: the state's `where` expressions and `OrderByItem`s already contain `ColumnRef`s built from `this.tableName`. So the choice matches the package. Its cost is that slice 3 (`include` with a lock), which the design says must put the lock on an inner select, will have to rewrite `of` rather than simply set it. See SD04.

## Naming and typology

- **`OrmLockOptions`.** The `Orm` prefix describes who uses the type, not what it is. The real distinction from the builder's `LockOptions` is that it has no `of`. Its body is identical to the builder's private `LockWaitOptions`. See SD02.
- **`LockCapability`.** Reads cold as "the capability for locking" (one thing). It is actually the set of six flag names the lock methods check, and it excludes `sql.lockOf`, which is also a lock capability. Acceptable as a private helper type, but it is a third way of writing a capability reference (SD01).
- **`assertLockCapability`.** Consistent with `assertDistinctOnCapability`, `assertReturningCapability` and `assertInsertConflictSkipCapability`. Fine.
- **`assertLockCompatible`.** Clear. The builder's version of the same check is called `assertLockable`. Two names for one check across two lanes; see SD01.
- **`LockedTerminalConflict = 'aggregate' | 'groupBy' | 'mutation'`.** `groupBy()` is not a terminal. It returns a `GroupedCollection` that can still be refined. The type's name claims a partition ("terminals") that its members do not share. See SD03.
- **`conflict` values.** `include`, `groupBy`, `aggregate`, `distinct`, `distinctOn`, `mutation` in the ORM; `distinct`, `distinctOn`, `groupBy`, `having`, `aggregate`, `subquery` in the builder. Most are method names, which is consistent. `aggregate` means "an aggregate or window function in the projection" in the builder and "the `aggregate()` terminal" in the ORM. Both describe aggregating a locked query, so one value is defensible. `include`, however, names two different situations (SD03).
- **The docs use one name for each thing.** "Lock" or "row lock" for the concept, "locking clause" only in error messages, "mutation terminal" for the ten write methods, and the four method names throughout. Across `query-patterns.md`, the skill, the upgrade notes and the error reference, I found no synonym and no name used for two things.

## Findings

### SD01. The builder and the ORM each keep their own copy of four locking concepts (medium)

`packages/3-extensions/sql-orm-client/src/collection.ts:3010-3027` (`LockRequest`, `lockWaitPolicyOf`); `packages/3-extensions/sql-orm-client/src/collection-contract.ts:654-684` (`LockCapability`, the flag map, `assertLockCapability`); `packages/3-extensions/sql-orm-client/src/types.ts:223-231` (`OrmLockOptions`); `packages/3-extensions/sql-orm-client/src/lock-guards.ts`. Their builder copies: `packages/2-sql/4-lanes/sql-builder/src/runtime/query-impl.ts:259-326` (the four `_gate` calls, `LockRequest`, `lockWaitPolicyOf`), `packages/2-sql/4-lanes/sql-builder/src/types/shared.ts:111-128` (`LockWaitOptions`), `packages/2-sql/4-lanes/sql-builder/src/runtime/builder-base.ts:160-197` (`lockConflictOf`, `assertLockable`, `assertNotLocked`). The renderer's copy: `packages/3-targets/6-adapters/postgres/src/core/sql-renderer.ts:253-282` (`lockStrengthSql`, `lockWaitSql`).

After slice 2, these concepts each exist more than once:

1. **Which flag a strength or wait policy needs.** This mapping exists three times in three encodings: the builder writes `{ postgres: { forNoKeyUpdate: true } }` in each `_gate` call, the ORM writes `'postgres.forNoKeyUpdate'` mapped to `['postgres', 'forNoKeyUpdate']`, and the renderer writes `['postgres', 'forNoKeyUpdate']` inside `lockStrengthSql`. Adding a fifth strength, or moving a flag between groups, means three edits that no type ties together.
2. **Turning `{ nowait, skipLocked }` into a `LockWaitPolicy`.** `lockWaitPolicyOf` and `LockRequest` are copied word for word, including the error text.
3. **The wait-option type.** `OrmLockOptions<TContract>` and the builder's `LockWaitOptions<QC>` have the same three-branch union body. They differ only in where they read `capabilities` from.
4. **The `conflict` vocabulary.** Each package has its own set of values, and both type them as `string` (SD03).

The code review of slice 2 noted item 2 as "small enough to leave". Seen together with items 1, 3 and 4, it is one concept, "the locking vocabulary", split across two lanes. Slice 1's SD07 already moved `isAggregateProjection` into relational-core for the same reason. Both lanes depend on `@internal/sql-relational-core`, and `LockingClause`, `LockStrength` and `LockWaitPolicy` already live there.

Suggestion: add one module next to `LockingClause` in `packages/2-sql/4-lanes/relational-core/src/ast/` that exports:
- `lockStrengthCapability(strength)` and `lockWaitPolicyCapability(policy)`, returning one capability reference format;
- `lockWaitPolicyOf(methodName, options)` together with its `LockWaitRequest` input type;
- a `LockWaitOptions<Capabilities>` type keyed on a capabilities record;
- the `LockConflict` union from SD03.

Then the builder, the ORM and the Postgres renderer all import these. The mapping becomes a fact about the capability vocabulary, stated once, and each lane keeps only its own gating mechanism (`_gate` for the builder, the rest tuple for the ORM). If the team prefers to wait, record the duplication in the project's deferred list, so that slice 3 does not add a fourth copy.

### SD02. `OrmLockOptions` is named for who uses it (low)

`packages/3-extensions/sql-orm-client/src/types.ts:223-231`.

The consumer-versus-essence probe: the `Orm` prefix says who uses the type. What the type actually holds is the wait-policy options (`nowait`, `skipLocked`), gated by capability. It is structurally the builder's `LockWaitOptions`. A fresh reader expects `OrmLockOptions` to be the ORM's version of the builder's `LockOptions`, and it is not: it lacks `of` because the ORM chooses `of` itself. So the name hides the one real difference.

Suggestion: if SD01 is adopted, use the shared `LockWaitOptions<TContract['capabilities']>` and remove `OrmLockOptions`. If not, rename it `LockWaitOptions` inside the ORM, so the name says what the type contains and matches the builder.

### SD03. The `conflict` vocabulary is untyped, one value names two situations, and one type name is wrong (low to medium)

`packages/3-extensions/sql-orm-client/src/lock-guards.ts:4` (`LockedTerminalConflict`), `:21-32` (`conflictOf` returns `string | undefined`); `packages/2-sql/4-lanes/sql-builder/src/runtime/builder-base.ts:160-168` (`lockConflictOf` returns `string | undefined`); `docs/reference/error-reference.md`, entry `ORM.LOCK_INCOMPATIBLE`.

`meta.conflict` is now a public contract. The error reference lists eight values, and callers can switch on them. Yet neither producer types the value, so nothing stops a ninth value from appearing without a docs update. Two naming problems sit inside it:

- `conflict: 'include'` is thrown for two different mistakes. One is a locked collection with `include()` (the outer lock cannot be placed). The other is a lock inside an `include()` refinement, scalar reducer or combine branch (the inner collection was locked). `conflictOf` checks the second first, at line 25. The fix is different in each case: remove the include, or remove the inner lock. The code does not tell them apart.
- `LockedTerminalConflict` includes `groupBy`, which is not a terminal. The parameter it types is named `terminal` for the same reason. The real grouping is "methods whose result no longer carries the lock", which is why the check runs when they are called.

Suggestion: declare one `LockConflict` union covering all eight values (and any new one), next to `LockingClause` per SD01 or in `orm-errors.ts`, and have both `conflictOf` functions return it. Give the refinement case its own value, for example `includeRefinement`, and add it to the error reference. Rename `LockedTerminalConflict` to something that describes its members, for example `LockDroppingCall`, or simply use `Extract<LockConflict, 'aggregate' | 'groupBy' | 'mutation'>`, and rename the parameter to `call`.

### SD04. The lock methods exist on collections where they can never succeed (low)

`packages/3-extensions/sql-orm-client/src/collection.ts:1125-1179`, with `includeRefinementMode` at `:286` and `:734`; `packages/3-extensions/sql-orm-client/src/lock-guards.ts:7-19`.

An `include()` refinement callback receives a `Collection` with `includeRefinementMode: true`. The four lock methods appear on it with full types, and every lock recorded there is refused later, when the outer query is lowered, with `conflict: 'include'`. So the type offers a method whose only possible outcome is an error, and the error arrives far from the call. The same class already has the reverse guard, `#assertIncludeRefinementMode`, for methods that exist only inside a refinement. So "this method depends on refinement mode" is an established concept in the class.

A related point: `of: [this.tableName]` is fixed when the method is called. That is correct for the plain read path the code review traced, and it matches how `where` and `orderBy` already record `this.tableName`. When slice 3 lets a lock go on an inner select, lowering will have to rewrite `of` rather than set it.

Suggestion: refuse the lock methods immediately in refinement mode (a mirror of `#assertIncludeRefinementMode`, throwing `ORM.LOCK_INCOMPATIBLE` with the refinement value from SD03). That keeps the nested walk in `lock-guards.ts` only as protection for states built by hand. Record in the design's slice 3 notes that `of` moves from the method to lowering when `include` support lands. No change to `of` is needed in this slice.

### SD05. The design's refusal table no longer matches the code (low)

`projects/select-row-locking/design.md:246-247` and `:252`.

- Line 246 says the ORM refuses "a lock with `include`, `aggregate`, `distinct` or `distinctOn`" at compile time. The code refuses `aggregate` and `groupBy` when the method is called, refuses `include`, `distinct` and `distinctOn` when the state is lowered, and also refuses a lock inside an include refinement. `groupBy` does not appear at all.
- Line 247's list of mutation terminals leaves out `createAll` and `createAndCount`, which the slice spec, the code and the error reference all include.
- Line 252 still hedges about a `SQL_BUILDER.` namespace. Slice 1 settled on `ORM.LOCK_INCOMPATIBLE` everywhere.

The design is meant to become the ADR at close-out, so it should state the rule the code follows.

Suggestion: rewrite the two ORM rows as three:
- state conflicts at lowering: `include`, `distinct`, `distinctOn`, and a lock inside an include;
- calls that drop the lock, checked when called: `groupBy()`, `aggregate()`;
- the ten mutation terminals, checked when called.

Give each row its `meta.conflict` value, and delete the hedge on line 252.

## Test strategy at the architectural level

The property to prove is the same as in slice 1: a method or option exists only under its flag, a missing flag is refused at run time, and every combination the ORM cannot render is refused before a statement is sent. It is proven at the right layers:
- `lock-capability.test-d.ts` covers types. It checks each method is present with its flag and a type error without it (including a call with no arguments), that `nowait` with `skipLocked` is a type error, and that `of` is not accepted.
- `lock-capability.test.ts` covers the run-time `ORM.CAPABILITY_MISSING` check.
- `select-locking-plan.test.ts` pins the whole rendered SQL, including the three polymorphic cases where `OF` must name only the base table. It covers every refusal, including all three nested include forms and a mutation's read-back.
- `where-binding.test.ts` closes the test slice 1 left open.
- The integration suite is named for what PGlite can prove ("Postgres accepts each row-locking clause the ORM renders"), which carries slice 1's SD08 fix forward.

If SD04 is adopted, the three nested include refusal tests move to the method call. If SD01 is adopted, the capability-mapping tests can move to relational-core and run once.

## Out of scope for this review (routed to the code review)

- Two lock calls on one collection (`forUpdate().forShare()`) produce two clauses, both `OF` the same table. Whether Postgres accepts that, and what it does with it, should be checked. The builder allows it too, but there the user chooses `of`.
- For an MTI variant collection, `OF` names the base table only, so the variant table's row is read but not locked. The plan tests pin this as intended. Whether it is the right behaviour for a caller who asked to lock a `Feature` row is a product and correctness question.
- `assertLockCompatible` runs once for each of the ten mutation terminals. Whether any mutation path reaches `compileSelect` for a read-back before that check runs was covered by the code review's D2 round. It should stay covered if new terminals are added.
- The extension upgrade note warns that setting `locking: undefined` while deriving from a locked state drops the lock silently. Whether any in-repo state builder does that is a code-review sweep.
