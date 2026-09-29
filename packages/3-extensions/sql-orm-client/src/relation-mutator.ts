import type { Contract } from '@internal/contract/types';
import type { SqlStorage } from '@internal/sql-contract/types';
import { blindCast } from '@internal/utils/casts';
import type {
  MutationCreateInput,
  RelationMutation,
  RelationMutationConnect,
  RelationMutationCreate,
  RelationMutationDisconnect,
  RelationMutator,
} from './types';

export function createRelationMutator<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
>(): RelationMutator<TContract, ModelName> {
  return {
    create(
      data:
        | MutationCreateInput<TContract, ModelName>
        | readonly MutationCreateInput<TContract, ModelName>[],
    ) {
      const rows = Array.isArray(data) ? [...data] : [data];
      return blindCast<
        RelationMutationCreate<TContract, ModelName>,
        'relation create descriptor rows are normalized to the target model input shape'
      >({
        kind: 'create',
        data: rows,
      });
    },
    connect(criteria: Record<string, unknown> | readonly Record<string, unknown>[]) {
      const values = Array.isArray(criteria) ? [...criteria] : [criteria];
      return blindCast<
        RelationMutationConnect<TContract, ModelName>,
        'relation connect descriptor criteria are normalized to records at runtime'
      >({
        kind: 'connect',
        criteria: values,
      });
    },
    disconnect(criteria?: readonly Record<string, unknown>[]) {
      if (!criteria) {
        return blindCast<
          RelationMutationDisconnect<TContract, ModelName>,
          'relation disconnect descriptor may omit criteria for all related rows'
        >({
          kind: 'disconnect',
        });
      }

      return blindCast<
        RelationMutationDisconnect<TContract, ModelName>,
        'relation disconnect descriptor criteria are copied to runtime records'
      >({
        kind: 'disconnect',
        criteria: [...criteria],
      });
    },
  };
}

export function isRelationMutationDescriptor(
  value: unknown,
): value is RelationMutation<Contract<SqlStorage>, string> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = blindCast<
    { kind?: unknown },
    'relation mutation descriptor guard only reads optional kind after object validation'
  >(value);
  if (
    candidate.kind !== 'create' &&
    candidate.kind !== 'connect' &&
    candidate.kind !== 'disconnect'
  ) {
    return false;
  }

  return true;
}

export function isRelationMutationCallback(
  value: unknown,
): value is (
  mutator: RelationMutator<Contract<SqlStorage>, string>,
) => RelationMutation<Contract<SqlStorage>, string> {
  return typeof value === 'function';
}
