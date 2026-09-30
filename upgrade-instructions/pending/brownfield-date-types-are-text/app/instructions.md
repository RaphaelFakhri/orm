---
changes:
  - id: prisma7-schema-date-types-are-text
    summary: |
      A contract from `prisma7Schema(...)` now reads a Prisma 7 `DateTime` column and `@db.Timestamp`, `@db.Timestamptz`, `@db.Date` and `@db.Time` columns as the text PostgreSQL prints (`TimestampString(3)`, `TimestampString(p)`, `TimestamptzString(p)`, `DateString`, `TimeString(p)`), not as `Temporal` values, and `@updatedAt` writes UTC text. The application needs no `Temporal` for them. Re-emit, change code that treats these fields as `Temporal` values, then run `prisma db sign`.
    detection:
      glob: "**/prisma.config.{ts,mts,cts,js,mjs}"
      matches:
        - '\bprisma7Schema\s*\('
  - id: contract-infer-writes-text-date-types
    summary: |
      `prisma contract infer` now writes `TimestampString(p)`, `TimestamptzString(p)`, `DateString` and `TimeString(p)` for `timestamp`, `timestamptz`, `date` and `time` columns, where it wrote `Timestamp(p)`, `Timestamptz(p)`, `Date` and `Time(p)`. A contract inferred earlier keeps its types until infer runs again.
    detection:
      glob: "**/*.prisma"
      matches:
        - 'Contract inferred from the live database schema'
  - id: text-timestamp-now-is-utc
    summary: |
      A `timestamp` column of type `TimestampString(p)` that the ORM fills with `now` now receives the UTC wall-clock time on a host outside UTC. Before, it received the host's local time. No code changes.
    detection:
      glob: "**/*.{prisma,ts,mts,cts}"
      matches:
        - '\btimestampString\s*\([^)\n]*\bnow\b'
---

# Contracts from a Prisma 7 schema or `contract infer` read dates as text

## `prisma7-schema-date-types-are-text`

For each project whose `prisma.config.ts` uses `prisma7Schema(...)`:

1. Run `prisma contract emit`. The date and time fields change type:

   | Prisma 7 field | Before | Now | Example value |
   | --- | --- | --- | --- |
   | `DateTime`, `DateTime @db.Timestamp(p)` | `Temporal.PlainDateTime` | `string` | `"2026-09-14 10:00:00.123"` (UTC, as Prisma 7 writes it) |
   | `DateTime @db.Timestamptz(p)` | `Temporal.Instant` | `string` | `"2026-09-14 10:00:00.123+00"` |
   | `DateTime @db.Date` | `Temporal.PlainDate` | `string` | `"2026-09-14"` |
   | `DateTime @db.Time(p)` | `Temporal.PlainTime` | `string` | `"10:00:00.123"` |

   `@db.Timetz` fields already read as text and do not change.

2. Change the code that reads or writes these fields. A read gives the string itself, so drop calls such as `.toString()` or `.toJSON()`. Where the code compares or computes with the value, parse it first; for a `timestamp` column, `` new Date(`${value.replace(' ', 'T')}Z`) `` is the instant. Write a string in a form PostgreSQL reads, such as `"2026-09-14T10:00:00Z"` for `@db.Timestamptz` or `"2026-09-14 10:00:00"` for `DateTime`, instead of a `Temporal` value.

3. If no other code in the application uses `Temporal`, remove the `import 'temporal-polyfill/full/global'` it had for these fields, and remove `temporal-polyfill` from the application's `dependencies`. Keep the dependency in a project that installs with Yarn: `@prisma/orm-postgres` declares it as a peer dependency, and Yarn does not install peers on its own.

4. Run `prisma db sign`. The storage hash changed with the column types, so `prisma db verify` reports that the marker does not match until the database is signed again. The database itself needs no migration.

`prisma7Schema(...)` has no option to keep the `Temporal` types. A project that wants them writes a Prisma 8 contract, for example with `prisma contract print --output prisma/contract.prisma`, and changes the types there.

## `contract-infer-writes-text-date-types`

Nothing changes until `prisma contract infer` runs again. When it does, the rewritten contract uses the text types for `timestamp`, `timestamptz`, `date` and `time` columns. Follow steps 1 to 4 above for the fields that changed, or change the types back to `Timestamp(p)`, `Timestamptz(p)`, `Date` and `Time(p)` in the inferred file to keep `Temporal` values.

A default of `infinity` or `-infinity` on one of these columns now prints as `@default("infinity")` where it printed a `sql` expression.

## `text-timestamp-now-is-utc`

This covers `temporal.timestampString(p, onCreate: now, onUpdate: now)` in PSL, `field.temporal.timestampString(...)` with `'now'` in TypeScript, and a Prisma 7 `DateTime @updatedAt` read through `prisma7Schema(...)`. Rows written before this release on a host outside UTC hold that host's local time; rows written from now on hold UTC.
