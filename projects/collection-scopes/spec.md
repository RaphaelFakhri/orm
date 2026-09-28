# Collection scopes and weighted full-text search

**Linear project:** none yet.
**Design record:** [ADR 256 — Collection scopes derived from indexes](../../docs/architecture%20docs/adrs/ADR%20256%20-%20Collection%20scopes%20derived%20from%20indexes.md) (Proposed).

## Purpose

A developer can search a model across several fields, with some fields counting more than others, through the ORM client, and the search always uses the index declared for it. The mechanism that makes this possible is general: any index kind can offer ways into a model's collection, and a target or extension can supply them without the contract or the framework knowing about the ORM client.

## At a glance

```prisma
model Post {
  id    Int     @id
  title String
  body  String?

  @@fullTextSearch(search, weights: [title, body])
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
- **A spike showed the types work without the caller writing any.** Contributions register their types by index kind in a registry interface the ORM client declares. With no scope in use, this adds about half a percent to type checking on the demo application. See [the spike findings](spikes/type-composition.md).
- **A contract index does not record which package owns its kind.** The check at client construction needs that to name a missing extension.

## Non-goals

- **Generated or stored `tsvector` columns.** The contract cannot represent generated columns. Search documents are expression indexes.
- **A MySQL target, or scope support for it.**
- **Combining relevance with another sort key.** An explicit `orderBy` replaces relevance order.
- **Highlighting a whole search document.** Highlighting stays per column through `fullTextHeadline`.
- **A domain name for an index independent of its storage name.** Recorded in the ADR as a possible extension.
- **Scopes for other index kinds** such as vector or geospatial indexes. The mechanism must allow them; this project delivers full-text only.
- **Changes to the ParadeDB extension.**
- **Relation navigation on collections** (`db.User.where(...).posts`).

## Place in the larger world

- **ORM client (`sql-orm-client`).** Gains the `scopes` member, the registry and interface that contributions satisfy, the check at construction that every registered index kind has a runtime contribution, and default-order handling.
- **Postgres target.** May reference the ORM client's interface type directly. Owns the full-text index kind: its authoring attribute, its structured representation, its DDL, and its scope operations. Reuses the existing full-text lowering and the `tsquery` helpers.
- **Postgres facade.** Its signature does not change. It passes the runtime contributions from the target and from `extensions` to the ORM client.
- **Package build.** Rewrites the internal module name in a registry declaration to the published one.
- **Contract and emitter.** Carry the index as structured data. No ORM-specific types are emitted.
- **Migrations.** A changed index representation changes storage hashes of contracts that declare a full-text index. The feature has no consumers yet, so no migration path from the opaque representation is provided.
- **Mongo ORM client.** Out of scope for delivery, but the design must not rule it out; the ADR records the MongoDB constraints.

## Cross-cutting requirements

- **The contract is not coupled to the ORM client.** Nothing emitted into `contract.json` or `contract.d.ts` describes scopes, collection members, or any one query interface.
- **The query expression and the index expression come from one renderer**, so a scope query always matches its index. An integration test proves the planner uses the index, with sequential scans disabled and negative controls.
- **No special cases by index kind or target in the ORM client.** The ORM client knows the interface; owners of index kinds supply behaviour.
- **A scope is reachable on every collection of its model**: root, chained, inside an include refinement, and on a custom collection class.
- **Scopes are reached through `scopes.<name>` only.** Nothing is placed directly on the collection.
- **Constructing a client needs no type arguments or annotations for scopes**, whichever package contributes them, first-party or not.
- **A user who declares no scope-backing index pays at most one percent more type checking**, measured on `examples/prisma-8-demo`.
- **Existing column operations and their tests are unchanged.**
- **User input stays safe.** Scope operations take a `tsquery`, as the column operations do; a plain string does not compile.

## Transitional-shape constraints

- **The structured full-text index lands before any scope reads it**, and the single-field `@@fullTextIndex` keeps producing the same DDL throughout.
- **Green main between slices; each slice is one independently mergeable PR.**

## Project Definition of Done

- [ ] Team-DoD floor (repo checks, docs, upgrade instructions, Linear close-out).
- [ ] ADR 256 is Accepted and matches what shipped, including its examples.
- [ ] A model with a weighted multi-field full-text index can be searched through `scopes.<name>.fulltext(query)` on a root collection, a chained collection, an include refinement, and a custom collection class, with whole-result assertions.
- [ ] Results are ordered by relevance by default, a title match ranks above a body match in a test, and an explicit `orderBy` replaces that order.
- [ ] `EXPLAIN` shows the planner using the declared index for a scope query.
- [ ] Type tests show the scope and its operation typed from the contract's index data, and show a model without such an index has no scope.
- [ ] A test on the built, published packages shows a registered scope is typed, so a registry declaration naming an internal module cannot ship.
- [ ] A client given a contract whose index kind is registered, without the extension that serves it, refuses to start and names the extension.
- [ ] A second, test-only contribution for a different index kind works without any change to the ORM client, proving the mechanism is general.
- [ ] `examples/prisma-8-demo` searches posts across more than one field through a scope.
- [ ] The skill reference and upgrade instructions describe the new index representation and the scope surface.

## Open questions

1. **How the weighted index is authored.** The sketch uses a new attribute, `@@fullTextSearch(search, weights: [...])`. The alternative is widening the existing `@@fullTextIndex` to take a weighted field list. Both declare an index; the question is whether one attribute or two.
2. **The TypeScript builder's form** of the weighted index, as the twin of the PSL attribute.
3. **How a contract index records the package that owns its kind**, so the check at client construction can name a missing extension.
4. **What the spike did not test:** two packages registering the same index kind, grouped collections, `.variant()`, and contracts with several namespaces.

## References

- [ADR 256 — Collection scopes derived from indexes](../../docs/architecture%20docs/adrs/ADR%20256%20-%20Collection%20scopes%20derived%20from%20indexes.md)
- [ADR 175 — Shared ORM Collection interface](../../docs/architecture%20docs/adrs/ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md): collections and custom collection classes.
- [ADR 180 — Dot-path field accessor](../../docs/architecture%20docs/adrs/ADR%20180%20-%20Dot-path%20field%20accessor.md): separate namespaces for user-chosen and framework-chosen names.
- [ADR 174 — Aggregate roots and relation strategies](../../docs/architecture%20docs/adrs/ADR%20174%20-%20Aggregate%20roots%20and%20relation%20strategies.md): what a root is, and why a search is not one.
- [ADR 236 — Target-contributed model attributes](../../docs/architecture%20docs/adrs/ADR%20236%20-%20Target-contributed%20model%20attributes.md): how `@@fullTextIndex` produces an index.
- [ADR 206 — Operations as TypeScript functions](../../docs/architecture%20docs/adrs/ADR%20206%20-%20Operations%20as%20TypeScript%20functions.md): the column operations and `tsquery` helpers.
- Code: `packages/3-extensions/sql-orm-client/src/collection.ts` (class-based cloning, aggregate reducers), `packages/3-extensions/sql-orm-client/src/orm.ts` (collection registry and client types), `packages/3-targets/3-targets/postgres/src/core/full-text-index-expression.ts` (index expression renderer).
