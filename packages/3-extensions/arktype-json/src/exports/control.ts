/**
 * Control-plane extension descriptor for arktype-json.
 *
 * Unlike pgvector, arktype-json has no database extension to install
 * (`jsonb` is a built-in Postgres type), no contract space, no query
 * operations and no control-plane hooks: the schema in typeParams
 * affects runtime validation only, never DDL.
 */

import type { SqlControlExtensionDescriptor } from '@internal/family-sql/control';
import { arktypeJsonPackMeta } from '../core/pack-meta';

export const arktypeJsonExtensionDescriptor: SqlControlExtensionDescriptor<'postgres'> = {
  ...arktypeJsonPackMeta,
  create: () => ({
    familyId: 'sql' as const,
    targetId: 'postgres' as const,
  }),
};

export default arktypeJsonExtensionDescriptor;
