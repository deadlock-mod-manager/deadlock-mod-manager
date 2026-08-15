# Critique lenses by artifact type

Load only the section matching the target. Walk each item explicitly — the point of a checklist is to surface absences, which reading-and-reacting never does.

- [Plans](#plans)
- [Decision records](#decision-records)
- [Specs](#specs)
- [Code](#code)
- [Conversations](#conversations)
- [Documents](#documents)

## Plans

Implementation plans, migration plans, rollout plans.

- **False premise** — the plan assumes something about the current system. Verify each such assumption against the code. This is where plans most often die.
- **Missing step** — walk the plan as if executing it. At which step does an executor stop and ask a question the plan doesn't answer?
- **Wrong order** — does any step depend on a later one? Does step N leave the system in a broken state that step N+1 doesn't repair?
- **Unbounded step** — "update all callers", "migrate the data". How many are there? Grep and count. A step whose size is unknown is a step whose risk is unknown.
- **No rollback** — what undoes each destructive step? A migration without a down path, a deploy without a revert, a backfill with no idempotency.
- **Partial-failure state** — the plan fails halfway. Is the system consistent? Who notices?
- **Unowned coordination** — steps requiring another team, a deploy window, a credential someone else holds, or a manual action nobody is named for.
- **Success undefined** — how does the executor know a step worked? "Verify it works" is not a verification step.
- **Cheaper path ignored** — is there a materially simpler approach the plan doesn't mention? If so, say which and why it was likely dismissed.

## Decision records

ADRs, RFCs, technical proposals.

- **Alternatives strawmanned** — is each rejected option stated in its strongest form, or in a form convenient to reject? Steelman the strongest rejection and see if it still falls.
- **Missing alternative** — the option nobody wrote down, often "do nothing" or "buy instead of build".
- **Consequences one-sided** — does the record list costs as honestly as benefits? What does this decision make permanently harder?
- **Reversibility unstated** — how expensive is unwinding this in six months? One-way doors deserve louder scrutiny than two-way ones.
- **Context drifted** — the constraints that motivated the decision: do they still hold? Verify against the current code, not the record's description of it.
- **Conflicts with an existing record** — check sibling ADRs. A decision that quietly contradicts an accepted one is a finding.
- **Scope creep** — is the record deciding one thing, or smuggling three decisions under one title?
- **Unfalsifiable justification** — "more scalable", "cleaner", "more maintainable" with no metric, threshold, or scenario attached.

## Specs

PRDs, specs, requirements docs.

- **Ambiguous requirement** — find any sentence two engineers would implement differently. Each one is a defect.
- **Missing edge case** — empty state, single item, maximum size, concurrent access, retried request, partial data, permission denied.
- **Undefined error behavior** — for each operation that can fail: what does the user see, and what state is the system left in?
- **Unstated non-functionals** — latency budget, data volume, retention, audit requirements, i18n, accessibility.
- **Untestable acceptance criteria** — can each criterion be turned into a test? If not, it will not be verified.
- **Contradiction** — two requirements that cannot both hold. Check requirements against each other, not just individually.
- **Existing behavior ignored** — does the spec conflict with how the system behaves today, without saying it's a change?
- **Migration of existing data unaddressed** — the spec describes the end state. What happens to records created before it?

## Code

Diffs, PRs, source files.

- **Contract violation** — does the change honor every caller's expectation? Grep every call site, don't sample.
- **Error path** — every failure branch: is it handled, logged with enough context, and does it leave consistent state? Swallowed errors, bare `continue`, discarded `Result`.
- **Boundary** — empty, single, maximum, null, zero, negative, duplicate, out-of-order.
- **Concurrency** — read-then-write without a guard, non-idempotent handler, shared mutable state, unawaited promise.
- **Data correctness** — filtering in memory that should be in the query, unbounded fetch, N+1, a query missing a tenant or soft-delete predicate.
- **Security** — untrusted input reaching a query or template, an authorization check that only verifies authentication, PII in logs, secrets in error messages.
- **Type escape hatches** — `any`, double casts, non-null assertions. Each marks a place the author could not prove the invariant.
- **Test gap** — does a test exist that fails if this change is reverted? If not, the change is unverified.
- **Dead or duplicated** — code the change orphans, or a helper that reimplements an existing shared utility.

## Conversations

Reviewing the discussion so far. The bias risk is highest here: the reasoning being reviewed is still in context, so its assumptions read as background fact.

Start by writing out the load-bearing claims and decisions, numbered. Then attack the list, not the memory of it.

- **Unverified assertion** — a claim made about the codebase that nobody opened a file to confirm. Re-read the file now. Do not trust an earlier summary of it, including your own.
- **Assumption promoted to fact** — something proposed tentatively that later turns depended on as settled.
- **Question dropped** — an open question raised, then never answered, that the plan now depends on.
- **Premature convergence** — the first workable idea became the plan. What was never considered?
- **Scope drift** — compare what the user originally asked for against what is now being built. Name anything added that they did not ask for, and anything asked for that quietly fell out.
- **Agreement without verification** — the user approved something based on a description. Is the description accurate?
- **Stale conclusion** — a finding from early in the conversation that later work has invalidated.

## Documents

Any other prose: runbooks, postmortems, guides, proposals.

- **Claim without support** — every factual assertion: where's the evidence? Verify the checkable ones.
- **Instruction that fails** — for procedural docs, walk each step literally. Do the commands work? Do the paths exist?
- **Stale content** — does it describe a system that has since changed? Check against current code.
- **Audience mismatch** — does it assume knowledge its stated reader lacks, or explain what they already know?
- **Buried consequence** — the most important implication, mentioned once in a subordinate clause.
- **Missing failure mode** — for runbooks and postmortems: what if the remediation itself fails?