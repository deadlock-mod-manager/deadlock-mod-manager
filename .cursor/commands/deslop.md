# Remove AI code slop

Check the diff against main, and remove all AI generated slop introduced in this branch.

This includes:

- Extra comments that a human wouldn't add or is inconsistent with the rest of the file
- Extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths)
- Casts to any to get around type issues
- Any other style that is inconsistent with the file

Report at the end with only a 1-3 sentence summary of what you changed

Use the following rules as guidelines:

- [030-coding-style](mdc:.cursor/rules/030-coding-style.mdc) - Coding standards
- [040-logging](mdc:.cursor/rules/040-logging.mdc) - Structured logging
