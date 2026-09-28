# Getting-started eval friction, sorted

Source: nightly run of 2026-09-28 in `prisma/getting-started-eval` ([run 36374460906](https://github.com/prisma/getting-started-eval/actions/runs/36374460906)), harness `0e796dd`, Prisma CLI `8.0.0-rc.17`, Composer `0.23.0`. The report lists 54 items across three agent attempts. After merging repeats there are 36 distinct items. "Seen" is the number of attempts that reported the item.

The automated script test also failed, at `npx prisma dev module.ts`. That failure is not in the friction list.

## Who owns what

| Owner | Distinct items | High severity |
| --- | --- | --- |
| Platform (Compute, Postgres, Management API) | 7 | 4 |
| Docs | 11 | 5 |
| Prisma CLI | 9 | 0 |
| Composer | 6 | 0 |
| ORM | 3 | 0 |

## Possible breaking changes

These touch a surface that users or scripts depend on. Decide them early.

| Item | Owner | Surface |
| --- | --- | --- |
| `prisma-composer destroy` rejects `prisma.config.ts` because of the `skills` section that `prisma init` wrote. Two CLIs disagree about one config file. | CLI, Composer | Config format |
| A project needs two config files, `prisma.config.ts` and `prisma-composer.config.ts`, and nothing explains how they relate. | CLI, Composer, ORM | Config format |
| Read-only commands (`service show`, `service version list`, `service logs`, `service version show`) fail with the code `SERVICE.DEPLOY_FAILED`. | CLI | Error codes |
| `prisma deploy` works in an unlinked directory and creates the project. `service logs` and `service show` then refuse with `PROJECT.SETUP_REQUIRED`. | CLI | Command behavior |
| `prisma deploy` treats a missing `--stage` as production. `prisma-composer destroy` requires `--production`. | CLI, Composer | Flags |
| `postgres connection delete` rejects `--project`. `connection create` and `postgres list` accept it. | CLI | Flags |

## Platform (outside the team)

| Severity | Seen | Item |
| --- | --- | --- |
| High | 2 | Deployed versions crash-loop with `ENV_URL must be set when vars file is absent` after a successful deploy. |
| High | 2 | The production URL returns 502 on and off, about 20% of requests, after a clean boot. |
| High | 1 | A deployed version could not reach `db.prisma.io:5432` for over 10 minutes. |
| High | 2 | `service version list` reports `running` and `live: true` for a version that is crash-looping. |
| Medium | 3 | The Management API returns "Internal Server Error" on and off for deploy, show, list, logs, stop and rollback. |
| Medium | 1 | `service version stop` reports failure but stops the version, leaving no live version. |
| Medium | 1 | A new Prisma Postgres connection URL refuses connections for about 90 seconds and tells the user to contact support. |

## Docs

| Severity | Seen | Item |
| --- | --- | --- |
| High | 3 | The Composer docs do not document `prisma-composer.config.ts`, `compute()`, the Postgres primitives or the install. The agent read type declarations instead. |
| High | 1 | `/docs/composer/quickstart` returns 404. |
| High | 1 | No example of a plain HTTP service with GET and POST routes. |
| High | 1 | Nothing explains how a service gets a public URL. |
| High | 1 | Nothing documents how to run Prisma migrations against a database that Composer provisioned. |
| Medium | 1 | No full signatures for `compute()`, `provision()`, `postgres()`, `rawPostgres()`. |
| Medium | 1 | A docs example imports `postgres` from the package root. It is only exported from `/orm`. |
| Medium | 1 | Nothing says a build adapter needs its own extension in the config. |
| Low | 1 | The Composer landing page does not list its subpages. |
| Low | 1 | No example shows the shape that `load()` returns for dependencies. |
| Low | 1 | `destroy --production` also deletes the Project. The help does not say so. |

## Prisma CLI

| Severity | Seen | Item |
| --- | --- | --- |
| Medium | 3 | `prisma` has no `destroy` command, and `prisma destroy --help` prints the root help with a success exit. |
| Medium | 2 | `prisma skills sync` in an empty directory reports success and syncs nothing. |
| Medium | 2 | `service logs` and `service show` require a linked project right after an unlinked deploy worked. |
| Medium | 1 | `service version show <service name>` returns a raw backend validation error. |
| Medium | 1 | `postgres connection delete` rejects `--project`. |
| Low | 1 | `service logs --json` puts terminal color codes inside the JSON. |
| Low | 1 | The "skills are out of date" notice is printed after the JSON result. |
| Low | 1 | `bunx prisma-composer` returns 404 from npm. The docs and skill file name that command. |
| Medium | 3 | Read-only commands use the error code `SERVICE.DEPLOY_FAILED`. |

## Composer

| Severity | Seen | Item |
| --- | --- | --- |
| Medium | 2 | Deploying unchanged source does not create a new version, so a crash-looping version cannot be restarted. |
| Medium | 1 | Bundled `.d.mts` files export names under single-letter aliases. |
| Medium | 1 | `.alchemy/` state is written to the project root and is not ignored by git. It can hold connection details. |
| Low | 3 | Every deploy prints an upgrade notice for `alchemy`, with a `pnpm` command. |
| Low | 3 | Every deploy from a directory without git prints "Not recording this deploy in Prisma Cloud". |
| Low | 2 | Stopping `prisma dev` leaves the emulator processes running. |
| Low | 1 | Every deploy plans the three injected environment variables as "update". |

## ORM

| Severity | Seen | Item |
| --- | --- | --- |
| Medium | 2 | Every ORM command prints the `pg` SSL warning, triggered by the connection string that Prisma itself issued. The RC1 plan already listed this warning. |
| Medium | 1 | `contract infer --db ""` falls back to localhost instead of refusing the empty value. |
| Low | 1 | `contract emit` tells the user to install `@internal/target-postgres`, which cannot be installed. |
