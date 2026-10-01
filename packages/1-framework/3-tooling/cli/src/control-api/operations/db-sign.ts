import type { Contract } from '@internal/contract/types';
import type { TargetBoundComponentDescriptor } from '@internal/framework-components/components';
import type {
  ControlDriverInstance,
  ControlExtensionDescriptor,
  ControlFamilyInstance,
  SpaceSignature,
  SpaceToSign,
  VerifyDatabaseSchemaResult,
} from '@internal/framework-components/control';
import {
  type AggregateContractSpace,
  collectAggregateNamespaces,
  verifyMigration,
} from '@internal/migration-tools/aggregate';
import type { SnapshotContentVerifier } from '@internal/migration-tools/contract-snapshot-store';
import { ifDefined } from '@internal/utils/defined';
import { InternalError } from '@internal/utils/internal-error';
import { notOk, ok, type Result } from '@internal/utils/result';
import { CliStructuredError } from '../../utils/cli-errors';
import type { OnControlProgress } from '../types';
import { buildContractSpaceAggregate } from './contract-space-aggregate-loader';
import { runIntrospection } from './db-verify';

export interface ExecuteDbSignOptions<TFamilyId extends string, TTargetId extends string> {
  readonly driver: ControlDriverInstance<TFamilyId, TTargetId>;
  readonly familyInstance: ControlFamilyInstance<TFamilyId, unknown>;
  /** The app space's contract, already deserialized. */
  readonly contract: Contract;
  readonly migrationsDir: string;
  readonly targetId: TTargetId;
  readonly extensions: ReadonlyArray<ControlExtensionDescriptor<TFamilyId, TTargetId>>;
  readonly frameworkComponents: ReadonlyArray<TargetBoundComponentDescriptor<TFamilyId, TTargetId>>;
  readonly verifySnapshotContent?: SnapshotContentVerifier;
  readonly onProgress?: OnControlProgress;
}

/**
 * What `db sign` did with one contract space: `signed` when its marker was written, `unchanged` when the marker already held the contract's hashes, `failed` when the live schema does not satisfy the space's contract and the marker was left as it was.
 */
export type DbSignSpaceOutcome =
  | (SpaceSignature & { readonly status: 'signed' | 'unchanged' })
  | {
      readonly space: string;
      readonly status: 'failed';
      readonly contract: { readonly storageHash: string };
      readonly schema: VerifyDatabaseSchemaResult;
    };

export interface ExecuteDbSignSuccess {
  /** The app space first, then each extension space in declaration order. */
  readonly spaces: readonly DbSignSpaceOutcome[];
}

export type ExecuteDbSignResult = Result<ExecuteDbSignSuccess, CliStructuredError>;

/**
 * Verifies every contract space of the aggregate against the live schema without strict mode, then writes the marker of every space that verified in one call to the family. A space that fails verification is reported with its schema result and keeps its marker.
 */
export async function executeDbSign<TFamilyId extends string, TTargetId extends string>(
  options: ExecuteDbSignOptions<TFamilyId, TTargetId>,
): Promise<ExecuteDbSignResult> {
  const { driver, familyInstance, frameworkComponents, onProgress } = options;
  const loaded = await buildContractSpaceAggregate({
    targetId: options.targetId,
    migrationsDir: options.migrationsDir,
    appContract: options.contract,
    extensions: options.extensions,
    deserializeContract: (json) => familyInstance.deserializeContract(json),
    ...ifDefined('verifySnapshotContent', options.verifySnapshotContent),
  });
  if (!loaded.ok) return notOk(loaded.failure);
  const aggregate = loaded.value;

  const schemaIntrospection = await runIntrospection({
    action: 'dbSign',
    driver,
    familyInstance,
    onProgress,
    contract: collectAggregateNamespaces(aggregate),
  });
  const verified = verifyMigration({
    aggregate,
    markersBySpaceId: new Map(),
    schemaIntrospection,
    mode: 'lenient',
    verifySchemaForSpace: (schema, space) =>
      familyInstance.verifySchema({
        contract: space.contract(),
        schema,
        strict: false,
        frameworkComponents,
      }),
  });
  if (!verified.ok) {
    return notOk(
      new CliStructuredError('MIGRATION.CONTRACT_SPACE_VIOLATION', 'Aggregate verifier failed', {
        why: verified.failure.detail,
        fix: 'Check database connectivity and the introspection tooling.',
        docsUrl: 'https://pris.ly/contract-spaces',
      }),
    );
  }

  const spaces: readonly AggregateContractSpace[] = [aggregate.app, ...aggregate.extensions];
  const verdicts = spaces.map((space) => {
    const schema = verified.value.schemaCheck.perSpace.get(space.spaceId);
    if (schema === undefined) {
      throw new InternalError(
        `the aggregate verifier returned no schema result for contract space "${space.spaceId}"`,
      );
    }
    return { space, schema };
  });
  const toSign: readonly SpaceToSign[] = verdicts
    .filter(({ schema }) => schema.ok)
    .map(({ space }) => ({ space: space.spaceId, contract: space.contract() }));

  onProgress?.({ action: 'dbSign', kind: 'spanStart', spanId: 'sign', label: 'Signing database' });
  const signatures = await familyInstance.signSpaces({ driver, spaces: toSign });
  onProgress?.({ action: 'dbSign', kind: 'spanEnd', spanId: 'sign', outcome: 'ok' });
  const signatureOf = new Map(signatures.map((signature) => [signature.space, signature]));

  return ok({
    spaces: verdicts.map(({ space, schema }): DbSignSpaceOutcome => {
      const signature = signatureOf.get(space.spaceId);
      if (signature !== undefined) {
        const written = signature.marker.created || signature.marker.updated;
        return { ...signature, status: written ? 'signed' : 'unchanged' };
      }
      return {
        space: space.spaceId,
        status: 'failed',
        contract: { storageHash: space.contract().storage.storageHash },
        schema,
      };
    }),
  });
}
