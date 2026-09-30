# Slice 1: sound conditional collections and `pipe`

**Project:** [spec](../../spec.md), [plan](../../plan.md). **Design:** [ADR 258](../../../../docs/architecture%20docs/adrs/ADR%20258%20-%20Query%20fragments%20are%20functions.md), sections 1 and 2. **Closes:** TML-3397.

## At a glance

```ts
const posts = db.Post.pipe((c) => (search ? c.where((p) => p.title.ilike(`%${search}%`)) : c));
await posts.limit(10).all();   // ok
await posts.deleteAll();       // error: the collection may have no filter

let q = db.Post;
if (search) q = q.where((p) => p.title.eq(search));
await q.update({ title: 'x' }); // error
```

## Chosen design

- `DefaultCollectionTypeState` flags `hasWhere`, `hasOrderBy` and `hasUniqueFilter` become `boolean`. `where`, `orderBy` and `variant` keep setting `true`. Every guard already tests `extends true`.
- `Collection` declares the state as a property: `declare readonly [StateType]: State`, first member, with `StateType` a unique symbol beside `RowType` in `collection-internal-types.ts`.
- `pipe<Self, Result>(this: Self, step: (collection: Self) => Result): Result { return step(this); }` on `CollectionImpl`, exposed on the `Collection` interface and documented.
- The spike on `bot/spike-collection-state-subtyping` (write-up `projects/collection-scopes/spikes/state-subtyping.md`) is the reference. Reuse its type tests; do not reuse its `when`, `fragment`, `rowFragment` or `sortField` code, which belong to slice 2 or are rejected.

## Coherence rationale

Three lines of production code plus one method, with a large set of type tests. One reviewer can hold it in one sitting.

## Scope

In: `packages/3-extensions/sql-orm-client` source and tests; the Postgres facade only if it re-declares the state type; upgrade instructions for `DefaultCollectionTypeState`; the ADR 258 example for `pipe` and conditionals must match the code.

Out: `FieldExpression`, `rowFragment`, `RowOf`, `sortField` (slice 2); any change to the demo (slice 2); the Mongo ORM client; making the union of a custom class and its filtered collection usable.

## Pre-investigated edge cases

- `Omit<Collection, ...>` include refinements keep symbol keys, so they carry the state property; the ternary reduces to the refinement type.
- `test/generated-contract-types.test-d.ts` asserts a flag is `false`; it becomes `boolean`.
- A ternary between a `where` branch and an `orderBy` branch, and between a custom class and its filtered collection, stays a union. Tests assert those unions refuse `update`, `delete` and `cursor`, and do not assert `include` works on them.

## Slice-specific done conditions

- Type tests cover every site (root, after `where`, after `select`, include refinement, `this` in a custom class, inside `pipe`) and every form (ternary both orders, `if` with early return, `switch`, loop, `let` with `if`), with `@ts-expect-error` negatives that fail for the stated reason.
- A regression test named for TML-3397 refuses `deleteAll` on a ternary between a filtered and an unfiltered collection.
- The whole repository typechecks; sql-orm-client tests pass; lint passes including `lint:throws` and `check:upgrade-coverage`.
- Type instantiations on `examples/prisma-8-demo` rise by less than one percent with `pipe` unused (spike: +0.16% for both changes).

## Open questions

None.
