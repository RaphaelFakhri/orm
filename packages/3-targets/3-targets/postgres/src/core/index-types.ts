import { defineIndexTypes } from '@internal/sql-contract/index-types';
import { type } from 'arktype';

// Postgres's built-in index access methods (`CREATE INDEX ... USING <method>`).
// Per-method option validation (e.g. `gin` operator classes) is out of scope;
// every method accepts any options object until a later slice narrows it.
// btree and hash serve the equality lookups a foreign key needs; the others
// do not.
export const postgresIndexTypes = defineIndexTypes()
  .add('btree', { options: type('object'), backsForeignKey: true })
  .add('hash', { options: type('object'), backsForeignKey: true })
  .add('gin', { options: type('object'), backsForeignKey: false })
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
