# AI Contribution Policy

> **Last updated:** February 2026

## Our Stance

Deadlock Mod Manager is built with AI assistance, and we're not shy about it. Our [Cursor configuration](https://github.com/deadlock-mod-manager/deadlock-mod-manager/tree/main/.cursor) is included in the repo because we believe AI tools are a legitimate and powerful part of the modern developer toolkit.

That said, AI tools amplify the skill of the person using them. A good developer with AI becomes faster. A developer who doesn't understand what they're contributing becomes a burden on maintainers, regardless of how the code was produced.

**This is not an anti-AI policy. This is a pro-accountability policy.**

## Rules for Contributors

### 1. You Own What You Submit

Every line in your pull request is your responsibility. If you used AI to generate code, you must:

- **Understand it fully.** If a maintainer asks why you made a specific choice, "the AI suggested it" is not an acceptable answer.
- **Have tested it.** AI-generated code must pass the same quality bar as hand-written code: linting, type checking, and manual verification.
- **Be able to modify it.** If a reviewer asks for changes, you should be able to make them without re-prompting an AI from scratch.

### 2. Disclose AI Usage

When opening a pull request that involved significant AI assistance (beyond autocomplete or minor suggestions), please note it in the PR description. A simple line is enough:

```
AI Assistance: Used [tool] for [what it helped with]
```

**Examples of what to disclose:**

- "Used Cursor to scaffold the initial component structure, then refined manually"
- "Claude helped debug the Rust compilation issue in the VPK parser"
- "GitHub Copilot generated the test cases, reviewed and adjusted by me"

**What doesn't need disclosure:**

- Tab completions and inline suggestions (Copilot, Supermaven, etc.)
- Using AI to understand the codebase or learn about a technique
- Grammar/spelling checks on documentation

This disclosure isn't about gatekeeping—it helps maintainers calibrate their review. If we know AI was involved, we can focus our review on the areas that matter most.

### 3. AI Pull Requests Must Be Tied to Real Work

We do not accept drive-by PRs that look like someone pointed an agent at our issue tracker and hit "go." Specifically:

- **PRs should address an existing issue or a discussed feature.** If there's no issue, open one first or discuss in our [Discord](https://deadlockmods.app/discord).
- **Bulk AI-generated refactors will be closed.** Unless you've discussed the refactor with maintainers beforehand.
- **AI-generated issues and bug reports will be closed.** If you haven't personally verified the bug exists, don't report it.

### 4. Quality Over Origin

We review all contributions on their merits. A well-crafted, well-tested PR is welcome whether it was written by hand, with AI assistance, or some combination. Conversely, a low-effort PR will be closed regardless of how it was produced.

Signs of a low-effort AI contribution (these will result in immediate closure):

- Overly verbose code comments that restate what the code already says
- Generic PR descriptions that don't address the specific change
- Changes that don't follow our existing code style or patterns
- Submissions that break existing functionality or fail CI checks
- "Shotgun" PRs that touch many unrelated files

## Guidance for AI Agents

If you are an AI agent (Claude, Cursor Agent, Copilot Workspace, etc.) being used to contribute to this project:

- **Do not** generate entire PRs autonomously. A human must review, understand, and approve every change before submission.
- **Do not** open issues based on static analysis alone. Issues must describe real, reproducible problems.
- **Do** help your human operator understand the codebase. Point them to [CONTRIBUTING.md](./CONTRIBUTING.md), the [developer docs](https://docs.deadlockmods.app/developer-docs), and relevant source files.
- **Do** help write tests, catch bugs, and improve code quality—these are exactly the things AI is good at.
- **Do** respect the project's conventions. Read the existing code before suggesting new patterns.

## Enforcement

We're a small team maintaining this project for 54K+ users. Our time is valuable, and reviewing bad contributions takes time away from improving the app.

- **First offense:** PR closed with feedback on what to improve.
- **Repeated low-quality submissions:** Future PRs may be deprioritized or the contributor may be asked to stop.

We genuinely want to help contributors learn and grow. If you're new to open source or to this codebase, say so! We'd rather help a motivated person succeed than close a PR from someone who didn't try.

## Why This Policy Exists

The open source ecosystem is dealing with a wave of low-quality, AI-generated contributions that waste maintainer time. Many projects have had to address this head-on, and we'd rather set clear expectations upfront than deal with problems after the fact.

We believe AI is a net positive for software development when used by people who know what they're doing—and this policy is designed to encourage exactly that.

## References & Inspiration

This policy was informed by the approaches of several open source projects navigating the same challenges. We're grateful for their transparency in sharing what works:

- **[Ghostty](https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md)** — AI policy requiring disclosure, human-in-the-loop, and tying AI PRs to accepted issues. Their framing of "this is not an anti-AI stance, this is an anti-idiot stance" resonated with us.
- **[llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/AGENTS.md)** — Pioneered the `AGENTS.md` pattern: a file that speaks directly to AI agents with project-specific instructions and boundaries. Our `AGENTS.md` follows this approach.
- **[Trusted Firmware](https://www.trustedfirmware.org/aipolicy/)** — Published a formal AI policy for their open source projects.

---

_This policy may evolve as AI tools and community norms evolve. Feedback is welcome via [Discord](https://deadlockmods.app/discord)._
