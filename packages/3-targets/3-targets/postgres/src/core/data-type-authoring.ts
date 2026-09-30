/**
 * The PSL support this target contributes for its data types: the value entries it declares, plus
 * the two tags that lower their own bodies and name no data type, which sit under reserved keys and
 * come from the family. ADR 254.
 */

import { sqlDefaultLiteralTagEntry } from '@internal/family-sql/control';
import type { AuthoringDataTypeEntry } from '@internal/framework-components/authoring';
import { loweringEntryKey } from '@internal/framework-components/authoring';
import { postgresDataTypeEntries } from './data-type-entries';

export function createPostgresDataTypeEntries(): Readonly<Record<string, AuthoringDataTypeEntry>> {
  return {
    ...postgresDataTypeEntries(),
    [loweringEntryKey('sql')]: sqlDefaultLiteralTagEntry('sql'),
    [loweringEntryKey('pg.sql')]: sqlDefaultLiteralTagEntry('pg.sql'),
  };
}
