# Nullable scalar lists — final retrospective

## 2026-10-01 — Verify the complete rebased contract change before pushing

**Trigger:** Mandatory final retrospective after [PR #30051](https://github.com/prisma/orm/pull/30051) merged as `982bca13644e9d7cdd9702c97a10d9d20482efeb`.

**What happened:** The project delivered independent list-container and element nullability across SQL and Mongo, nested list cardinality descriptors, TypeScript authoring and emitted types, explicit SQL check-waiver semantics, and runtime null preservation. Repeated rebases incorporated upstream changes to authored nodes, domain/storage descriptors, codec interfaces, default rendering, and Mongo binding. Several pushes failed CI because focused validation omitted affected consumers and upstream tests. An attempt to make storage cardinality optional also exceeded the operator's requested optional-domain scope and was reverted.

**Root cause:** Verification followed manually edited files rather than the complete rebased change and its consumers. Staged-file formatting and focused package checks were treated as broader evidence than they provided. Automatic conflict resolution was not sufficient semantic verification: a later rebase introduced a duplicate import and stale whole-object expectations. The intended separation between optional domain cardinality and required storage cardinality was not kept explicit early enough.

**Landing surface(s):**

- Project-context: `drive/retro/README.md` § Recurring-pattern catalogue — repository-wide typecheck and lint after shared-contract rebases; affected tests and CI-specific checks; review automatic resolutions; report environment limitations without bypassing safeguards; verify the exact checked commit and merge queue; preserve the requested domain/storage scope.
- Existing architecture: ADR 248 records independent container/element nullability, nested descriptors, required SQL storage cardinality, and explicit `noCheck` semantics. Close-out audits the project's four resolved decisions against this durable record.

### What worked

The final verification found and fixed the missed Prisma 7 conversion, missing test codec decoders, formatting, and stale cardinality assertions. A final rebase onto the Mongo binder changes retained upstream resolution behavior and passed 448 affected Mongo package tests and 798 affected integration tests. All 27 PR checks passed on `04aa4fa8e04d786a87f37dca1593e2eb701ce79d`; merge-queue verification then completed and the PR merged. Regression tests preserved strict-list rejection, nullable-element null bypass, and the distinction between SQL storage lists and JSON-backed value-object lists.

### Verification limits

The full local package run passed 21,150 tests but encountered 39 fixture-copy permission failures, three package-install suites blocked by a trust-downgrade check, and one timeout that passed on retry. Full local typecheck completed 170 of 171 tasks successfully; the Prisma 7 example was blocked by an unavailable NixOS engine download. These limits were disclosed, no safeguards were bypassed, and the remote PR checks subsequently passed. Earlier project notes reporting blocked fixture comparison and pending validation are historical, not current CI results.

### Scope and remaining close-out gates

No feature slice was intentionally deferred. Semantic-printer acceptance, nested lists, relation-list element nullability, and non-Postgres SQL scalar-list support were not separate promised deliverables; the original scope and later implemented behavior must be distinguished during the final documentation audit. Fresh manual QA subsequently found Mongo rejecting explicit null list containers despite generated types accepting them: removing a field from `required` permits omission but does not make `bsonType: 'array'` accept null. The existing four-cell unit matrix repeated the erroneous schema expectation. The operator authorized a follow-up fix with failing-first unit and real-Mongo regressions; close-out remains blocked until those tests and the live QA pass. The ADR also uses `.nullable()` where the public builder exposes `.optional()`. The decision-to-document mapping additionally requires disposition of the deliberate legacy-list wire migration versus the inherited historical-snapshot policy. There is no Linear project or ticket, by the operator's original direction.

### Team summary

Independent nullable scalar-list elements are merged; the delivery lesson is to validate every affected consumer of a rebased contract change before pushing and distinguish code readiness from local environment limitations and merge-queue state.

## Final disposition after the Mongo fix merged — 2026-10-01

The earlier pending-gate paragraph is historical. [PR #30568](https://github.com/prisma/orm/pull/30568) merged as `84b3bb693c395ec21ccf2de97d5db4787c805d03` with all 27 checks passed. The scoped public-consumer rerun accepts explicit null containers while strict null elements remain rejected with code 121. Failing-first unit and real-Mongo regression coverage shipped, and the ADR examples now use `.optional()`. The original failed QA and its subsequent scoped rerun remain intact in `manual-qa-run.md`; no new full manual run is claimed.

The durable list decision is renumbered ADR 258, indexed, and narrowly supersedes ADR 178's `many: true` representation. The operator authorized closure after the historical-snapshot incompatibility was surfaced: the nested wire migration is an explicit project-specific exception to the usual artifact-compatibility floor, not a claim that the default floor was met or a global relaxation. ADR 258 records that exception and distinguishes its coordinated historical-state upgrade obligations from the Mongo fix's new validator migration with retained production history. The old strict-list JSON/hash stability and absence-of-CHECK ⇒ nullable assumptions are superseded; strict-list DDL remains unchanged.

All four resolved spec decisions have durable homes in ADR 258 (with ADR 244 for conservative inference). All four planned slices merged; no feature delivery is deferred. No Linear project or ticket was created. The already-landed `drive/retro/README.md` lesson covers both complete rebased-consumer validation and real database nullability probes, so the mandatory final retro has a durable result. The remaining mechanical steps are evidence preservation, transient-file deletion and the close-out PR.
