# Query features: what Prisma 7 has and Prisma 8 lacks

Private planning notes. Local branch only. Input for stream 4 of [plan.md](plan.md). Nothing here is decided.

Gathered 2026-09-28 by two read-only agents. I have not verified each line myself. Where the two sources disagreed, the code wins and the disagreement is noted.

## Sources and how complete they are

1. **The ported Prisma 7 tests** under `test/integration/test/ports/`, with the records of failing and non-portable tests.
2. **The repo's own docs and code**: `skills/prisma-8/references/queries.md` has a section "What Prisma 8 doesn't do yet", which is the closest thing to a gap list. Also the ORM client source.

The ported tests cover less than half of the query-side tests:

| Test set | Processed | Total |
| --- | --- | --- |
| Prisma functional tests | 1423 | 1423 |
| Engine query tests | 500 | 873 |
| Engine write tests | 3 | 638 |
| Engine new and raw tests | 0 | 323 |
| Prisma legacy tests | 0 | 840 |
| **Total** | **1926** | **4097** |

Not examined yet: almost all write tests (nested mutations, atomic updates, `connectOrCreate`), ordering and pagination in the engine tests, interactive transactions, referential actions, relation load strategy.

The records have drifted from the code. They list 54 failing tests, and the test files mark 72. Some records say a feature is missing that has since been built (see the last section).

## Missing on SQL (PostgreSQL and SQLite)

"Tests" is the approximate number of Prisma 7 tests that need the feature.

| Feature | Tests | Note |
| --- | --- | --- |
| Client extensions (`$extends`) | 166 | Prisma 8 has extension packs and custom collection classes instead |
| Fluent relation API (`findUnique().posts()`) | 84 | |
| `omit`, per query and global | 83 | |
| Typed SQL from `.sql` files | 80 | |
| Batch transaction `$transaction([a, b])` | 55 | |
| Implicit batching of concurrent lookups | 54 | |
| `startsWith`, `endsWith`, `contains` | 49 | `like` and `ilike` exist |
| Case-insensitive mode | 40 | PostgreSQL has `ilike`. SQLite has nothing. |
| Relation load strategy option | 36 | Prisma 8 always joins |
| Comparing two columns in `where` | 34 | Possible only through an internal import |
| JSON filters (path, contains) | 33 | No JSON operators exist in the PostgreSQL target |
| Scalar-list filters (`has`, `hasSome`, `hasEvery`, `isEmpty`) | 20 | prisma/orm#29834 is open and stalled |
| Transaction isolation levels | 18 | Explicitly deferred in the runtime docs |
| Splitting large `IN` lists | 16 | An oversized query drops the connection on PostgreSQL |
| Nested writes: `set`, `update`, `delete`, `upsert`, `connectOrCreate` | 14+ | Deferred to TML-2781. `create`, `connect`, `disconnect` exist. |
| Nested transactions and savepoints | 13 | |
| JSON null values (`DbNull`, `JsonNull`) | 13 | |
| `increment`, `decrement` | 8 | `multiply` and `divide` not examined |
| Transaction timeout options | 4 | |
| List updates (`push`) | 3 | Assigning the whole list works |
| Collection-level `count()` | | Use `aggregate` |
| Order grouped results by an aggregate | | |
| `firstOrThrow` on the collection | | Exists only as `.all().firstOrThrow()`, which reads every row |
| `EXPLAIN` | | |
| N+1 detection | | |

## Different on SQL

| Feature | Tests | Difference |
| --- | --- | --- |
| Cursor pagination | 13 failing | Prisma 8 starts after the cursor row. Prisma 7 includes it. |
| Error model | 55 | No P-codes. Driver errors are wrapped. |
| Negative `take` | 7 | Refused |
| `aggregate` | 8 | Ignores `take`, `skip`, `cursor`, `orderBy` |
| Runtime validation | 20 | Some inputs the types reject are accepted at runtime |
| JSON reads | 8 | A top-level JSON string is parsed twice and fails |
| Bytes inside JSON | 4 failing | Written as an object, not base64 |
| Enum `@map` on members | 1 failing | Not translated |
| `update({})` | 1 failing | Returns `null` without running SQL |
| Default `onUpdate` | 2 failing | `NoAction` where Prisma 7 uses `Cascade` |

## Missing on MongoDB

The MongoDB ORM collection has `where` (equality only), `select`, `include` (by name only), `orderBy`, `limit`, `offset`, and the create, update, delete and upsert methods.

| Feature | Note |
| --- | --- |
| `aggregate`, `count`, `groupBy`, `distinct`, cursor | The pipeline builder has grouping |
| Filters beyond equality (`in`, ranges, `or`) | Need an internal import (TML-2526) |
| Composite type filters and partial updates | About 65 tests |
| Interactive transactions | Planned in `projects/sqlite-mongo-transactions` |
| Nested relation writes | |
| Refining an include | |

MongoDB already has what SQL lacks for atomic and list updates: `inc`, `mul`, `push`, `pull`, `addToSet`.

## Documents that contradict the code

| Document | Problem |
| --- | --- |
| `docs/reference/mongodb-user-promise.md` | Shows callback `where`, `contains`, list operators, include refinement and cascade. None exists in code. |
| `skills/prisma-8/references/queries-postgres.md` | Sends users to `db.sql` for set operations and window functions. Neither exists. This file ships to users' agents. |
| `docs/reference/mongodb-feature-support-priorities.md` | Describes Prisma 7, not Prisma 8 |
| `docs/reference/query-patterns.md` | Uses an API that no longer exists |
| `packages/2-sql/4-lanes/sql-builder/STATUS.md` | Lists features as missing that exist |
| Non-portable test records | Say these are missing, but the code has them: nulls ordering, full-text search, raw SQL (`db.raw.sql`), ordering by a relation field or count, affected-row counts |
