# DMM babysitting policy

Use the shared workflow in [SKILL.md](../SKILL.md) with these repository rules.
The user's explicit readiness criteria take precedence when supplied.

## Checks and reviews

Use required checks when configured. If none are required, every check gates
readiness except:

- The `CodeRabbit` check itself: inspect its posted feedback and review state.
  Unresolved actionable threads and the latest `CHANGES_REQUESTED` from any
  reviewer still block readiness, including CodeRabbit.
- `Vercel - *` / `Vercel – *` and `Vercel Preview Comments`: gate only when the
  PR touches `apps/www`. Docs deploy on main and have no PR deployment check.
- Jobs intentionally skipped, such as E2E without the `e2e-full` label:
  report them without waiting for an execution that will not happen.

If a bot's changes-requested review is obsolete after fixes, request a fresh
review with `@coderabbitai review` rather than claiming the old review passed.
When a failure also reproduces on the base branch, report it and ask whether
to exclude it unless the user's criteria already cover it.

## Verification, history, and decisions

Follow repository `git-conventions` for shared staged work and scoped commits.
Use its `rebase` / `fix-pr` skills as appropriate, with the PR's actual base;
keep fixes in their owning commits when that follows repository history rules.
Verify the affected behavior before pushing. For desktop UI and IPC, follow
`verify-desktop` and the current user's authorization for starting the app.

Ask in one batch about security, authentication, personal data, migrations,
production data, architectural changes, or out-of-scope work. Routine false
positives may be declined with verified evidence; ask if the correct behavior
is genuinely disputed. Give a recommendation and stop watching for handoff.

A babysitting request alone does not authorize merging, enabling auto-merge,
or promoting a draft. Report readiness and leave those actions to the user
unless the user explicitly requested a workflow that authorizes them.
