# ADR 258 — Query fragments are functions

**Status:** Proposed
**Date:** 2026-09-30
**Builds on:** [ADR 175 — Shared ORM Collection interface](ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md), [ADR 206 — Operations as TypeScript functions](ADR%20206%20-%20Operations%20as%20TypeScript%20functions.md)

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
- The conditional inside `pipe` yields a collection that may or may not be filtered. Its type says so, and `deleteAll` is refused on it.
- `summary` is a step that changes the row. `RowOf` names the row it produces.
- `sortField` turns a request string into a typed `orderBy` selector, and rejects a field outside the allowed list at run time.

## Decision

A **query fragment** is a function. A fragment of a row is a function from the row accessor to an expression, and `where` and `orderBy` take it. A fragment of a query is a function from a collection to a collection, and `pipe` applies it.

1. **`Collection` has a `pipe` method.** `pipe(step)` returns `step(this)`. It is typed with a `this` parameter, so the step receives the caller's exact type, including a custom collection class.
2. **A filtered collection is a subtype of an unfiltered one.** The collection's type state is part of the type's structure, and a flag that is not known to be set is `boolean`, not `false`. A conditional that may or may not add a filter therefore has the unfiltered type, and the methods that require a filter, `update` and `delete`, or an order, `cursor`, stay refused on it.
3. **A field type is named by its codec.** `FieldExpression<Contract, CodecId, Nullable>` is the type of any row field with that codec and nullability, with the same comparison methods and operations as the field on a model. A row fragment typed with it fits every model that has such a field.
4. **A step that changes the row is defined once per model.** `rowFragment<Contract, Model>()(body)` types the body against the plain collection of that model and returns a step that takes that model's collection in any state. `RowOf<Step>` names the row the step produces.
5. **A sort field from a string is checked at run time.** `sortField(collection, name, direction, allowed)` returns an `orderBy` selector. The allowed list may name only fields whose codec can be ordered. A name outside it throws before the query runs.

Nothing is added to the query language for control flow. Whatever the application would write in a function body, it writes inside the step.

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

The `this` parameter makes `Self` the static type of the receiver. A custom collection class receives itself, an include refinement receives the refinement, a collection after `select` receives the narrowed row. The result is whatever the step returns, so a step that filters yields a filtered collection and a step that selects yields a new row.

### 2. A conditional step is sound because filtered is a subtype of unfiltered

```ts
db.Post.pipe((posts) => (search ? posts.where((p) => p.title.ilike(`%${search}%`)) : posts));
```

The two branches have different types: one has a filter in its type state, one does not. TypeScript types the conditional as the union of the two, then removes any member that is a subtype of another. For the result to be sound, the filtered branch must be the subtype, so that the unfiltered type remains.

Two properties of `Collection` give it that order:

- **The state is a declared property of the class.** `declare readonly [StateType]: State`. A declared property takes part in assignability in one direction, from the value to the target. The state written only in method parameter types would not: TypeScript compares method parameters in both directions, so two collections that differ only in their parameters are assignable to each other, and the union would collapse to whichever member TypeScript met first.
- **A flag that is not known to be set is `boolean`.** The default state is `{ hasWhere: boolean, hasOrderBy: boolean, hasUniqueFilter: boolean }`. `where` sets `hasWhere: true`. `true` is assignable to `boolean`, and `boolean` is not assignable to `true`. So `Collection<..., { hasWhere: true }>` is assignable to `Collection<..., { hasWhere: boolean }>`, and not the reverse.

The methods that require a flag test it with `extends true`, which treats `boolean` as not set:

```ts
update(data: State['hasWhere'] extends true ? UpdateInput : never): Promise<Row | null>;
delete(this: State['hasWhere'] extends true ? Collection<...> : never): Promise<Row | null>;
```

With this order, every way of writing a conditional gives the sound type: a ternary in either branch order, an `if` with an early return, a `switch`, a loop that may run zero times, `pipe` with any of these inside, and `let posts = db.Post; if (search) posts = posts.where(...)`. A function whose every return path filters yields the filtered type, and `update` is allowed on it, which is correct.

An unfiltered collection can no longer be passed where a filtered one is declared. `const filtered: Collection<Contract, 'Post', Row, { hasWhere: true, ... }> = db.Post` is an error. A filtered collection can be passed where an unfiltered one is declared, which is what a function taking `typeof db.Post` needs.

**Two conditionals keep a union.** When neither branch is a subtype of the other, TypeScript keeps both: a `where` branch against an `orderBy` branch, and a custom collection class against its own filtered collection, including `this` inside the class. The union is sound. `update`, `delete` and `cursor` are refused, and `where`, `orderBy`, `select`, `limit`, `first` and `all` work. `include` does not: TypeScript cannot call a generic method on a union whose members have different signatures. The application annotates the result with the base type, `const posts: typeof db.Post = ...`, and it reduces. The custom-class case is a limit of custom classes, not of conditionals: `where` on a custom class returns the base `Collection`, so the class's own methods are gone after any chained call, conditional or not.

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

A step that calls `select` or `include` produces a new row, so its type cannot be the caller's type. `rowFragment` types the body once, against the plain collection of the model, and returns a step that accepts a collection of that model in any state, including an include refinement and a collection after an earlier `select`. `RowOf` reads the row type off the result, so the application can name it.

The step's result has the default state. A filter or order applied before the step is not recorded after it, so `update` is refused after `pipe(summary)` even when a `where` came first. Row-changing steps are for reading.

### 5. A sort field from a request

```ts
db.Post.orderBy(sortField(db.Post, input.sort, input.direction, ['title', 'createdAt']));
```

`sortField` takes a collection, a field name from the request, a direction and an allowed list. The allowed list is typed against the fields of the model whose codec has the `order` trait, so a relation, an unknown field, or a field that cannot be ordered is a compile error in the list. The name from the request is checked at run time against the allowed list and the model, and `ORM.ARGUMENT_INVALID` is thrown for a name that is not allowed. The selector it returns fits any collection of a model that has the allowed fields, and `orderBy` records the order, so `cursor` is allowed afterwards.

## What it costs

Measured as TypeScript type instantiations on `examples/prisma-8-demo`, which is the application a user's type check resembles.

| Feature | Present but unused | Per use |
| --- | --- | --- |
| `pipe` | +608 (+0.08%) | about 7 |
| Filtered as subtype of unfiltered | +601 (+0.08%) | none for a plain chain |
| A conditional step | none | 10,000 to 14,000 once per pair of collection types, then under 10 |
| `FieldExpression` row fragment | none | about 350 once, then under 3 |
| `rowFragment` | none | cheaper than the same `select` and `include` written inline |
| `sortField` | none | about 1,250 once, then about 100 |

A conditional step makes TypeScript compare the two branch types to reduce the union. TypeScript caches that comparison per pair of types, so the cost grows with the number of distinct collection types that appear in conditionals, about the number of models times the kinds of site, and not with the number of conditionals. Ten identical conditionals cost the same as one. That comparison is the price of a sound conditional, with or without `pipe`.

## Consequences

- **Any function is a step.** Control flow stays in the language. The query API gains one method, `pipe`, and no combinators.
- **Conditional queries are sound today.** Code that builds a query with a ternary or a `let` exists in applications now. With filtered as a subtype of unfiltered, that code refuses `deleteAll` when the filter may be missing. Without it, TypeScript may keep the filtered branch and allow the delete.
- **`DefaultCollectionTypeState` changes.** A type test that asserts a flag is `false` on a fresh collection asserts `boolean` instead. This is the only observable change to an unconditional chain.
- **A package can offer a fragment for any model.** A row fragment typed with `FieldExpression` needs no knowledge of the application's models. A package that introduces a kind of index can offer a step built from the index definition, and the application applies it with `pipe`; see [ADR 257](ADR%20257%20-%20Packages%20offer%20collection%20scopes%20for%20their%20kinds%20of%20index.md).
- **The error for a missing field is indirect.** `db.Tag.where(notDeleted)` fails, but the message reports the shorthand filter overload of `where` rather than the missing field. Improving it is a follow-up.

## Non-goals

- **A default fragment per model.** A filter that every query of a model must apply, such as soft delete, is a separate feature. `pipe` is applied per query.
- **Recording a fragment's filter after a row-changing step.** `rowFragment` produces the default state.
- **Making the union of a custom class and its filtered base usable.** Custom classes lose their methods after any chained call. That is a limit of the custom-class design and needs its own decision.

## Alternatives considered

- **A `when(value, step)` combinator** on `Collection`, whose result keeps the caller's type. It avoids the union entirely and is cheap per use, about 90 instantiations, and it keeps a custom class's methods. It is rejected because it moves control flow into the query API. Each construct an application might use, a conditional, a loop, an early return, would need its own combinator, and users would have to learn a second syntax for things their language already has. Sound conditionals through subtyping cover every construct with one rule.
- **`where(undefined)` and `orderBy(undefined)` as no-ops.** `posts.where(search ? (p) => ... : undefined)`. Cheap per use, but it adds an overload to every `where` and `orderBy` call, costing 7.5% more instantiations in the client package when unused, and it changes what `ReturnType<typeof posts.where>` gives. It covers only these two methods.
- **A `fragment` builder** that declares the fields a step needs by codec and applies it with `pipe`, keeping the caller's type. It works, but the result's type state is not updated, so `update` stays refused after a fragment that filters, and one definition costs about 10,000 instantiations in the demo for a reason not found. `FieldExpression` covers the same need as a plain function of the row.
- **A checked state with `false` as the default.** Declaring the state as a property but keeping `false` for unknown flags makes the two branches unrelated instead of ordered. Every conditional then keeps a union, `let posts = db.Post; posts = posts.where(...)` stops compiling, and existing tests that cast between states break.
- **Query fragments as objects**, as in a query language made of objects. The chain is the query language here, and an object fragment would need a second way to express every method, kept in step with the first.
