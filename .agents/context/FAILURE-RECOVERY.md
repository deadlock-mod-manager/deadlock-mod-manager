# Failure and recovery review

Use this for cancellation, retries, locks, authorization, filesystem mutations, and removal of behavioral guards or regression tests.

## Before changing behavior

Identify the operation's owner, its callers, when success becomes durable, and what remains after failure. Trace existing recovery behavior and relevant history before tightening error handling. A missing source can mean an operation was already completed; prove that from the destination state rather than treating every failure as success.

Before removing a guard or test, name the scenario it protects, explain why that scenario is impossible or covered elsewhere, and identify the surviving behavioral test. If the reason is uncertain, preserve it. Simplification alone is not evidence that a race or recovery case is unnecessary.

## Verify the affected operation

Choose the applicable failure sequences and make them deterministic:

- Failure after the first durable change, including failure of cleanup itself.
- A request that never returns, or returns after cancellation, release, or a new attempt.
- Overlapping calls and both completion orders, including repeated cancellation.
- Retry or restart after partial success, with the original data and recovery information preserved.
- Legitimate reuse: re-enable an installed mod, reuse a completed extraction, and distinguish unavailable input from an empty result.

Use controlled promises or clocks for timing and disposable files for filesystem faults. Check final state, bytes, ownership, and recoverability, not only logs or toasts. Exercise the real operation; a success-only stub cannot verify failure handling. Prove a regression test fails when its corresponding defect is restored, then restore the fix and rerun it. Use an isolated fixture or checkout when needed to protect concurrent work.

## Review and handoff

Keep each change centered on one behavior that the maintainer can explain. For high-risk changes, use an independent reviewer with the diff, callers, and intended contract before sharing the implementer's explanation. Require a concrete failure sequence and verify it against the code before fixing it.

After two substantive review rounds uncover new defects in the same mechanism, revisit its states, ownership, and commit points before another patch. Recheck each fix for new interleavings and partial states. A pre-existing defect still matters if the change makes it reachable or more likely.

The handoff names the behavior changed, failure behavior, executed evidence, and remaining uncertainty. Record deferred verified risks explicitly; passing checks do not establish that an untested failure path is safe. Convert recurring findings into a type, shared operation, regression test, or precise lint rule.
