import type { CodecLookup, DataTypeLookup } from '@internal/framework-components/codec';
import type { AdapterDescriptor } from '@internal/framework-components/components';
import { createPostgresBuiltinCodecLookup } from '../src/core/codec-registry';
import { codecDescriptors } from '../src/core/codecs';
import { createPostgresBuiltinDataTypeLookup, postgresDataTypes } from '../src/core/data-types';

export const postgresTypeLookups: {
  readonly codecLookup: CodecLookup;
  readonly dataTypeLookup: DataTypeLookup;
} = {
  codecLookup: createPostgresBuiltinCodecLookup(),
  dataTypeLookup: createPostgresBuiltinDataTypeLookup(),
};

const postgresTypesComponent: AdapterDescriptor<'sql', 'postgres'> = {
  kind: 'adapter',
  id: 'postgres-test-types',
  version: '0.0.0-test',
  familyId: 'sql',
  targetId: 'postgres',
  dataTypes: postgresDataTypes,
  types: { codecTypes: { codecDescriptors } },
};

/** Framework components that register the Postgres codecs and data types, for planner and diff tests. */
export const postgresTypeComponents: readonly AdapterDescriptor<'sql', 'postgres'>[] = [
  postgresTypesComponent,
];
