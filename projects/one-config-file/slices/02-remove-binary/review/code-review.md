# Code review: slice 2, remove the `prisma-composer` binary

Range: `one-config-file/composer-section...one-config-file/remove-binary` in prisma/composer (10 commits, 145 files). Reviewer role: principal engineer. Expectations: [`../spec.md`](../spec.md) ("Slice-specific done conditions"), parent spec requirements 5, 6 and 8, [`../grounding.md`](../grounding.md), and the implementer's `wip/slice-02-qa.md` and `wip/effect-resolution-run-slice2.txt`.

Commands run on the branch, all exit 0: `pnpm lint` (no diagnostics in changed files), `pnpm typecheck` (78 tasks), `pnpm test:scripts` (213 pass, including `composer-destroy` and `lint-retired-cli-name`), `pnpm lint:retired-cli-name`, and `pnpm test` in `packages/0-framework/3-tooling/cli` (220 pass, 3 skip). I also ran the lint script against a scratch tree with planted mentions (results in F03).

## Summary

The deletion is clean. The binary, its runtime, its two retired commands and their tests are gone. `/control` keeps `destroy` and `log` with a new test. `@prisma/composer-cli` publishes no `bin`. Every CI path that ran the binary now runs the hoisted `prisma` host or the new `scripts/composer-destroy.ts`. The version bump touches only version fields, workspace specifiers, the lockfile and the skill's `library_version`.

The main risk is in how the repository makes the published `prisma` run the workspace family. It depends on three things together: a root `pnpm.overrides` entry, a root devDependency that nothing documents, and a `prisma` pin copied by hand into 14 manifests. No check covers any of them. If one drifts, CI can keep passing while it tests the registry's family, or while two copies of the engine are loaded (F01, F02). The docs have one gap: a reader of the getting-started guide can deploy but cannot tear down (F06). The lint that retires the name misses some realistic command forms (F03).

## What looks solid

- The lockfile encodes the mechanism. It has `overrides: '@prisma/composer-cli': workspace:*` at the top, and the `prisma@8.0.0-rc.19` snapshot lists `'@prisma/composer-cli': link:packages/9-public/composer-cli`. `pnpm install --frozen-lockfile` on a clean runner therefore reproduces the link. The root importer's link puts `node_modules/@prisma/composer-cli` at the root, where the hoisted `prisma` resolves it. The QA notes explain why that root link is needed: the hoisted linker leaves `node_modules/prisma/node_modules/@prisma/` empty.
- The QA proof for done condition 1 is real. A marker added to the family's `deploy` help appeared in `bun ../../node_modules/.bin/prisma deploy --help` run from `examples/orm-demo`.
- `check-cli-engine-pin.mjs` still proves the library is free of the engine. "Half two" is unchanged: it packs `@prisma/composer` and rejects any engine field or engine import in the packed output. Dropping the bin checks is correct, because the whole-dist sweep now covers the only config.
- `check-npm-effect-resolution.mjs` now imports `@prisma/composer-cli/family` from the scratch install and requires `["deploy","dev"]`. The recorded run shows it passing in the healthy shapes and in the adversarial one. The family imports `@prisma/cli-engine` statically, so this also proves that npm installed the peer.
- The paths are right at every depth. The examples use `../../node_modules/.bin/prisma`, `website` and `deploy-docs.yml` (with `working-directory: website`) use `../`, and the composite action uses `${{ github.workspace }}/node_modules/.bin/prisma`, which is sturdier than the old relative path. `destroy-guard.sh` finds its own directory through `BASH_SOURCE` and passes the same `--name … --production` as before. The action still decides whether to destroy from `steps.deploy.outcome`.
- `composer-destroy.ts` enforces the same targets as the deleted `targetOf`: both flags, or neither, is refused before any work. The destroy call, the `no-local-deploy-state` warning text and `toEnvelope()` printing match the old command. `CliStructuredError.toEnvelope` exists, so the printing works against the real class too.
- `spawn-prisma.ts` walks up to the nearest `node_modules/.bin/prisma` and puts it on `PATH` for `cross-spawn`, so Windows still goes through the `.CMD` shim, as `spawn-composer.ts` did.
- The deleted tests covered code that no longer exists. `runtime.test.ts` and `node-compat.test.ts` covered the composer-owned Runtime and `src/bin.ts`. `engine-cli.test.ts` and `cli.engine-shell.test.ts` covered the binary's grammar, version and help. The destroy cases in `deploy-destroy.test.ts` covered the destroy command. The retired-file rule from `host-adapter.test.ts` is still covered in process: `section.test.ts` and `operations.test.ts` assert `CONFIG.FILE_RETIRED`. The `/control` destroy and log are covered by the new `exports/__tests__/control.test.ts` and the existing `operations.test.ts`.
- The `destroy` and `log` examples in the guides match the real `DestroyInput`/`LogInput`: `config: { value, file }`, `target`, `tail`, `signal`, and `result.value.lines` of `{ service, line }`. `definePrismaConfig<T>` returns `T & …`, so `prismaConfig.composer` is typed.

## Findings

### F01: Nothing checks that the hoisted `prisma` runs the workspace family, and the root devDependency is undocumented (correctness, operability; high)

Location: package.json lines 37 and 48-50; scripts/check-cli-engine-pin.mjs (no host check exists)

Issue: The in-repo proof depends on two root entries. If the root devDependency `@prisma/composer-cli` is removed (it looks unused, and no comment, gotcha or CONTRIBUTING note explains it), `prisma` fails loudly with `Cannot find module`. If the override is removed or narrowed, pnpm installs the registry `@prisma/composer-cli@0.25.0` nested under `prisma`. The integration tests, `e2e-deploy.yml` and the cron canary then test the published family, not the PR, and stay green. The only proof that the workspace family runs is a manual marker in the QA notes.

Suggestion: Add an assertion to `check-cli-engine-pin.mjs`, or to a small new check wired into CI, that resolves the family the way the host does and requires the result to point at the workspace:

```js
const host = createRequire(join(repoRoot, 'node_modules/prisma/package.json'));
require_(realpathSync(host.resolve('@prisma/composer-cli/family')).startsWith(cliDir),
  'the installed prisma host does not resolve @prisma/composer-cli to the workspace package; check pnpm.overrides and the root devDependency.');
```

Add a short entry to `gotchas.md` or CONTRIBUTING that names both root entries and says why each exists.

### F02: The host's `prisma` pin, and the engine it brings, are not coordinated with the workspace (correctness; medium)

Location: .github/dependabot.yml lines 60-80 (ignore list); 14 manifests pinning `"prisma": "8.0.0-rc.19"`; scripts/check-cli-engine-pin.mjs lines 80-112

Issue: The slice spec's edge-case table says `check-cli-engine-pin.mjs` covers "the host's engine version and the workspace pin are both 0.6.2". It does not: the script never reads the `prisma` manifest. Dependabot ignores `@prisma/cli-engine` but not `prisma`. A bump of `prisma` to a release that pins a different engine would install that engine nested under `prisma`, while the family keeps importing the root 0.6.2 copy. The process would then hold two copies of the engine, the exact failure the pin check exists to prevent. The 14 hand-copied pins can also drift apart; the hoisted linker then nests copies, and the composite action's root path may pick a different version than the example declares. The host also pins `@prisma/orm-toolchain`, which `check-orm-pins.mjs` does not see.

Suggestion: Add `prisma` to Dependabot's ignore list, with the same tandem-release reason as the engine. Extend the pin check to require that the installed `prisma` depends on exactly the workspace engine pin. Extend `check-orm-pins.mjs`, or add a sibling check, to require that every workspace `prisma` pin is identical.

### F03: The retired-name lint misses realistic command forms and flags ordinary prose (correctness of the check; medium)

Location: scripts/lint-retired-cli-name.mjs lines 56-60

Issue: I ran the script against a scratch tree. It did not flag:

- `prisma-composer \` followed by `deploy` on the next line, a common shape in shell blocks
- `$ prisma-composer` with no arguments
- `npm exec -- prisma-composer`
- `` `prisma-composer` deploy ``

It did flag the prose line "the prisma-composer package is great". Pattern 1 only matches when the next character after the whitespace is a lowercase letter or a dash.

Suggestion: Treat every standalone token as a finding: `(?<![\w.@/-])prisma-composer(?![\w.-])`, plus the existing `bin/` form. The current checked trees contain no such token, so the check still passes on the branch. It then catches all four forms above, and the reserved names stay excluded because their boundaries are unchanged. Add the continuation line and the bare `$ prisma-composer` to the planted cases in the test.

### F04: The lint skips every directory named `generated`, and some edited reader-facing files are outside its scope (maintainability; low)

Location: scripts/lint-retired-cli-name.mjs lines 22-30 and 42-52

Issue: `'generated'` is excluded at any depth, but the comment justifies only `website/src/generated`. A hand-written file under any `examples/**/generated/` escapes the check; I confirmed this with a planted file. Separately, `CONTRIBUTING.md`, `SECURITY.md`, `docs/oss/` and `.agents/rules/` were swept in this PR but are not protected afterward.

Suggestion: Exclude the path `website/src/generated`, not the directory name. Consider adding the root `*.md` files and `docs/oss` to `CHECKED_PATHS`. `gotchas.md` and `.drive/` should stay out, because they are historical records.

### F05: One lint test only restates the allowlist (tests; low)

Location: scripts/lint-retired-cli-name.test.mjs lines 128-133

Issue: The test is named "allowlists only paths that exist in the repository", but it only compares the constant's keys to a literal list and never checks that the paths exist (see the rule `no-tautological-tests`). The real run already reports an allowlisted file that has zero mentions.

Suggestion: Assert `existsSync(join(repoRoot, file))` for each key, or delete the test.

### F06: The getting-started guide leaves its reader unable to tear down (docs correctness; medium)

Location: docs/guides/getting-started.md lines 344-353 and the "tear it down" paragraph after the stage deploy; docs/guides/deploying.md lines 168-195

Issue: Getting-started no longer asks the reader for a service token or a workspace id; `prisma auth login` is enough to deploy. It then sends the reader to the `destroy` script in the deploying guide. That script runs outside the CLI and reads only `PRISMA_SERVICE_TOKEN` and `PRISMA_WORKSPACE_ID`, so a reader who only logged in gets a container failure. `deploying.md` states the requirement under Credentials, but not beside the script. Neither guide says how to run `destroy-staging.ts` (for example `bun destroy-staging.ts`).

Suggestion: Beside the script, and in the getting-started pointer, add one sentence: run it with `bun destroy-staging.ts`, with `PRISMA_SERVICE_TOKEN` and `PRISMA_WORKSPACE_ID` set; a `prisma auth login` session is not used. Mirror the sentence in the skill's teardown passage.

### F07: `composer-destroy.ts` lets errors before the operation escape its documented exit contract (operability; low)

Location: scripts/composer-destroy.ts lines 88-141

Issue: The header promises exit 1 with the structured failure and exit 2 on bad arguments. If `@prisma/composer/control` does not resolve, or `prisma.config.ts` throws on import, the top-level `await` rejects with a raw stack. The exit code is 1 only by accident. The script reads only `<cwd>/prisma.config.ts`, while the host walks up to the nearest declaring file; that is fine for today's callers, but the header does not say so. `createRequire(...).resolve` works only while `./control` is a plain-string export; an `import`-only condition would break it. The hand-written `ControlModule` types are not typechecked (no tsconfig covers `scripts/`), and the test runs the script under `node` while CI runs it under `bun`.

Suggestion: Wrap `main()` so that load and config errors print one line with the resolved path and exit 1. State in the header that the config is looked up in the current directory only. The other points are acceptable for a repo-private script; no change needed.

### F08: A command example in an example README uses a path that only exists in this repository (docs; low)

Location: examples/store/README.md line 80

Issue: `pnpm build && bun ../../node_modules/.bin/prisma dev module.ts` works only inside this repository, which hoists `node_modules` to the root. The slice spec's "At a glance" shows `node_modules/.bin/prisma`, and the implementation differs because of the hoisted layout; only the QA notes explain that.

Suggestion: Add "from this repository checkout" before the command, or add a script to `examples/store/package.json` and document that. State the path deviation from the spec in the PR description.

### F09: Historical records reworded as if the new command had been used (style; low)

Location: gotchas.md (the "First hit" and "Product" lines for the stage-as-branch and `.tsx` entries)

Issue: Entries that record what was run at the time now say `prisma deploy` or "a `deploy --stage staging`". The record now says something that did not happen.

Suggestion: Keep historical records verbatim, as `.drive/` and `docs/design/` were kept. The lint does not scan `gotchas.md`, so no allowlist entry is needed.

## Deferred

- Users outside the workspace: the published `prisma@8.0.0-rc.19` pins `@prisma/composer-cli@0.25.0`, so outside this repository the override does nothing and users run whatever the host pins. The spec assigns this to slice 3, which bumps the host's pins.
- `bun <path>/.bin/prisma` on Windows: the extensionless file is a shell shim there, not the JS entry. The same was true of `prisma-composer`, and no Windows job deploys. This is not a regression.
- Signal handling in the destroy script uses the default `spawnAlchemy` instead of the engine's spawn adapter. CI cancellation behaves like any other host of the operation.

## Already addressed

- The reason for the root devDependency and the relative bin path is written in `wip/slice-02-qa.md`. F01 asks for the same reasoning in a place maintainers will read.
- The proof that the workspace family runs (the marker in `deploy --help`) was done manually and the marker reverted. F01 asks for an automated version.
- The `effect` resolution check was re-run with the family import. It passes in the healthy shapes and in the adversarial one.

## Acceptance-criteria verification

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| S1 | From `examples/orm-demo`, `prisma deploy --help` and `prisma dev --help` exit 0 and run the workspace family | PASS | QA marker run; lockfile snapshot links `prisma` to the workspace family. The run used `../../node_modules/.bin/prisma` (F08). No automated guard (F01). |
| S2a | Packed `@prisma/composer-cli` declares no `bin` | PASS | Manifest has no `bin`; tsdown has one config with `exports: false` and no bin entry. |
| S2b | Boundary search for the command form over the repo, excluding `docs/design/` and `node_modules`, finds nothing | FAIL | 13 hits: 10 in `.drive/**` and 3 in `open-chat-port-friction.md`, all historical records. Either narrow the condition in the spec and PR description or rewrite them. |
| S2c | New CI check passes on the branch and fails on a planted mention | PASS | `pnpm lint:retired-cli-name` exits 0; the test plants a mention and expects exit 1; wired into `ci.yml`. Coverage gaps in F03. |
| S3 | `e2e-deploy.yml` passes on the PR with `prisma deploy` and the destroy script | NOT VERIFIED | No PR run yet. The workflow triggers on `pull_request`. Local QA reached the operation with no credentials. |
| P5 | The binary exists in no published package; publish and CI scripts reworked, none pointing at a missing file | PASS | No `bin` in either public package; node-floor smoke steps removed; pin, static-graph, floor-import and effect checks updated; lint and typecheck green. |
| P6 | All ten examples, `test/integration` and `website` have a `composer` section and no `prisma-composer.config.ts`; scripts call `prisma`, not a binary path | WEAK | All 12 have a `composer` section, and no tracked `prisma-composer.config*` exists. Scripts call `bun ../../node_modules/.bin/prisma`, a binary path, which the slice spec approved over the parent's wording. |
| P8 | No guide, README, example or skill names `prisma-composer` as a command or names the config file; a CI check enforces it; docs name only commands the released `prisma` has | PASS | Lint clean; allowlist 3 + 2 migration passages; commands named (`deploy`, `dev`, `auth login`, `skills sync`, ORM commands) exist in `prisma@8.0.0-rc.19`. prisma/web is slice 3. Weak spots in F03 and F06. |

Totals: 5 PASS, 1 FAIL, 1 NOT VERIFIED, 1 WEAK (8 criteria).
