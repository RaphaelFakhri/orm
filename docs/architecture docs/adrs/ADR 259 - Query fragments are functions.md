# ADR 259 — Query fragments are functions

**Status:** Proposed
**Date:** 2026-09-30
**Builds on:** [ADR 258 — A collection keeps its class through the chain](ADR%20258%20-%20A%20collection%20keeps%20its%20class%20through%20the%20chain.md), [ADR 175 — Shared ORM Collection interface](ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md)

---

## At a glance

An application lists posts for a request that may carry a search term and a sort field. The filter for deleted rows is shared by every model that has a `deletedAt` field, and the summary shape is shared by every endpoint that returns posts.

```ts
import { FieldExpression, rowFragment, RowOf, sortField } from '@prisma/orm-postgres/orm-client';

type DeletedAt = FieldExpression<Contract, 'pg/timestamptz@1', true>;
const notDeleted = (row: { deletedAt: DeletedAt }) => row.deletedAt.isNull();

const summary = rowFragment<Contract, 'Post'>()((posts) => posts.select('id', 'title').include('user'));
type PostSummary = RowOf<ReturnType<typeof summary>>;

const posts: PostSummary[] = await db.Post
  .where(notDeleted)
  .pipe((posts) => (input.search ? posts.where((p) => p.title.ilike(`%${input.search}%`)) : posts))
  .orderBy(sortField(db.Post, input.sort, input.direction, ['title', 'createdAt']))
  .pipe(summary)
  .limit(20)
  .all();
```

- `notDeleted` is a plain function of the row. It fits any model with a nullable `deletedAt` of that codec, and no other.
- `pipe` applies a function to the collection and returns what the function returns. The function may contain any code: a conditional, an early return, a loop.
- The conditional inside `pipe` yields a collection that may or may not be filtered. Its type is the unfiltered one, and `deleteAll` is refused on it.
- `summary` is a step that changes the row. `RowOf` names the row it produces.
- `sortField` turns a request string into a typed `orderBy` selector, and rejects a field outside the allowed list at run time.

## Decision

A **query fragment** is a function. A fragment of a row is a function from the row accessor to an expression, and `where` and `orderBy` take it. A fragment of a query is a function from a collection to a collection, and `pipe` applies it.

1. **`Collection` has a `pipe` method.** `pipe(step)` returns `step(this)`. It is typed with a `this` parameter, so the step receives the caller's exact type, including a custom collection class.
2. **Nothing is added to the query API for control flow.** Whatever the application would write in a function body, it writes inside the step. The type stays sound because a filtered collection is a subtype of an unfiltered one (ADR 258).
3. **A field type is named by its codec.** `FieldExpression<Contract, CodecId, Nullable>` is the type of any row field with that codec and nullability, with the same comparison methods and operations as the field on a model. A row fragment typed with it fits every model that has such a field.
4. **A step that changes the row is defined once per model.** `rowFragment<Contract, Model>()(body)` types the body against the plain collection of that model and returns a step that takes that model's collection in any state. `RowOf<Step>` names the row the step produces.
5. **A sort field from a string is checked at run time.** `sortField(collection, name, direction, allowed)` returns an `orderBy` selector. The allowed list may name only fields whose codec can be ordered. A name outside it throws before the query runs.

## Why a fragment is a function

A query in Prisma is a chain of method calls on a collection. Each call returns a new collection whose type records what is known about it: the row it produces, whether it has a filter, whether it has an order. The type is how the client refuses `deleteAll` on a collection with no filter and `cursor` on a collection with no order.

Applications share parts of queries. The same filter for deleted rows appears on every query of a model. The same conditional filters are built from every list request. The same `select` and `include` are used by every endpoint that returns a summary. In a query language made of objects these are objects, spread into each query. In a query language made of calls they are functions, applied to each collection.

A function can be applied without any support from the collection: `notDeleted(db.Post)`. `pipe` exists so that the application of a fragment reads in the same order as the rest of the chain, and so that a fragment can be applied in the middle of one.

## How it works

### 1. `pipe` applies a step

```ts
db.Post.pipe((posts) => posts.where((p) => p.userId.eq(userId)).orderBy((p) => p.createdAt.desc()));
```

`pipe` is one line:

```ts
pipe<Self, Result>(this: Self, step: (collection: Self) => Result): Result {
  return step(this);
}
```

The `this` parameter makes `Self` the static type of the receiver. A custom collection class receives itself, an include refinement receives the refinement, a collection after `select` receives the narrowed row. The result is whatever the step returns, so a step that filters yields `Self & HasWhere` and a step that selects yields a new row.

### 2. Any function body is sound

```ts
db.Post.pipe((posts) => (search ? posts.where((p) => p.title.ilike(`%${search}%`)) : posts));

class PostCollection extends Collection<Contract, 'Post'> {
  matching(search: string | undefined) {
    return this.pipe((posts) => (search ? posts.where((p) => p.title.ilike(`%${search}%`)) : posts));
  }
}
```

The two branches have types `Self & HasWhere` and `Self`. The first is a subtype of the second, so TypeScript reduces the union to `Self`. The result is the unfiltered collection, or the unfiltered class, and `update`, `delete` and `cursor` stay refused. An `if` with an early return, a `switch`, a loop that may run zero times, and a reassigned `let` reduce the same way. A function whose every return path filters yields `Self & HasWhere`, and `update` is allowed on it. This is the subtyping rule of ADR 258; `pipe` adds nothing to it and needs nothing from it beyond the `this` parameter.

### 3. A row fragment names its fields by codec

```ts
type DeletedAt = FieldExpression<Contract, 'pg/timestamptz@1', true>;
const notDeleted = (row: { deletedAt: DeletedAt }) => row.deletedAt.isNull();

db.Post.where(notDeleted);
db.Comment.where((c) => and(notDeleted(c), c.postId.eq(postId)));
db.Tag.where(notDeleted); // error: Tag has no deletedAt
```

`where` takes a function of the row accessor, an object with one member per field. TypeScript compares objects by their members, so a function whose parameter asks for one field accepts every row accessor that has it. What was missing was a way to write that field's type without naming a model. `FieldExpression` is the type of a field with a given codec and nullability: an expression of that codec, the comparison methods the codec's traits allow, and the query operations registered for that codec. It is built from the same parts as the field type on the model's row accessor, so the two are assignable to each other in both directions, and an operation contributed by a package, such as `fullTextMatches`, is available on it.

A fragment is rejected for a model without the field, for a field of another codec, and for a field of another nullability.

### 4. A step that changes the row is defined once per model

```ts
const summary = rowFragment<Contract, 'Post'>()((posts) => posts.select('id', 'title').include('user'));
type PostSummary = RowOf<ReturnType<typeof summary>>;

db.Post.pipe(summary);
db.Post.where({ userId }).pipe(summary);
db.User.include('posts', (posts) => posts.pipe(summary));
db.Comment.pipe(summary); // error: not a Post collection
```

A step that calls `select` produces a new row, so its type cannot be the caller's type. `rowFragment` types the body once, against the plain collection of the model, and returns a step that accepts a collection of that model in any state, including an include refinement and a collection after an earlier `select`. `RowOf` reads the row type off the result, so the application can name it.

The step's result has the default state. A filter or order applied before the step is not recorded after it, so `update` is refused after `pipe(summary)` even when a `where` came first. Row-changing steps are for reading.

### 5. A sort field from a request

```ts
db.Post.orderBy(sortField(db.Post, input.sort, input.direction, ['title', 'createdAt']));
```

`sortField` takes a collection, a field name from the request, a direction and an allowed list. The allowed list is typed against the fields of the model whose codec has the `order` trait, so a relation, an unknown field, or a field that cannot be ordered is a compile error in the list. The name from the request is checked at run time against the allowed list and the model, and `ORM.ARGUMENT_INVALID` is thrown for a name that is not allowed. The selector it returns fits any collection of a model that has the allowed fields, and `orderBy` records the order, so `cursor` is allowed afterwards.

## What it costs

Measured as TypeScript type instantiations on `examples/prisma-8-demo`.

| Feature | Present but unused | Per use |
| --- | --- | --- |
| `pipe` | +608 (+0.08%) | about 7 |
| A conditional step | none | 10,000 to 14,000 once per pair of collection types, then under 10 |
| `FieldExpression` row fragment | none | about 350 once, then under 3 |
| `rowFragment` | none | cheaper than the same `select` and `include` written inline |
| `sortField` | none | about 1,250 once, then about 100 |

## Consequences

- **Any function is a step.** Control flow stays in the language. The query API gains one method and no combinators.
- **A package can offer a fragment for any model.** A row fragment typed with `FieldExpression` needs no knowledge of the application's models. A package that introduces a kind of index can offer a step built from the index definition, and the application applies it with `pipe`; that is the subject of ADR 257.
- **The error for a missing field is indirect.** `db.Tag.where(notDeleted)` fails, but the message reports the shorthand filter overload of `where` rather than the missing field. Improving it is a follow-up.

## Non-goals

- **A default fragment per model.** A filter that every query of a model must apply, such as soft delete, is a separate feature. `pipe` is applied per query.
- **Recording a fragment's filter after a row-changing step.** `rowFragment` produces the default state.

## Alternatives considered

- **A `when(value, step)` combinator** whose result keeps the caller's type, as the way to write conditional steps. Rejected: it moves control flow into the query API, and every construct would need its own combinator. The subtyping rule of ADR 258 makes the plain conditional sound.
- **`where(undefined)` and `orderBy(undefined)` as no-ops**, so a conditional filter is `posts.where(search ? (p) => ... : undefined)`. It adds an overload to every `where` and `orderBy`, costs 7.5% more type checking in the client package when unused, and covers only those two methods.
- **A `fragment` builder** that declares the fields a step needs by codec and applies it with `pipe`, keeping the caller's type. It works, but its result's state is not updated, and one definition costs about 10,000 instantiations in the demo for a reason not found. `FieldExpression` covers the same need as a plain function of the row.
- **Query fragments as objects**, as in a query language made of objects. The chain is the query language here, and an object fragment would need a second way to express every method, kept in step with the first.
