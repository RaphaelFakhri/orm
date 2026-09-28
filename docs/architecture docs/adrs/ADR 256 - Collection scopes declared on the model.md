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
}

scopes Post {
  search fullTextSearch([title, body])
}
```

An application searches posts through the ORM client, by the name the author chose:

```ts
const q = websearchToTsquery('postgres index');

const posts = await db.Post.scopes.search.fulltext(q).limit(10).all();
```

The result is ten posts, best match first. The database answers the query from an index that the declaration created.

## Decision

A **scope** is a named way to find a model's entities that goes beyond filtering on its fields. Full-text search across several fields is the first one.

1. **A scope is declared on the model in the contract**, with a name, a scope type, and parameters.
2. **A scope type is an open id.** A target or an extension introduces it, and supplies what the ORM client offers for it.
3. **The author declares scopes in a `scopes` block for the model.** A declaration also creates the storage that serves the scope.
4. **The ORM client offers each scope at `collection.scopes.<name>`**, on every collection of the model.
5. **A scope operation returns a collection.** It narrows the collection and sets a default order, which an explicit `orderBy` replaces.

The rest of this document follows one search from the schema to the SQL, and gives the reason for each choice where it is made.

## The problem a scope solves

Searching several fields at once needs one search document built from all of them, for example the title and the body joined together with the title weighted higher. In Postgres that document is an expression, and an index over the expression makes the search fast.

Two things make this hard to offer through a query interface that knows only fields:

- **The search document is not a field.** The ORM client's row accessor, `p.title`, reaches stored fields and relations. There is nothing to call `fullTextMatches` on.
- **The query must repeat the index's expression exactly.** Postgres uses an expression index only when the query contains the same expression. If the query lists the fields in another order, or uses another language or weight, the database scans the whole table and reports no error.

A scope gives the search a name on the model, and renders the query from the same definition as the index.

## When something is a scope

Some searches can be written as an operation on a column, such as `p.title.fullTextMatches(q)`. The rule for choosing is:

- **It is an operation on a column** when it applies to one stored field and returns a value.
- **It is a scope** when at least one of these is true:
  - it spans several fields;
  - it sets an order;
  - the database runs it as a step of its own, not as a filter;
  - the query must repeat an expression from the index that the author did not write.

[Appendix B](#appendix-b-scopes-that-are-not-searches) applies the rule to three cases that are not text searches.

## How it works

### 1. The author declares the search

```prisma
model Post {
  id       Int     @id
  title    String
  subtitle String?
  body     String?
}

scopes Post {
  search fullTextSearch([[title, subtitle], body])
}
```

- **A `scopes` block names its model.** The model must be declared in the same namespace, and has at most one `scopes` block.
- **Each line is a scope.** The name is on the left, as a field's name is. The scope's kind and its arguments are on the right, as a field's type is.
- **`fullTextSearch` comes from the Postgres target.** A scope from an extension carries the extension's name, as its types do: `pgvector.nearest(embedding)`.
- **The list gives the fields in order of weight.** Fields in a nested list share a weight. Here `title` and `subtitle` count most, and `body` counts less.
- **The index is created for the author.** Its name is generated from the table and the scope, here `post_search`. `map: "existing_index_name"` uses an index that already exists under that exact name.

The TypeScript contract builder has the same declaration. The key is the scope's name, and the target contributes the `fullTextSearch` helper:

```ts
model('Post', { fields: { id, title, subtitle, body } }).scopes(({ fields, scopes }) => ({
  search: scopes.fullTextSearch([[fields.title, fields.subtitle], fields.body]),
}));
```

The author declares the search because that is what they want. The index is how they get it. An author who wants an index and no scope writes `@@index(expression: ...)` on the model.

**Why a block of its own.** A `model` block describes the shape of the model, and its `@@` attributes describe the model as a whole. A scope is neither. It is a named way to find the model's entities. In its own block, the scope's name is on the left, as every name in the schema language is, and the `model` block keeps its meaning.

### 2. The contract records a scope and an index

The contract has two planes. The domain plane describes models and their fields. The storage plane describes tables, columns and indexes. A scope declaration writes to both:

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

Each ORM client defines an interface for this. In the SQL ORM client, for a call such as `fulltext(q)`, the supplier returns a filter, a default order, or both:

```ts
interface ScopeRefinement {
  readonly filter?: AnyExpression;
  readonly defaultOrderBy?: readonly OrderByItem[];
}
```

The ORM client applies them to the collection. The supplier never touches the collection itself.

The interface belongs to the ORM client because the form of a search differs between database families. The contract is the same for all of them. [Other databases](#other-databases) shows why.

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
| Target or extension that introduces a scope type | The scope's declaration form in the schema language, the index and its DDL, the operations, and their line in the type registry |
| ORM client | The `scopes` member of a collection, the interface suppliers satisfy, the type registry, and applying what a supplier returns |
| Adapter | Turning the finished query into SQL, as for any other query |

## Consequences

**For the contract and authoring**

- **A scope declaration produces a domain scope and a storage index together.**
- **The schema language gains a `scopes` block**, which the framework owns, and a way for packages to supply the kinds of scope that may appear in it.
- **Packages write to the domain plane**, through the `scopes` member only.
- **The contract validator cannot check a scope's parameters**, because it does not know the packages' scope types. The client checks when it is constructed. It refuses to start when a scope's type has no supplier or its index does not exist, and the error names what is missing.

**For queries**

- **Ordering by relevance sorts every match.** A caller who does not need it can order by something cheaper.
- **A scope operation gives the caller no value for each row.** The relevance score of a search and the distance of a geographic search are such values. The caller cannot select them, and cannot combine them with another sort key in `orderBy`. Adding this later does not change what the contract records.
- **Operations on a single column are separate, and can share an index with a scope.** `fullTextMatches`, `fullTextRank` and `fullTextHeadline` apply to one text column. The index expression contains weights only when the search has more than one weight group, so a search over one field has the same expression as `fullTextMatches` on that field, and both use the one index. Highlighting has no scope operation, because it needs text and a search document is not text.

**For packages that supply a scope type**

- **The package depends on the ORM client package**, because its type declarations name it.
- **A published package must name the published module in its registry declaration.** TypeScript ignores a declaration that names a module it cannot find, and reports no error. `scopes` is then empty. The build rewrites internal module names, and a test on the built packages checks the result.

## Other databases

The design must serve databases other than Postgres. This section summarises how three other kinds of search would use it. [Appendix A](#appendix-a-scopes-on-other-databases) gives the detail for each.

The contract records a scope in the same way for every database: a name, a scope type, and parameters. What differs is the parameters, the scope type's operations, and what its supplier returns.

| | Postgres | MySQL | MongoDB text index | MongoDB Atlas Search |
| --- | --- | --- | --- | --- |
| The query agrees with the index by | Repeating its expression | Repeating its column list | Nothing; a collection has one | Naming it |
| Weights | Four classes | None | A number for each field | Set in the index or the query |
| Scopes on one model | Several | Several | One | Several |
| A search in a query is | A filter | A filter | A filter, in the first stage only | A pipeline stage, the first one |
| Rows arrive in relevance order | No | Not reliably | No | Yes |

**MySQL.** `MATCH(title, body) AGAINST (?)` must list the same columns as a full-text index. The supplier writes the list from the index, and returns a filter and a default order, as the Postgres supplier does.

**MongoDB text index.** The supplier returns a `$text` filter and a sort by text score. MongoDB accepts `$text` only in the first stage of a pipeline. A collection builds its query at the terminal method, so the MongoDB ORM client places it there whatever the order of calls. MongoDB accepts `$text` inside a `$lookup` sub-pipeline, so a scope works inside an include.

**MongoDB Atlas Search.** The search is a pipeline stage, `$search` or `$vectorSearch`. It cannot be written as a filter. The MongoDB ORM client's interface therefore lets a supplier return a first stage.

**Operations are not portable between databases.** `fulltext(q)` takes a Postgres `tsquery`. A MySQL operation takes a string. Operations belong to the scope type, as column operations belong to the target.

## Alternatives considered

### Where the scope is recorded

- **Nowhere: the ORM client derives scopes from the model's indexes.** The ORM client must then decide, from the properties an index has, which package serves it. Two packages can claim the same index by accident. The scope's name is also tied to the index's name, which must be unique in the whole database schema.
- **A type id on the index.** It marks a storage object with what a query interface should do with it. The scope still has no place in the domain.
- **The fields and weights on the scope.** It puts data about one kind of index into the domain plane.
- **A second aggregate root for the model.** A root is the entry point to an aggregate, and each queryable model has one (ADR 174). A search is another way into the same aggregate.
- **The operations' types in the emitted contract.** It ties the contract to one query interface.

### How the author writes it

- **An attribute on the model, as `@@fullTextSearch(search, [title, body])`.** The scope's name is an argument among others. Everywhere else in the schema language, a name is on the left of what it names.
- **A `scopes` block nested in the model.** No block nests in a model. A reader learns that everything in a `model` block describes the model's shape, and a nested block breaks that.
- **A line in the model that starts with a keyword, as `scope search = ...`.** No line in a model starts with a keyword.
- **A line in the model written as a field, as `search fullTextSearch(...)`.** A reader cannot tell a scope from a field, and a scope and a field could not share a name.
- **One declaration for the index and another, or an optional argument, for the scope.** Almost every author who wants the index wants to query it. This makes the common case the longer one to write.

### How the application reaches it

- **On the row accessor, as `p.search`, used inside `where`.** It puts something that is not a field among the fields, where a field of the same name collides with it. A filter inside `where` also cannot set an order. In MongoDB Atlas Search a search is not a filter at all, and cannot be combined with `or` and `not` as `where` allows.
- **Directly on the collection, as `db.Post.search`.** A scope and a collection method of the same name collide, and a custom collection class with such a method does not compile. It also costs about four percent more type checking for every application, because of the extra type on every collection.
- **Only at the start of a query.** The collection inside an `include` is created by the ORM client, not by the caller, so a scope could never be used there.
- **As an operation on a column.** An operation on a column returns a value. A scope operation applies to a collection and returns a collection.
- **With the fields and weights written in the query.** Any difference from the index disables it without an error.
- **Relevance as an ordinary sort key, applied where the scope is called.** The same calls in a different order would then mean different queries, which is true of no other collection method.

### How the types reach the client

- **As a type argument inferred when the client is constructed.** TypeScript infers none once the contract type is written, so the application would have to write the types.
- **Built into the client's types for the target's own scope types.** An extension's scope types are not known in advance.
- **By extending the collection class.** A class cannot be typed from the index of whichever model it is applied to.

## Appendix A: scopes on other databases

Each case below shows the database's own syntax, what the contract would record, what the supplier would return, and what the case shows about the design. None of these scope types exists. They are here to show that the design can carry them.

The facts about the MongoDB text index were checked against a running MongoDB. The facts about MySQL and MongoDB Atlas Search come from their documentation.

### MySQL full-text index

```sql
CREATE FULLTEXT INDEX post_search ON post (title, body);

SELECT ... FROM post
WHERE MATCH(title, body) AGAINST (? IN NATURAL LANGUAGE MODE)
ORDER BY MATCH(title, body) AGAINST (? IN NATURAL LANGUAGE MODE) DESC;
```

**The contract:**

```json
"scopes": { "search": { "type": "mysql/full-text@1", "params": { "index": "post_search" } } }
```

**What the database requires**

- The column list in `MATCH(...)` must be the column list of one full-text index. A query with another list fails.
- An index has no weight for each column and no language. It may name a parser.
- A query has a mode: natural language, boolean, or natural language with query expansion. Boolean mode has its own operators in the search text.
- A table may have several full-text indexes.

**What the supplier returns.** A filter, `MATCH(...) AGAINST (...)`, and a default order by the same expression. It writes the column list from the index.

**Operations.** One for each mode, for example `natural(text)` and `boolean(text)`. They take a string.

**What it shows**

- The rule that the query is rendered from the index applies here in a stricter form than in Postgres.
- The query never names the index. The scope's `index` parameter is for the supplier, which reads the columns from it.
- Weights belong to the scope type, not to the general design. The MySQL declaration would take a flat list of fields.

### MongoDB text index

```js
db.post.createIndex({ title: "text", body: "text" }, { weights: { title: 10, body: 1 } })

db.post.aggregate([
  { $match: { $text: { $search: "postgres index" }, userId: 7 } },
  { $sort: { score: { $meta: "textScore" } } },
])
```

**The contract.** The storage plane already records a text index with its weights and language. A MongoDB index in the contract has keys and no name:

```json
{ "keys": [{ "field": "title", "direction": "text" }, { "field": "body", "direction": "text" }], "weights": { "title": 10, "body": 1 } }
```

A collection has at most one text index, so the scope needs no parameter to find it:

```json
"scopes": { "search": { "type": "mongo/text@1", "params": {} } }
```

**What the database requires**

- A collection has at most one text index.
- `$text` must be in the first stage of the pipeline. That stage may hold other filters too.
- `$text` is accepted inside a `$lookup` sub-pipeline.
- Matches come back in no particular order unless the query sorts by the text score.
- A weight is a number from 1 to 99999 for each field.

**What the supplier returns.** A `$text` filter and a default sort by the text score.

**What it shows**

- A model can have at most one scope of this type. The limit belongs to the scope type.
- The ORM client, not the caller, places the search in the first stage. It can, because a collection builds its query at the terminal method.
- A scope works inside an include.
- Parameters differ between scope types. This one has none.
- The form of weights differs between databases: ordered groups in Postgres, numbers here.

### MongoDB Atlas Search and vector search

```js
db.post.aggregate([
  { $search: { index: "post_search", text: { query: "postgres index", path: ["title", "body"] } } },
  { $match: { userId: 7 } },
])

db.post.aggregate([
  { $vectorSearch: { index: "post_embedding", path: "embedding", queryVector: [...], numCandidates: 200, limit: 10 } },
])
```

**The contract:**

```json
"scopes": { "search": { "type": "mongo/atlas-search@1", "params": { "index": "post_search" } } }
```

The index here is a search index. It is a different kind of object from an ordinary MongoDB index, and the storage plane would have to record it.

**What the database requires**

- `$search` and `$vectorSearch` are pipeline stages. They cannot be written inside `$match`.
- The stage must be the first in the pipeline.
- The stage names its index.
- Results come back ordered by score.
- `$vectorSearch` takes its own limit, and its own filter over fields that the index lists.
- A collection may have several search indexes.

**What the supplier returns.** A first stage. It returns no filter and no order.

**What it shows**

- A search is not always a filter. This is the case that rules out a search field used inside `where`, because `where` lets the caller combine filters with `or` and `not`, and a stage cannot be combined that way.
- The supplier interface must belong to the ORM client of the database family. The MongoDB ORM client's interface lets a supplier return a first stage. The SQL ORM client's does not need to.
- Filters the caller adds with `where` run after the search stage. For vector search that can return fewer rows than the limit asked for. A supplier that can pass filters into the stage avoids this, so the MongoDB interface should give the supplier the filters the collection has gathered.

### What the three cases have in common

- **A search takes a collection and returns a collection.** That holds whether the search is a filter, a filter with an order, or a stage.
- **The contract's record is the same:** a name, a scope type, and parameters that the scope type defines.
- **Everything else belongs to the scope type:** the declaration's arguments, the form of weights, the operations and their argument types, and how many scopes of that type a model may have.

## Appendix B: scopes that are not searches

A scope is a general mechanism. Each case below is a scope that is not a text search, on a different database. None of these scope types exists. The database syntax comes from each database's documentation.

### Postgres: bookings by period

A booking has a start and an end. The application asks which bookings overlap a given period.

```prisma
model Booking {
  id       Int      @id
  roomId   Int
  startsAt DateTime
  endsAt   DateTime
}

scopes Booking {
  during period([startsAt, endsAt])
}
```

```json
"scopes": { "during": { "type": "pg/period@1", "params": { "index": "booking_during" } } }
```

```ts
db.Booking.where({ roomId }).scopes.during.overlapping(from, to).all();
db.Booking.scopes.during.containing(instant).all();
```

```sql
CREATE INDEX booking_during ON booking USING gist (tstzrange(starts_at, ends_at));

SELECT ... FROM booking
WHERE room_id = $1 AND tstzrange(starts_at, ends_at) && tstzrange($2, $3);
```

**Why it is a scope.** It spans two fields, and the query must repeat the index's expression.

**What it shows.** A scope can be a plain filter. It has no relevance and sets no order.

### MySQL: posts by tag

Tags are stored as a JSON array on the post.

```prisma
model Post {
  id   Int  @id
  tags Json
}

scopes Post {
  tagged members(tags, as: "CHAR(40)")
}
```

```json
"scopes": { "tagged": { "type": "mysql/members@1", "params": { "index": "post_tagged" } } }
```

```ts
db.Post.scopes.tagged.with('postgres').all();
db.Post.scopes.tagged.withAny(['postgres', 'mysql']).all();
```

```sql
CREATE INDEX post_tagged ON post ((CAST(tags->'$[*]' AS CHAR(40) ARRAY)));

SELECT ... FROM post WHERE 'postgres' MEMBER OF (tags->'$[*]');
SELECT ... FROM post WHERE JSON_OVERLAPS(tags->'$[*]', CAST('["postgres","mysql"]' AS JSON));
```

**Why it is a scope.** MySQL uses the index only through three functions, and only with the same JSON path and the same cast type as the index. The query must repeat an expression the author did not write.

**What it shows.** This case is the closest to the line. It has one field and sets no order, so it could be an operation on the column. Only the last condition of the rule makes it a scope.

### MongoDB: places near a point

```prisma
model Place {
  id       ObjectId @id
  name     String
  open     Boolean
  location Json
}

scopes Place {
  nearby geo(location)
}
```

```json
"scopes": { "nearby": { "type": "mongo/geo@1", "params": { "field": "location" } } }
```

```ts
db.Place.where({ open: true }).scopes.nearby.near({ lng, lat }, { maxMetres: 2000 }).all();
```

```js
db.place.createIndex({ location: "2dsphere" })

db.place.aggregate([
  { $geoNear: {
      near: { type: "Point", coordinates: [lng, lat] },
      key: "location", maxDistance: 2000,
      distanceField: "distance", query: { open: true } } },
])
```

**Why it is a scope.** MongoDB runs it as a pipeline stage that must come first, and it returns rows nearest first.

**What it shows**

- The stage takes the caller's filters inside itself, in `query`. The supplier must receive the filters the collection has gathered.
- The parameter names a field, not an index, because a MongoDB index in the contract has no name.
- The database computes a value for each row, the distance. A scope operation cannot give it to the caller.

### What a supplier returns, across all the cases

| Case | Filter | Default order | First stage | Value for each row |
| --- | --- | --- | --- | --- |
| Postgres full-text search | Yes | Yes | | Relevance |
| MySQL full-text search | Yes | Yes | | Relevance |
| MongoDB text index | Yes | Yes | | Text score |
| MongoDB Atlas Search | | | Yes | Score |
| Postgres period | Yes | | | |
| MySQL tags | Yes | | | |
| MongoDB geographic search | | | Yes | Distance |

The contract's record is the same in every row: a name, a scope type, and parameters that the scope type defines.
