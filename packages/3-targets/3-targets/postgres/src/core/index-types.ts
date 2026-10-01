import { defineIndexTypes } from '@internal/sql-contract/index-types';
import { type } from 'arktype';
import { POSTGRES_TEXT_SEARCH_LANGUAGES } from './text-search-languages';

const FULL_TEXT_MAX_WEIGHT_GROUPS = 4;

const fullTextFields = type('string > 0')
  .array()
  .atLeastLength(1)
  .array()
  .atLeastLength(1)
  .atMostLength(FULL_TEXT_MAX_WEIGHT_GROUPS)
  .narrow((groups, ctx) => {
    const fields = groups.flat();
    return (
      new Set(fields).size === fields.length || ctx.mustBe('weight groups naming each field once')
    );
  });

const fullTextLanguage = type.enumerated(...POSTGRES_TEXT_SEARCH_LANGUAGES);

/** The options of a full-text index: its weight groups, as storage column names, and its language. */
export const fullTextIndexOptions = type({
  fields: fullTextFields,
  language: fullTextLanguage,
});

/**
 * A `gin` index is a full-text index when its options carry `fields`, and then they must also carry
 * `language`. Any other option is passed to `CREATE INDEX ... WITH (...)` as before.
 */
const ginOptions = type({
  '[string]': 'unknown',
  'fields?': fullTextFields,
  'language?': fullTextLanguage,
}).narrow(
  (options, ctx) =>
    Object.hasOwn(options, 'fields') === Object.hasOwn(options, 'language') ||
    ctx.mustBe('full-text options carrying both fields and language'),
);

// Postgres's built-in index access methods (`CREATE INDEX ... USING <method>`).
// Only `gin` validates its options, for the full-text index; every other
// method accepts any options object. btree and hash serve the equality
// lookups a foreign key needs; the others do not.
export const postgresIndexTypes = defineIndexTypes()
  .add('btree', { options: type('object'), backsForeignKey: true })
  .add('hash', { options: type('object'), backsForeignKey: true })
  .add('gin', { options: ginOptions, backsForeignKey: false })
  .add('gist', { options: type('object'), backsForeignKey: false })
  .add('spgist', { options: type('object'), backsForeignKey: false })
  .add('brin', { options: type('object'), backsForeignKey: false });

export type IndexTypes = typeof postgresIndexTypes.IndexTypes;

const FOREIGN_KEY_BACKING_INDEX_TYPES: ReadonlySet<string> = new Set(
  postgresIndexTypes.entries.filter((entry) => entry.backsForeignKey).map((entry) => entry.type),
);

/** Whether a Postgres index of this access method can back a foreign key, as registered above. */
export function postgresIndexTypeBacksForeignKey(indexType: string): boolean {
  return FOREIGN_KEY_BACKING_INDEX_TYPES.has(indexType);
}
