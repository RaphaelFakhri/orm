import type { Runtime } from '@prisma/orm-postgres/family-runtime';
import { orm } from '@prisma/orm-postgres/orm-client';
import { db } from '../prisma/db';
import {
  createTaskCollection,
  PostCollection,
  TagCollection,
  type TaskVariantRoots,
  UserCollection,
} from './collections';

const context = db.context;

export function createOrmClient(runtime: Runtime) {
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
