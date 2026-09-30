# Deferred follow-ups

Found while building; not in any slice. File as Linear issues at close-out.

- `pnpm lint:deps` cannot see imports between packages: `@internal/*` imports resolve to `dist/*.mjs`, which `dependency-cruiser.config.mjs` excludes, so plane boundaries in `architecture.config.json` are not checked across packages. Found in the slice 1 system design review (F01).
- Rename the pack descriptor key `authoring.dataTypes` (PSL value entries: tags, plain entries, number classifier) so it does not share a name with `dataTypes` (the data types). Touches ADR 254 and every pack. Slice 1 system design review F10.
