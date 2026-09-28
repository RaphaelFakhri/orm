# ADR 256 — Collection scopes declared on the model

**Status:** Proposed
**Date:** 2026-09-28
**Builds on:** [ADR 172 — Contract domain-storage separation](ADR%20172%20-%20Contract%20domain-storage%20separation.md), [ADR 174 — Aggregate roots and relation strategies](ADR%20174%20-%20Aggregate%20roots%20and%20relation%20strategies.md), [ADR 175 — Shared ORM Collection interface](ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md), [ADR 236 — Target-contributed model attributes](ADR%20236%20-%20Target-contributed%20model%20attributes.md)

---

## At a glance

A schema author says that posts can be searched by text, and that a match in the title counts more than a match in the body:

```prisma
model Post {
  id     Int     @id
  userId Int
  title  String
  body   String?

  @@fullTextSearch(search, [title, body])
}
```

An application searches posts through the ORM client, by the name the author chose:

```ts
const q = websearchToTsquery('postgres index');

const posts = await db.Post.scopes.search.fulltext(q).limit(10).all();
```

The result is ten posts, best match first. The database answers the query from an index that the same attribute created.

## Decision

A **scope** is a named way to find a model's entities that goes beyond filtering on its fields. Full-text search across several fields is the first one.

1. **A scope is declared on the model in the contract**, with a name, a scope type, and parameters.
2. **A scope type is an open id.** A target or an extension introduces it, and supplies what the ORM client offers for it.
3. **One schema attribute declares the scope and creates the storage that serves it.**
4. **The ORM client offers each scope at `collection.scopes.<name>`**, on every collection of the model.
5. **A scope operation returns a collection.** It narrows the collection and sets a default order, which an explicit `orderBy` replaces.

The rest of this document follows one search from the schema to the SQL, and gives the reason for each choice where it is made.

## The problem a scope solves

Searching several fields at once needs one search document built from all of them, for example the title and the body joined together with the title weighted higher. In Postgres that document is an expression, and an index over the expression makes the search fast.

Two things make this hard to offer through a query interface that knows only fields:

- **The search document is not a field.** The ORM client's row accessor, `p.title`, reaches stored fields and relations. There is nothing to call `fullTextMatches` on.
- **The query must repeat the index's expression exactly.** Postgres uses an expression index only when the query contains the same expression. If the query lists the fields in another order, or uses another language or weight, the database scans the whole table and reports no error.

A scope gives the search a name on the model, and renders the query from the same definition as the index.

## How it works

### 1. The author declares the search

```prisma
@@fullTextSearch(search, [[title, subtitle], body])
```

- **The first argument is the scope's name.** It is the name the application uses.
- **The list gives the fields in order of weight.** Fields in a nested list share a weight. Here `title` and `subtitle` count most, and `body` counts less.
- **The index is created for the author.** Its name is generated from the table and the scope, here `post_search`. `map: "existing_index_name"` uses an index that already exists under that exact name.

The TypeScript contract builder has the same declaration. The key is the scope's name, and the target contributes the `fullTextSearch` helper:

```ts
model('Post', { fields: { id, title, subtitle, body } }).scopes(({ fields, scopes }) => ({
  search: scopes.fullTextSearch([[fields.title, fields.subtitle], fields.body]),
}));
```

The attribute is named for the search because that is what the author wants. The index is how they get it. An author who wants an index and no scope writes `@@index(expression: ...)`.

### 2. The contract records a scope and an index

The contract has two planes. The domain plane describes models and their fields. The storage plane describes tables, columns and indexes. The attribute writes to both:

```json
{
  "domain": { "namespaces": { "public": { "models": { "Post": {
    "scopes": {
      "search": { "type": "pg/full-text@1", "params": { "index": "post_search" } }
    }
  } } } } },
  "storage": { "namespaces": { "public": { "entries": { "table": { "post": {
    "indexes": [
      {
        "name": "post_search_0a1b2c3d",
        "prefix": "post_search",
        "type": "gin",
        "options": { "fields": [["title", "subtitle"], ["body"]], "language": "english" }
      }
    ]
  } } } } } }
}
```

**The scope belongs to the domain.** "Posts can be searched, and the search is called `search`" is a statement about posts. It is true whatever database holds them.

**The scope has a type and parameters.** `type` is an open id, as a field's `codecId` is. `pg/full-text@1` belongs to the Postgres target, and any package can introduce another. The framework defines the shape `{ type, params }` and knows no scope type.

**The parameters point at storage.** The full-text scope has one parameter: the name of an index on the model's table. The domain plane may refer to the storage plane, as a model's `storage.table` does. The reverse is not allowed.

**The fields, weights and language stay on the index.** They describe how the database stores the search document, so they are storage facts. The domain plane holds nothing specific to one kind of index.

**The index is data, not a SQL string.** The index expression and the query are both rendered from `options`, by one renderer. That is what keeps them the same.

**The contract does not describe the ORM client.** It says the scope exists and what type it has. It does not say what methods a query interface offers for it. A query interface that has no scopes ignores them, as the SQL builder ignores `roots`.

### 3. The ORM client offers the scope on collections

A collection is the ORM client's object for querying one model: `db.Post`. Methods such as `where` and `limit` each return a new collection, and a terminal method such as `all()` runs the query.

Every collection of a model has a `scopes` member, with one member for each scope the model declares:

```ts
// at the start
db.Post.scopes.search.fulltext(q).limit(10).all();

// after other methods
db.Post.where((p) => p.userId.eq(userId)).scopes.search.fulltext(q).all();

// on the collection of related posts inside an include
db.User.where({ id: userId }).include('posts', (posts) =>
  posts.scopes.search.fulltext(q).limit(3),
);
```

**Scopes live under `scopes` and nowhere else.** The contract's author chooses scope names. The ORM client chooses the names of collection methods. Under one member, neither can hide the other, whatever either adds later.

**A scope works at any position in a chain.** A collection only records what was asked, and builds the query when the terminal method runs. The order of calls does not change the query.

**A shorter name is a method on a custom collection class:**

```ts
class PostCollection extends Collection<Contract, 'Post'> {
  search(q: TsqueryArgument) {
    return this.scopes.search.fulltext(q);
  }
}
```

### 4. The package that owns the scope type supplies the operations

`fulltext` is not part of the ORM client. The Postgres target supplies it, because `pg/full-text@1` is its scope type. An extension does the same for a scope type of its own.

The ORM client defines an interface for this. For a call such as `fulltext(q)`, the supplier returns a filter and, optionally, a default order:

```ts
interface ScopeRefinement {
  readonly filter: AnyExpression;
  readonly defaultOrderBy?: readonly OrderByItem[];
}
```

The ORM client applies both to the collection. The supplier never touches the collection itself.

The supplier's code travels on the descriptor that the application already passes to the client. Nothing new is written when the client is constructed:

```ts
import pgvector from '@prisma/orm-extension-pgvector/runtime';
import postgres from '@prisma/orm-postgres/runtime';

export const db = postgres<Contract>({ contractJson, extensions: [pgvector] });
```

### 5. The types come from a registry

`db.Post.scopes.search.fulltext` must be fully typed, for a scope type from any package, and the application must not have to write a type to get that.

The ORM client package declares an empty interface. It is a list of scope types, and each package adds its own line:

```ts
// in the ORM client package
interface ScopeContributions {}

// in the Postgres target's type declarations
declare module '@prisma/orm-family-sql/orm-client' {
  interface ScopeContributions {
    'pg/full-text@1': FullTextScope;
  }
}
```

TypeScript merges the two declarations when the package is imported. `FullTextScope` describes the operations. The ORM client gives it the scope's index and the model's collection, so an operation can be typed from the index and can return the right collection:

```ts
interface FullTextScope {
  readonly index: unknown;      // filled by the ORM client
  readonly collection: unknown; // filled by the ORM client
  readonly operations: {
    fulltext(query: TsqueryArgument): this['collection'];
  };
}
```

The collection's type reads the model's scopes from the contract type, and looks up each scope's `type` in the list.

**Why a registry.** The documented way to build a client names the contract type: `postgres<Contract>(...)`. Once one type argument is written, TypeScript infers no others, so a type passed along with `extensions` would have to be written by hand. A registry needs no type argument.

**Why it is affordable.** The collection type is part of every query's type, so every application pays for what it carries. For an application that declares no scope, the `scopes` member adds about a tenth of one percent to type checking.

### 6. The query is ordered by relevance unless the caller orders it

The first query in this document becomes:

```sql
SELECT ... FROM "public"."post"
WHERE (setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'B'))
      @@ websearch_to_tsquery('english', $1)
ORDER BY ts_rank(setweight(...) || setweight(...), websearch_to_tsquery('english', $1)) DESC
LIMIT 10
```

**Relevance is a default order.** A call to `orderBy` anywhere in the chain, before or after the scope call, replaces it.

**The index does not order rows.** A Postgres GIN index finds the matching rows and returns them in no particular order. Ordering by relevance ranks every match and sorts them. MongoDB behaves the same way: text matches come back unordered unless the query sorts by score. So relevance order is a choice the scope operation makes for the caller, and the caller can make another.

## Responsibilities

| Party | Owns |
| --- | --- |
| Framework | The `scopes` member of a model in the contract, and its shape |
| Target or extension that introduces a scope type | The schema attribute, the index and its DDL, the operations, and their line in the type registry |
| ORM client | The `scopes` member of a collection, the interface suppliers satisfy, the type registry, and applying the filter and the default order |
| Adapter | Turning the finished query into SQL, as for any other query |

## Consequences

**For the contract and authoring**

- **A schema attribute can produce a domain scope and a storage index together.**
- **Packages write to the domain plane**, through the `scopes` member only.
- **The contract validator cannot check a scope's parameters**, because it does not know the packages' scope types. The client checks when it is constructed. It refuses to start when a scope's type has no supplier or its index does not exist, and the error names what is missing.

**For queries**

- **Ordering by relevance sorts every match.** A caller who does not need it can order by something cheaper.
- **Relevance cannot be combined with another sort key.** That needs a way to name the relevance score inside `orderBy`, which this decision does not provide.
- **Operations on a single column are separate, and can share an index with a scope.** `fullTextMatches`, `fullTextRank` and `fullTextHeadline` apply to one text column. The index expression contains weights only when the search has more than one weight group, so a search over one field has the same expression as `fullTextMatches` on that field, and both use the one index. Highlighting has no scope operation, because it needs text and a search document is not text.

**For packages that supply a scope type**

- **The package depends on the ORM client package**, because its type declarations name it.
- **A published package must name the published module in its registry declaration.** TypeScript ignores a declaration that names a module it cannot find, and reports no error. `scopes` is then empty. The build rewrites internal module names, and a test on the built packages checks the result.

**For other targets**

- **MongoDB allows one text index per collection**, so a MongoDB model has at most one text search scope. Postgres allows several.
- **MongoDB accepts a text search only in the first stage of a pipeline.** Because a collection builds its query at the terminal method, a MongoDB ORM client can place the search there whatever the order of calls. MongoDB also accepts a text search inside a `$lookup` sub-pipeline, so a scope works inside an include.

## Alternatives considered

### Where the scope is recorded

- **Nowhere: the ORM client derives scopes from the model's indexes.** The ORM client must then decide, from the properties an index has, which package serves it. Two packages can claim the same index by accident. The scope's name is also tied to the index's name, which must be unique in the whole database schema.
- **A type id on the index.** It marks a storage object with what a query interface should do with it. The scope still has no place in the domain.
- **The fields and weights on the scope.** It puts data about one kind of index into the domain plane.
- **A second aggregate root for the model.** A root is the entry point to an aggregate, and each queryable model has one (ADR 174). A search is another way into the same aggregate.
- **The operations' types in the emitted contract.** It ties the contract to one query interface.

### How the author writes it

- **One attribute for the index and another, or an optional argument, for the scope.** Almost every author who wants the index wants to query it. This makes the common case the longer one to write.

### How the application reaches it

- **On the row accessor, as `p.search`.** It puts something that is not a field among the fields, where a field of the same name collides with it.
- **Directly on the collection, as `db.Post.search`.** A scope and a collection method of the same name collide, and a custom collection class with such a method does not compile. It also costs about four percent more type checking for every application, because of the extra type on every collection.
- **Only at the start of a query.** The collection inside an `include` is created by the ORM client, not by the caller, so a scope could never be used there.
- **As an operation on a column.** An operation on a column returns a value. A scope operation applies to a collection and returns a collection.
- **With the fields and weights written in the query.** Any difference from the index disables it without an error.
- **Relevance as an ordinary sort key, applied where the scope is called.** The same calls in a different order would then mean different queries, which is true of no other collection method.

### How the types reach the client

- **As a type argument inferred when the client is constructed.** TypeScript infers none once the contract type is written, so the application would have to write the types.
- **Built into the client's types for the target's own scope types.** An extension's scope types are not known in advance.
- **By extending the collection class.** A class cannot be typed from the index of whichever model it is applied to.
