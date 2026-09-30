# Brief: one CLI and one config file for Composer

Written 2026-09-30 for an agent that will design this work and then run its implementation. The agent starts in a fresh worktree of `prisma/orm` and has no other context. Everything it needs is in this file or in the repositories it names.

## The goal

Prisma 8 ships one command-line tool, `prisma`, and one config file, `prisma.config.ts`. Today Prisma Composer (the product that deploys and runs Prisma apps, source in the repository `prisma/composer`) breaks that rule twice:

1. Composer keeps its own config file, `prisma-composer.config.ts`, beside `prisma.config.ts`. A Composer user has two config files.
2. Composer keeps its own command-line tool, `prisma-composer`, beside `prisma`. Some Composer commands exist only there.

This work removes both. When it is done:

- Composer's configuration lives in the `composer` section of `prisma.config.ts`. The file `prisma-composer.config.ts` is no longer read by anything.
- Every Composer command a user needs runs as `prisma <command>`.
- The `prisma-composer` command-line tool no longer exists.
- No guide, README or agent skill tells anyone to run `prisma-composer`.

This is a breaking change. Prisma 8 general availability (GA) is planned for the end of October 2026 and is the last point at which breaking changes are allowed, so this must ship before GA. It is item 2 of the foundations stream of the GA plan.

## Terms

- **The engine**: the package `@prisma/cli-engine` in the repository `prisma/prisma-cli`. It owns the command grammar, help, config loading, diagnostics and exit codes for every Prisma command-line tool.
- **A command family**: a bundle of commands plus one config section, defined with `defineCommandFamily` from the engine. A host binary mounts families. The `prisma` binary mounts the platform family, the Composer family, the ORM family and the skills family (verified in `packages/cli/src/cli.ts` of `prisma/prisma-cli`, 2026-09-30).
- **A config section**: one top-level key of `prisma.config.ts`, owned by one family, with a validator that runs when the engine loads the config. The engine rejects any top-level key that no mounted family declares.
- **The host**: the `prisma` binary. Its source is the package `@prisma/cli` in `prisma/prisma-cli`, published under both names `prisma` and `@prisma/cli`.
- **Alchemy**: the infrastructure-provisioning engine Composer deploys through. It depends on an exact version of the library `effect`. If a project's dependency tree resolves a different `effect` version, importing Alchemy crashes.
- **Control-plane code**: the deploy-time code of each Composer extension (provisioning, bundling, Alchemy providers). It must never be imported by application code, because application code is bundled into the deployed artifact. Composer's design record ADR-0017 (in `docs/design/90-decisions/` of `prisma/composer`) makes the config file the only place that imports control-plane code.

## Where things are today

All of the following was read from the `main` branches on 2026-09-30.

### Composer's config file

`prisma-composer.config.ts` default-exports `defineConfig({ extensions: [...], state: ... })` from `@prisma/composer/config`. `extensions` is an array of extension descriptors, each with an `id` (the extension package name) and a `nodes` registry. `state` is a state-store descriptor with an `extension` name and a `create` function. Example from `examples/orm-demo/prisma-composer.config.ts` in `prisma/composer`:

```ts
import { defineConfig } from '@prisma/composer/config';
import { nodeBuild } from '@prisma/composer/node/control';
import { prismaCloud, prismaState } from '@prisma/composer-prisma-cloud/control';

export default defineConfig({
  extensions: [prismaCloud(), nodeBuild()],
  state: prismaState(),
});
```

It is found and loaded by `packages/0-framework/3-tooling/cli/src/load-config.ts` in `prisma/composer`. Discovery walks up from the deploy entry file's directory looking for `prisma-composer.config.{ts,mts,mjs,js}`. Loading uses the library `c12`. Validation is field by field in `configShapeDiagnostics` and returns every problem rather than throwing the first.

Before any load, `check-effect-resolution.ts` verifies that Alchemy resolves the exact `effect` version Composer pins. If not, the load stops with one diagnostic (`CONFIG.EFFECT_RESOLUTION` or similar; read the file for the code) that names the fix. This check exists because evaluating the config imports Alchemy's provider tree, which crashes on a wrong `effect` version.

### The `composer` section of `prisma.config.ts`

Defined in `packages/0-framework/3-tooling/cli/src/family/section.ts` in `prisma/composer`. It has exactly one optional field, `configPath`, a path to `prisma-composer.config.ts`. So the section is a pointer to the second file, not the configuration itself.

The file's header comment gives the reason for the split: Composer's config holds executable values and can only be understood by evaluating it inside a running command, while a section validator loads with the command tree at start-up and must be light. Will Madden has ruled that this reason does not hold. The ORM section of the same file already holds built descriptor objects (functions and all), and its validator checks only identifying fields and passes the rest through as references (verified in `packages/1-framework/3-tooling/config-loader/src/orm-section.ts` in `prisma/orm`). The Composer section can do the same.

The one real difference is the Alchemy import. A user's `prisma.config.ts` that imports `@prisma/composer-prisma-cloud/control` will import Alchemy at evaluation time. On a wrong `effect` version that crashes the evaluation of the whole config, which would take down every `prisma` command, including ORM commands that have nothing to do with Composer. Will's decision: consolidate regardless. The design must keep the `effect` check ahead of config evaluation so that the crash becomes a diagnostic. See the design constraints below.

The `prisma` host already has a test, `packages/cli/tests/composer-isolation.test.ts` in `prisma/prisma-cli`, proving that mounting the Composer family does not load Alchemy or `effect` on an unrelated command. That property concerns the family's static import graph and stays true regardless of this work, but it says nothing about a user's config file importing Alchemy. The design must address the second case.

### The Composer commands

The Composer command family (`packages/0-framework/3-tooling/cli/src/family/family.ts` in `prisma/composer`) exposes `deploy` and `dev` only. The `prisma` host mounts those two at its root, so `prisma deploy` and `prisma dev` exist.

`destroy` (tear down a deployed app, `destroy <entry> --stage <name>` or `--production`) and `log` (local development logs) exist only in the standalone `prisma-composer` tool. They were removed from the family on purpose: the family's header comment records that a product-management review on 2026-08-21 retired them from the surface the `prisma` binary mounts. `engine-cli.ts` mounts them back on top of the family for the standalone tool only.

Consequences seen in the nightly getting-started test of 2026-09-28: a coding agent looking for `destroy` ran the standalone tool by file path, and the standalone tool then rejected the project's `prisma.config.ts` because it did not know the `skills` section that `prisma init` writes. The standalone tool also differs from `prisma deploy` in how it treats a missing `--stage`.

### The standalone `prisma-composer` tool

Its source is the package `@internal/cli` in `prisma/composer` (`packages/0-framework/3-tooling/cli/`). Its entry is `src/bin.ts`, and `src/family/engine-cli.ts` builds it on the engine as a thin composition of the Composer family plus `destroy` and `log`. The package is marked private and its build config says it ships no executable, with a comment that `@prisma/composer` publishes the CLI. The published package names are `@prisma/composer` and `@prisma/composer-cli`, both at version 0.25.0; the `prisma` host depends on both (verified in `packages/cli/package.json` of `prisma/prisma-cli`). The nightly test of 2026-09-28 found no package named `prisma-composer` on npm. Which published package carries the `prisma-composer` binary, if any still does, must be established by the design agent from the publish scripts under `scripts/` in `prisma/composer`.

### Documents that name the standalone tool

Linear ticket TML-3340 (urgent, backlog) lists them: in `prisma/composer` at commit `c29ae43`, 55 occurrences across `docs/guides/deploying.md`, `docs/guides/running-locally.md`, `docs/guides/getting-started.md`, `skills/prisma-composer-core-concepts/SKILL.md`, `README.md`, `examples/store/README.md` and `skills/README.md`. The skill file matters most, because `prisma init` copies it into every new project and every coding agent reads it. The Composer pages of the public docs (source in `prisma/web`, under the Composer docs) must be checked too. The ticket's text has the full instructions, including a CI check that stops the name from returning.

### Earlier design work

The repository `prisma/orm` has an earlier plan for consolidating all Prisma command-line tools under `projects/consolidate-clis/` (`spec.md`, `plan.md`, `cli-consolidation-plan.md`, `current-state.md`, and `slices/`). It already states that Composer's config becomes a section of `prisma.config.ts` and that product config entry points must not throw at import time. Read it for background. Where it conflicts with this brief, this brief wins. In particular it proposed naming teardown `branch delete`; that is not decided, see the open questions.

## What to build

Four parts, in this order. Each part is one or more pull requests.

1. **Config merge.** Composer's whole configuration moves into the `composer` section of `prisma.config.ts`, written the same way the ORM section is written:

   ```ts
   import { definePrismaConfig } from 'prisma/config';
   import { defineConfig as composer } from '@prisma/composer/config';
   import { nodeBuild } from '@prisma/composer/node/control';
   import { prismaCloud, prismaState } from '@prisma/composer-prisma-cloud/control';

   export default definePrismaConfig({
     composer: composer({
       extensions: [prismaCloud(), nodeBuild()],
       state: prismaState(),
     }),
     orm: /* unchanged */,
   });
   ```

   The section validator checks the same identifying fields `configShapeDiagnostics` checks today and passes the descriptors through as references, as the ORM section does. The `configPath` field is removed. The file `prisma-composer.config.ts` is no longer discovered or loaded by any code path. The `c12` loader and the walk-up discovery in `load-config.ts` go away; the engine's config loading replaces them.

2. **Commands.** Every Composer command a user needs is mounted in the `prisma` host. Today that means `destroy` at least, and `log` unless Will says otherwise (open question 1). The standalone tool's `destroy` takes an explicit `--stage <name>` or `--production` and has no confirmation prompt; whether that grammar is kept as is when it moves into `prisma` is a design decision the agent makes, following the host's existing conventions for destructive commands (look at `postgres delete` and `project delete` in `packages/cli/src/commands/` of `prisma/prisma-cli`).

3. **Remove the standalone tool.** Delete `bin.ts`, `engine-cli.ts`, `cli.ts` and everything only they use in `packages/0-framework/3-tooling/cli/` of `prisma/composer`. Remove the binary from whatever published package declares it. Remove the `check-effect-resolution` pre-flight only if the design moved it somewhere else; it must survive in some form (constraint 2 below).

4. **Docs and the skill.** Do TML-3340 in full, after parts 1 to 3, so that every command the docs name exists in `prisma`. Replace every mention of `prisma-composer.config.ts` in guides, examples and the skill with the merged `prisma.config.ts`. Update every example under `examples/` in `prisma/composer`.

## Design constraints

1. **No creative freedom on the shape.** The `composer` section is written with `definePrismaConfig` from `prisma/config` and a `defineConfig` from `@prisma/composer/config`, mirroring the ORM section exactly. Do not invent a different layout, a different file name, or a way to keep the old file working.
2. **The `effect` check runs before the config is evaluated, and a mismatch is a diagnostic, not a crash.** Today the check runs before loading `prisma-composer.config.ts`. After the merge, the file being evaluated is `prisma.config.ts`, which the engine loads. The design must place the check so that a wrong `effect` version is reported as a structured diagnostic that names the fix, and so that `prisma` commands that do not read the `composer` section still run. Decide where the check lives (the engine, the family, or a hook the engine offers families before evaluation) and say why in the design. This is likely to need a change in `@prisma/cli-engine` in `prisma/prisma-cli`.
3. **The control-plane boundary of ADR-0017 holds.** `prisma.config.ts` becomes the one file that imports `/control` entries. Application code must still never import it. Composer's existing guard tests for this must keep passing; extend them to the new file if they name the old one.
4. **The old file is refused loudly.** If a project still has `prisma-composer.config.ts`, or a `composer.configPath` field, a Composer command fails with a diagnostic that names the file and says to move its contents into the `composer` section of `prisma.config.ts`. No silent fallback, no automatic migration (open question 2 may change this).
5. **Every design accounts for the host mounting the family, not only Composer's own tests.** Prove the end state by running the `prisma` binary from `prisma/prisma-cli` against a Composer example project, not only Composer's unit tests.
6. **Repository rules apply in each repository.** Each of `prisma/composer`, `prisma/prisma-cli` and `prisma/orm` has its own `AGENTS.md` or `CLAUDE.md`, rules and skills. Follow the ones of the repository being changed.

## Process

1. Design first. Follow the Drive process (`drive-process` skill) from a project spec: write the spec and design notes, settle the open questions with Will, then plan slices. Do not start implementation until Will has approved the design.
2. Then orchestrate implementation slice by slice, using Opus subagents for implementation, following the Drive process and `drive-code-review` after each slice.
3. Coordinate versions. The `prisma` host pins exact versions of `@prisma/composer` and `@prisma/composer-cli`. Composer changes publish first; then the host bumps its pins and mounts the new commands. Plan the pull request order so that no published release has the host expecting a family surface that Composer has not published.
4. Do not create Linear tickets for plan items unless Will asks. TML-3340 already exists and is used for part 4.

## Open questions for Will

Do not guess these. Ask Will before the design is written up.

1. **Which commands come into `prisma`?** `destroy` is required. Is `log` required too, or was the 2026-08-21 review's decision to retire it from the `prisma` surface still the position? And what is `destroy` called in `prisma`: `destroy`, or `branch delete` as the earlier consolidation plan proposed?
2. **Migration for existing users.** Release-candidate users have `prisma-composer.config.ts` today. Is a diagnostic telling them to move the contents enough (constraint 4), or is an automatic migration required (a command that rewrites the file, or `prisma init` detecting the old file)?
3. **Does the same agent own TML-3340?** The ticket is written as standalone work and is urgent. This brief folds it in as part 4 so that the docs are only rewritten once, after the commands exist. If Will wants the docs fixed sooner, part 4 splits: fix the skill and guides now for the commands `prisma` already has, then again after parts 1 to 3.
4. **Which repository holds the project artifacts.** The agent starts in `prisma/orm`, but almost all code changes are in `prisma/composer` and `prisma/prisma-cli`. Confirm where the Drive project folder (spec, design notes, plan) should live. Recommendation: `prisma/composer`, because most of the change is there.

## Done when

- A Composer example project in `prisma/composer` has one config file, `prisma.config.ts`, with a `composer` section, and no `prisma-composer.config.ts`.
- `prisma deploy`, `prisma dev`, `prisma destroy` (or its agreed name) and any other agreed command work from the `prisma` binary against that project.
- A wrong `effect` version produces a diagnostic from `prisma`, and unrelated `prisma` commands still run in that state.
- A project with the old file gets a diagnostic naming the file and the fix.
- The `prisma-composer` binary is gone from every published package.
- TML-3340 is done: no guide, README, example or skill in `prisma/composer` or Composer page in `prisma/web` names `prisma-composer` as a command or names `prisma-composer.config.ts`, and a CI check enforces it.
