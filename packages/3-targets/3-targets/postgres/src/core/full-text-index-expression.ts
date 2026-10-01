import { invariant } from '@internal/utils/assertions';
import { type } from 'arktype';
import { codecDescriptors } from './codecs';
import { postgresError } from './errors';
import { fullTextIndexOptions } from './index-types';
import { quoteIdentifier } from './sql-utils';
import type { FullTextSearchLanguage } from './text-search-languages';

/** The weights Postgres's `setweight` takes, strongest first. Each weight group takes the next one. */
export const FULL_TEXT_WEIGHTS = ['A', 'B', 'C', 'D'] as const;

/** Fields in order of weight: each inner list is one weight group, every field a storage column name. */
export type FullTextWeightGroups<Field> = readonly (readonly Field[])[];

/** A full-text index as the contract stores it in the index's `options`. */
export interface FullTextIndexDefinition {
  readonly fields: FullTextWeightGroups<string>;
  readonly language: FullTextSearchLanguage;
}

/** How one producer writes a field, tells whether it is nullable, and writes the configuration. */
export interface FullTextDocumentSyntax<Field> {
  readonly column: (field: Field) => string;
  readonly isNullable: (field: Field) => boolean;
  readonly language: string;
}

/**
 * The search document of a full-text index: the expression the index is built over and the one
 * `fullTextMatches` and `fullTextRank` search. Postgres uses an expression index only when the
 * query carries the same expression, so the index DDL, the schema node and the query operations
 * all render it here.
 *
 * One field alone is `to_tsvector(language, field)`. With more fields, each gets its own
 * `to_tsvector` and they are joined with `||`; a nullable field is wrapped in `coalesce`, since one
 * null would make the whole document null. With more than one group, each field is weighted with
 * its group's weight, `A` for the first.
 */
export function renderFullTextDocument<Field>(
  groups: FullTextWeightGroups<Field>,
  syntax: FullTextDocumentSyntax<Field>,
): string {
  invariant(
    groups.length > 0 && groups.length <= FULL_TEXT_WEIGHTS.length,
    `a full-text document takes 1 to at most ${FULL_TEXT_WEIGHTS.length} weight groups, received ${groups.length}`,
  );
  invariant(
    groups.every((group) => group.length > 0),
    'a full-text document has an empty weight group',
  );
  const fieldCount = groups.reduce((count, group) => count + group.length, 0);
  const weighted = groups.length > 1;
  const vectors = groups.flatMap((group, position) =>
    group.map((field) => {
      const column = syntax.column(field);
      const text = fieldCount > 1 && syntax.isNullable(field) ? `coalesce(${column}, '')` : column;
      const vector = `to_tsvector(${syntax.language}, ${text})`;
      return weighted ? `setweight(${vector}, '${FULL_TEXT_WEIGHTS[position]}')` : vector;
    }),
  );
  return vectors.length === 1 ? (vectors[0] ?? '') : `(${vectors.join(' || ')})`;
}

/** The search document over storage columns, as the index DDL and the schema node carry it. */
export function renderFullTextIndexExpression(
  definition: FullTextIndexDefinition,
  isNullable: (column: string) => boolean,
): string {
  return renderFullTextDocument(definition.fields, {
    column: quoteIdentifier,
    isNullable,
    language: `'${definition.language}'`,
  });
}

/**
 * How an author lists the fields of a full-text index: one field, or a list whose items are fields
 * or lists of fields. Each top-level item is one weight group, strongest first.
 */
export type FullTextFieldsInput<Field> = Field | readonly (Field | readonly Field[])[];

export function weightGroupsOf<Field>(
  fields: FullTextFieldsInput<Field>,
  isField: (value: unknown) => value is Field,
): FullTextWeightGroups<Field> {
  if (isField(fields)) return [[fields]];
  return fields.map((item) => (isField(item) ? [item] : item));
}

/** What is wrong with a set of weight groups, in the order an author would fix it. */
export type FullTextWeightGroupProblem =
  | { readonly kind: 'no-fields' }
  | { readonly kind: 'too-many-groups'; readonly groupCount: number }
  | { readonly kind: 'empty-group'; readonly position: number }
  | { readonly kind: 'duplicate-field'; readonly field: string };

export function weightGroupProblems(
  groups: FullTextWeightGroups<string>,
): readonly FullTextWeightGroupProblem[] {
  const problems: FullTextWeightGroupProblem[] = [];
  if (groups.length === 0) problems.push({ kind: 'no-fields' });
  if (groups.length > FULL_TEXT_WEIGHTS.length) {
    problems.push({ kind: 'too-many-groups', groupCount: groups.length });
  }
  groups.forEach((group, position) => {
    if (group.length === 0) problems.push({ kind: 'empty-group', position });
  });
  const seen = new Set<string>();
  for (const field of groups.flat()) {
    if (seen.has(field)) problems.push({ kind: 'duplicate-field', field });
    seen.add(field);
  }
  return problems;
}

export function describeWeightGroupProblem(
  subject: string,
  problem: FullTextWeightGroupProblem,
): string {
  switch (problem.kind) {
    case 'no-fields':
      return `${subject} needs at least one field.`;
    case 'too-many-groups':
      return `${subject} takes at most ${FULL_TEXT_WEIGHTS.length} weight groups, one for each of the weights ${FULL_TEXT_WEIGHTS.join(', ')}, but was given ${problem.groupCount}.`;
    case 'empty-group':
      return `${subject} has an empty weight group at position ${problem.position + 1}.`;
    case 'duplicate-field':
      return `${subject} names the field "${problem.field}" more than once.`;
  }
}

interface IndexMethod {
  readonly type?: string | undefined;
  readonly options?: Record<string, unknown> | undefined;
}

/**
 * The full-text definition an index carries, or `undefined` for any other index. A full-text index
 * is a `gin` index whose options name `fields`; the `gin` options schema has already checked them
 * when the contract was validated.
 */
export function fullTextIndexDefinitionOf(index: IndexMethod): FullTextIndexDefinition | undefined {
  const { type: indexType, options } = index;
  if (indexType !== 'gin' || options === undefined || !Object.hasOwn(options, 'fields')) {
    return undefined;
  }
  const definition = fullTextIndexOptions({
    fields: options['fields'],
    language: options['language'],
  });
  if (definition instanceof type.errors) {
    throw postgresError(
      'CONTRACT.INDEX_INVALID',
      `A full-text index has invalid options: ${definition.summary}`,
      {
        why: 'A gin index whose options carry `fields` is a full-text index; its options must name its weight groups and its language.',
        fix: 'Re-emit the contract from its source, or correct the index options.',
        meta: { options },
      },
    );
  }
  return definition;
}

/** The options of an index other than its full-text definition: what `CREATE INDEX ... WITH (...)` receives. */
export function storageOptionsOf(
  options: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (options === undefined) return undefined;
  const rest = Object.fromEntries(
    Object.entries(options).filter(([key]) => key !== 'fields' && key !== 'language'),
  );
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** Widens a descriptor's trait tuple, so membership is a plain string test. */
function traitsOf(descriptor: { readonly traits: readonly string[] }): readonly string[] {
  return descriptor.traits;
}

const TEXTUAL_CODEC_IDS: ReadonlySet<string> = new Set(
  codecDescriptors
    .filter((descriptor) => traitsOf(descriptor).includes('textual'))
    .map((descriptor) => descriptor.codecId),
);

/**
 * Whether a column stored through this codec can be indexed for full-text search.
 * Read from the codec descriptors themselves, so both authoring surfaces accept
 * exactly the columns the `textual` operations dispatch on.
 */
export function isFullTextIndexableCodec(codecId: string): boolean {
  return TEXTUAL_CODEC_IDS.has(codecId);
}
