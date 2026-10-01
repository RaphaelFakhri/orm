---
changes:
  - id: contract-stores-data-type
    summary: |
      A SQL contract names each column's data type in `dataType` (for example `pg/int4`) instead of
      its database type name in `nativeType`. Run the colocated script on every SQL contract in the project: it
      rewrites every contract, renames the snapshot directories to the new storage hashes, and
      rewrites the migrations, refs, `migration.ts` imports and `contract.d.ts` files that name them.
    detection:
      glob: "**/*.json"
      matches:
        - '"nativeType"\s*:\s*"'
    script: ./scripts/data-type-in-contract.ts
---

## `contract-stores-data-type`

Commit your work first, so the script's changes can be reviewed and undone with git. Then run the script from the project root:

```sh
pnpm exec tsx <path-to-this-guide>/scripts/data-type-in-contract.ts
```

It reads and writes files only and needs no database. It rewrites every `*.json` file under the root that parses as a SQL contract, skipping `node_modules`, `.git`, `dist` and `build`. That includes a test fixture of an old-format contract: if you keep such a fixture on purpose, restore it with git afterwards (`git restore <file>`), or keep it outside the project root.

Run your formatter afterwards. The script replaces text in `migration.ts` and `contract.d.ts`, so the import order in `migration.ts` and the line wrapping in `contract.d.ts` can differ from what a fresh emit and your formatter produce.

A project already in the new format is left unchanged. It prints `<file>: stored hash did not recompute; rehashed from content` for a contract whose stored storage hash does not match its content, and rewrites it anyway. It changes no file and exits 1 when a column uses a codec it does not know (`<file>: unknown codec <id>; name its data type with --data-type <id>=<data type id>`) or when a renamed snapshot directory already exists with different content.

The script knows every codec that Prisma and its own extensions ship. For a codec from another extension, pass the line that extension publishes in its upgrade notes, once per codec, for example `--data-type acme/shape@1=acme/shape`. The option cannot change the data type of a codec the script already knows.
