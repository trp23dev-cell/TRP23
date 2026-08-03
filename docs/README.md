# TRP23 Documentation

Everything written about this project, in the order you would need it.

> **New here?** Read [00-vision/TRP23_Master_Vision_and_Development_Plan.pdf](00-vision/TRP23_Master_Vision_and_Development_Plan.pdf), then [01-audit/MASTER-REPOSITORY-AUDIT.md](01-audit/MASTER-REPOSITORY-AUDIT.md), then [04-plan/MASTER-PLAN.md](04-plan/MASTER-PLAN.md). That is the whole picture in three documents.
>
> **Here to build?** Go straight to [04-plan/MASTER-PLAN.md](04-plan/MASTER-PLAN.md) and take the next open work package.

---

## The folders

| Folder | What lives here | Who writes it |
|---|---|---|
| **[00-vision/](00-vision/)** | The founding intent. The Trapology Bible (14 volumes), the master directive, the team brief. **Doctrine.** | Founder |
| **[01-audit/](01-audit/)** | Evidence-based assessments of what actually exists. Dated, never edited after the fact — a stale audit is still a true record of that date. | AI / engineer |
| **[02-design/](02-design/)** | How systems should work: missions, premises, NPCs, economy, world. Design, not implementation. | AI + founder |
| **[03-technical/](03-technical/)** | Architecture, pipelines, platform targets, performance budgets, testing strategy. | AI / engineer |
| **[04-plan/](04-plan/)** | **The system we follow.** Master plan, horizons, work packages, human task lists, decision register. | AI + founder |
| **[05-operations/](05-operations/)** | Running the thing: deployment, releases, real-world integrations, legal register, runbooks. | AI + founder |
| **[06-log/](06-log/)** | What actually happened, session by session. Append-only. | AI / engineer |
| **[_superseded/](_superseded/)** | Kept for history, **not** current. Every file carries a banner saying what replaced it. | — |

---

## Source of truth

When two documents disagree, this table decides. It is the single most useful thing in this folder.

| Question | Authority |
|---|---|
| What are we building, and why does it matter? | `00-vision/` — the Bible and the master plan |
| What does the code actually do today? | `01-audit/MASTER-REPOSITORY-AUDIT.md` |
| How should a system behave? | `02-design/` |
| How is it built? | `03-technical/` |
| What do we do next? | `04-plan/MASTER-PLAN.md` |
| What did we decide, and when? | `04-plan/DECISION-REGISTER.md` |
| What has to become real before launch? | `05-operations/REAL-WORLD-INTEGRATION-REGISTER.md` |
| What happened last session? | `06-log/CLAUDE-EXECUTION-LOG.md` |

**Never** treat `_superseded/` as current, and never trust `README.md` in the repo root over an audit — it has claimed things that were not true for weeks at a time.

---

## Rules for these documents

1. **Date everything.** A document without a date cannot be judged.
2. **Supersede, do not delete.** Move the old file to `_superseded/` with a banner naming its replacement. History is evidence.
3. **Do not mark work done in a plan because the code was written.** Done means verified — the commands were run and the output recorded in `06-log/`.
4. **Design documents state open questions explicitly.** An unanswered question is more useful written down than quietly assumed.
5. **Audits are never retro-edited.** Write a new one.

---

## Current status at a glance

| | |
|---|---|
| **Phase** | Horizon 0 — stabilise and understand |
| **Client direction** | Unity is the product; the web build is frozen ([audit §G](01-audit/MASTER-REPOSITORY-AUDIT.md)) |
| **Targets** | PC, iOS, Android now; consoles later |
| **Blocking founder decisions** | See [04-plan/DECISION-REGISTER.md](04-plan/DECISION-REGISTER.md) |
