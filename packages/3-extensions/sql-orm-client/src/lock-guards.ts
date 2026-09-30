import { ormError } from './orm-errors';
import type { CollectionState, IncludeExpr } from './types';

export type LockedTerminalConflict = 'aggregate' | 'groupBy' | 'mutation';

function includeCarriesLock(include: IncludeExpr): boolean {
  if (stateCarriesLock(include.nested) || include.scalar?.state.locking !== undefined) {
    return true;
  }
  return Object.values(include.combine ?? {}).some((branch) =>
    branch.kind === 'rows'
      ? stateCarriesLock(branch.state)
      : branch.selector.state.locking !== undefined,
  );
}

function stateCarriesLock(state: CollectionState): boolean {
  return state.locking !== undefined || state.includes.some(includeCarriesLock);
}

function conflictOf(
  state: CollectionState,
  terminal: LockedTerminalConflict | undefined,
): string | undefined {
  if (state.includes.some(includeCarriesLock)) return 'include';
  if (state.locking === undefined) return undefined;
  if (terminal !== undefined) return terminal;
  if (state.includes.length > 0) return 'include';
  if (state.distinct !== undefined && state.distinct.length > 0) return 'distinct';
  if (state.distinctOn !== undefined && state.distinctOn.length > 0) return 'distinctOn';
  return undefined;
}

/** Refuses a row lock the ORM cannot render: with include, distinct or distinctOn in the state, or with the given terminal. */
export function assertLockCompatible(
  state: CollectionState,
  terminal?: LockedTerminalConflict,
): void {
  const conflict = conflictOf(state, terminal);
  if (conflict !== undefined) {
    throw ormError(
      'ORM.LOCK_INCOMPATIBLE',
      `A locking clause cannot be combined with ${conflict}`,
      { meta: { conflict } },
    );
  }
}
