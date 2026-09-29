# Planning notes: start here

Private notes for planning Prisma 8 GA with Will Madden. They live only on the local branch `worktree/prisma-orm-planning-51fed0` of the `prisma/orm` checkout. Never push this branch or open a pull request from it.

If you are an agent picking up this discussion, read this file, then [plan.md](plan.md). Read the other files only when the discussion needs them.

## Files

| File | What it holds | How current |
| --- | --- | --- |
| [plan.md](plan.md) | Every decision Will has made, the order of work, blockers, and tasks | Kept current. This is the source of truth. |
| [query-feature-gaps.md](query-feature-gaps.md) | What Prisma 7 queries can do that Prisma 8 cannot | Gathered 2026-09-28. Several entries were found to be stale. Check the code before relying on a line. |
| [eval-friction-2026-09-28.md](eval-friction-2026-09-28.md) | The 36 friction items from one nightly run of the getting-started eval, sorted by owner | A snapshot of one run |
| [open-projects.md](open-projects.md) | First inventory of Linear projects and open pull requests | A snapshot of 2026-09-28. Superseded by plan.md where they differ. |

## How to work with Will in this discussion

1. This is a discussion. Do not produce drafts, strategies or documents unless Will asks. Ask, listen, and record what he decides.
2. Plan for the team as a whole. Do not ask who builds what, and do not comment on how work is split between people.
3. Stay on the big picture unless Will asks for detail.
4. Answer factual questions from the code, the pull requests and Linear before asking Will. When you state that something exists or is missing, say whether you verified it.
5. Treat notes that Will pastes in as input, not as decisions, unless he says otherwise.
6. When Will decides something, write it into plan.md in the same turn and commit it on this branch.
7. Keep tracking in these files. Do not create Linear tickets for plan items unless Will asks. TML-3340 is the one exception so far.
8. Write short, plain English. Follow the global rules in `~/.claude/CLAUDE.md`.

## How to refresh the facts

Linear and the ported test records drift from the code. Before relying on a status:

- Open pull requests by the bot: `gh search prs --author wmadden-electric --state open`
- Whether a ticket is done: search pull requests for its identifier, then read the code.
- The eval: the newest scheduled run of "Nightly getting-started check" in `prisma/getting-started-eval`. The `report` artifact holds `report.md` and `report.html`.
- Public positions: `apps/docs/content/docs/orm/coming-from-prisma-orm-7.mdx` and `release-status.mdx` in `prisma/web`.
- Designs in progress sit on local branches in other worktrees: `data-types-completion` (rest of ADR 254) and `tml-3282-sql-expression-literals`. Read them with `git show <branch>:<path>`.

## Open questions, as of 2026-09-29

Will has not answered these yet. Ask them when the discussion resumes, a few at a time.

1. Nested writes on relations: Will agreed they can technically ship after GA. Confirm whether the team still aims to have them at GA.
5. Which of the 40 open upgrade issues are required for GA? Two Linear projects hold them. Will prefers to leave this until the big picture is settled.
6. What is the stopping point for the Prisma 7 schema gaps?
7. What project does the ORM scenario of the eval build?
8. Two documents claim the number ADR 256, and two ADR files carry the number 255.
9. Sixteen Linear issues are marked In Progress with no evidence either way. They are listed in the conversation of 2026-09-28 and in [open-projects.md](open-projects.md), section 2.3.

## Work agreed for after the plan is finished

- Update every record that contradicts the code: the ported test records and the documents listed in query-feature-gaps.md.
- Decide whether plan items become Linear tickets.
