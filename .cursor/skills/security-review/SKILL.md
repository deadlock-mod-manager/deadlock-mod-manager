---
name: security-review
description: >-
  Security code review for Tauri/Rust/TypeScript desktop apps and Hono/oRPC APIs.
  Use when asked to "security review", "find vulnerabilities", "check for security issues",
  "audit security", or review code for injection, XSS, IPC abuse, path traversal,
  or authentication issues. Provides confidence-based reporting tuned to the
  Deadlock Mod Manager stack.
allowed-tools: Read, Glob, Grep, Bash(read-only commands like cargo, git, npm)
---

<!--
Reference material based on OWASP Cheat Sheet Series (CC BY-SA 4.0)
https://cheatsheetseries.owasp.org/
-->

# Security Review

Review code for exploitable vulnerabilities in a Tauri 2.x desktop app with a Rust backend,
React/TypeScript webview frontend, and Hono/oRPC API server.

## Scope

- **Report on**: The specific files/changes requested by the user.
- **Research across**: The entire codebase to build context before reporting.

Only report findings you can trace to attacker-controlled input reaching a dangerous sink.

## Confidence Levels

| Level | Criteria | Action |
|-------|----------|--------|
| **HIGH** | Attacker-controlled input reaches dangerous sink, no mitigation | **Report** |
| **MEDIUM** | Dangerous pattern, mitigations may exist elsewhere | **Note** for verification |
| **LOW** | Theoretical, defense-in-depth only | **Do not report** |

## Do Not Flag

- Test files and fixtures
- Dead code with no callers
- React JSX interpolation `{variable}` (auto-escaped)
- Drizzle ORM parameterized queries (safe by default)
- Serde deserialization into strongly-typed Rust structs
- Tauri plugin scope restrictions working as intended
- Values only settable by the local user on their own machine
- Hardcoded constants, env vars, build-time config

## Threat Model

This is a **desktop mod manager** running locally. Key distinctions:

| Source | Trust Level | Rationale |
|--------|-------------|-----------|
| Local user actions | **Trusted** | User controls their own machine |
| Mod archives from GameBanana | **Untrusted** | Filenames, metadata, archive contents |
| API responses from deadlockmods.app | **Semi-trusted** | Validate structure, not intent |
| Deep link parameters | **Untrusted** | Any website can trigger `deadlock-mod-manager://` |
| IPC messages from webview | **Untrusted if XSS** | XSS escalates to native code execution |

## Review Process

### Step 1: Detect Context and Load References

| Code Type | Load Reference |
|-----------|---------------|
| `#[tauri::command]`, IPC handlers | `references/tauri-ipc.md` |
| React components, webview | `references/webview-xss.md` |
| `Command::new`, process spawning, `unsafe` | `references/rust-backend.md` |
| File I/O, archives, paths | `references/file-operations.md` |
| Hono routes, oRPC procedures | `references/api-security.md` |
| better-auth, OAuth, sessions, tokens | `references/authentication.md` |
| Cargo.toml, package.json | `references/supply-chain.md` |
| Encryption, hashing, key storage | `references/cryptography.md` |

Load **only** references relevant to the code under review.

### Step 2: Map Data Flow

For each potential finding, trace:

1. **Source**: Where does data originate?
2. **Transforms**: What validation/sanitization exists between source and sink?
3. **Sink**: Where is data consumed? (filesystem, process, DOM, SQL, IPC)

### Step 3: Verify Exploitability

1. Can an attacker actually control the input?
2. Does the framework provide automatic protection?
3. Are there mitigations elsewhere in the call chain?
4. What is the realistic impact?

### Step 4: Classify Severity

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | RCE, sandbox escape, arbitrary file write outside game dir | Cmd injection via mod metadata, IPC allowing arbitrary path writes |
| **High** | Data exfil, auth bypass, privilege escalation | XSS reaching IPC bridge, path traversal to sensitive files, token leak |
| **Medium** | Limited impact, requires user interaction | Stored XSS without IPC access, CSRF on non-critical API endpoints |
| **Low** | Defense-in-depth improvements | Missing rate limiting, verbose errors, suboptimal CSP |

## Quick Patterns — Always Flag

```
# Rust — command injection
Command::new(user_input)
Command::new("sh").arg("-c").arg(format!("... {}", user_input))

# Rust — path traversal (no canonicalize + prefix check)
std::fs::read(format!("{}/{}", base, user_filename))

# Rust — unsafe in IPC handlers
unsafe { } // inside #[tauri::command]

# TypeScript — XSS escalation to native
dangerouslySetInnerHTML={{ __html: modDescription }}
eval(serverData)
window.__TAURI__.invoke(userControlledCommand)

# API — SQL injection via string interpolation
sql`SELECT * FROM mods WHERE name = '${userInput}'`

# Secrets hardcoded in source
BETTER_AUTH_SECRET = "..."
STEAM_API_KEY = "..."
DATABASE_URL = "postgres://user:pass@..."
```

## Quick Patterns — Check Context First

```
# File ops — safe if path is validated + canonicalized
std::fs::read_to_string(path)
std::fs::write(path, data)

# Process spawn — safe if args are hardcoded/validated
Command::new("steam").arg(game_id)

# Drizzle — safe when using query builder
db.select().from(mods).where(eq(mods.name, input))

# React rendering — safe if data doesn't reach dangerous sink
<div>{modData.description}</div>
```

## Output Format

```markdown
## Security Review: [Component/File Name]

### Summary
- **Findings**: X (Y Critical, Z High, ...)
- **Risk Level**: Critical/High/Medium/Low
- **Confidence**: High/Mixed
- **Scope**: [What was reviewed]

### Findings

#### [VULN-001] [Vulnerability Type] (Severity)
- **Location**: `file.rs:123`
- **Confidence**: High/Medium
- **Issue**: [One-line description]
- **Data Flow**: [source] → [transforms] → [sink]
- **Impact**: [What an attacker achieves]
- **Evidence**:
  ```rust
  // vulnerable code
  ```
- **Fix**:
  ```rust
  // remediated code
  ```

### Needs Verification
[MEDIUM-confidence findings requiring human review]

### Not Flagged
[Suspicious patterns confirmed safe, with explanation]
```

If no vulnerabilities found: "No high-confidence vulnerabilities identified."
