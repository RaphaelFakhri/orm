import type { DataType } from '@internal/framework-components/codec';
import type { TargetBoundComponentDescriptor } from '@internal/framework-components/components';
import { assertUniqueCodecOwner } from '@internal/framework-components/control';
import {
  claimingSqlTexts,
  isSqlDataType,
  type SqlDataType,
  sqlTypeTextsCollide,
} from '@internal/sql-contract/data-type';
import { blindCast } from '@internal/utils/casts';
import { InternalError } from '@internal/utils/internal-error';
import type { CodecControlHooks } from './migrations/types';

type CodecControlHooksMap = Record<string, CodecControlHooks>;

function hasCodecControlHooks(descriptor: unknown): descriptor is {
  readonly id: string;
  readonly types: {
    readonly codecTypes: {
      readonly controlPlaneHooks: CodecControlHooksMap;
    };
  };
} {
  if (typeof descriptor !== 'object' || descriptor === null) {
    return false;
  }
  const d = blindCast<
    { types?: { codecTypes?: { controlPlaneHooks?: unknown } } },
    'object check proves descriptor is property-readable, nested optional fields are probed defensively'
  >(descriptor);
  const hooks = d.types?.codecTypes?.controlPlaneHooks;
  return hooks !== null && hooks !== undefined && typeof hooks === 'object';
}

export function extractCodecControlHooks(
  descriptors: ReadonlyArray<TargetBoundComponentDescriptor<'sql', string>>,
): Map<string, CodecControlHooks> {
  const hooks = new Map<string, CodecControlHooks>();
  const owners = new Map<string, string>();

  for (const descriptor of descriptors) {
    if (typeof descriptor !== 'object' || descriptor === null) {
      continue;
    }
    if (!hasCodecControlHooks(descriptor)) {
      continue;
    }
    const controlPlaneHooks = descriptor.types.codecTypes.controlPlaneHooks;
    for (const [codecId, hook] of Object.entries(controlPlaneHooks)) {
      assertUniqueCodecOwner({
        codecId,
        owners,
        descriptorId: descriptor.id,
        entityLabel: 'control hooks',
        entityOwnershipLabel: 'owner',
      });
      hooks.set(codecId, hook);
      owners.set(codecId, descriptor.id);
    }
  }

  return hooks;
}

interface DataTypeContributor {
  readonly id: string;
  readonly dataTypes?: ReadonlyArray<DataType>;
}

interface ContributedSqlDataType {
  readonly type: SqlDataType;
  readonly contributedBy: string;
}

function describe(entry: ContributedSqlDataType): string {
  return `data type "${entry.type.id}" contributed by "${entry.contributedBy}"`;
}

/**
 * Refuses two SQL data types in one stack that would both recognise one reported type: their claiming texts collide, or they claim the same kind. Each error names both data types and their contributors.
 */
export function enforceSqlDataTypeInvariants(stack: {
  readonly family: DataTypeContributor;
  readonly target: DataTypeContributor;
  readonly adapter?: DataTypeContributor | undefined;
  readonly extensions: ReadonlyArray<DataTypeContributor>;
}): void {
  const contributors = [
    stack.family,
    stack.target,
    ...(stack.adapter === undefined ? [] : [stack.adapter]),
    ...stack.extensions,
  ];
  const sqlTypes: ContributedSqlDataType[] = contributors.flatMap((contributor) =>
    (contributor.dataTypes ?? [])
      .filter(isSqlDataType)
      .map((type) => ({ type, contributedBy: contributor.id })),
  );

  sqlTypes.forEach((first, index) => {
    for (const second of sqlTypes.slice(index + 1)) {
      const kind = first.type.sql.claimsKind;
      if (kind !== undefined && kind === second.type.sql.claimsKind) {
        throw new InternalError(
          `The ${describe(first)} and the ${describe(second)} both claim the kind "${kind}".`,
        );
      }
      for (const a of claimingSqlTexts(first.type)) {
        const b = claimingSqlTexts(second.type).find((text) => sqlTypeTextsCollide(a, text));
        if (b !== undefined) {
          throw new InternalError(
            `The ${describe(first)} claims the text "${a}", which collides with the text "${b}" claimed by the ${describe(second)}.`,
          );
        }
      }
    }
  });
}
