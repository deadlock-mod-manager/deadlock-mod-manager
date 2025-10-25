# Commit Staged Changes

Generate a conventional commit message and commit staged changes, respecting the project's commitlint configuration.

## Instructions

### 1. Gather Context

Run the single git command from [100-git-conventions](mdc:.cursor/rules/100-git-conventions.mdc) to gather all context:

```bash
echo "=== BRANCH ===" && git rev-parse --abbrev-ref HEAD && echo "=== STAGED FILES ===" && git diff --staged --stat && echo "=== STAGED CHANGES ===" && git diff --staged
```

### 2. Analyze & Generate

From the gathered information:

- Extract the GitHub issue number if available from branch name or changes
- Identify affected packages/apps from file paths → determine scope
- Analyze the nature of changes → determine commit type
- Generate commit message following the format in [100-git-conventions](mdc:.cursor/rules/100-git-conventions.mdc)

### 3. Present & Execute

Show the generated commit message in a code block:

```text
type(scope): description

Optional body text

Closes #123
```

Explain the ticket number, type, and scope chosen.

Then **execute the commit**:

**For commits with body:**

```bash
git commit -m "type(scope): description" -m "Body paragraph" -m "Closes #GITHUB_ISSUE"
```

**For commits without body:**

```bash
git commit -m "type(scope): description"
```

After committing, show the commit hash and confirm success.

### 4. Error Handling

If the commit fails (e.g., commitlint validation fails):

- Show the error message
- Explain what went wrong
- Suggest how to fix it or offer to generate a new message

## Key Points

- Follow the conventional commits format: `<type>(<scope>): <subject>`
- Use imperative, present tense for subject and body
- Body is optional unless adding context or breaking changes
- Footer with `Closes #123` is optional but recommended for feat/fix commits
- See [100-git-conventions](mdc:.cursor/rules/100-git-conventions.mdc) for complete format rules

## Example Usage

**User:** "commit", "commit staged changes", or `/commit`

**Response:**

1. Run single git command to gather context
2. Extract ticket number, analyze changes, determine type and scope
3. Generate properly formatted commit message
4. Show the message in a code block
5. Execute the git commit command
6. Confirm success with commit hash
