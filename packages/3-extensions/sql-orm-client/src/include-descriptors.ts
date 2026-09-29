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

  const candidate = blindCast<
    {
      kind?: unknown;
      fn?: unknown;
      state?: unknown;
    },
    'include scalar guard only reads optional shape fields after object validation'
  >(value);

  // The operation vocabulary is open: any string names a potentially
  // contributed operation, so validity is shape-only.
  return (
    candidate.kind === 'includeScalar' &&
    typeof candidate.fn === 'string' &&
    isCollectionState(candidate.state)
  );
}

export function isIncludeCombine(value: unknown): value is IncludeCombine<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = blindCast<
    {
      kind?: unknown;
      branches?: unknown;
    },
    'include combine guard only reads optional shape fields after object validation'
  >(value);

  if (candidate.kind !== 'includeCombine') {
    return false;
  }

  if (typeof candidate.branches !== 'object' || candidate.branches === null) {
    return false;
  }

  return true;
}

export function isCollectionStateCarrier(value: unknown): value is CollectionStateCarrier {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = blindCast<
    { state?: unknown },
    'collection state carrier guard only reads optional state after object validation'
  >(value);
  return isCollectionState(candidate.state);
}

function isCollectionState(value: unknown): value is CollectionState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = blindCast<
    {
      filters?: unknown;
      includes?: unknown;
    },
    'collection state guard only reads optional shape fields after object validation'
  >(value);

  return Array.isArray(candidate.filters) && Array.isArray(candidate.includes);
}
