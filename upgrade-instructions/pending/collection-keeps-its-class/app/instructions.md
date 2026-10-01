---
changes:
  - id: collection-state-flags-are-boolean
    summary: |
      In `DefaultCollectionTypeState`, `hasWhere`, `hasOrderBy` and `hasUniqueFilter` are `boolean` (not known) instead of `false`. Code that expects `false` on a collection with no filter or order must expect `boolean`.
    detection:
      glob: "**/*.{ts,mts,cts,tsx}"
      matches:
        - '\bhas(?:Where|OrderBy|UniqueFilter)\b[''"]?\]?\s*,\s*false\b'
        - '\bhas(?:Where|OrderBy|UniqueFilter)\s*:\s*false\b'
  - id: read-collection-state-and-row-with-helpers
    summary: |
      A collection's type state and row are read with `CollectionStateOf<C>` and `CollectionRowOf<C>`, not by inferring the type arguments of `Collection`. The type arguments keep what the collection started with.
    detection:
      glob: "**/*.{ts,mts,cts,tsx}"
      matches:
        - '\bCollection(?:Impl)?<[^;]*?\binfer\b'
  - id: return-type-of-a-chaining-method
    summary: |
      `ReturnType` of `where`, `orderBy`, `limit`, `offset`, `distinct`, `distinctOn`, `cursor` or `include` no longer gives a collection. Write the type as `Filtered<C>` or `Ordered<C>`, or take `typeof` of a value.
    detection:
      glob: "**/*.{ts,mts,cts,tsx}"
      matches:
        - '\bReturnType<[^>]*\[[''"](?:where|orderBy|limit|offset|distinct|distinctOn|cursor|include)[''"]\]'
        - '\bReturnType<\s*typeof\s+[\w$.]+\.(?:where|orderBy|limit|offset|distinct|distinctOn|cursor|include)\b'
  - id: include-takes-no-explicit-type-argument
    summary: |
      `include` with an explicit type argument, such as `include<'posts'>`, now types as `never`. Call it with the relation name as a value.
    detection:
      glob: "**/*.{ts,mts,cts,tsx}"
      matches:
        - '\.include<'
---

# A collection keeps its class through the chain

`where`, `orderBy`, `limit`, `offset`, `distinct`, `distinctOn`, `cursor` and `include` now return the collection they were called on, with what they establish added to its type. A custom collection class keeps its methods through the chain, so `db.Post.where({ userId }).published()` and `db.Post.include('user').published()` compile. The changes below affect code that reads a collection's type.

## The flags of a new collection are `boolean`

`DefaultCollectionTypeState` declares `hasWhere`, `hasOrderBy` and `hasUniqueFilter` as `boolean`, meaning not known. A method that establishes a flag sets it to `true`. Where your code expects `false`, expect `boolean`:

```diff
- type Check = Equal<CollectionStateOf<typeof users>['hasOrderBy'], false>;
+ type Check = Equal<CollectionStateOf<typeof users>['hasOrderBy'], boolean>;
```

A type of your own that sets a flag to `false` should set it to `boolean`. Writes (`update`, `delete` and their variants) still need `hasWhere: true`, and `cursor` still needs `hasOrderBy: true`.

## Read the state and the row with `CollectionStateOf` and `CollectionRowOf`

`where`, `orderBy` and `include` record what they establish in two declared properties, not in the type arguments of `Collection`. Inferring the third or fourth type argument gives the row and the state the collection started with. Import `CollectionStateOf` and `CollectionRowOf` from the `orm-client` entry of your facade and read them instead:

```diff
- type RowOf<C> = C extends Collection<infer _C, infer _M, infer Row, infer _S> ? Row : never;
- type StateOf<C> = C extends Collection<infer _C, infer _M, infer _R, infer State> ? State : never;
+ import type { CollectionRowOf, CollectionStateOf } from '@prisma/orm-postgres/orm-client';
+ type RowOf<C> = CollectionRowOf<C>;
+ type StateOf<C> = CollectionStateOf<C>;
```

## `ReturnType` of a chaining method gives only what the method adds

The chaining methods are generic in their receiver, and `ReturnType` of a generic method uses the constraint of its type parameter. `ReturnType<PostCollection['where']>` is now `HasWhere`, not a collection. Write the type with `Filtered` or `Ordered`, or take `typeof` of a value:

```diff
- type PublishedPosts = ReturnType<PostCollection['where']>;
+ import type { Filtered } from '@prisma/orm-postgres/orm-client';
+ type PublishedPosts = Filtered<PostCollection>;
```

`ReturnType` of a method of your own class, such as `ReturnType<PostCollection['published']>`, still works.

## `include` takes no explicit type argument

`include` infers its receiver from the call. With an explicit type argument the receiver is not inferred and the result is `never`. Call `include` on a value and take its type:

```diff
- type WithTasks = ReturnType<typeof projects.include<'tasks'>>;
+ const withTasks = projects.include('tasks');
+ type WithTasks = typeof withTasks;
```
