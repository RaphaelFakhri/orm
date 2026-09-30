import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PostgresContractSerializer } from '@internal/target-postgres/runtime';
import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vitest';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/contract-format/supabase-before-dbgenerated-removal.contract.json',
);

describe('a contract emitted before columns named their data type', () => {
  it('is refused, naming a stored database type name and saying what replaced it', () => {
    const contractJson: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(() => new PostgresContractSerializer().deserializeContract(contractJson)).toThrow(
      expect.objectContaining({
        code: 'CONTRACT.VALIDATION_FAILED',
        message: expect.stringContaining(
          `storage.namespaces.auth.entries.table.audit_log_entries.columns.created_at.nativeType: contracts no longer store a column's database type name; the column names its data type in "dataType"`,
        ),
      }),
    );
  });

  it('is refused without mentioning an upgrade script', () => {
    const contractJson: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(() => new PostgresContractSerializer().deserializeContract(contractJson)).toThrow(
      expect.objectContaining({ message: expect.not.stringMatching(/upgrade|script/i) }),
    );
  });
});
