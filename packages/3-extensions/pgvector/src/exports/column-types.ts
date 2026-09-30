/**
 * Column type descriptor factory for pgvector extension. `vector(N)` is the canonical authoring surface; every pgvector column must declare a dimension via this factory.
 */

import type { ColumnTypeDescriptor } from '@internal/framework-components/codec';
import { validateSqlTypeParams } from '@internal/sql-contract/data-type';
import { VECTOR_CODEC_ID } from '../core/constants';
import { pgvectorVector } from '../core/data-types';

/**
 * Factory for creating dimensioned vector column descriptors.
 *
 * @example
 * ```typescript
 * .column('embedding', { type: vector(1536), nullable: false })
 * // Produces: nativeType: 'vector', typeParams: { length: 1536 }
 * ```
 * @param length - The dimension of the vector (e.g., 1536 for OpenAI embeddings)
 * @returns A column type descriptor with `typeParams.length` set
 * @throws `CONTRACT.TYPE_PARAMS_INVALID` if the `pgvector/vector` data type does not accept `length`
 */
export function vector<N extends number>(
  length: N,
): ColumnTypeDescriptor<typeof VECTOR_CODEC_ID> & { readonly typeParams: { readonly length: N } } {
  validateSqlTypeParams(pgvectorVector, { length });
  return {
    codecId: VECTOR_CODEC_ID,
    nativeType: 'vector',
    typeParams: { length },
  } as const;
}
