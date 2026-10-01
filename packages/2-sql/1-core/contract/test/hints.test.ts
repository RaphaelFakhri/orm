import { ContractValidationError } from '@internal/contract/contract-validation-error';
import type { Contract } from '@internal/contract/types';
import { createSqlContract } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';
import { sqlContractHints } from '../src/hints';
import type { SqlStorage } from '../src/types';
import { validateSqlContractFully } from '../src/validators';
import { exampleHints, loadContract, tableHints } from './hints-fixtures';

describe('hints section validation', () => {
  it('accepts the full section and keeps it on the loaded contract', () => {
    expect(loadContract(exampleHints).hints).toEqual(exampleHints);
  });

  it('accepts a deleted table entry carrying a control policy', () => {
    const hints = tableHints({ Legacy: { deleted: true, control: 'tolerated' } });
    expect(loadContract(hints).hints).toEqual(hints);
  });

  it('accepts a column-only table entry and a deleted column', () => {
    const hints = tableHints({ User: { columns: { nickname: { deleted: true } } } });
    expect(loadContract(hints).hints).toEqual(hints);
  });

  it.each([
    ['an unknown top-level key', { ...exampleHints, extra: true }],
    ['an unknown namespace key', { namespaces: { public: { tables: {}, views: {} } } }],
    ['an unknown table entry key', tableHints({ User: { was: 'Profile', renamed: true } })],
    [
      'an unknown column entry key',
      tableHints({ User: { columns: { firstName: { was: 'first_name', note: 'x' } } } }),
    ],
    ['an empty table was', tableHints({ User: { was: '' } })],
    ['an empty column was', tableHints({ User: { columns: { firstName: { was: '' } } } })],
    ['deleted: false on a table', tableHints({ Legacy: { deleted: false } })],
    ['deleted: false on a column', tableHints({ User: { columns: { a: { deleted: false } } } })],
    ['was and deleted on a table', tableHints({ User: { was: 'Profile', deleted: true } })],
    [
      'was and deleted on a column',
      tableHints({ User: { columns: { a: { was: 'b', deleted: true } } } }),
    ],
    ['an empty table entry', tableHints({ User: {} })],
    ['an empty column entry', tableHints({ User: { columns: { a: {} } } })],
    ['control on a was entry', tableHints({ User: { was: 'Profile', control: 'external' } })],
    ['an unknown control policy', tableHints({ Legacy: { deleted: true, control: 'bogus' } })],
    [
      'columns on a deleted entry',
      tableHints({ Legacy: { deleted: true, columns: { a: { deleted: true } } } }),
    ],
    ['a namespaces map that is not an object', { namespaces: 'public' }],
  ])('rejects %s', (_label, hints) => {
    expect(() => loadContract(hints)).toThrow(ContractValidationError);
    expect(() => loadContract(hints)).toThrow(/hints/);
  });
});

describe('sqlContractHints', () => {
  it('returns the section of a loaded contract', () => {
    expect(sqlContractHints(loadContract(exampleHints))).toEqual(exampleHints);
  });

  it('returns undefined for a contract without hints', () => {
    const contract = validateSqlContractFully<Contract<SqlStorage>>(createSqlContract());
    expect(sqlContractHints(contract)).toBeUndefined();
  });
});
