import {
  Collection,
  type DefaultCollectionTypeState,
  type orm,
} from '@prisma/orm-postgres/orm-client';
import type { Contract } from '../prisma/contract.d';

type DemoOrm = ReturnType<typeof orm<Contract>>['public'];
type PublicRootState = Omit<DefaultCollectionTypeState, 'nsId'> & { readonly nsId: 'public' };
type DemoRow<ModelName extends keyof DemoOrm> = DemoOrm[ModelName] extends {
  readonly _row?: infer Row;
}
  ? Row
  : never;
type BugRoot = DemoOrm['Bug'];
type FeatureRoot = DemoOrm['Feature'];

export interface TaskVariantRoots {
  readonly Bug: BugRoot;
  readonly Feature: FeatureRoot;
}

type TaskBaseCollection = Collection<Contract, 'Task', DemoRow<'Task'>, PublicRootState>;
declare const taskBaseCollection: TaskBaseCollection;
type TaskBugCollection = ReturnType<typeof taskBaseCollection.variant<BugRoot, 'Bug'>>;
type TaskFeatureCollection = ReturnType<typeof taskBaseCollection.variant<FeatureRoot, 'Feature'>>;
type TaskWhereCollection = ReturnType<typeof taskBaseCollection.where>;

export interface TaskCollectionSurface extends TaskBaseCollection {
  bugs(): TaskBugCollection;
  features(): TaskFeatureCollection;
  forUser(userId: string): TaskWhereCollection;
}

export type TaskCollectionConstructor = new (
  ...args: ConstructorParameters<
    typeof Collection<Contract, 'Task', DemoRow<'Task'>, PublicRootState>
  >
) => TaskCollectionSurface;

export class UserCollection extends Collection<Contract, 'User', DemoRow<'User'>, PublicRootState> {
  admins() {
    return this.where({ kind: 'admin' });
  }

  byEmail(email: string) {
    return this.where({ email });
  }

  emailDomain(domain: string) {
    return this.where((user) => user.email.ilike(`%@${domain}`));
  }

  withPostTitle(titleTerm: string) {
    return this.where((user) => user.posts.some((post) => post.title.ilike(`%${titleTerm}%`)));
  }

  newestFirst() {
    return this.orderBy((user) => user.createdAt.desc());
  }
}

export class PostCollection extends Collection<Contract, 'Post', DemoRow<'Post'>, PublicRootState> {
  forUser(userId: string) {
    return this.where({ userId });
  }

  withTitle(titleTerm: string) {
    return this.where((post) => post.title.ilike(`%${titleTerm}%`));
  }

  newestFirst() {
    return this.orderBy((post) => post.createdAt.desc());
  }
}

export class TagCollection extends Collection<Contract, 'Tag', DemoRow<'Tag'>, PublicRootState> {
  byLabel(label: string) {
    return this.where({ label });
  }
}

export function createTaskCollection(getRoots: () => TaskVariantRoots): TaskCollectionConstructor {
  return class TaskCollection extends Collection<
    Contract,
    'Task',
    DemoRow<'Task'>,
    PublicRootState
  > {
    bugs(): TaskBugCollection {
      return this.variant(getRoots().Bug);
    }

    features(): TaskFeatureCollection {
      return this.variant(getRoots().Feature);
    }

    forUser(userId: string): TaskWhereCollection {
      return this.where({ userId });
    }
  };
}
