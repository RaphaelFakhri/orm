# Nullable scalar lists — close-out verification

## Delivery evidence

- Feature [PR #30051](https://github.com/prisma/orm/pull/30051) merged as `982bca13644e9d7cdd9702c97a10d9d20482efeb` at 2026-10-01T15:33:16Z; final PR head `04aa4fa8e04d786a87f37dca1593e2eb701ce79d` passed all 27 checks. Required merge-queue checks passed; integration tests were skipped on the queue run, not the PR run.
- Mongo container-validation follow-up [PR #30568](https://github.com/prisma/orm/pull/30568) merged as `84b3bb693c395ec21ccf2de97d5db4787c805d03` at 2026-10-01T18:31:49Z; all 27 PR checks passed.
- The four planned slices (representation, SQL enforcement, SQL typing, Mongo) shipped together in #30051. None is deferred. The follow-up closes the explicit-null-container QA finding rather than adding a fifth planned slice.
- Both PRs were queried again through paginated GraphQL `reviewThreads(first: 100, after: ...)`: #30051 has nine threads, all resolved; #30568 has zero threads. Each query completed one page with no next page. No GitHub comment or reply was posted.
- No Linear project or ticket exists, by the operator's explicit original direction. Its creation and completion gates are not applicable.

## Acceptance and team-DoD verification

| Spec item | Disposition and evidence |
| --- | --- |
| D1 — inherited team floor | Merged Build, Type Check, Lint, Fixtures, Package Tests, Integration Tests, Test Examples, E2E, Coverage and Supabase Acceptance checks passed on both PRs. Dependency lint passed during implementation/fix verification and is repeated for this close-out. Artifact compatibility is the explicit exception below, not an ordinary pass. No new package was introduced. |
| D2 — parsing, SQL/Mongo interpretation, emission and token formatting | Met in #30051; matrix coverage and parser/token-formatter tests shipped. Fresh QA scenarios 1 and 3 additionally exercise public authoring and emission, not a new formatter run. Semantic printing was explicitly excluded. |
| D3 — nested domain/storage cardinality and waiver distinction | Met in #30051. QA scenarios 1 and 4 confirm nested descriptors, scalar omission normalization, explicit-waiver separation and rejection of legacy `many: true`. Strict-list JSON/hash byte-stability was intentionally superseded; DDL remains unchanged. Historical snapshot compatibility was not established by mutating a fresh artifact. |
| D4 — emitted and inferred TypeScript matrix | Met by merged type tests. QA scenario 5 adds generated-type and SQL no-emit checks; it does not claim an independent Mongo ORM no-emit result proof. |
| D5 — SQL/Mongo TS authoring parity and literal-only options | Met by merged value/type tests and public-consumer positive/negative probes. Both builders use `.optional()` for nullable containers. |
| D6 — PostgreSQL checks, add/drop lifecycle, inserts and verification | Met by merged lifecycle integration coverage; QA scenario 2 independently checks real catalog constraints, strict negative controls and clean verification on a fresh PGlite database. Historical transitions were not rerun in manual QA. |
| D7 — PostgreSQL runtime null-element reads/writes | Met by merged runtime/integration tests and public ORM QA round-trip with actual JS nulls. |
| D8 — Mongo validator, result-shape and runtime/ORM coverage | Met by #30051 plus #30568. The initial manual failure is retained; the scoped post-fix real-Mongo rerun accepts null containers and nullable elements while rejecting strict null elements with code 121. The fix includes 56 distinct real-Mongo regression cases. Manual QA exercises emitted validators/direct-driver writes, not the ORM path; merged tests cover the latter. |
| D9 — durable semantics and ADR | Met by ADR 258 (renamed from the colliding list ADR 248), indexed under Contract & Schema. ADR 178 has a narrow supersession pointer. The unrelated PostgreSQL ADR 248 and duplicate ADR 255 files are unchanged. |
| Mandatory final retro | Complete on 2026-10-01; `retros.md` records the final disposition and the lesson is retained in `drive/retro/README.md`. |
| Manual QA | Original failed run and scoped successful rerun retained in `manual-qa-run.md`; F-2 and F-3 resolved by merged #30568, F-1 resolved in the post-run script revision. No fresh all-scenario run or database-suite rerun is claimed during close-out. |

## Explicit compatibility exception

The operator required nested descriptors and rejection of legacy `many: true`; this shipped in #30051 with `upgrade-instructions/pending/nullable-scalar-lists/`. The default team floor requiring unchanged loading of previous-format historical artifacts is **not met** by that decision. The operator authorized close-out with this specific exception after the conflict was surfaced. ADR 258 records the rationale, historical-snapshot upgrade obligations and limits; no global compatibility policy is changed and no shim is introduced.

Strict-list contract JSON and affected hashes change even though strict-list PostgreSQL DDL does not. Consumers must inventory historical states and coordinate regenerated contract pairs and references, retaining applied production history and rehearsing identity/marker reconciliation rather than automatically rewriting production snapshots. This is distinct from the later Mongo validator fix: consumers already on nested descriptors retain historical snapshots and apply a **new** validator migration. Neither fresh serializer negative controls nor green CI are presented as proof of universal historical upgrade safety.

For trace vocabulary, the final disposition is `some-cancelled`: the obsolete byte-stability/legacy-load requirements were superseded with explicit rationale, not deferred as unfinished work. All four feature slices are complete.

## Resolved-decision mapping

| Decision | Durable home and final interpretation |
| --- | --- |
| 1 — operator-ordered nested IR | ADR 258, “Element nullability is an independent field-shape axis”, “Native SQL array storage carries the same semantic fact”, and “Compatibility and historical artifacts”. Domain scalar omission remains supported; lists require nested descriptors, native SQL storage carries the semantic marker, and explicit waivers remain separate. |
| 2 — verify signal | ADR 258, “Semantic nullability and enforcement waivers remain distinct”, and ADR 244's inference rule. Absent CHECK does **not** imply semantic nullable elements; inference emits a strict list plus `@noCheck(elementNotNull)`. Migration comparison observes physical checks, not a schema-IR nullability marker. |
| 3 — TS authoring | ADR 258's concrete matrix and builder example: `.many({ elementsNullable: true })`, literal-only options, independent `.optional()`. |
| 4 — value-object lists | ADR 258's domain/native-storage distinction and family enforcement sections preserve domain element semantics without treating JSONB storage as a native SQL array. Scalar lists were the acceptance target; additional value-object support was not a separate close-out gate. |

## Classification and deletion plan

All nine originally tracked project files are transient. No whole-file migration is needed; durable decisions are already in ADR 258, with the compatibility/inference amendments above. Default transient classification was authorized by the close-out request and needs no routine reconfirmation.

| File relative to the project directory | Classification | Rationale |
| --- | --- | --- |
| `spec.md` | transient | Shaping and acceptance record; all four decisions mapped above. |
| `plan.md` | transient | Delivery sequencing. |
| `slices/representation/spec.md` | transient | Slice acceptance record. |
| `slices/representation/plan.md` | transient | Dispatch coordination. |
| `slices/sql-enforcement/spec.md` | transient | Slice acceptance record. |
| `slices/sql-enforcement/plan.md` | transient | Dispatch coordination and historical gate notes. |
| `slices/mongo/spec.md` | transient | Slice acceptance record. |
| `slices/mongo/plan.md` | transient | Dispatch coordination. |
| `slices/mongo/status.md` | transient | Historical implementation validation notes. |

The five new evidence files (`closeout.md`, `manual-qa.md`, `manual-qa-run.md`, `retros.md`, `trace.jsonl`) are also transient. Preserve them in the first DCO-signed evidence commit, then delete the directory in the second DCO-signed commit. The PR will link to the immutable first commit. Archive the ignored `reviews/code-review.md` locally and move the trace to ignored `wip/` before deletion; emit `project-closed` there after PR opening without recreating the project directory.

## Close-out execution gates

- [x] Both implementation PRs merged with all 27 checks successful and no unresolved review threads.
- [x] Required behavior and mandatory final retro verified; no feature slice deferred.
- [x] Initial QA failure preserved and final finding dispositions appended.
- [x] Compatibility exception and all four decisions recorded durably; no runtime or production-snapshot changes.
- [x] ADR 258 number availability verified against the existing maximum 257; index and ADR 178 pointer updated.
- [x] Nine original tracked files and five evidence additions classified transient; no whole-file migrations.
- [x] External-reference scan includes decoded paths and resolved relative Markdown links: zero external references, zero stale list-ADR paths and zero broken local file links in changed tracked documents. `pnpm lint:deps`, `lint:docs`, `lint:skills`, `lint:rules`, `lint:rules:symlinks`, `lint:rules:footprint` and `git diff --check` passed. Docs lint retains pre-existing missing-Responsibilities warnings. Re-run the scan after deletion; record its outcome in the PR.
- [ ] Two DCO-signed commits, project deletion, push and non-draft close-out PR (record immutable evidence SHA and final SHA in the PR/report).

## Historical local validation limits

The feature's full local lint passed 102 tasks and 16 additional CI lint scripts. Full local typecheck passed 170 of 171 tasks; only the Prisma 7 example was blocked by a NixOS engine-download 404. The full local package run passed 21,150 tests but encountered fixture-copy permission failures and package-install trust-check failures; one timeout passed on retry. The final affected Mongo feature tests passed 448/448 and integration tests 798/798. These were not fully green aggregate local runs.

The fix's initial scoped verification passed 456 affected unit tests, 712 reported Mongo integration tests and 56 distinct regression cases (overlapping counts, not additive). Later finalization passed 2,309 Mongo-family tests, 55 retail-store example tests, fixtures and lint; local typecheck retained the same environment limitation. Both PRs subsequently passed remote verification in full. This documentation-only close-out relies on those merged implementation checks rather than rerunning database suites or regenerating examples.
