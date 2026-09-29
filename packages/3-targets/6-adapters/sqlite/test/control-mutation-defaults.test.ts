import { sqliteDataTypeEntries } from '@internal/target-sqlite/data-types';
import { describe, expect, it } from 'vitest';
import sqliteAdapterDescriptor from '../src/exports/control';

describe('the adapter descriptor authoring data types', () => {
  const registered = sqliteAdapterDescriptor.authoring?.dataTypes ?? {};

  it('registers the entries the target declares', () => {
    expect(Object.keys(registered)).toEqual(Object.keys(sqliteDataTypeEntries()));
  });

  it('has sql/expression as its last key and the tags json and sql', () => {
    expect({
      lastKey: Object.keys(registered).at(-1),
      tags: Object.values(registered).flatMap((entry) =>
        entry.written.kind === 'tag' ? [entry.written.tag] : [],
      ),
    }).toEqual({ lastKey: 'sql/expression', tags: ['json', 'sql'] });
  });
});
