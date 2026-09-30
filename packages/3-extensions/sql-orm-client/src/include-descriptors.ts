import { blindCast } from '@internal/utils/casts';
import type { StripRowType } from './collection-internal-types';
import type { CollectionState, IncludeCombine, IncludeCombineBranch, IncludeScalar } from './types';

interface CollectionStateCarrier {
  readonly state: CollectionState;
}

export function createIncludeScalar<Result>(
  fn: IncludeScalar<Result>['fn'],
  state: CollectionState,
  column?: string,
): IncludeScalar<Result> {
  return blindCast<
    IncludeScalar<Result>,
    'include scalar descriptor stores phantom row typing that StripRowType removes at runtime'
  >({
    kind: 'includeScalar',
    fn,
    state,
    ...(column !== undefined ? { column } : {}),
  } satisfies StripRowType<IncludeScalar<Result>>);
}

export function createIncludeCombine<ResultShape extends Record<string, unknown>>(
  branches: Record<string, IncludeCombineBranch>,
): IncludeCombine<ResultShape> {
  return blindCast<
    IncludeCombine<ResultShape>,
    'include combine descriptor stores phantom row typing that StripRowType removes at runtime'
  >({
    kind: 'includeCombine',
    branches,
  } satisfies StripRowType<IncludeCombine<ResultShape>>);
}

export function isIncludeScalar(value: unknown): value is IncludeScalar<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // The operation vocabulary is open: any string names a potentially
  // contributed operation, so validity is shape-only.
  return (
    'kind' in value &&
    value.kind === 'includeScalar' &&
    'fn' in value &&
    typeof value.fn === 'string' &&
    'state' in value &&
    isCollectionState(value.state)
  );
}

export function isIncludeCombine(value: unknown): value is IncludeCombine<Record<string, unknown>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'includeCombine' &&
    'branches' in value &&
    typeof value.branches === 'object' &&
    value.branches !== null
  );
}

export function isCollectionStateCarrier(value: unknown): value is CollectionStateCarrier {
  return (
    typeof value === 'object' &&
    value !== null &&
    'state' in value &&
    isCollectionState(value.state)
  );
}

function isCollectionState(value: unknown): value is CollectionState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'filters' in value &&
    Array.isArray(value.filters) &&
    'includes' in value &&
    Array.isArray(value.includes)
  );
}
