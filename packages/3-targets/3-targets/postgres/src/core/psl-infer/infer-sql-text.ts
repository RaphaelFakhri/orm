import { canonicalizeTaggedLiteralBody } from '@internal/framework-components/authoring';
import { sqlTextsReadBack } from '@internal/sql-contract/sql-expression';
import { detectIndexNaming, type IndexAttributeSource } from '../psl-build/index-attributes';

/** Why `contract infer` skips an exact-named object whose SQL a `sql` literal would change. */
export const SQL_DOES_NOT_READ_BACK =
  'its SQL cannot be written as a sql literal that reads back unchanged. It is not in this schema; add it by hand before running migration plan, or the plan will drop it.';

function canonicalSqlText(text: string): string | undefined {
  const canonical = canonicalizeTaggedLiteralBody(text);
  return canonical.ok ? canonical.text : undefined;
}

/**
 * The index as `contract infer` prints it, or `undefined` when it is skipped. An exact-named index
 * is compared byte for byte, so its SQL must read back unchanged. A wire-named index is compared by
 * name, and its canonical SQL hashes to the same name, so it is printed with that text.
 */
export function printableIndex<Index extends IndexAttributeSource>(
  index: Index,
): Index | undefined {
  if (sqlTextsReadBack([index.expression, index.where])) return index;
  const expression =
    index.expression === undefined ? undefined : canonicalSqlText(index.expression);
  const where = index.where === undefined ? undefined : canonicalSqlText(index.where);
  if (expression === undefined && index.expression !== undefined) return undefined;
  if (where === undefined && index.where !== undefined) return undefined;
  const canonical: Index = {
    ...index,
    ...(expression !== undefined ? { expression } : {}),
    ...(where !== undefined ? { where } : {}),
  };
  return detectIndexNaming(canonical).kind === 'wire' ? canonical : undefined;
}
