# ADR 256 — Collection scopes derived from indexes

**Status:** Proposed
**Date:** 2026-09-27
**Builds on:** [ADR 175 — Shared ORM Collection interface](ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md), [ADR 180 — Dot-path field accessor](ADR%20180%20-%20Dot-path%20field%20accessor.md), [ADR 236 — Target-contributed model attributes](ADR%20236%20-%20Target-contributed%20model%20attributes.md)

---

## At a glance

A model declares a full-text index over several fields. The earlier a field appears in the list, the more a match in it counts, and fields in a nested list share a weight:

```prisma
model Post {
  id       Int     @id
  userId   Int
  title    String
  subtitle String?
  body     String?

  @@fullTextIndex([[title, subtitle], body], name: "search")
}
```

The ORM client offers that index as a scope on every collection of the model:

```ts
import { websearchToTsquery } from '@prisma/orm-postgres/target/full-text';

const q = websearchToTsquery(input);

// best matches first
db.Post.scopes.search.fulltext(q).limit(10).all();

// chained after other refinements, and ordered explicitly
db.Post.where((p) => p.userId.eq(userId))
  .scopes.search.fulltext(q)
  .orderBy((p) => p.id.desc())
  .all();

// inside an include: this user, with their three most relevant posts
db.User.where({ id: userId }).include('posts', (posts) =>
  posts.scopes.search.fulltext(q).limit(3),
);
```

The client is constructed as it is for any other use. Nothing about scopes is written there:

```ts
import pgvector from '@prisma/orm-extension-pgvector/runtime';
import postgres from '@prisma/orm-postgres/runtime';

export const db = postgres<Contract>({ contractJson, extensions: [pgvector] });
```

A shorter name is a method on a custom collection class:

```ts
class PostCollection extends Collection<Contract, 'Post'> {
  search(q: TsqueryArgument) {
    return this.scopes.search.fulltext(q);
  }
}
```

On Postgres the first query lowers to a match against the indexed expression, ordered by rank:

```sql
SELECT ... FROM "public"."post"
WHERE (setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', coalesce("subtitle", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'B')) @@ websearch_to_tsquery('english', $1)
ORDER BY ts_rank(setweight(...) || setweight(...) || setweight(...), websearch_to_tsquery('english', $1)) DESC
LIMIT 10
```

## Decision

**A scope is a named, chainable way into a model's collection that an index makes possible.** Calling a scope operation returns a collection of the same model, narrowed and ordered by the index's own notion of relevance. Everything that works on a collection works on the result.

**The ORM client derives scopes from the model's indexes. The contract declares no scopes.** The contract states storage facts: this table has this index, over these fields, with these weights. The ORM client reads the indexes of a model's table or collection and offers a scope for each index that a contribution serves. This is the same kind of derivation the ORM client already performs when it reads a table's primary key and unique constraints to decide row identity and upsert conflict targets.

**A scope's name is the index's authored name, exactly.** The contract records an index's authored name separately from its physical name, so no string transformation is involved. An index authored with `name: "search"` is the scope `search`; an index declared with an exact physical name through `map:` uses that name.

**Scopes live under `scopes` on the collection, and nowhere else.** `collection.scopes.<name>` reaches the scope. Scope names share that member only with other scope names, so they cannot collide with a collection method or a custom collection class's method. A caller who wants a shorter name writes a method on a custom collection class.

**A scope is available on every collection of its model.** That includes a collection reached by chaining and the collection handed to an `include` refinement. A collection accumulates state and compiles when a terminal method runs, so the position of a scope call in a chain does not change the query.

**A scope operation sets a default order, and an explicit `orderBy` replaces it.** `scopes.search.fulltext(q)` orders by relevance. Adding `orderBy` anywhere in the chain, before or after the scope call, replaces the relevance order.

**The package that authors an index supplies its scope operations, through an interface the ORM client defines.** A contribution has two halves. The runtime half travels on the target's or extension's descriptor, which the caller already passes in `extensions`; a descriptor that has nothing to offer the ORM omits it. It says which indexes it serves and, for a call, returns a filter and an optional default order. The ORM client applies those to the collection, so the rule for default order lives in one place. The type half is described next.

**Contributions register their types in a registry, and the caller writes no types.** The ORM client package declares an empty interface that acts as a registry. A key is the contribution's own id. A contributing package adds its entry to that interface in its own type declarations, which TypeScript merges when the package is imported:

```ts
declare module '@prisma/orm-family-sql/orm-client' {
  interface ScopeContributions {
    'pg/full-text': FullTextScope;
  }
}
```

**An entry states the shape of the indexes it serves, and an index has the scope when its data fits that shape.** The entry declares a `match` type. The collection's type compares each of the model's indexes, as literal data from the contract, with it. The index carries no field that names its kind, so the set of index kinds is open and any package can add one. The collection's type uses an entry only when the contract lists the entry's owner, as its target or among its extensions, so two clients with different contracts get different scopes. An entry also has two slots the ORM client fills, the index and the collection, so its operations can be typed from the index and can return the model's collection. The client factory's signature does not change, and a contribution from any package is typed the same way as one from the target.

**Types never come from the emitted contract.** The emitted `contract.d.ts` gives the type system access to the contract's data, including each index as literal types. The contract carries no types that describe one query interface, because the ORM client is an interchangeable component the contract must not be coupled to.

**An index that backs a scope is structured data in the contract.** A scope operation renders its query from the index's fields, weights and language, so the index records those as data and the index expression is rendered from them. An index stored only as an opaque SQL expression cannot back a scope.

### Responsibilities

| Party | Owns |
| --- | --- |
| Contract | The index as structured storage data, with its authored name |
| Target or extension that authors the index | The attribute that authors the index, the index's DDL, its scope operations, and their registry entry |
| ORM client | The `scopes` member, the registry and contribution interface, applying a scope's filter and default order, and the collection's types |
| Adapter | Lowering the resulting query, as for any other |

## Why

**Finding entities is the collection's job, not a property of the entity.** "Posts are found by relevance, and the title counts more than the body" is knowledge about how posts are retrieved. It is not an attribute of a post, so it does not belong on the row accessor beside `title` and `body`. The collection is where ways of retrieving a model already live: `where`, `orderBy`, and the methods of custom collection classes.

**The query and the index must agree, and only a shared definition guarantees it.** Postgres uses an expression index only when the query's expression is the same as the indexed one. When a query restates the field list, order, weights or language by hand, any difference silently turns an indexed search into a sequential scan. A scope renders the query from the index's own definition, so the two cannot differ.

**User-chosen names and ORM-chosen names must not be able to break each other.** ADR 180 keeps scalar fields and operators in separate namespaces for this reason. Scope names are chosen by whoever authors the index, and collection methods are chosen by the ORM client. Keeping scopes under one member means a scope is always reachable, whatever either side adds later.

**Construction must not need type annotations.** The documented way to build a client writes the contract type explicitly, `postgres<Contract>({ ... })`, and TypeScript stops inferring any further type argument once one is written. A contribution passed as an inferred type argument would therefore force the caller to write its type. A registry needs no type argument, so the call stays as it is and any package can contribute.

**Every user pays for what the collection type carries.** Measured on a real application contract with no scope in use, the registry with scopes under `scopes` adds about half a percent to the type checker's work. Also placing scopes directly on the collection adds about four percent, for every user, whether or not they declare such an index.

**Relevance order is not a property of the index.** Postgres's GIN index cannot return rows in order; rows matched through it come back in no particular order, and ordering by relevance computes the rank of every matching row and sorts them. MongoDB likewise returns text matches unordered unless the query sorts by the text score. Relevance order is therefore a default the scope operation chooses, which is why a caller can replace it.

## Consequences

- **Several scopes per model on SQL targets, one on MongoDB.** MongoDB permits one text index per collection, so a MongoDB model has at most one text search scope. Postgres permits several indexes and therefore several scopes.
- **MongoDB's placement rule stays inside the ORM client.** MongoDB accepts a text search only in the first stage of a pipeline, together with any other filters. Because a collection compiles at the terminal method, the Mongo ORM client places the text search and the accumulated filters in that first stage regardless of call order. A text search inside a `$lookup` sub-pipeline is accepted, so scopes work inside includes there too.
- **Ordering by relevance costs a sort over every match.** A caller who needs only the matching rows can replace the default order with a cheaper one.
- **Relevance cannot be combined with another sort key.** Replacing is the only interaction between the default order and `orderBy`. Combining them needs a way to refer to the relevance score inside `orderBy`, which this decision does not provide.
- **The Postgres full-text index changes representation.** It records fields, weights and language as data. A contract that declares a full-text index as a hand-written expression index keeps working as an index and offers no scope.
- **Column operations remain.** `fullTextMatches`, `fullTextRank` and `fullTextHeadline` on a single text column are unchanged. `fullTextHeadline` has no scope equivalent, because highlighting needs text and a search document is not text; highlighting stays per column.
- **A package contributes scopes only when the contract lists it.** The contract records the target and the extensions it was built with. The types use that list, and the client already refuses to start when the contract lists an extension that was not passed to it. The types and the runtime therefore agree for every client that starts.
- **Two entries can match the same index.** The index then offers the operations of both.
- **A contributing package depends on the ORM client package,** because its type declarations name it.
- **Published packages must name the published module.** A registry entry that names an internal module specifier is ignored without an error, and `scopes` comes out empty. The build rewrites the specifier, and a test on the built packages guards it.
- **Custom collection classes see scopes everywhere.** `this.scopes` is typed inside the class body and after chained calls.

### Possible extension: a domain name for an index

An index could carry a domain name independent of its storage name, as a model has a name independent of its table's. A scope would use the domain name when present. That name would live in the contract's domain plane and refer to the storage index through the contract's entity coordinates.

## Alternatives considered

- **A kind field on the index, with the registry keyed by it.** A field with a fixed set of values on a generic concept cannot be extended by an extension. Matching by shape needs no such field.

- **Declare scopes in the contract's domain plane, mapped to a storage entity.** The domain entry carries nothing beyond a name that the index already has, and the mapping needs entity coordinates to address an index inside a table or collection, which they cannot do. It also makes every ORM client honour a concept that only some of them need.
- **Make each search an aggregate root beside the model's own.** A root is the entry point to an aggregate, one per directly queryable model. A search is another way into the same aggregate, so this gives one model two roots and blurs what being a root means.
- **Offer search only as a starting point, not on every collection.** The collection inside an `include` refinement is created by the ORM client from the relation, not started by the caller, so a starting-point-only scope could never be used there.
- **Put the search document on the row accessor, as `p.search`.** It places something that is not a field in the field namespace, where a model with a field of that name collides with it.
- **Have the query restate the fields and weights.** Any difference from the index silently disables it.
- **Model scope operations as query operations.** A query operation applies to a column or expression and returns a value with a codec. A scope operation applies to a collection and returns a collection.
- **Carry scope types in the emitted contract.** It couples the contract to one query interface.
- **Place scopes directly on the collection, as `db.Post.search`, alone or beside `scopes`.** It costs every user about four percent more type checking on a real application contract, against half a percent for `scopes` alone. A custom collection class with a method of the same name gets a compile error. Alone, it also lets a method added in a later release shadow an existing scope.
- **Pass contributions as a type argument inferred from the client factory call.** TypeScript infers no further type argument once the contract type is written explicitly, so the caller would have to write the contributions' types.
- **Build the target's own contributions into the client's types.** It works only for contributions known in advance, and an extension's are not.
- **Carry contribution types by extending the collection base class.** A class cannot be generic over the literal index of whichever model it is applied to, so it cannot type an operation from the index.
- **Relevance as a sort key at the point of the call.** The same two calls in a different order would mean different queries, unlike every other collection refinement.
