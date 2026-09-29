import { UNBOUND_NAMESPACE_ID } from '@prisma/orm-sqlite/components/ir';
import { orm } from '@prisma/orm-sqlite/orm-client';
import type { ExecutionContext } from '@prisma/orm-sqlite/relational-core/query-lane-context';
import type { SqliteRuntime } from '@prisma/orm-sqlite/runtime';
import { blindCast } from '@prisma/orm-sqlite/utils/casts';
import type { Contract } from '../prisma/contract.d';
import { db } from '../prisma/db';

const context = blindCast<
  ExecutionContext<Contract>,
  'emitted db context and contract.d.ts are generated from the same demo contract'
>(db.context);

type SqliteOrmClient = ReturnType<typeof orm<Contract>>[typeof UNBOUND_NAMESPACE_ID];

export function createOrmClient(runtime: SqliteRuntime): SqliteOrmClient {
  return orm({ runtime, context })[UNBOUND_NAMESPACE_ID];
}
