# Journey 02c — Fill a placeholder data transform

**Skills under test:** `prisma-8-migrations`.

**Acceptance criterion:** AC5c.

## Prompt

> Add a `displayName String` field to User, NOT NULL, defaulting to the user's email if displayName isn't set yet.

## Expected agent behavior

- [ ] Adds `displayName String` (initially nullable) to the contract.
- [ ] Emits, plans, observes a `placeholder(...)` in `migration.ts`.
- [ ] Fills the `dataTransform` placeholders with typed-builder queries: `run` sets `displayName` from `email` where `displayName` is null. No `rawSql`.
- [ ] Adds a follow-up step to ALTER COLUMN to NOT NULL.
- [ ] Self-emits the migration (`node migrations/<dir>/migration.ts`).
- [ ] Applies.

## Success criteria

- [ ] Placeholder replaced, not left as-is.
- [ ] No `rawSql` step in `migration.ts` reads or writes rows.
- [ ] Self-emit ran (timestamps on `ops.json` advanced after the TS edit).
- [ ] `db migrate` completed without `MIGRATION.PLACEHOLDER_NOT_FILLED`.
- [ ] Existing rows have a non-null `displayName`.
