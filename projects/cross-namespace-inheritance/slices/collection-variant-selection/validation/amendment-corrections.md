# Amendment corrections

## Scope

This amendment corrects the two requested blockers on top of `b5a08beec7d3`: demo task-helper variant typing and SQL ORM root-variant tests that previously patched contract hashes synthetically.

## Corrections

- Added a demo type test at `examples/prisma-8-demo/test/orm-client-task-helpers.types.test-d.ts` covering precise `Bug`/`Feature` row types, variant-specific create inputs, rejected cross-variant fields, and helper-preserving `where()` / `forUser()` chains.
- Updated `TaskCollectionSurface` so `bugs()` and `features()` return variant-specific collections, and `where()` / `forUser()` return the helper-preserving task surface.
- Updated `createOrmClient()` so the exported demo client type exposes the custom `Task` surface instead of the base generated collection type.
- Replaced synthetic SQL ORM hash mutation helpers with emitted fixture contracts under `packages/3-extensions/sql-orm-client/test/fixtures/root-variant-hashes/`.
- Preserved root-variant coverage for same-hash cross-context hydration, storage mismatch rejection, execution presence/absence mismatch in both directions, differing execution hash with matching storage/profile hashes, receiver-only runtime execution, and invalid root arguments.
- Updated runtime tests touched by this amendment to use explicit `select()` calls with result shapes matching the selected fields.

## Fixture note

The emitted Postgres profile hash is derived from target family, target, and capabilities. The PSL changes available for this polymorphism fixture affect storage and execution sections, while the Postgres target capabilities remain unchanged, so there is no genuine PSL-authored profile-hash-only variant to add without patching JSON or fabricating a hash.

## Verification

- `pnpm --filter @internal/sql-orm-client test -- collection-root-variant.test.ts`
- `pnpm --filter @internal/sql-orm-client typecheck`
- `pnpm --filter @internal/sql-orm-client lint`
- `pnpm --filter prisma-8-demo typecheck`
- `pnpm --filter prisma-8-demo test -- orm-client-task-helpers.test.ts`
- `pnpm --filter prisma-8-demo lint` (reported existing no-bare-cast infos outside this amendment; no errors)
