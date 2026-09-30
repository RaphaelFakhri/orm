import { describe, expect, it } from 'vitest';
import { postgresAdapterDescriptorMeta } from '../src/core/descriptor-meta';
import * as columnTypes from '../src/exports/column-types';

const codecId = 'pg/timestamptz-date@1';

describe('Postgres Date adapter wiring', () => {
  it('exports the Date column descriptor', () => {
    expect(columnTypes).not.toHaveProperty('timestamptzDateColumn');
    expect(columnTypes).toHaveProperty('timestamptzJsDateColumn', {
      codecId,
      nativeType: 'timestamptz',
    });
  });

  it('declares storage and precision expansion for Date columns', () => {
    expect(postgresAdapterDescriptorMeta.types.storage).toContainEqual({
      typeId: codecId,
      familyId: 'sql',
      targetId: 'postgres',
      nativeType: 'timestamptz',
    });
    const hook = postgresAdapterDescriptorMeta.types.codecTypes.controlPlaneHooks[codecId];
    expect(hook.expandNativeType).toBeDefined();
    expect(hook.expandNativeType?.({ nativeType: 'timestamptz' })).toBe('timestamptz');
    for (const precision of [0, 3, 6]) {
      expect(
        hook.expandNativeType?.({ nativeType: 'timestamptz', typeParams: { precision } }),
      ).toBe(`timestamptz(${precision})`);
    }
    expect(() =>
      hook.expandNativeType?.({ nativeType: 'timestamptz', typeParams: { precision: -1 } }),
    ).toThrow();
  });
});
