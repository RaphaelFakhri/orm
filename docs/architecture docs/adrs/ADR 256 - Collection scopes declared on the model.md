# ADR 256 — Collection scopes declared on the model

**Status:** Proposed
**Date:** 2026-09-28
**Builds on:** [ADR 172 — Contract domain-storage separation](ADR%20172%20-%20Contract%20domain-storage%20separation.md), [ADR 174 — Aggregate roots and relation strategies](ADR%20174%20-%20Aggregate%20roots%20and%20relation%20strategies.md), [ADR 175 — Shared ORM Collection interface](ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md), [ADR 180 — Dot-path field accessor](ADR%20180%20-%20Dot-path%20field%20accessor.md), [ADR 236 — Target-contributed model attributes](ADR%20236%20-%20Target-contributed%20model%20attributes.md)

---

## At a glance

A model declares a full-text search named `search` over several fields. The earlier a field appears in the list, the more a match in it counts, and fields in a nested list share a weight:

```prisma
model Post {
  id       Int     @id
  userId   Int
  title    String
  subtitle String?
  body     String?

  @@fullTextSearch(search, [[title, subtitle], body])
}
```

The attribute declares the scope and creates the index that serves it. The contract records both, the scope in the domain plane and the index in the storage plane:

```json
{
  "domain": { "models": { "Post": {
    "scopes": {
      "search": { "type": "pg/full-text@1", "params": { "index": "post_search" } }
    }
  } } },
  "storage": { "tables": { "post": { "indexes": [
    {
      "name": "post_search_0a1b2c3d",
      "prefix": "post_search",
      "type": "gin",
      "options": { "fields": [["title", "subtitle"], ["body"]], "language": "english" }
    }
  ] } } }
}
```

The ORM client offers the scope on every collection of the model:

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

**A scope is a named, chainable way to find a model's entities, declared on the model.** "Posts can be searched by text, and the search is called `search`" is a statement about the domain. Calling a scope operation returns a collection of the same model, narrowed and ordered by the scope's own notion of relevance. Everything that works on a collection works on the result.

**The contract declares scopes in the domain plane.** A model has a `scopes` member. Each scope has a name, a scope type, and the parameters of that type. The framework defines this shape and knows no scope type.

**A scope type is an open id that a target or extension introduces**, as a codec id is. `pg/full-text@1` belongs to the Postgres target. Any package can introduce another.

**A scope's parameters point at the storage that serves it.** The full-text scope has one parameter, the authored name of an index on the model's table. The fields, weights and language are storage facts and stay on the index. The domain holds nothing specific to the index.

**One attribute declares the scope and creates its index.** The author names the scope. The index gets a name generated from the table and the scope, and `map:` adopts an existing index by its exact name. An index without a scope is written with `@@index(expression: ...)`.

**Scopes live under `scopes` on the collection, and nowhere else.** `collection.scopes.<name>` reaches the scope. Scope names share that member only with other scope names, so they cannot collide with a collection method or a custom collection class's method. A caller who wants a shorter name writes a method on a custom collection class.

**A scope is available on every collection of its model.** That includes a collection reached by chaining and the collection handed to an `include` refinement. A collection accumulates state and compiles when a terminal method runs, so the position of a scope call in a chain does not change the query.

**A scope operation sets a default order, and an explicit `orderBy` replaces it.** `scopes.search.fulltext(q)` orders by relevance. Adding `orderBy` anywhere in the chain, before or after the scope call, replaces the relevance order.

**The package that introduces a scope type supplies its operations, through an interface the ORM client defines.** A contribution has two halves. The runtime half travels on the target's or extension's descriptor, which the caller already passes in `extensions`; a descriptor that has nothing to offer the ORM omits it. For a call, it returns a filter and an optional default order. The ORM client applies those to the collection, so the rule for default order lives in one place. The type half is described next.

**Contributions register their types by scope type, and the caller writes no types.** The ORM client package declares an empty interface that acts as a registry keyed by scope type. A contributing package adds its line to that interface in its own type declarations, which TypeScript merges when the package is imported:

```ts
declare module '@prisma/orm-family-sql/orm-client' {
  interface ScopeContributions {
    'pg/full-text@1': FullTextScope;
  }
}
```

The collection's type reads the model's declared scopes from the contract type and looks each one up in the registry by its scope type. `FullTextScope` has two slots the ORM client fills, the index the scope points at and the collection, so its operations can be typed from the index and can return the model's collection. The client factory's signature does not change, and a contribution from any package is typed the same way as one from the target.

**The contract carries no types that describe one query interface.** It states that the scope exists and what type it has. What a query interface offers for a scope type is that interface's own business. A query interface that has no scopes ignores them, as the SQL builder ignores `roots`.

**An index that serves a scope is structured data in the contract.** A scope operation renders its query from the index's fields, weights and language, so the index records those as data and the index expression is rendered from them.

### Responsibilities

| Party | Owns |
| --- | --- |
| Framework | The `scopes` member of a model and its shape: name, scope type, parameters |
| Contract | The scope on the model, and the index as structured storage data |
| Target or extension that introduces the scope type | The attribute that declares the scope and its index, the index's DDL, the scope's operations, and their line in the registry |
| ORM client | The `scopes` member of a collection, the registry and contribution interface, applying a scope's filter and default order, and the collection's types |
| Adapter | Lowering the resulting query, as for any other |

## Why

**Finding entities is the collection's job, not a property of the entity.** "Posts are found by relevance, and the title counts more than the body" is knowledge about how posts are retrieved. It is not an attribute of a post, so it does not belong on the row accessor beside `title` and `body`. The collection is where ways of retrieving a model already live: `where`, `orderBy`, and the methods of custom collection classes.

**Authors want the search, and the index is how they get it.** Almost nobody wants a full-text index they cannot query. The attribute is therefore named for the search and creates the index. The rarer case of an index alone uses the lower-level `@@index`.

**Declared, not derived.** ADR 174 declares roots in the contract and rejected deriving them from storage. A scope is the same kind of thing: a named way in that has meaning in the domain. Declaring it also makes the lookup exact. Deriving it meant deciding from an index's shape which package should serve it.

**The shape is one the contract already uses.** A field's type is an open id with parameters, `{ codecId, typeParams }`. The domain may refer to storage and not the reverse (ADR 221), as `model.storage` and a many-to-many relation's `through` already do.

**The query and the index must agree, and only a shared definition guarantees it.** Postgres uses an expression index only when the query's expression is the same as the indexed one. When a query restates the field list, order, weights or language by hand, any difference silently turns an indexed search into a sequential scan. A scope renders the query from the index's own definition, so the two cannot differ.

**User-chosen names and ORM-chosen names must not be able to break each other.** ADR 180 keeps scalar fields and operators in separate namespaces for this reason. Scope names are chosen by the contract's author, and collection methods are chosen by the ORM client. Keeping scopes under one member means a scope is always reachable, whatever either side adds later.

**Construction must not need type annotations.** The documented way to build a client writes the contract type explicitly, `postgres<Contract>({ ... })`, and TypeScript stops inferring any further type argument once one is written. A contribution passed as an inferred type argument would therefore force the caller to write its type. A registry needs no type argument, so the call stays as it is and any package can contribute.

**Every user pays for what the collection type carries.** Measured on a real application contract with no scope in use, declared scopes under `scopes` add about a tenth of a percent to the type checker's work. Also placing scopes directly on the collection adds about four percent, for every user, whether or not they declare a scope.

**Relevance order is not a property of the index.** Postgres's GIN index cannot return rows in order; rows matched through it come back in no particular order, and ordering by relevance computes the rank of every matching row and sorts them. MongoDB likewise returns text matches unordered unless the query sorts by the text score. Relevance order is therefore a default the scope operation chooses, which is why a caller can replace it.

## Consequences

- **`@@fullTextSearch` replaces `@@fullTextIndex`.** The index records fields, weights and language as data. A hand-written expression index keeps working as an index and has no scope.
- **Attribute lowering returns more than one thing.** An attribute returns either a storage entity or an index today (ADR 236). It must be able to return an index and a scope together.
- **The domain plane gains a member that packages fill.** No package contributes to the domain plane today.
- **The contract validator cannot check a scope's parameters**, because it does not consult package registries. Index types have the same limit (ADR 210, index-type registry). The client checks at construction that each scope's type has a contribution and that its index exists, and refuses to start otherwise.
- **Several scopes per model on SQL targets, one text search scope on MongoDB.** MongoDB permits one text index per collection. Postgres permits several indexes and therefore several scopes.
- **MongoDB's placement rule stays inside the ORM client.** MongoDB accepts a text search only in the first stage of a pipeline, together with any other filters. Because a collection compiles at the terminal method, the Mongo ORM client places the text search and the accumulated filters in that first stage regardless of call order. A text search inside a `$lookup` sub-pipeline is accepted, so scopes work inside includes there too.
- **Ordering by relevance costs a sort over every match.** A caller who needs only the matching rows can replace the default order with a cheaper one.
- **Relevance cannot be combined with another sort key.** Replacing is the only interaction between the default order and `orderBy`. Combining them needs a way to refer to the relevance score inside `orderBy`, which this decision does not provide.
- **Column operations remain.** `fullTextMatches`, `fullTextRank` and `fullTextHeadline` on a single text column are unchanged. `fullTextHeadline` has no scope equivalent, because highlighting needs text and a search document is not text; highlighting stays per column.
- **A contributing package depends on the ORM client package,** because its type declarations name it.
- **Published packages must name the published module.** A registry declaration that names an internal module specifier is ignored without an error, and `scopes` comes out empty. The build rewrites the specifier, and a test on the built packages guards it.
- **Custom collection classes see scopes everywhere.** `this.scopes` is typed inside the class body and after chained calls.

## Alternatives considered

- **Derive scopes from the model's indexes, with nothing in the contract.** The ORM client must then decide from an index's shape which package serves it. Two packages can match one index by accident, and the scope's name is tied to the index's storage name.
- **A type id or kind field on the index.** It marks a storage object with what a query interface should do with it, and the scope still has no place in the domain. A kind with a fixed set of values could also not be extended by an extension.
- **Separate attributes, or an optional argument, for the scope and the index.** It makes the common case the exception.
- **Store the fields and weights on the scope.** It puts data specific to one kind of index into the domain plane.
- **Make each search an aggregate root beside the model's own.** A root is the entry point to an aggregate, one per directly queryable model. A search is another way into the same aggregate, so this gives one model two roots and blurs what being a root means.
- **Offer search only as a starting point, not on every collection.** The collection inside an `include` refinement is created by the ORM client from the relation, not started by the caller, so a starting-point-only scope could never be used there.
- **Put the search document on the row accessor, as `p.search`.** It places something that is not a field in the field namespace, where a model with a field of that name collides with it.
- **Have the query restate the fields and weights.** Any difference from the index silently disables it.
- **Model scope operations as query operations.** A query operation applies to a column or expression and returns a value with a codec. A scope operation applies to a collection and returns a collection.
- **Carry the scope operations' types in the emitted contract.** It couples the contract to one query interface.
- **Place scopes directly on the collection, as `db.Post.search`, alone or beside `scopes`.** It costs every user about four percent more type checking on a real application contract. A custom collection class with a method of the same name gets a compile error. Alone, it also lets a method added in a later release shadow an existing scope.
- **Pass contributions as a type argument inferred from the client factory call.** TypeScript infers no further type argument once the contract type is written explicitly, so the caller would have to write the contributions' types.
- **Build the target's own contributions into the client's types.** It works only for contributions known in advance, and an extension's are not.
- **Carry contribution types by extending the collection base class.** A class cannot be generic over the literal index of whichever model it is applied to, so it cannot type an operation from the index.
- **Relevance as a sort key at the point of the call.** The same two calls in a different order would mean different queries, unlike every other collection refinement.
