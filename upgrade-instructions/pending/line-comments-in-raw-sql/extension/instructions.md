---
changes:
  - id: ddl-nodes-hold-opaque-sql
    summary: |
      `FunctionColumnDefault`, `CheckExpressionConstraint`, `PostgresCreatePolicy` and `PostgresCreateIndex` hold their SQL as an `OpaqueSql` node instead of a string. Wrap the string with `opaqueSql(...)` when you construct one, and read `.text` where you read the SQL.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bnew\s+(FunctionColumnDefault|CheckExpressionConstraint|PostgresCreatePolicy|PostgresCreateIndex)\s*\('
  - id: sql-with-a-line-comment-gets-a-new-wire-name
    summary: |
      An index, check or policy whose SQL body contains both `--` and a line break gets a new wire name once. The next migration renames or recreates it.
---

# Line comments in raw SQL are safe

## DDL nodes hold `OpaqueSql`

SQL that Prisma places inside a larger statement now travels as an `OpaqueSql` node, exported with `opaqueSql` and `renderOpaqueSql` from `@internal/sql-relational-core/ast`. These fields changed type:

| Node | Field | Was | Is |
| --- | --- | --- | --- |
| `FunctionColumnDefault` | `expression` | `string` | `OpaqueSql` |
| `CheckExpressionConstraint` | `expression` | `string` | `OpaqueSql` |
| `PostgresCreatePolicy` | `using`, `withCheck` | `string \| undefined` | `OpaqueSql \| undefined` |
| `PostgresCreateIndex` | `where` | `string \| undefined` | `OpaqueSql \| undefined` |
| `PostgresCreateIndex` | `elements.expression` | `string` | `OpaqueSql` |

Code that constructs one of these nodes directly wraps the string:

```diff
- new FunctionColumnDefault('now()')
+ new FunctionColumnDefault(opaqueSql('now()'))
```

The factories `fn`, `checkExpression`, and the Postgres contract-free `createPolicy` and `createIndex` still take strings. Prefer them over the constructors:

```diff
- new CheckExpressionConstraint({ name: 'chk', expression: 'price > 0' })
+ checkExpression('chk', 'price > 0')
```

Code that reads `.expression`, `.using`, `.withCheck` or `.where` of these nodes now reads `.text`. No detection pattern finds those reads; the TypeScript compiler reports each one as a type error.

An adapter that renders these nodes into SQL renders the SQL with `renderOpaqueSql(node.expression)`, not `node.expression.text`. `renderOpaqueSql` ends text that contains `--` with a line break, so a line comment on the last line cannot comment out the rest of the statement.

## SQL with a line comment gets a new wire name

The body of a wire-named index, check or policy is normalized before it is hashed into the name. A body that contains `--` now keeps its line breaks, because a line break ends the comment and so changes what the body means. Every other body hashes as before.

If a contract has an index expression or predicate, a check expression, or a policy `using` or `withCheck` with both `--` and a line break, re-emit the contract and plan a migration. The object gets a new wire name, and the migration renames or recreates it.
