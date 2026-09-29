import sqliteAdapter from '@internal/adapter-sqlite/runtime';
import type { Contract } from '@internal/contract/types';
import type { SqliteBinding } from '@internal/driver-sqlite/runtime';
import sqliteDriver from '@internal/driver-sqlite/runtime';
import { instantiateExecutionStack } from '@internal/framework-components/execution';
import { UNBOUND_NAMESPACE_ID } from '@internal/framework-components/ir';
import { sql as sqlBuilder } from '@internal/sql-builder/runtime';
import type {
  Db,
  QueryContext,
  RawLane,
  Scope,
  ScopeField,
  SelectQuery,
} from '@internal/sql-builder/types';
import type { ExtractCodecTypes, SqlStorage } from '@internal/sql-contract/types';
import {
  INTERNAL_TO_TEMP_TABLE_QUERY_SOURCE,
  orm as ormBuilder,
  type PreparedFrom,
  prepareQuery,
} from '@internal/sql-orm-client';
import { RawQueryAst, type SelectAst, TableSource } from '@internal/sql-relational-core/ast';
import type { CodecTypesBase } from '@internal/sql-relational-core/expression';
import {
  type Preparable,
  planFromAst,
  type SqlQueryPlan,
} from '@internal/sql-relational-core/plan';
import type {
  BindSiteParams,
  ConnectionContext,
  Declaration,
  ExecutionContext,
  ParamsFromDeclaration,
  Runtime,
  SqlExecutionStackWithDriver,
  SqlMiddleware,
  SqlRuntimeAdapterInstance,
  SqlRuntimeExtensionDescriptor,
  TransactionContext,
  VerifyMarkerOption,
} from '@internal/sql-runtime';
import {
  createExecutionContext,
  createSqlExecutionStack,
  withConnection,
  withTransaction,
} from '@internal/sql-runtime';
import sqliteTarget, {
  SqliteContractSerializer as SqlContractSerializer,
} from '@internal/target-sqlite/runtime';
import { assertDefined } from '@internal/utils/assertions';
import { blindCast, castAs } from '@internal/utils/casts';
import { ifDefined } from '@internal/utils/defined';
import { InternalError } from '@internal/utils/internal-error';
import { sqliteError } from '../errors';
import { buildSqliteStaticContext, type SqliteStaticContext } from '../static/sqlite-static';
import { resolveOptionalSqliteBinding, resolveSqliteBinding } from './binding';
import { SqliteRuntimeImpl } from './sqlite-runtime';

export type SqliteTargetId = 'sqlite';
type OrmClient<TContract extends Contract<SqlStorage>> = ReturnType<typeof ormBuilder<TContract>>;

export interface TempTableColumnDef {
  readonly name: string;
  readonly type: string;
}

type TempTableJoinSource<Row extends Record<string, ScopeField>> = ReturnType<
  SelectQuery<QueryContext, Scope, Row>['as']
>;

type TempTableQuerySource<Row extends Record<string, ScopeField>> = {
  buildAst(): SelectAst;
  getRowFields(): Row;
};

type TempTableSubqueryConvertible<Row extends Record<string, ScopeField>> = {
  [INTERNAL_TO_TEMP_TABLE_QUERY_SOURCE](): TempTableQuerySource<Row>;
};

type TempTableAsInput<Row extends Record<string, ScopeField>> =
  | TempTableQuerySource<Row>
  | TempTableSubqueryConvertible<Row>;

export interface TempTableHandle<
  Row extends Record<string, ScopeField> = Record<string, ScopeField>,
> extends TempTableJoinSource<Row> {
  readonly name: string;
  readonly fields: Row;
  append(input: TempTableAppendInput<Row>): Promise<void>;
  drop(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

export type TempTableAppendInput<
  Row extends Record<string, ScopeField> = Record<string, ScopeField>,
> = TempTableAsInput<Row> | readonly (readonly (string | number | boolean | null)[])[];

export interface TempTableBuilder {
  as<Row extends Record<string, ScopeField>>(
    query: TempTableAsInput<Row>,
  ): Promise<TempTableHandle<Row>>;
  from(columns: readonly TempTableColumnDef[]): Promise<TempTableHandle>;
}

type UnboundSql<TContract extends Contract<SqlStorage>> =
  Db<TContract>[typeof UNBOUND_NAMESPACE_ID];
type UnboundOrm<TContract extends Contract<SqlStorage>> =
  OrmClient<TContract>[typeof UNBOUND_NAMESPACE_ID];

function unboundOrm<TContract extends Contract<SqlStorage>>(
  orm: OrmClient<TContract>,
): UnboundOrm<TContract> {
  const value = orm[UNBOUND_NAMESPACE_ID];
  assertDefined(value, 'the unbound namespace always exists on a sqlite builder output');
  return blindCast<
    UnboundOrm<TContract>,
    'OrmClient<TContract> indexed by a literal key widens NsId to string; Collection is invariant in NsId via row/mutation-input types, so the indexed-access type cannot be proven to match the literal-keyed OrmNamespace without this cast'
  >(value);
}

export interface SqliteTransactionContext<TContract extends Contract<SqlStorage>>
  extends TransactionContext {
  readonly sql: UnboundSql<TContract>;
  readonly orm: UnboundOrm<TContract>;
  readonly enums: SqliteStaticContext<TContract>['enums'];
  tempTable(): TempTableBuilder;
}

export interface SqliteConnectionContext<TContract extends Contract<SqlStorage>>
  extends ConnectionContext {
  readonly sql: UnboundSql<TContract>;
  readonly orm: UnboundOrm<TContract>;
  readonly enums: SqliteStaticContext<TContract>['enums'];
  tempTable(): TempTableBuilder;
}

export interface SqliteClient<TContract extends Contract<SqlStorage>> {
  readonly sql: UnboundSql<TContract>;
  readonly orm: UnboundOrm<TContract>;
  readonly enums: SqliteStaticContext<TContract>['enums'];
  readonly raw: RawLane<TContract>;
  readonly context: ExecutionContext<TContract>;
  readonly contract: TContract;
  readonly stack: SqlExecutionStackWithDriver<SqliteTargetId>;
  connect(bindingInput?: { readonly path: string }): Promise<Runtime>;
  runtime(): Runtime;
  prepare<
    D extends Declaration<CT>,
    Q extends SqlQueryPlan | Preparable<unknown, unknown>,
    CT extends CodecTypesBase = ExtractCodecTypes<TContract>,
  >(
    declaration: D,
    callback: (params: BindSiteParams<D>) => Q,
  ): Promise<PreparedFrom<ParamsFromDeclaration<D, CT>, Q>>;
  transaction<R>(fn: (tx: SqliteTransactionContext<TContract>) => PromiseLike<R>): Promise<R>;
  connection<R>(fn: (conn: SqliteConnectionContext<TContract>) => PromiseLike<R>): Promise<R>;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface SqliteOptionsBase {
  readonly extensions?: readonly SqlRuntimeExtensionDescriptor<SqliteTargetId>[];
  readonly middleware?: readonly SqlMiddleware[];
  readonly verifyMarker?: VerifyMarkerOption;
}

export type SqliteOptionsWithContract<TContract extends Contract<SqlStorage>> = {
  readonly path?: string;
} & SqliteOptionsBase & {
    readonly contract: TContract;
    readonly contractJson?: never;
  };

export type SqliteOptionsWithContractJson<TContract extends Contract<SqlStorage>> = {
  readonly path?: string;
  readonly _contract?: TContract;
} & SqliteOptionsBase & {
    readonly contractJson: unknown;
    readonly contract?: never;
  };

export type SqliteOptions<TContract extends Contract<SqlStorage>> =
  | SqliteOptionsWithContract<TContract>
  | SqliteOptionsWithContractJson<TContract>;

function resolveContract<TContract extends Contract<SqlStorage>>(
  options: SqliteOptions<TContract>,
): TContract {
  const serializer = new SqlContractSerializer();
  if ('contractJson' in options && options.contractJson !== undefined) {
    return blindCast<
      TContract,
      'validated contract JSON corresponds to the caller supplied contract type'
    >(serializer.deserializeContract(options.contractJson));
  }
  const contract = options.contract;
  assertDefined(contract, 'a contract or contractJson is required');
  return blindCast<
    TContract,
    'serialized and validated contract retains the authored contract type'
  >(serializer.deserializeContract(serializer.serializeContract(contract)));
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function toSqlLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot use non-finite number as SQL literal: ${value}`);
    }
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function resolveTempTableName(): string {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  return `pn_temp_${suffix}`;
}

function createTempTableBuilder(
  execCtx: Pick<TransactionContext, 'execute'>,
  registerCleanupHook: (hook: () => Promise<void>) => void,
  contract: Contract<SqlStorage>,
  adapter: SqlRuntimeAdapterInstance<SqliteTargetId>,
): TempTableBuilder {
  const normalizeQuerySource = <Row extends Record<string, ScopeField>>(
    query: TempTableAsInput<Row>,
  ): TempTableQuerySource<Row> => {
    if ('buildAst' in query && 'getRowFields' in query) {
      return query;
    }
    return query[INTERNAL_TO_TEMP_TABLE_QUERY_SOURCE]();
  };

  const asJoinSource = <Row extends Record<string, ScopeField>>(
    tableName: string,
    alias: string,
    rowFields: Row,
  ): TempTableJoinSource<Row> => {
    const source = {
      getJoinOuterScope: () => ({
        topLevel: rowFields,
        namespaces: { [alias]: rowFields } as Record<string, Row>,
      }),
      buildAst: () => TableSource.named(tableName, alias),
    };
    return blindCast<TempTableJoinSource<Row>, 'source implements TempTableJoinSource duck-type'>(
      source,
    );
  };

  const createAppend =
    (quotedName: string) =>
    async (input: TempTableAppendInput<Record<string, ScopeField>>): Promise<void> => {
      if (Array.isArray(input)) {
        const rows = blindCast<
          readonly (readonly (string | number | boolean | null)[])[],
          'Array.isArray true — input is a raw rows array'
        >(input);
        if (rows.length === 0) return;
        const valueRows = rows.map((row) => `(${row.map(toSqlLiteral).join(', ')})`).join(', ');
        const insertSql = `INSERT INTO ${quotedName} VALUES ${valueRows}`;
        const insertAst = RawQueryAst.affectedCount([insertSql]);
        const insertQueryPlan = planFromAst(insertAst, contract, 'raw.temp-table');
        await execCtx.execute(
          Object.freeze({
            sql: insertSql,
            params: [] as unknown[],
            ast: insertAst,
            meta: insertQueryPlan.meta,
          }),
        );
      } else {
        const source = normalizeQuerySource(
          blindCast<
            TempTableAsInput<Record<string, ScopeField>>,
            'Array.isArray false — input is a query source'
          >(input),
        );
        const queryPlan = planFromAst(source.buildAst(), contract, 'dsl');
        const lowered = adapter.lower(queryPlan.ast, { contract, params: queryPlan.params });
        const params = lowered.params.map((slot) => {
          if (slot.kind === 'literal') return slot.value;
          throw new Error('tempTable.append(...) does not accept bind-site parameters.');
        });
        const insertSql = `INSERT INTO ${quotedName} ${lowered.sql}`;
        const insertAst = RawQueryAst.affectedCount([insertSql]);
        const insertQueryPlan = planFromAst(insertAst, contract, 'raw.temp-table');
        await execCtx.execute(
          Object.freeze({
            sql: insertSql,
            params,
            ast: insertAst,
            meta: insertQueryPlan.meta,
          }),
        );
      }
    };

  return {
    async as<Row extends Record<string, ScopeField>>(
      query: TempTableAsInput<Row>,
    ): Promise<TempTableHandle<Row>> {
      const source = normalizeQuerySource(query);
      const tableName = resolveTempTableName();
      const quotedTableName = quoteIdentifier(tableName);
      const queryPlan = planFromAst(source.buildAst(), contract, 'dsl');
      const lowered = adapter.lower(queryPlan.ast, {
        contract,
        params: queryPlan.params,
      });
      const params = lowered.params.map((slot) => {
        if (slot.kind === 'literal') return slot.value;
        throw new Error('tempTable.as(...) does not accept bind-site parameters.');
      });

      const createSql = `CREATE TEMP TABLE ${quotedTableName} AS ${lowered.sql}`;
      const createAst = RawQueryAst.affectedCount([createSql]);
      const createQueryPlan = planFromAst(createAst, contract, 'raw.temp-table');
      const createPlan = Object.freeze({
        sql: createSql,
        params,
        ast: createAst,
        meta: createQueryPlan.meta,
      });
      await execCtx.execute(createPlan);

      const dropPlan = Object.freeze({
        sql: `DROP TABLE IF EXISTS ${quotedTableName}`,
        params: [],
        ast: queryPlan.ast,
        meta: queryPlan.meta,
      });
      let dropped = false;
      const drop = async (): Promise<void> => {
        if (dropped) return;
        dropped = true;
        await execCtx.execute(dropPlan);
      };
      registerCleanupHook(drop);

      const rowFields = blindCast<Row, 'subquery row fields align with Subquery<Row> generic'>(
        source.getRowFields(),
      );
      const defaultJoin = asJoinSource(tableName, tableName, rowFields);

      return blindCast<
        TempTableHandle<Row>,
        'temp table handle created from Subquery<Row> preserves the same row field shape'
      >({
        ...defaultJoin,
        name: tableName,
        fields: rowFields,
        append: createAppend(quotedTableName),
        drop,
        [Symbol.asyncDispose]: drop,
      });
    },

    async from(columns: readonly TempTableColumnDef[]): Promise<TempTableHandle> {
      const tableName = resolveTempTableName();
      const quotedTableName = quoteIdentifier(tableName);

      const colDefs = columns.map((c) => `${quoteIdentifier(c.name)} ${c.type}`).join(', ');
      const createSql = `CREATE TEMP TABLE ${quotedTableName} (${colDefs})`;
      const createAst = RawQueryAst.affectedCount([createSql]);
      const createQueryPlan = planFromAst(createAst, contract, 'raw.temp-table');
      const createPlan = Object.freeze({
        sql: createSql,
        params: [] as unknown[],
        ast: createAst,
        meta: createQueryPlan.meta,
      });
      await execCtx.execute(createPlan);

      const dropSql = `DROP TABLE IF EXISTS ${quotedTableName}`;
      const dropAst = RawQueryAst.affectedCount([dropSql]);
      const dropQueryPlan = planFromAst(dropAst, contract, 'raw.temp-table');
      const dropPlan = Object.freeze({
        sql: dropSql,
        params: [] as unknown[],
        ast: dropAst,
        meta: dropQueryPlan.meta,
      });
      let dropped = false;
      const drop = async (): Promise<void> => {
        if (dropped) return;
        dropped = true;
        await execCtx.execute(dropPlan);
      };
      registerCleanupHook(drop);

      const emptyFields = {} as Record<string, ScopeField>;
      const defaultJoin = asJoinSource(tableName, tableName, emptyFields);
      return blindCast<TempTableHandle, 'from() handle has no typed row fields'>({
        ...defaultJoin,
        name: tableName,
        fields: emptyFields,
        append: createAppend(quotedTableName),
        drop,
        [Symbol.asyncDispose]: drop,
      });
    },
  };
}

export default function sqlite<TContract extends Contract<SqlStorage>>(
  options: SqliteOptionsWithContract<TContract>,
): SqliteClient<TContract>;
export default function sqlite<TContract extends Contract<SqlStorage>>(
  options: SqliteOptionsWithContractJson<TContract>,
): SqliteClient<TContract>;
export default function sqlite<TContract extends Contract<SqlStorage>>(
  options: SqliteOptions<TContract>,
): SqliteClient<TContract> {
  const contract = resolveContract(options);
  let binding = resolveOptionalSqliteBinding(options);

  const stack = createSqlExecutionStack({
    target: sqliteTarget,
    adapter: sqliteAdapter,
    driver: sqliteDriver,
    extensions: options.extensions ?? [],
  });
  const stackInstance = instantiateExecutionStack(stack);

  const context = createExecutionContext<TContract, SqliteTargetId>({
    contract,
    stack,
    driver: sqliteDriver,
  });
  const {
    sql,
    raw: rawSqlTag,
    enums,
  }: SqliteStaticContext<TContract> = buildSqliteStaticContext<TContract>(
    context,
    stack.adapter.rawCodecInferer,
  );

  let runtimeInstance: Runtime | undefined;
  let runtimeDriver: { connect(binding: unknown): Promise<void> } | undefined;
  let driverConnected = false;
  let connectPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let backgroundConnectError: unknown;
  let closed = false;
  let ownedDispose: (() => Promise<void>) | undefined;

  const connectDriver = async (resolvedBinding: SqliteBinding): Promise<void> => {
    if (driverConnected) return;
    if (!runtimeDriver) throw new InternalError('SQLite runtime driver missing');
    if (connectPromise) return connectPromise;
    connectPromise = runtimeDriver
      .connect(resolvedBinding)
      .then(() => {
        driverConnected = true;
      })
      .catch((err) => {
        backgroundConnectError = err;
        connectPromise = undefined;
        throw err;
      });
    return connectPromise;
  };

  const getRuntime = (): Runtime => {
    if (closed) {
      throw sqliteError('DRIVER.NOT_CONNECTED', 'SQLite client is closed', {
        meta: { extension: 'sqlite' },
      });
    }

    if (backgroundConnectError !== undefined) {
      throw backgroundConnectError;
    }

    if (runtimeInstance) {
      return runtimeInstance;
    }

    const driverDescriptor = stack.driver;
    if (!driverDescriptor) {
      throw new InternalError('Driver descriptor missing from execution stack');
    }

    const driver = driverDescriptor.create();
    ownedDispose = () => driver.close();
    runtimeDriver = driver;
    if (binding !== undefined) {
      void connectDriver(binding).catch(() => undefined);
    }

    runtimeInstance = new SqliteRuntimeImpl({
      context,
      adapter: stackInstance.adapter,
      driver,
      ...ifDefined('verifyMarker', options.verifyMarker),
      ...ifDefined('middleware', options.middleware),
    });

    return runtimeInstance;
  };

  const orm: UnboundOrm<TContract> = unboundOrm(
    ormBuilder({
      context,
      runtime: {
        query(plan) {
          return getRuntime().query(plan);
        },
        execute(plan) {
          return getRuntime().execute(plan);
        },
        connection() {
          return getRuntime().connection();
        },
      },
    }),
  );

  function prepare<
    D extends Declaration<CT>,
    Q extends SqlQueryPlan | Preparable<unknown, unknown>,
    CT extends CodecTypesBase = ExtractCodecTypes<TContract>,
  >(
    declaration: D,
    callback: (params: BindSiteParams<D>) => Q,
  ): Promise<PreparedFrom<ParamsFromDeclaration<D, CT>, Q>> {
    return prepareQuery<D, Q, CT>(getRuntime(), declaration, callback);
  }

  return {
    sql,
    orm,
    enums,
    raw: rawSqlTag,
    context,
    contract,
    stack,
    async connect(bindingInput) {
      if (closed) {
        throw sqliteError('DRIVER.NOT_CONNECTED', 'SQLite client is closed', {
          meta: { extension: 'sqlite' },
        });
      }

      if (driverConnected || connectPromise) {
        throw sqliteError('DRIVER.ALREADY_CONNECTED', 'SQLite client already connected', {
          meta: { extension: 'sqlite' },
        });
      }

      backgroundConnectError = undefined;

      if (bindingInput !== undefined) {
        binding = resolveSqliteBinding(bindingInput);
      }

      if (binding === undefined) {
        throw sqliteError(
          'RUNTIME.BINDING_MISSING',
          'SQLite binding not configured. Pass path to sqlite(...) or call db.connect({ path }).',
          { meta: { extension: 'sqlite' } },
        );
      }

      const runtime = getRuntime();
      if (driverConnected) {
        return runtime;
      }

      await connectDriver(binding);
      return runtime;
    },
    runtime() {
      return getRuntime();
    },
    prepare,

    transaction<R>(fn: (tx: SqliteTransactionContext<TContract>) => PromiseLike<R>): Promise<R> {
      let runtime: ReturnType<typeof getRuntime>;
      try {
        runtime = getRuntime();
      } catch (err) {
        return Promise.reject(err);
      }
      return withTransaction(runtime, (txCtx) => {
        const rawCodecInferer = stack.adapter.rawCodecInferer;
        const txSqlNamespace = sqlBuilder<TContract>({ context, rawCodecInferer })[
          UNBOUND_NAMESPACE_ID
        ];
        assertDefined(
          txSqlNamespace,
          'the unbound namespace always exists on a sqlite builder output',
        );
        const txSql: UnboundSql<TContract> = blindCast<
          UnboundSql<TContract>,
          'Db<TContract> indexed by a literal key widens NsId to string; TableProxy is invariant in NsId via insert()/update() parameter positions, so the indexed-access type cannot be proven to match the literal-keyed Namespace without this cast'
        >(txSqlNamespace);

        const txOrm: UnboundOrm<TContract> = unboundOrm(
          ormBuilder({
            runtime: {
              query(plan) {
                return txCtx.query(plan);
              },
              execute(plan) {
                return txCtx.execute(plan);
              },
            },
            context,
          }),
        );

        // Use `txCtx` as the prototype instead of spreading it so that live
        // accessors (notably the `invalidated` getter, which reads a closure
        // variable in `withTransaction`) remain wired to the original object.
        // Spreading would evaluate the getter once and freeze its value.
        const tx: SqliteTransactionContext<TContract> = Object.assign(
          castAs<TransactionContext>(Object.create(txCtx)),
          {
            sql: txSql,
            orm: txOrm,
            enums,
            tempTable(): TempTableBuilder {
              return createTempTableBuilder(
                txCtx,
                (hook) => txCtx.registerPreCommitHook(hook),
                context.contract,
                stackInstance.adapter,
              );
            },
          },
        );

        return fn(tx);
      });
    },

    connection<R>(fn: (conn: SqliteConnectionContext<TContract>) => PromiseLike<R>): Promise<R> {
      try {
        return withConnection(getRuntime(), (connCtx) => {
          const rawCodecInferer = stack.adapter.rawCodecInferer;
          const connSqlNamespace = sqlBuilder<TContract>({ context, rawCodecInferer })[
            UNBOUND_NAMESPACE_ID
          ];
          assertDefined(
            connSqlNamespace,
            'the unbound namespace always exists on a sqlite builder output',
          );
          const connSql: UnboundSql<TContract> = blindCast<
            UnboundSql<TContract>,
            'Db<TContract> indexed by a literal key widens NsId to string; TableProxy is invariant in NsId via insert()/update() parameter positions, so the indexed-access type cannot be proven to match the literal-keyed Namespace without this cast'
          >(connSqlNamespace);

          const connOrm: UnboundOrm<TContract> = unboundOrm(
            ormBuilder({
              runtime: {
                query(plan) {
                  return connCtx.query(plan);
                },
                execute(plan) {
                  return connCtx.execute(plan);
                },
              },
              context,
            }),
          );

          const conn: SqliteConnectionContext<TContract> = Object.assign(
            castAs<ConnectionContext>(Object.create(connCtx)),
            {
              sql: connSql,
              orm: connOrm,
              enums,
              tempTable(): TempTableBuilder {
                return createTempTableBuilder(
                  connCtx,
                  (hook) => connCtx.registerReleaseHook(hook),
                  context.contract,
                  stackInstance.adapter,
                );
              },
            },
          );

          return fn(conn);
        });
      } catch (err) {
        return Promise.reject(err);
      }
    },

    close(): Promise<void> {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = (async () => {
        await connectPromise?.catch(() => undefined);
        await ownedDispose?.();
      })();
      return closePromise;
    },

    [Symbol.asyncDispose](): Promise<void> {
      return this.close();
    },
  };
}
