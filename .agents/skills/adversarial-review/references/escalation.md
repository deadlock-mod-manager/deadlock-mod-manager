# Escalating to independent reviewers

Read this only when Step 4 of SKILL.md decided to escalate.

A subagent starts with none of this conversation's context. That is the entire value — it cannot inherit the assumptions that produced the artifact. It also means the brief must stand alone: a reviewer that has to guess what it is reviewing produces guesses.

## Step A: Write the brief

Compose the brief inside the subagent prompt. Do not write it to disk — this skill is read-only, and a temp file adds cleanup for no gain.

The brief contains, in order:

1. **What to review** — a file path the reviewer can read itself, or the literal text if the target is the conversation or pasted content. Prefer paths: a path lets the reviewer read the real thing rather than a summary of it.
2. **What kind of artifact it is** — plan, ADR, spec, code, conversation.
3. **Constraints the artifact states** — so the reviewer doesn't report a violation of a rule the artifact already declared out of scope.
4. **The assigned lens** — one lens per reviewer (see Step B).
5. **The stance and the gate** — copy the rules of engagement and the self-refute gate from SKILL.md Steps 5 and 6 into the prompt. A reviewer without the gate returns polish suggestions.
6. **The return format** — findings as a list, each with location, one-sentence defect, concrete failure scenario, and evidence. Tell it the return value is data for another agent, not a message to a human.

When the target is the conversation, the brief must reconstruct it honestly. Include the decisions and the claims made about the codebase — including the ones that turned out convenient. Omitting a shaky claim from the brief guarantees the reviewer won't catch it, which defeats the exercise. Give file paths for every claim so the reviewer can check them itself.

## Step B: Fan out

Spawn reviewers in a single message so they run concurrently. Assign each a **different** lens from the artifact's section in `lenses.md` — perspective diversity finds failure modes that three identical reviewers cannot.

Default: three reviewers. For a large diff or a plan with many independent parts, split by area instead of by lens and give each reviewer the full lens list for its area.

| Reviewer | Typical assignment for a plan                                                                 |
| -------- | --------------------------------------------------------------------------------------------- |
| 1        | Premises — verify every claim about the current system against the code                       |
| 2        | Gaps — missing steps, rollback, partial-failure states, unbounded work                        |
| 3        | Approach — is there a materially simpler path, and what does this one make permanently harder |

Prefer a read-only / explore subagent for verification. Use a general-purpose subagent only if the reviewer needs to run commands.

## Step C: Model override

If the user named a model, pass it through when spawning the subagent, using whatever model identifier the current environment accepts. Do not translate it into a different vendor's names.

When the target is the current conversation and no model was named, ask which model to use — or default to a different one than the session's and say so in the output. A model reviewing its own reasoning is the weakest configuration available, and the point of the request was usually to avoid exactly that.

## Step D: Verify

Do not report a subagent's findings as-is. Subagents produce plausible-sounding findings that don't survive contact with the code, and passing them through unchecked spends the user's trust on the review.

For each returned finding:

1. Read the cited location yourself.
2. Check whether the artifact or the code already handles it.
3. Confirm the failure scenario is concrete — specific state leading to a specific wrong outcome.

Then apply the self-refute gate from SKILL.md Step 6. Findings that survive get `CONFIRMED`; ones whose reasoning holds but that could not be traced get `PLAUSIBLE` with the blocker named.

For a finding that would change the user's decision and resists verification either way, spawn a single refuter: give it the finding and instruct it to argue the finding is wrong, defaulting to "not a real defect" when uncertain. Drop the finding if the refutation holds.

## Step E: Merge

- Deduplicate across reviewers by location and defect — two reviewers reaching the same finding independently is corroboration, not two findings. Report it once and note the independent agreement.
- Rank by blast radius of the failure scenario, not by how many reviewers mentioned it.
- Report what was covered and what wasn't. If reviewers were split by area, name any area no reviewer received. Silent partial coverage reads as "everything was checked" when it wasn't.
- Report the number of reviewers and the model used, so the user can weigh the result.