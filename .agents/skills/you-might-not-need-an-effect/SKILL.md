---
name: you-might-not-need-an-effect
description: Analyze code for useEffect anti-patterns per react.dev and optionally apply fixes
disable-model-invocation: true
---

Arguments:

- scope: what to analyze (default: your current changes). Examples: "diff to main", "PR #123", "src/components/", "whole codebase"
- fix: whether to apply fixes (default: true). Set to false to only propose changes.

Steps:

1. Read https://react.dev/learn/you-might-not-need-an-effect to understand the guidelines
2. Analyze the specified scope for useEffect anti-patterns
3. If fix=true, apply the fixes. If fix=false, propose the fixes without applying.
