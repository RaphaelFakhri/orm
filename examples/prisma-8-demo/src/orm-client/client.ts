import type { Runtime } from '@prisma/orm-postgres/family-runtime';
import { orm } from '@prisma/orm-postgres/orm-client';
import type { ExecutionContext } from '@prisma/orm-postgres/relational-core/query-lane-context';
import { blindCast } from '@prisma/orm-postgres/utils/casts';
import type { Contract } from '../prisma/contract.d';
import { db } from '../prisma/db';
import {
  createTaskCollection,
  PostCollection,
  TagCollection,
  type TaskCollectionConstructor,
  type TaskVariantRoots,
  UserCollection,
} from './collections';

const context = blindCast<
  ExecutionContext<Contract>,
  'emitted db context and contract.d.ts are generated from the same demo contract'
>(db.context);

type DemoCollections = {
  User: typeof UserCollection;
  Post: typeof PostCollection;
  Tag: typeof TagCollection;
  Task: TaskCollectionConstructor;
};

type DemoOrmClient = ReturnType<typeof orm<Contract, DemoCollections>>['public'];

export function createOrmClient(runtime: Runtime): DemoOrmClient {
  let roots: TaskVariantRoots;
  const TaskCollection = createTaskCollection((): TaskVariantRoots => roots);
  const client = orm({
    runtime,
    context,
    collections: {
      User: UserCollection,
      Post: PostCollection,
      Tag: TagCollection,
      Task: TaskCollection,
    },
  }).public;
  roots = { Bug: client.Bug, Feature: client.Feature };
  return client;
}
