---
name: pr-description
description: Write a pull request body a reviewer can predict the diff from, scaled to the size of the change. Use when creating, rewriting, or filling in a PR description.
---

# PR Description

A reviewer reads the description before the diff. Write so they could predict the diff, and so a reader six months later understands why the change was needed.

Length follows the diff, not the effort. A long description on a small diff buries the one thing they needed.

## When to use

- Creating, rewriting, or filling in a pull request body.
- The description has to stand on its own for review.

## Scale

Start from the row that matches the change, then add a section only when its trigger fires.

| Change | Body |
| --- | --- |
| Copy, config, dependency bump, typo | Ticket line and one sentence. No headings. |
| Single concern, a handful of files | Ticket line, 1–3 sentence summary, test plan. |
| Several independent changes, or non-obvious reasoning | One numbered section per change. A diagram only where it beats a sentence. |

Add, at any size: a callstack when call flow changed, a before/after table when data outcomes changed, the artifact you looked at when you verified by looking, a follow-up ticket when something is left undone.

## How to write it

**Lead with the ticket.** First line, before any heading, with a magic word (`fixes`, `closes`, `refs`) and a link. Name absorbed tickets and filed follow-ups here too. Skip the line only when the repo has no tracker and the change has no issue.

**Explain the change, not the diff.** The Files tab already has the diff. For a fix: which real scenario broke, why the old code looked correct, and why the new code is. For a feature: what was impossible before, and what the design commits to. When there are several changes, one sentence naming the shape they share comes before the numbered sections.

**Be concrete.** Real identifiers, values, and file names. Cut any sentence that does not change what the reviewer does: subsystem recaps, restating the diff, background the ticket already covers, self-justification, notes about your own process.

**Show both states in one frame** when a sentence cannot settle the mismatch. One fenced block, both sides labeled, the disagreeing line marked. If a sentence settles it, write the sentence.

**Number sections when there are several**, and reference them from the test plan (`§3`) so each test defends a claim.

**Callstack** when who-calls-whom changed. Paste `npx calldiff@latest diff` output (see [095-calldiff.mdc](../../../.cursor/rules/095-calldiff.mdc)) and narrate the `+` / `-` lines. Skip for copy, translations, CSS, config, and schema-only changes. A heading that only reports the tool found nothing is worse than no heading.

**The test plan proves the change.** Name each new test, map it to the section it defends, and say it failed without the change. List updated assertions as from/to. Name the suites that ran, and pre-existing failures that also fail on the base.

**Predict data outcomes** with one row per user-visible quantity, where the numbers came from, and how someone else confirms them after merge.

**Attach the evidence.** A screenshot, recording, or captured output belongs in the section it supports, with alt text that says what the reviewer is looking at. Collapse everything except the one artifact that is the point of the PR.

## Title

The title becomes the squash commit. Follow [git-conventions](../git-conventions/SKILL.md): `type(scope): description`, imperative, under 100 characters. Check recent `git log --oneline` when the repo's convention differs.

## Related

- [095-calldiff.mdc](../../../.cursor/rules/095-calldiff.mdc) — callstack diffs for the Callstack section.
- [git-conventions](../git-conventions/SKILL.md) — title and squash-commit format.
