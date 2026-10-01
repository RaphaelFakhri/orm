import type { Contract } from '@internal/contract/types';
import { type ResolvedHints, renamedTableKey } from '@internal/family-sql/control';
import type { TargetBoundComponentDescriptor } from '@internal/framework-components/components';
import type { ConsumedHint } from '@internal/framework-components/control';
import type { SqlStorage } from '@internal/sql-contract/types';
import type { SqlSchemaIR } from '@internal/sql-schema-ir/types';
import type { RenameTableCall } from './op-factory-call';
import { WorkingSchema } from './schema-working-state';
import { sqliteTableRenameCall } from './table-rename-calls';

export interface HintRenames {
  readonly calls: readonly RenameTableCall[];
  /** The origin with every planned rename applied: the schema the rest of the plan diffs. */
  readonly origin: SqlSchemaIR;
  readonly consumed: readonly ConsumedHint[];
  /** The renamed tables, keyed by `renamedTableKey` of the old name, valued by the new name. */
  readonly renamedTables: ReadonlyMap<string, string>;
  /** Always empty: SQLite applies a hint whatever the table's control policy. */
  readonly warnings: readonly [];
}

/** The outcome when there is nothing to rename: the origin unchanged. */
export function noHintRenames(origin: SqlSchemaIR): HintRenames {
  return { calls: [], origin, consumed: [], renamedTables: new Map(), warnings: [] };
}

/**
 * Turns the resolved table renames into rename calls, in order, each computed against the origin as
 * the earlier renames leave it.
 */
export function planHintRenames(input: {
  readonly origin: SqlSchemaIR;
  readonly contract: Contract<SqlStorage>;
  readonly hints: Pick<ResolvedHints, 'tableRenames'>;
  readonly frameworkComponents: ReadonlyArray<TargetBoundComponentDescriptor<'sql', string>>;
}): HintRenames {
  const working = new WorkingSchema(input.origin);
  const calls: RenameTableCall[] = [];
  const consumed: ConsumedHint[] = [];
  const renamedTables = new Map<string, string>();
  for (const rename of input.hints.tableRenames) {
    const call = sqliteTableRenameCall({
      previous: working.current,
      contract: input.contract,
      rename,
      frameworkComponents: input.frameworkComponents,
    });
    working.apply(call);
    calls.push(call);
    renamedTables.set(renamedTableKey(rename.namespaceId, rename.from), rename.to);
    consumed.push({
      kind: 'renamed',
      coordinate: { namespaceId: rename.namespaceId, entityKind: 'table', entityName: rename.to },
      from: rename.from,
    });
  }
  return { calls, origin: working.current, consumed, renamedTables, warnings: [] };
}
