import type { Runtime } from '@prisma/orm-postgres/family-runtime';
import { orm } from '@prisma/orm-postgres/orm-client';
import type { ExecutionContext } from '@prisma/orm-postgres/relational-core/query-lane-context';
import { blindCast } from '@prisma/orm-postgres/utils/casts';
import type { Contract } from '../prisma/contract.d';
import { db } from '../prisma/db';
import { ItemCollection } from './collections';

const context = blindCast<
  ExecutionContext<Contract>,
  'emitted db context and contract.d.ts are generated from the same demo contract'
>(db.context);

type ParadeDbCollections = {
  Item: typeof ItemCollection;
};

type ParadeDbOrmClient = ReturnType<typeof orm<Contract, ParadeDbCollections>>['public'];

export function createOrmClient(runtime: Runtime): ParadeDbOrmClient {
  return orm({
    runtime,
    context,
    collections: {
      Item: ItemCollection,
    },
  }).public;
}
