import { UNBOUND_NAMESPACE_ID } from '@internal/framework-components/ir';
import type { CodecTypes } from '../exports/codec-types';
import { sqliteAuthoringFieldPresets, sqliteAuthoringTypes } from './authoring';
import { createSqliteDataTypeEntries } from './data-type-authoring';
import { sqliteTargetDescriptorMetaRuntime } from './descriptor-meta-runtime';

const sqliteTargetDescriptorMetaBase = {
  ...sqliteTargetDescriptorMetaRuntime,
  defaultNamespaceId: UNBOUND_NAMESPACE_ID,
  supportsNamespaces: false,
  authoring: {
    type: sqliteAuthoringTypes,
    valueObjectStorageType: 'Json',
    field: sqliteAuthoringFieldPresets,
    dataTypes: createSqliteDataTypeEntries(),
  },
} as const;

export const sqliteTargetDescriptorMeta: typeof sqliteTargetDescriptorMetaBase & {
  readonly __codecTypes?: CodecTypes;
} = sqliteTargetDescriptorMetaBase;
