import type { Runtime } from '@prisma/orm-postgres/family-runtime';
import {
  type CollectionRowOf,
  type FieldExpression,
  type ModelAccessor,
  type ModelFieldCodec,
  sortField,
} from '@prisma/orm-postgres/orm-client';
import { websearchToTsquery } from '@prisma/orm-postgres/target/full-text';
import { describe, expectTypeOf, test } from 'vitest';
import { createOrmClient } from '../src/orm-client/client';
import { createdSince, postSummary } from '../src/orm-client/fragments';
import type { ormClientGetRecentPosts } from '../src/orm-client/get-recent-posts';
import type { ormClientGetRecentUsers } from '../src/orm-client/get-recent-users';
import type { Contract } from '../src/prisma/contract.d';

declare const runtime: Runtime;
declare const since: Temporal.Instant;
declare const sort: string;

const db = createOrmClient(runtime);

type TimestampCodec = 'pg/timestamptz-temporal@1';
type CreatedAt = FieldExpression<Contract, TimestampCodec>;
type Title = FieldExpression<Contract, 'pg/text@1'>;
type PostAccessor = ModelAccessor<Contract, 'Post', 'public'>;
type PostSummary = CollectionRowOf<ReturnType<typeof postSummary>>;

describe('FieldExpression', () => {
  test('a timestamp field and its FieldExpression are assignable both ways', () => {
    expectTypeOf<PostAccessor['createdAt']>().toExtend<CreatedAt>();
    expectTypeOf<CreatedAt>().toExtend<PostAccessor['createdAt']>();
    expectTypeOf<Temporal.Instant>().toExtend<Parameters<CreatedAt['gte']>[0]>();
    expectTypeOf<string>().not.toExtend<Parameters<CreatedAt['gte']>[0]>();
  });

  test('a text field with full-text operations and its FieldExpression are assignable both ways', () => {
    expectTypeOf<PostAccessor['title']>().toExtend<Title>();
    expectTypeOf<Title>().toExtend<PostAccessor['title']>();
    const matches = (row: { title: Title }) => row.title.fullTextMatches(websearchToTsquery('orm'));
    db.Post.where(matches);
  });

  test('ModelFieldCodec names the codec of a field', () => {
    expectTypeOf<ModelFieldCodec<Contract, 'Post', 'createdAt', 'public'>>().toEqualTypeOf<{
      readonly codecId: TimestampCodec;
      readonly nullable: false;
    }>();
  });

  test('a row fragment fits every model with the field and no other', () => {
    db.User.where(createdSince(since));
    db.Post.where(createdSince(since));
    db.Task.where(createdSince(since));
    db.Task.bugs().where(createdSince(since));
    // @ts-expect-error Tag has no createdAt
    db.Tag.where(createdSince(since));
  });
});

describe('rowFragment', () => {
  test('names the row of the summary', () => {
    expectTypeOf<PostSummary>().toEqualTypeOf<{
      id: string;
      title: string;
      createdAt: Temporal.Instant;
      tags: { id: string; label: string }[];
    }>();
  });

  test('is refused after select and for another model', () => {
    // @ts-expect-error the rows no longer have every Post field
    db.Post.select('id').pipe(postSummary);
    // @ts-expect-error a Tag collection is not a Post collection
    db.Tag.pipe(postSummary);
  });
});

describe('sortField', () => {
  test('the allowed list takes only fields that can be ordered', () => {
    db.Post.orderBy(sortField(db.Post, sort, 'asc', ['title', 'createdAt']));
    // @ts-expect-error the codec of embedding has no order trait
    sortField(db.Post, sort, 'asc', ['embedding']);
    // @ts-expect-error user is a relation
    sortField(db.Post, sort, 'asc', ['user']);
  });
});

describe('the demo queries', () => {
  test('return post summaries', async () => {
    expectTypeOf<Awaited<ReturnType<typeof ormClientGetRecentPosts>>>().toEqualTypeOf<
      PostSummary[]
    >();
    type RecentUser = Awaited<ReturnType<typeof ormClientGetRecentUsers>>[number];
    expectTypeOf<RecentUser['posts']>().toEqualTypeOf<PostSummary[]>();
    expectTypeOf<RecentUser['email']>().toEqualTypeOf<string>();
  });
});
