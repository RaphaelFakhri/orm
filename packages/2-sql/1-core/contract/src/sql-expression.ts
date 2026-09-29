import type { JsonValue } from '@internal/contract/types';
import type { DataTypeAuthoringEntry } from '@internal/framework-components/authoring';
import {
  canonicalizeTaggedLiteralBody,
  printTaggedLiteral,
} from '@internal/framework-components/authoring';
import type { DataType, DataTypeId } from '@internal/framework-components/codec';
import { dataType, dataTypeId } from '@internal/framework-components/codec';
import { InternalError } from '@internal/utils/internal-error';

export const SQL_EXPRESSION_DATA_TYPE_ID: DataTypeId = dataTypeId('sql/expression');
export const SQL_EXPRESSION_TAG = 'sql';

/** The data type of SQL text in the target's language. It declares no casts. Each SQL target registers it unchanged. ADR 256. */
export const sqlExpressionDataType: DataType = dataType(SQL_EXPRESSION_DATA_TYPE_ID, {});

/** PSL support for `sql/expression`. Each SQL target registers it unchanged under `SQL_EXPRESSION_DATA_TYPE_ID`. */
export const sqlExpressionAuthoringEntry: DataTypeAuthoringEntry = {
  written: { kind: 'tag', tag: SQL_EXPRESSION_TAG, parse: (text) => text },
  print: (value) => sqlTextFromCanonical(value),
  documentation:
    "SQL in the target database's language. Prisma passes it to the database unchanged.",
};

/** The SQL text held by the canonical form of a `sql/expression` value. */
export function sqlTextFromCanonical(value: JsonValue): string {
  if (typeof value === 'string') return value;
  throw new InternalError(`A sql/expression value is a string, got ${JSON.stringify(value)}.`);
}

/** A `sql` literal holding `text`, as `contract infer` prints it. */
export function printSqlExpressionLiteral(text: string): string {
  return printTaggedLiteral(SQL_EXPRESSION_TAG, text);
}

/** Whether `text` reads back unchanged when printed as a `sql` literal. */
export function sqlTextReadsBack(text: string): boolean {
  const canonical = canonicalizeTaggedLiteralBody(text);
  return canonical.ok && canonical.body === text;
}
