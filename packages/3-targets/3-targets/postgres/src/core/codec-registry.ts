import type { CodecRegistry, DataType, DataTypeLookup } from '@internal/framework-components/codec';
import type { ComponentMetadata } from '@internal/framework-components/components';
import { assembleDataTypes, extractCodecLookup } from '@internal/framework-components/control';
import { structuredError } from '@internal/utils/structured-error';
import {
  type AnyPostgresCodecDescriptor,
  buildPostgresCodecDescriptorRegistry,
  type PostgresCodecDescriptorRegistry,
} from './codec-descriptor';
import { postgresTargetDescriptorMetaRuntime } from './descriptor-meta-runtime';
import { postgresCodecDescriptorRegistry } from './registry';

/**
 * The codecs of a composed stack, with the data types the same components register. The SQL
 * renderer writes a parameter's cast from the data type its codec represents.
 */
export type PostgresCodecRegistry = CodecRegistry &
  PostgresCodecDescriptorRegistry & { readonly dataTypes: DataTypeLookup };

type DataTypeContributor = Pick<ComponentMetadata, 'dataTypes'> & { readonly id?: string };

function buildPostgresCodecRegistry(
  descriptors: ReadonlyArray<unknown>,
  dataTypeContributors: ReadonlyArray<DataTypeContributor>,
): PostgresCodecRegistry {
  const descriptorRegistry = buildPostgresCodecDescriptorRegistry(descriptors);
  const validatedDescriptors = Array.from(descriptorRegistry.values());
  const codecRegistry = extractCodecLookup([
    {
      id: 'postgres-codecs',
      types: { codecTypes: { codecDescriptors: validatedDescriptors } },
    },
  ]);
  const dataTypes = assembleDataTypes(dataTypeContributors).lookup;
  for (const descriptor of validatedDescriptors) {
    if (!dataTypes.has(descriptor.dataType)) {
      throw structuredError(
        'CONTRACT.DATA_TYPE_UNREGISTERED',
        `Codec "${descriptor.codecId}" represents data type "${descriptor.dataType}", which no component registers.`,
        {
          why: 'A parameter of this codec is written with a cast named by its data type.',
          fix: 'Pass the data type beside the codec: in `dataTypes` of createPostgresAdapter, or in the `dataTypes` of the extension that contributes the codec.',
          meta: { codecId: descriptor.codecId, dataType: descriptor.dataType },
        },
      );
    }
  }
  const registry: PostgresCodecRegistry = {
    ...codecRegistry,
    descriptorFor: (codecId) => descriptorRegistry.descriptorFor(codecId),
    values: () => descriptorRegistry.values(),
    dataTypes,
  };
  return Object.freeze(registry);
}

export function assemblePostgresCodecRegistry(
  components: ReadonlyArray<
    Pick<ComponentMetadata, 'types' | 'dataTypes'> & { readonly id?: string }
  >,
): PostgresCodecRegistry {
  const descriptors = components.flatMap(
    (component) => component.types?.codecTypes?.codecDescriptors ?? [],
  );
  return buildPostgresCodecRegistry(descriptors, components);
}

export function assemblePostgresCodecRegistryWithBuiltins(
  extensions: ReadonlyArray<
    Pick<ComponentMetadata, 'types' | 'dataTypes'> & { readonly id?: string }
  >,
): PostgresCodecRegistry {
  return buildPostgresCodecRegistry(
    [
      ...postgresCodecDescriptorRegistry.values(),
      ...extensions.flatMap((extension) => extension.types?.codecTypes?.codecDescriptors ?? []),
    ],
    [postgresTargetDescriptorMetaRuntime, ...extensions],
  );
}

/**
 * A registry of the built-in codecs and `codecDescriptors`. `dataTypes` are the data types those
 * descriptors represent beyond the target's own.
 */
export function createPostgresCodecRegistryWithBuiltins(
  codecDescriptors: readonly AnyPostgresCodecDescriptor[] = [],
  dataTypes: readonly DataType[] = [],
): PostgresCodecRegistry {
  return buildPostgresCodecRegistry(
    [...postgresCodecDescriptorRegistry.values(), ...codecDescriptors],
    [postgresTargetDescriptorMetaRuntime, { id: 'postgres-codec-registry', dataTypes }],
  );
}

/**
 * Build a coherent PostgreSQL codec registry populated with built-in descriptors only.
 *
 * The returned registry supports both ordinary codec materialization and PostgreSQL target behavior. Stack-composed paths build the same combined registry from their complete ordered descriptor contributions.
 */
export function createPostgresBuiltinCodecLookup(): PostgresCodecRegistry {
  return createPostgresCodecRegistryWithBuiltins();
}
