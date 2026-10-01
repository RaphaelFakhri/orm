#!/usr/bin/env -S node
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';
import type { Contract as Start } from '../../snapshots/62d81d607d929760f7d740b45bb97acc1dba361363c4851b19ee5a1cb4fecbe3/contract';
import startContract from '../../snapshots/62d81d607d929760f7d740b45bb97acc1dba361363c4851b19ee5a1cb4fecbe3/contract.json' with {
  type: 'json',
};
import type { Contract as End } from '../../snapshots/3769f67036b96f2d2e97038f6511d20591f5cb4953941a152d69b7204f243d8e/contract';
import endContract from '../../snapshots/3769f67036b96f2d2e97038f6511d20591f5cb4953941a152d69b7204f243d8e/contract.json' with {
  type: 'json',
};

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'post',
        index: 'post_title_search_fef4158d',
        expression: 'to_tsvector(\'english\', "title")',
        extras: { type: 'gin' },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
