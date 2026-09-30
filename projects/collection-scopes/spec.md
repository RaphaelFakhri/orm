# Query fragments, collection scopes and weighted full-text search

**Linear project:** none yet.
**Design records:** [ADR 259 — Query fragments are functions](../../docs/architecture%20docs/adrs/ADR%20259%20-%20Query%20fragments%20are%20functions.md) (Proposed) and [ADR 260 — Packages offer collection scopes for their kinds of index](../../docs/architecture%20docs/adrs/ADR%20260%20-%20Packages%20offer%20collection%20scopes%20for%20their%20kinds%20of%20index.md) (Proposed).

## Purpose

A developer can share and compose parts of a query as ordinary functions, with the collection's type staying sound however the function is written. A package that introduces a kind of index can give applications a typed search built from the index's own definition, so the search cannot miss the index. The first such search is Postgres full-text search over several weighted fields.

## At a glance

```prisma
model Post {
  id        Int       @id
  title     String
  body      String?
  deletedAt DateTime?

  @@fullTextIndex([[title], body], name: "post_search")
}
```

```ts
import { fulltextSearchScopes, FieldExpression, sortField } from '@prisma/orm-postgres/orm-client';

const postScopes = fulltextSearchScopes<Contract, 'Post'>();

type DeletedAt = FieldExpression<Contract, 'pg/timestamptz@1', true>;
const notDeleted = (row: { deletedAt: DeletedAt }) => row.deletedAt.isNull();

const posts = await db.Post
  .where(notDeleted)
  .pipe((posts) => (input.q ? posts.pipe(postScopes.post_search(websearchToTsquery(input.q))) : posts))
  .pipe((posts) => (input.sort ? posts.orderBy(sortField(db.Post, input.sort, 'asc', ['title', 'createdAt'])) : posts))
  .limit(20)
  .all();
```

- `pipe` applies any function to the collection. The conditional yields a collection that may be unfiltered, and its type says so: `deleteAll` is refused on it.
- `notDeleted` fits any model with a nullable `deletedAt` of that codec.
- `postScopes.post_search(q)` is a fragment built from the index's definition in the contract. The query it adds uses the index.

## Where things stand (grounded 2026-09-30)

- **Single-column full-text search works.** `fullTextMatches`, `fullTextRank` and `fullTextHeadline` are column operations taking a `tsquery`; `@@fullTextIndex([field])` and the TypeScript `fullTextIndex` helper author a GIN index over one field. The parsers and the `tsquery` template tag build the query.
- **The Postgres full-text index is stored as an opaque expression.** The contract holds `expression: "to_tsvector('english', \"title\")"` with `type: "gin"`. Nothing can recover the field or language from it.
- **The collection's type state is not part of assignability.** It appears only in method parameter types, so a filtered and an unfiltered collection are assignable to each other, and a ternary between them may keep the filtered one. `deleteAll` is then allowed on a collection that may have no filter. This exists in code today (TML-3397).
- **`Collection` has no `pipe` method.** Spikes on the `bot` remote have one (`spike-pipe-fragments`), the state fix (`spike-collection-state-subtyping`), and the scope helper builder in its collection-taking form (`spike-scope-helper-api`, `spike-scope-helper-authoring`). Their write-ups are under `spikes/`.
- **Collections are created from a per-model class.** Chained collections use the current collection's constructor, and include refinements use the class registered for the related model. Custom collection classes are registered through `orm({ collections })`.
- **Runtime extensions are not typed at the client factory.** Nothing in this project needs them to be: a scope helper is imported from the package, and its types come from the contract type and model name the application writes.
- **There is no MySQL target.** MongoDB models text indexes with weights on `MongoIndex`; the MongoDB ORM client is out of scope for delivery.

## Decided

- **A query fragment is a function.** A row fragment is a function of the row accessor, taken by `where` and `orderBy`. A collection fragment is a function from a collection to a collection, applied by `pipe`. There are no control-flow combinators in the query API.
- **A filtered collection is a subtype of an unfiltered one.** The default state's flags are `boolean`, `where` and `orderBy` set `true`, and the state is a declared property of `Collection`. A conditional therefore reduces to the unfiltered type, and any function body inside `pipe` is sound.
- **`FieldExpression<Contract, CodecId, Nullable>`** is the type of a row field named by codec. **`rowFragment` and `RowOf`** define a row-changing step once per model. **`sortField`** turns a request string into a checked `orderBy` selector.
- **A scope is a named fragment that a package builds from an index definition.** `fulltextSearchScopes<Contract, 'Post'>()` returns one scope per full-text index on the model, named after the index. Each scope's result has the caller's type with the filter recorded.
- **The ORM client provides `defineIndexScopes`.** The package author writes a type guard for its kind of index and an ordinary function returning a filter and a default order.
- **`@@fullTextIndex` takes fields in weight groups**, `name:` is the scope's name, and the contract records fields, weights and language as data. One renderer produces the index expression and the query expression.
- **A scope's order is a default** that `orderBy` anywhere in the chain replaces. After a scope, `update` and `delete` are allowed and `cursor` is not.
- **Nothing is added to the schema grammar, the contract's domain plane, or the `Collection` type beyond `pipe`.** Scopes declared in the schema are a possible later step.

## Non-goals

- **A default fragment per model** (a Rails default scope). A filter every query must apply is a separate feature.
- **Chaining on a custom collection class after a chained call.** `where` on a subclass returns the base `Collection`; a conditional between a subclass and its filtered collection is a union. That is a limit of custom classes and needs its own decision.
- **A general `fragment` builder** that declares required fields by codec and keeps the caller's type. `FieldExpression` covers the need.
- **Generated or stored `tsvector` columns.** Search documents are expression indexes.
- **Combining relevance with another sort key**, highlighting a whole search document, scope kinds other than full-text (vector, geospatial), MongoDB scopes, and changes to the ParadeDB extension.
- **A MySQL target.**

## Place in the larger world

- **ORM client (`sql-orm-client`).** Gains `pipe`, the state subtyping, `FieldExpression`, `rowFragment`, `RowOf`, `sortField`, and the `defineIndexScopes` builder with its refinement and index-lookup types. `DefaultCollectionTypeState` is a public type and changes.
- **Postgres target.** Owns the weighted full-text index: `@@fullTextIndex` with weight groups, the structured index data in the contract, its DDL, and `fullTextMatches` and `fullTextRank` over weight groups. Owns `fulltextSearchScopes`.
- **Postgres facade (`@prisma/orm-postgres`).** Re-exports the new ORM client surface and the scope helper from `orm-client`.
- **Contract and emitter.** Carry the full-text index as structured data. A changed index representation changes storage hashes of contracts that declare one.
- **Migrations and upgrades.** The feature has no consumers yet, so no migration path from the opaque representation is provided. The index change and the `DefaultCollectionTypeState` change need upgrade instructions.
- **Mongo ORM client.** Out of scope, but ADR 257 records the MongoDB constraints so the design does not rule it out.

## Cross-cutting requirements

- **Any function body inside `pipe` yields a sound type.** A ternary in either order, an early return, a `switch`, a loop, and `let` with `if` all refuse `update`, `delete` and `cursor` unless every path sets the flag.
- **Nothing that compiles on an unconditional chain today stops compiling.** A filtered collection is accepted where the root collection type is expected.
- **Every fragment works at every site**: a root collection, a chained collection, a collection after `select`, an include refinement, and `this` inside a custom collection class. Scopes additionally keep a custom class's type when applied with `this.pipe`.
- **A scope's result records the filter.** The type-level mechanism that keeps the caller's type and sets `hasWhere` is unproven and is the first thing the scope slice settles.
- **The query expression and the index expression come from one renderer.** An integration test proves the planner uses the index, with sequential scans disabled and negative controls.
- **User input stays safe.** Scope operations take a `tsquery`; a plain string does not compile. `sortField` rejects names outside the allowed list at run time.
- **A user who uses none of this pays at most one percent more type checking**, measured on `examples/prisma-8-demo`. Measured so far: `pipe` +0.08%, state subtyping +0.08%.
- **Every negative type test fails for the stated reason**, checked by removing the directive and reading the error.

## Transitional-shape constraints

- **Green main between slices; each slice is one independently mergeable PR.**
- **The structured full-text index lands before any scope reads it.** The scope slice builds on both the fragment slice and the index slice.
- **Spike branches are deleted after the ADRs are accepted.** Only the write-ups under `spikes/` are kept until close-out.

## Project Definition of Done

- [ ] Team-DoD floor (repo checks, docs, upgrade instructions, Linear close-out).
- [ ] ADR 259 and ADR 257 are Accepted and match what shipped, including their examples.
- [ ] TML-3397 is closed by a test: a ternary between a filtered and an unfiltered collection refuses `deleteAll`.
- [ ] `examples/prisma-8-demo` has a conditional list query written with `pipe`, a shared soft-delete filter typed with `FieldExpression`, and a sort field from a request.
- [ ] A model with a weighted multi-field full-text index can be searched through a scope on a root collection, a chained collection, an include refinement, and a custom collection class, with whole-result assertions.
- [ ] Results are ordered by relevance by default, a title match ranks above a body match in a test, and an explicit `orderBy` replaces that order.
- [ ] `EXPLAIN` shows the planner using the declared index for a scope query, and for `fullTextMatches` on a column of a single-field index.
- [ ] Type tests show a scope typed from the contract's index data, a model without such an index has no scopes, and a scope is rejected on a collection of another model.
- [ ] A test on the built, published packages shows the scope helper and the fragment helpers are typed through `dist`.
- [ ] A second, test-only kind of index gets a scope helper without any change to the ORM client, proving the builder is general.
- [ ] `examples/prisma-8-demo` searches posts across more than one field through a scope.
- [ ] The skill reference and upgrade instructions describe the new index representation, the `DefaultCollectionTypeState` change, and the fragment and scope surface.

## Open questions

None for the operator. One type-level mechanism is unproven and is settled inside the scope slice: a fragment whose result is the caller's type with `hasWhere` set. If it cannot be typed, the fallback is a scope whose result is the caller's type with the state unchanged, and `update` after a scope then needs an explicit `where`.
