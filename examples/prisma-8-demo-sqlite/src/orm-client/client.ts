import { UNBOUND_NAMESPACE_ID } from '@prisma/orm-sqlite/components/ir';
import { orm } from '@prisma/orm-sqlite/orm-client';
import type { SqliteRuntime } from '@prisma/orm-sqlite/runtime';
import type { Contract } from '../prisma/contract.d';
import { db } from '../prisma/db';

const context = db.context;

type SqliteOrmClient = ReturnType<typeof orm<Contract>>[typeof UNBOUND_NAMESPACE_ID];

export function createOrmClient(runtime: SqliteRuntime): SqliteOrmClient {
  return orm({ runtime, context })[UNBOUND_NAMESPACE_ID];
}
