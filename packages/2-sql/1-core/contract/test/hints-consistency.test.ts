import type { Contract } from '@internal/contract/types';
import { createSqlContract } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';
import { assertContractHintsConsistent } from '../src/hints';
import type { SqlStorage } from '../src/types';
import { validateSqlContractFully } from '../src/validators';

const column = { nativeType: 'text', codecId: 'pg/text@1', nullable: false };

function sqlTable(...columnNames: string[]) {
  return {
    columns: Object.fromEntries(columnNames.map((name) => [name, column])),
    uniques: [],
    indexes: [],
    foreignKeys: [],
  };
}

function contractJsonWithHints(hints: unknown): Record<string, unknown> {
  return {
    ...createSqlContract({
      tables: {
        public: {
          User: sqlTable('id', 'firstName', 'givenName', 'email'),
          Post: sqlTable('id'),
          Account: sqlTable('id'),
        },
      },
    }),
    hints,
  };
}

function loadContract(hints: unknown): Contract<SqlStorage> {
  return validateSqlContractFully<Contract<SqlStorage>>(contractJsonWithHints(hints));
}

const exampleHints = {
  namespaces: {
    public: {
      tables: {
        Legacy: { deleted: true },
        User: { columns: { firstName: { was: 'first_name' } }, was: 'Profile' },
      },
    },
  },
};

function tableHints(tables: Record<string, unknown>, namespace = 'public') {
  return { namespaces: { [namespace]: { tables } } };
}

describe('assertContractHintsConsistent', () => {
  function expectHintInvalid(hints: unknown, message: string) {
    expect(() => assertContractHintsConsistent(loadContract(hints))).toThrow(
      expect.objectContaining({ code: 'CONTRACT.HINT_INVALID', message }),
    );
  }

  it('passes for a consistent contract', () => {
    expect(() => assertContractHintsConsistent(loadContract(exampleHints))).not.toThrow();
  });

  it('passes for a contract without hints', () => {
    const contract = validateSqlContractFully<Contract<SqlStorage>>(createSqlContract());
    expect(() => assertContractHintsConsistent(contract)).not.toThrow();
  });

  describe('namespaces (item 1)', () => {
    it('rejects a renamed table in a namespace the contract does not declare', () => {
      expectHintInvalid(
        tableHints({ Legacy: { deleted: true }, User: { was: 'Profile' } }, 'ghost'),
        'Contract hints: table "User" names namespace "ghost", which the contract does not declare.',
      );
    });

    it('accepts an undeclared namespace holding only deleted tables', () => {
      const contract = loadContract(tableHints({ Legacy: { deleted: true } }, 'ghost'));
      expect(() => assertContractHintsConsistent(contract)).not.toThrow();
    });
  });

  describe('hinted tables exist (item 2)', () => {
    it('rejects a rename hint on a table the contract does not declare', () => {
      expectHintInvalid(
        tableHints({ Customer: { was: 'Client' } }),
        'Contract hints: table "Customer" carries a hint but the contract does not declare it.',
      );
    });

    it('rejects column hints on a table the contract does not declare', () => {
      expectHintInvalid(
        tableHints({ Customer: { columns: { name: { was: 'full_name' } } } }),
        'Contract hints: table "Customer" carries a hint but the contract does not declare it.',
      );
    });
  });

  describe('old names are free and unique (item 6)', () => {
    it('rejects a table was naming a table the contract declares', () => {
      expectHintInvalid(
        tableHints({ User: { was: 'Post' } }),
        'Contract hints: table "User" claims it was "Post", which the contract also declares.',
      );
    });

    it('rejects two tables claiming the same was', () => {
      expectHintInvalid(
        tableHints({ User: { was: 'Profile' }, Account: { was: 'Profile' } }),
        'Contract hints: table "Account" and "User" both claim they were "Profile".',
      );
    });

    it('rejects a column was naming a column the table declares', () => {
      expectHintInvalid(
        tableHints({ User: { columns: { firstName: { was: 'email' } } } }),
        'Contract hints: column "User"."firstName" claims it was "email", which the contract also declares.',
      );
    });

    it('rejects two columns of one table claiming the same was', () => {
      expectHintInvalid(
        tableHints({
          User: {
            columns: { givenName: { was: 'first_name' }, firstName: { was: 'first_name' } },
          },
        }),
        'Contract hints: column "User"."firstName" and "givenName" both claim they were "first_name".',
      );
    });

    it('accepts the same column was on two different tables', () => {
      const contract = loadContract(
        tableHints({
          User: { columns: { firstName: { was: 'name' } } },
          Account: { columns: { id: { was: 'name' } } },
        }),
      );
      expect(() => assertContractHintsConsistent(contract)).not.toThrow();
    });
  });
});
