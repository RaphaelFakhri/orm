---
changes:
  - id: ts-contract-lists-extension-codecs
    summary: |
      A TypeScript contract built with `defineContract` from `@prisma/orm-postgres/contract-builder`
      or `@prisma/orm-sqlite/contract-builder` names each column's database type from the data type
      its codec represents. A contract that uses an extension's codec without listing the extension
      in `extensions` now fails with `CONTRACT.CODEC_DESCRIPTOR_MISSING`. List the extension.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '[''"]@prisma/orm-extension-(?:pgvector|postgis|arktype-json)/column-types[''"]'
        - '\bcodecId\s*:\s*[''"](?:pg/vector|pg/geometry|arktype/json)@\d+[''"]'
  - id: sqlite-contract-d-ts-char-aggregates
    summary: |
      On SQLite, `sql/char@1` and `sql/varchar@1` are registered codecs. Re-emit the contract:
      `contract.d.ts` gains `min` and `max` aggregate rows for both codecs. `contract.json`, its
      hashes and the migration SQL do not change.
    detection:
      glob: "**/contract.d.ts"
      matches:
        - '^(?![\s\S]*[''"]sql/char@1[''"]\s*:\s*\{\s*readonly output)[\s\S]*@prisma/orm-(?:target-)?sqlite/'
---

## `ts-contract-lists-extension-codecs`

A column's stored database type name is now written from the data type of the column's codec, so the contract build needs the pack that provides the codec. Add every extension whose codec the contract uses:

```ts
import pgvector from '@prisma/orm-extension-pgvector/pack';
import { defineContract } from '@prisma/orm-postgres/contract-builder';

export const contract = defineContract(
  { extensions: { pgvector } },
  ({ field, model }) => ({
    // …
  }),
);
```

A contract that already lists the extension changes nothing. `contract.json` does not change.

## `sqlite-contract-d-ts-char-aggregates`

Run `prisma contract emit` for a SQLite project. The emitted `contract.d.ts` adds these rows under both `AggregateTypes.max.byCodec` and `AggregateTypes.min.byCodec`:

```ts
readonly 'sql/char@1': { readonly output: 'sql/char@1'; readonly nullable: true };
readonly 'sql/varchar@1': { readonly output: 'sql/varchar@1'; readonly nullable: true };
```

`contract.json`, `storageHash`, `profileHash` and migration snapshots do not change, so no migration or re-sign is needed.
