# Collection scopes and weighted full-text search

**Linear project:** none yet.
**Design record:** [ADR 257 — Collection scopes declared on the model](../../docs/architecture%20docs/adrs/ADR%20257%20-%20Collection%20scopes%20declared%20on%20the%20model.md) (Proposed).

## Purpose

A developer can search a model across several fields, with some fields counting more than others, through the ORM client, and the search always uses the index declared for it. The mechanism that makes this possible is general: a model declares named scopes in the contract, and any target or extension can introduce a scope type and supply its operations.

## At a glance

```prisma
model Post {
  id    Int     @id
  title String
  body  String?
}

scopes Post {
  search fullTextSearch([title, body])
}
```

```ts
const q = websearchToTsquery(input);

db.Post.scopes.search.fulltext(q).limit(10).all();
db.User.where({ id }).include('posts', (posts) => posts.scopes.search.fulltext(q).limit(3));
```

## Where things stand (grounded 2026-09-27)

- **Single-column full-text search works.** `fullTextMatches`, `fullTextRank` and `fullTextHeadline` are column operations taking a `tsquery`; `@@fullTextIndex([field])` and the TypeScript `fullTextIndex` helper author a GIN index over one field. The parsers and the `tsquery` template tag build the query.
- **The Postgres full-text index is stored as an opaque expression.** The contract holds `expression: "to_tsvector('english', \"title\")"` with `type: "gin"`. Nothing can recover the field or language from it.
- **Queries can address only columns and relations.** The ORM row accessor exposes stored fields and relations. The SQL builder's field proxy exposes columns. No query-side code reads a table's indexes.
- **Collections are created from a per-model class.** Chained collections use the current collection's constructor, and include refinements use the class registered for the related model. Custom collection classes are registered through `orm({ collections })`, and the client's types come from those classes.
- **Runtime extensions are not typed at the client factory.** The Postgres facade takes `extensions` as an untyped array of descriptors, so an extension cannot contribute to the client's types today.
- **The ORM client already installs members by name with precedence.** Aggregate reducers (`count`, `sum`, …) are installed per collection only when the name is free.
- **MongoDB models text indexes with weights** on `MongoIndex`. Verified against MongoDB: a text search must be in the first pipeline stage, works inside a `$lookup` sub-pipeline, returns results unordered unless sorted by score, and a collection can have one text index.
- **There is no MySQL target.**
- **Two spikes showed the types work without the caller writing any.** Contributions register their types in a registry interface the ORM client declares. With scopes declared on the model and none in use, this adds 0.12% to type checking on the demo application. See [the first findings](spikes/type-composition.md) and [the findings for declared scopes](spikes/declared-scopes.md).
- **The contract lists its extensions**, and a client refuses to start when one of them was not passed to it.
- **A model in the contract has no `scopes` member**, and no package contributes to the domain plane. The schema language has no way to declare one: a model body holds fields and `@@` attributes, and a top-level block's body holds `key = value` lines and `@@` attributes.
- **Contract deserialization keeps an unknown `scopes` key on a model** without a validator change, as the second spike found.

## Decided

- **Scopes are declared on the model in the contract's domain plane.** Each has a name, an open scope type id, and parameters. The full-text scope's one parameter names its index.
- **Scopes are declared in a top-level `scopes <Model> { }` block**, one line for each scope: the name, then the kind of scope with its arguments, as `search fullTextSearch([title, body])`. A declaration creates the scope and its index. The index name is generated unless `map:` gives one.
- **`fullTextSearch` replaces `@@fullTextIndex`.** An index without a scope is written with `@@index(expression: ...)`.
- **The Prisma 7 grammar does not get the block.**
- **No kind or type id on the index.**
- **The TypeScript builder declares scopes through a `scopes` method on the model.** The target contributes the helper, so nothing is imported: `.scopes(({ fields, scopes }) => ({ search: scopes.fullTextSearch([[fields.title, fields.subtitle], fields.body]) }))`. The key is the scope's name.
- **The index expression contains only what the search needs.** `setweight` appears only when there is more than one weight group, and `coalesce` only when there is more than one field. A search over one field therefore has the expression `to_tsvector(language, column)`, which is the one `fullTextMatches` on that column uses.
- **A scope is in no contract hash**, as the rest of the domain plane is in none. Its index is in the storage hash.

## Non-goals

- **Generated or stored `tsvector` columns.** The contract cannot represent generated columns. Search documents are expression indexes.
- **A MySQL target, or scope support for it.**
- **Combining relevance with another sort key.** An explicit `orderBy` replaces relevance order.
- **Highlighting a whole search document.** Highlighting stays per column through `fullTextHeadline`.
- **Scope types other than full-text**, such as vector or geospatial search. The mechanism must allow them; this project delivers full-text only.
- **Changes to the ParadeDB extension.**
- **Relation navigation on collections** (`db.User.where(...).posts`).

## Place in the larger world

- **Framework contract.** A model gains a `scopes` member with a fixed shape: name, scope type, parameters. The framework knows no scope type.
- **Schema language.** The parser, binder, formatter, printer and language server gain the `scopes` block. Its lines are read as a name followed by a constructor with arguments. Packages supply the kinds of scope through a new kind of authoring contribution, and each produces a scope and an index together.
- **TypeScript contract builder.** Gains the `scopes` method on a model, with the same contributions.
- **ORM client (`sql-orm-client`).** Gains the `scopes` member on collections, the registry and interface that contributions satisfy, a check at construction that each declared scope has a contribution and an index, and default-order handling.
- **Postgres target.** May reference the ORM client's interface type directly. Owns the full-text scope type: its declaration form, the structured index, its DDL, and the scope's operations. Reuses the existing full-text lowering and the `tsquery` helpers.
- **Postgres facade.** Its signature does not change. It passes the runtime contributions from the target and from `extensions` to the ORM client.
- **Package build.** Rewrites the internal module name in a registry declaration to the published one.
- **Contract and emitter.** Carry the scope on the model and the index as structured data. No types describing the ORM client are emitted.
- **Migrations and upgrades.** A changed index representation changes storage hashes of contracts that declare a full-text index. The feature has no consumers yet, so no migration path from the opaque representation is provided. Removing `@@fullTextIndex` needs an upgrade instruction.
- **Mongo ORM client.** Out of scope for delivery, but the design must not rule it out; the ADR records the MongoDB constraints.

## Cross-cutting requirements

- **The contract is not coupled to the ORM client.** It states that a scope exists and what type it has. Nothing emitted describes collection members, operations, or any one query interface.
- **The domain plane holds nothing specific to an index.** Fields, weights and language stay on the storage index.
- **The query expression and the index expression come from one renderer**, so a scope query always matches its index. An integration test proves the planner uses the index, with sequential scans disabled and negative controls.
- **The `Collection` type's `scopes` member is written inline.** Moving it into a helper type alias fails with a circular reference. A test and a note in the code protect it.
- **No special cases by scope type or target in the ORM client or the framework.** They know the shape and the interface; the package that introduces a scope type supplies behaviour.
- **A scope is reachable on every collection of its model**: root, chained, inside an include refinement, and on a custom collection class.
- **Scopes are reached through `scopes.<name>` only.** Nothing is placed directly on the collection.
- **Constructing a client needs no type arguments or annotations for scopes**, whichever package contributes them, first-party or not.
- **A user who declares no scope pays at most one percent more type checking**, measured on `examples/prisma-8-demo`.
- **Existing column operations and their tests are unchanged.**
- **User input stays safe.** Scope operations take a `tsquery`, as the column operations do; a plain string does not compile.

## Transitional-shape constraints

- **The structured full-text index and the `scopes` member land before any scope reads them.**
- **Green main between slices; each slice is one independently mergeable PR.**

## Project Definition of Done

- [ ] Team-DoD floor (repo checks, docs, upgrade instructions, Linear close-out).
- [ ] ADR 257 is Accepted and matches what shipped, including its examples.
- [ ] A model with a weighted multi-field full-text index can be searched through `scopes.<name>.fulltext(query)` on a root collection, a chained collection, an include refinement, and a custom collection class, with whole-result assertions.
- [ ] Results are ordered by relevance by default, a title match ranks above a body match in a test, and an explicit `orderBy` replaces that order.
- [ ] `EXPLAIN` shows the planner using the declared index for a scope query.
- [ ] Type tests show the scope and its operation typed from the contract's index data, and show a model that declares no scope has none.
- [ ] A test on the built, published packages shows a registered scope is typed, so a registry declaration naming an internal module cannot ship.
- [ ] A client refuses to start when a declared scope's type has no contribution, or its index does not exist, and the error names what is missing.
- [ ] `EXPLAIN` shows `fullTextMatches` on a column using the index of a search declared over that one field.
- [ ] Tests cover: two packages registering the same scope type, which is a compile error; a grouped collection; a collection after `.variant()`; and a contract with several namespaces.
- [ ] A second, test-only scope type works without any change to the ORM client or the framework, proving the mechanism is general.
- [ ] `examples/prisma-8-demo` searches posts across more than one field through a scope.
- [ ] The skill reference and upgrade instructions describe the new index representation and the scope surface.

## Open questions

None.

## References

- [ADR 257 — Collection scopes declared on the model](../../docs/architecture%20docs/adrs/ADR%20257%20-%20Collection%20scopes%20declared%20on%20the%20model.md)
- [ADR 175 — Shared ORM Collection interface](../../docs/architecture%20docs/adrs/ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md): collections and custom collection classes.
- [ADR 180 — Dot-path field accessor](../../docs/architecture%20docs/adrs/ADR%20180%20-%20Dot-path%20field%20accessor.md): separate namespaces for user-chosen and framework-chosen names.
- [ADR 174 — Aggregate roots and relation strategies](../../docs/architecture%20docs/adrs/ADR%20174%20-%20Aggregate%20roots%20and%20relation%20strategies.md): what a root is, and why a search is not one.
- [ADR 236 — Target-contributed model attributes](../../docs/architecture%20docs/adrs/ADR%20236%20-%20Target-contributed%20model%20attributes.md): how a package's attribute produces contract data, which a scope declaration parallels.
- [ADR 206 — Operations as TypeScript functions](../../docs/architecture%20docs/adrs/ADR%20206%20-%20Operations%20as%20TypeScript%20functions.md): the column operations and `tsquery` helpers.
- Code: `packages/3-extensions/sql-orm-client/src/collection.ts` (class-based cloning, aggregate reducers), `packages/3-extensions/sql-orm-client/src/orm.ts` (collection registry and client types), `packages/3-targets/3-targets/postgres/src/core/full-text-index-expression.ts` (index expression renderer).
