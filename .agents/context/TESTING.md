# Testing

Rules for writing tests, and for asking for them in review. Commands and runners are in [AGENTS.md](../../AGENTS.md#commands).

## What to test

- Test behavior that can break: install and VPK file operations, profile switching, parsers for external formats, store migrations, API auth and permission guards, queue and lock handling, race fixes, and the logic a bug fix changed.
- Leave out tests for what types already guarantee, trivial helpers, copy text, mock-call mirrors, callback wiring, and props rendered to static markup.
- Extend before you add. When an existing test or table covers the behavior, add a row or an assertion there. Write a new test only when no case fits.
- Test at one layer: the lowest one that fails on `main`. Keep the case out of wrapper tests, call sites, and both sides of an IPC or DTO boundary.
- Follow the owning package's test layout and naming. Documentation-only changes need no tests.

## Proof for a bug fix

Pick the first row that matches:

- **Presentation only** (spacing, color, alignment, a layout shift): before and after captures, and no test.
- **Desktop behavior a user can reproduce in the app**: add or extend one E2E case; see [verify-desktop](../skills/verify-desktop/SKILL.md#regression-coverage). Add a lower-level test only when it catches a failure that case does not.
- **Any other logic, data, state, or protocol bug**: a failing test first, then the fix. Use the fewest tests that fail on `main` for that reason.

## Waiting for work

Await the promise, event, or state change that marks completion. Use a real deadline only when a timeout, cancellation, or process termination is the behavior under test.

- Use fake timers for code that schedules work. Assert on events and counts, never on elapsed time.
- Fix a flaky test instead of adding a retry or a longer timeout.
- A failing or flaky test you disable names its tracking issue on the line above: `// quarantine: #1234 <why>`. Platform and service prerequisites belong in the test's own condition (`skipIf`).

## In review

- Ask for a missing test only when it would catch a real regression nothing else catches.
- Flag a new test that breaks the rules above and name the fix: fold it into the existing case, delete it, keep one layer, or move it down a layer.
