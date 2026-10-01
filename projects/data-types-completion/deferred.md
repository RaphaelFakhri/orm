# Deferred follow-ups

Found while building; not in any slice. File as Linear issues at close-out.

- `pnpm lint:deps` cannot see imports between packages: `@internal/*` imports resolve to `dist/*.mjs`, which `dependency-cruiser.config.mjs` excludes, so plane boundaries in `architecture.config.json` are not checked across packages. Found in the slice 1 system design review (F01).
- Rename the pack descriptor key `authoring.dataTypes` (PSL value entries: tags, plain entries, number classifier) so it does not share a name with `dataTypes` (the data types). Touches ADR 254 and every pack. Slice 1 system design review F10.
- Both targets' `data-type-entries.ts` (shared plane) import helpers from `@internal/sql-relational-core/ast` (runtime plane). The import predates slice 1. Move the helpers to a shared package or narrow the map. Slice 1 review fixes 2, S1-rf2-R1-2.
- `pnpm fixtures:emit` fails from a clean start when an extension's contract-space head hash changes: example emits run before `build:contract-space` and `migrations:regen`, and the extension `dist` bundles the head hash. Workaround used in slice 2: run `build:contract-space`, `migrations:regen` and an extension build first. Fix the script order.
