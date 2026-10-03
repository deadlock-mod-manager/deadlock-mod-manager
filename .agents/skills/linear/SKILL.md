---
name: linear
description: Read Linear tickets and resolve their comments, dependencies, and acceptance criteria; update tickets when the user requests it.
---

# Linear

Use the connected Linear plugin or MCP server. Discover available tools rather than assuming a particular naming prefix or create/update API.

- Read the issue, comments, relations, team, and project before implementing. Use ticket identifiers or URLs supplied by the user; resolve ambiguous matches before writing.
- Read team statuses and labels before changing them. Preserve existing labels when an update replaces the whole label set.
- Confirm bug reports through reproduction before creating an issue. DMM does not accept issues based on static analysis alone.
- Implementing code does not authorize comments, assignments, or status changes. Make only the ticket writes the user requested.
- Keep descriptions concise: observable problem, reproduction evidence, expected behavior, or checkable acceptance criteria. Report writes with the issue identifier and URL.
- Do not assume the agency repo's team prefix, labels, cycle policy, or GitHub integration applies to DMM.

If tools are unavailable, use the user's supplied ticket text and identify missing context. Configure Linear through the user's agent client; keep OAuth credentials out of this repository.
