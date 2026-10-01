import type { Type } from 'arktype';
import { contractError } from './contract-errors';

export interface IndexTypeEntry<TOptions = unknown> {
  readonly type: string;
  readonly options: Type<TOptions>;
  /**
   * Whether an index of this type over a foreign key's columns serves the foreign key's lookups,
   * so no separate backing index is derived for it.
   */
  readonly backsForeignKey: boolean;
}

type IndexTypeDeclaration<TOpts> = {
  readonly options: Type<TOpts>;
  readonly backsForeignKey: boolean;
};

export type IndexTypeMap = { readonly [K in string]: { readonly options: unknown } };

export interface IndexTypeRegistration<TMap extends IndexTypeMap = Record<never, never>> {
  readonly IndexTypes: TMap;
  readonly entries: ReadonlyArray<IndexTypeEntry>;
}

export interface IndexTypeBuilder<TMap extends IndexTypeMap = Record<never, never>>
  extends IndexTypeRegistration<TMap> {
  add<TLit extends string, TOpts>(
    typeLiteral: TLit,
    entry: IndexTypeDeclaration<TOpts>,
  ): IndexTypeBuilder<TMap & Record<TLit, { readonly options: TOpts }>>;
}

class IndexTypeBuilderImpl<TMap extends IndexTypeMap> implements IndexTypeBuilder<TMap> {
  readonly entries: ReadonlyArray<IndexTypeEntry>;
  readonly IndexTypes: TMap;

  constructor(entries: ReadonlyArray<IndexTypeEntry>) {
    this.entries = entries;
    this.IndexTypes = {} as TMap;
  }

  add<TLit extends string, TOpts>(
    typeLiteral: TLit,
    entry: IndexTypeDeclaration<TOpts>,
  ): IndexTypeBuilder<TMap & Record<TLit, { readonly options: TOpts }>> {
    if (this.entries.some((e) => e.type === typeLiteral)) {
      throw contractError(
        'CONTRACT.PACK_CONTRIBUTION_INVALID',
        `Index type "${typeLiteral}" is already declared in this builder`,
        { meta: { indexType: typeLiteral } },
      );
    }
    return new IndexTypeBuilderImpl<TMap & Record<TLit, { readonly options: TOpts }>>([
      ...this.entries,
      {
        type: typeLiteral,
        options: entry.options as Type<unknown>,
        backsForeignKey: entry.backsForeignKey,
      },
    ]);
  }
}

export function defineIndexTypes(): IndexTypeBuilder<Record<never, never>> {
  return new IndexTypeBuilderImpl([]);
}

export interface IndexTypeRegistry {
  register(entry: IndexTypeEntry): void;
  get(typeLiteral: string): IndexTypeEntry | undefined;
  has(typeLiteral: string): boolean;
  /** Whether an index of this type can back a foreign key; false for a type nobody registered. */
  backsForeignKey(typeLiteral: string): boolean;
}

class IndexTypeRegistryImpl implements IndexTypeRegistry {
  private readonly entries = new Map<string, IndexTypeEntry>();

  register(entry: IndexTypeEntry): void {
    if (typeof entry.backsForeignKey !== 'boolean') {
      throw contractError(
        'CONTRACT.PACK_CONTRIBUTION_INVALID',
        `Index type "${entry.type}" does not declare backsForeignKey (true or false)`,
        { meta: { indexType: entry.type } },
      );
    }
    if (this.entries.has(entry.type)) {
      throw contractError(
        'CONTRACT.PACK_CONTRIBUTION_INVALID',
        `Index type "${entry.type}" is already registered`,
        { meta: { indexType: entry.type } },
      );
    }
    this.entries.set(entry.type, entry);
  }

  get(typeLiteral: string): IndexTypeEntry | undefined {
    return this.entries.get(typeLiteral);
  }

  has(typeLiteral: string): boolean {
    return this.entries.has(typeLiteral);
  }

  backsForeignKey(typeLiteral: string): boolean {
    return this.entries.get(typeLiteral)?.backsForeignKey === true;
  }
}

export function createIndexTypeRegistry(): IndexTypeRegistry {
  return new IndexTypeRegistryImpl();
}
