import { Collection } from '../src/collection';
import { orm } from '../src/orm';
import contractJson from './fixtures/generated/contract.json' with { type: 'json' };
import type { Contract as SoftDeleteContract } from './fixtures/soft-delete/contract';
import {
  buildTestContextFromContract,
  createMockRuntime,
  deserializeTestContract,
} from './helpers';

export type { SoftDeleteContract };

const deletedAtCodec = 'pg/timestamptz-date@1';

function addDeletedAt(json: Record<string, never>, model: string, table: string): void {
  const raw = json as unknown as {
    domain: {
      namespaces: { public: { models: Record<string, Record<string, Record<string, unknown>>> } };
    };
    storage: {
      namespaces: {
        public: { entries: { table: Record<string, { columns: Record<string, unknown> }> } };
      };
    };
  };
  const domainModel = raw.domain.namespaces.public.models[model]!;
  domainModel['fields']!['deletedAt'] = {
    nullable: true,
    type: { kind: 'scalar', codecId: deletedAtCodec },
  };
  (domainModel['storage']!['fields'] as Record<string, unknown>)['deletedAt'] = {
    column: 'deleted_at',
  };
  raw.storage.namespaces.public.entries.table[table]!.columns['deleted_at'] = {
    nativeType: 'timestamptz',
    codecId: deletedAtCodec,
    nullable: true,
  };
}

export function softDeleteContract(): SoftDeleteContract {
  const json = JSON.parse(JSON.stringify(contractJson));
  addDeletedAt(json, 'Post', 'posts');
  addDeletedAt(json, 'Comment', 'comments');
  return deserializeTestContract(json) as unknown as SoftDeleteContract;
}

export class SoftPostCollection extends Collection<SoftDeleteContract, 'Post'> {
  popular() {
    return this.where((post) => post.views.gte(100));
  }
}

export function softDeleteSetup() {
  const runtime = createMockRuntime();
  const context = buildTestContextFromContract(softDeleteContract());
  return {
    runtime,
    context,
    db: orm({ runtime, context }),
    custom: orm({ runtime, context, collections: { Post: SoftPostCollection } }),
  };
}
