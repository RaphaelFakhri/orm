import type { Runtime } from '@prisma/orm-postgres/family-runtime';
import { orm } from '@prisma/orm-postgres/orm-client';
import type { Contract } from '../prisma/contract.d';
import { db } from '../prisma/db';
import { ItemCollection } from './collections';

const context = db.context;

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
