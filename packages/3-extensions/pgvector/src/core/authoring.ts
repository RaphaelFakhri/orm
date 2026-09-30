import type { AuthoringTypeNamespace } from '@internal/framework-components/authoring';
import { VECTOR_MAX_DIM } from './constants';

export const pgvectorAuthoringTypes = {
  pgvector: {
    Vector: {
      kind: 'typeConstructor',
      inferred: true,
      args: [
        { kind: 'number', name: 'length', integer: true, minimum: 1, maximum: VECTOR_MAX_DIM },
      ],
      output: {
        codecId: 'pg/vector@1',
        typeParams: {
          length: { kind: 'arg', index: 0 },
        },
      },
    },
  },
} as const satisfies AuthoringTypeNamespace;
