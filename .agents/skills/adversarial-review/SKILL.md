---
name: adversarial-review
description: Adversarial review of any artifact — a plan, PRD, ADR, design doc, code diff, or the current conversation itself — from a hostile stance that tries to break it rather than improve it. Use when asked to "adversarially review", "red team this", "poke holes in", "attack this plan", "review our discussion", "what did we get wrong", "stress-test this", "steelman then break", "review this ADR/PRD/doc", or "find the flaws". Resolves the target, picks critique lenses per artifact type, self-refutes each candidate finding, and reports ranked findings with concrete failure scenarios. Read-only — never edits the artifact. Escalates to independent subagents (optionally on a different model) on request or for large targets.
---

# Adversarial Review

Attack an artifact until either a real defect surfaces or the artifact survives. Report what breaks it, not what would polish it.

The stance is the skill. A normal review asks "is this good?" — this one assumes the artifact is wrong and looks for the argument that proves it. Findings that cannot be stated as a concrete failure scenario are not findings.

## Step 1: Resolve the target

| Argument                                          | Target                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| (none)                                            | The current conversation — the plan, claims, and decisions reached so far |
| `this chat`, `our discussion`, `what we decided`  | Same as above                                                             |
| A file or glob path                               | That document, plan, ADR, PRD, or source file                             |
| A git ref, `the changes`, `this branch`, a PR URL | The diff against the merge-base                                           |
| A URL                                             | Fetch it and review the fetched content                                   |
| Pasted text in the prompt                         | That text                                                                 |

If the target is genuinely ambiguous — two plausible readings that would produce different reviews — ask once, then proceed. Otherwise pick the obvious reading and state it in one line before starting.

## Step 2: Read the target completely

No partial reads. A review of half an artifact produces findings the other half already answers, and those are worse than no findings.

- **Documents**: read the whole file, plus anything it links to that carries load (a referenced ADR, a linked ticket, a schema it depends on).
- **Diffs**: `git diff $(git merge-base HEAD origin/HEAD)...HEAD`. If output truncates, read each changed file individually until every changed line has been seen. List the files before proceeding.
- **Conversation**: enumerate the load-bearing claims and decisions made so far, in writing, before critiquing any of them.

Then verify the artifact against reality. An artifact's description of the codebase is a claim, not evidence — grep and read the actual code before accepting any statement about how the system currently behaves.

## Step 3: Pick the lenses

Read `references/lenses.md` (next to this skill) and load only the section matching the artifact type:

| Artifact                                          | Section               |
| ------------------------------------------------- | --------------------- |
| Implementation plan, migration plan, rollout plan | `## Plans`            |
| ADR, RFC, technical proposal                      | `## Decision records` |
| PRD, spec, requirements doc                       | `## Specs`            |
| Code, diff, PR                                    | `## Code`             |
| The current conversation                          | `## Conversations`    |
| Anything else prose                               | `## Documents`        |

Load one section, not the whole file. If the target spans types (a plan containing code), load both.

## Step 4: Decide inline or escalate

Run the review inline by default. Escalate to independent subagents when **any** of these holds:

- The user asked for it — `--deep`, a named model, "use subagents", "second opinion", "different model", "thorough".
- The target exceeds roughly 1500 lines or 15 changed files.
- The target is the current conversation **and** the user wants a model that did not participate in it.
- The inline pass surfaced a structural finding — one that invalidates the artifact's approach rather than a detail — and independent confirmation would change what the user does next.

To escalate, read `references/escalation.md` and follow it. Otherwise continue inline.

Reviewing the current conversation inline has a known blind spot: the reasoning that produced the plan is still in context, so its assumptions read as obvious rather than as assumptions. Compensate by attacking the premises hardest — and say in the output that the review was not independent.

## Step 5: Attack

Work each lens in turn. Rules of engagement:

- **Steelman first.** State the artifact's strongest version in one sentence. Attack that, not a weaker paraphrase of it.
- **Go for load-bearing claims.** One broken premise beats ten valid nits. If the artifact rests on an assumption that is false, nothing downstream matters.
- **Demand evidence for every factual claim.** "The service already handles retries" → find the retry logic. If it isn't there, that's a finding.
- **Hunt for what is absent.** Missing rollback, unhandled failure mode, an integration nobody named, a migration with no backfill, a decision the doc silently skipped. Absences do not announce themselves — walk the lens checklist explicitly rather than reading and reacting.
- **Take the artifact's own constraints seriously.** A finding that violates a constraint the artifact states up front is out of scope, not insight.

## Step 6: Self-refute before reporting

Every candidate finding faces this gate. Argue the opposing case as well as the artifact's own author would, then drop the finding if any of these is true:

- The artifact already handles it somewhere you had not yet read.
- No concrete failure scenario can be stated — specific inputs or state leading to a specific wrong outcome.
- It is a matter of taste, naming, or style with no failure attached.
- It restates a risk the artifact already names and accepts.

Surviving findings get a verdict:

| Verdict     | Means                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| `CONFIRMED` | The failure scenario was traced against the actual code or artifact text            |
| `PLAUSIBLE` | The reasoning holds but could not be fully verified — say what blocked verification |

Report a smaller set of confirmed findings over a longer padded list. Never pad to reach a count.

## Step 7: Report

Ranked most severe first. Nothing is written to disk.

```markdown
## Adversarial review: <target>

**Steelman:** <the artifact's strongest form, one sentence>
<if the review was not independent, one line saying so>

### 1. <finding, stated as the defect> — CONFIRMED

`path/to/file.ts:142` (or: section "Rollout", or: turn where the claim was made)

<One sentence: what is wrong.>

**Fails when:** <concrete inputs or state → concrete wrong outcome.>

**Evidence:** <what was read that establishes this — file:line, or the absent thing and where it was looked for.>

### 2. ...

### Checked and clean

- <lens or area>: <why it holds up>

### Could not verify

- <thing>: <what blocked it>
```

If nothing survives Step 6, say that plainly — list the lenses walked and what was verified. An artifact surviving an honest attack is a real result. Do not manufacture findings to justify the review.

## Anti-patterns

| Don't                                            | Why                                                     |
| ------------------------------------------------ | ------------------------------------------------------- |
| "Consider adding error handling"                 | No failure scenario, no location — unactionable         |
| Reporting style, naming, or formatting           | That's a different skill's job                          |
| Assigning severity by gut feel                   | Severity comes from the failure scenario's blast radius |
| Trusting the artifact's account of the code      | The gap between them is the most common real finding    |
| Reviewing an artifact half-read                  | Produces findings the unread half answers               |
| Softening a structural finding into a suggestion | If the approach is wrong, say the approach is wrong     |