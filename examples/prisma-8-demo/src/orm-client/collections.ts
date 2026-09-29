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

export class TaskCollection extends Collection<Contract, 'Task', DemoRow<'Task'>, PublicRootState> {
  bugs(bug: BugRoot) {
    return this.variant(bug);
  }

  features(feature: FeatureRoot) {
    return this.variant(feature);
  }

  forUser(userId: string) {
    return this.where({ userId });
  }
}
