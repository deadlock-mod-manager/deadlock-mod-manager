---
name: transcript-search
description: Search local Cursor, Claude Code, and Codex session transcripts. Use when looking up past agent sessions, choosing grep vs ranked search, building the search index, dumping a session by id, or scoping by cwd and provider.
---

# Transcript search

Query sessions already on disk. Nothing is uploaded. Six tools, three intended search tiers.

## Tools

<!-- tool-contract:start -->

| Tool                 | Purpose                                                                                                                                                                   | Inputs                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `list_providers`     | List transcript harnesses on this machine. Returns availability and a capped session file count.                                                                          | —                                                                                                                     |
| `list_sessions`      | List session summaries filtered by provider, cwd, and time range. Newest first. Does not return full transcripts.                                                         | provider? · cwd? · since? · until? · limit? (1–200, default 50)                                                       |
| `get_transcript`     | Return the normalized transcript for one session (provider + id, optional path). Messages are capped (default 200, max 1000).                                             | **provider** · **id** · path? · limit? (1–1000, default 200)                                                          |
| `grep_transcripts`   | Search raw transcript files without an index. Supports plain, regex, and fuzzy matching with 10 MiB file, 1 MiB line, 64 MiB scan, and 60 second fallback limits.         | **query** (max 1024 chars) · mode? (plain/regex/fuzzy, default fuzzy) · provider? · limit? (1–200, default 50)        |
| `search_transcripts` | BM25-ranked search over normalized messages. mode=fts (default) or mode=hybrid after a semantic index build.                                                              | **query** · mode? (fts/hybrid, default fts) · provider? · role? · cwd? · since? · until? · limit? (1–100, default 20) |
| `build_index`        | Build or refresh the FTS5 index. Pass full=true to rebuild from scratch. Pass semantic=true to also embed the corpus — first run downloads ~23MB ONNX (all-MiniLM-L6-v2). | full? (default false) · semantic? (default false)                                                                     |

<!-- tool-contract:end -->

Provider ids: `cursor`, `claude-code`, `codex`.

## Grep vs search

Use `grep_transcripts` when you need a hit now and have no index, or when you want a literal, regex, or fuzzy scan of raw JSONL.

- `query` (required)
- `mode`: `plain` \| `regex` \| `fuzzy` (default `fuzzy`)
- `provider?`, `limit?` (1–200, default 50)

Grep does not take `cwd`. Scope it with `provider`, then open the matching session.

Intended grep engine is `@ff-labs/fff-bun` (fuzzy / plain / regex). If the native binary is unavailable, the server falls back to a streaming scan. Do not assume the native engine is present in every install.

Use `search_transcripts` when you want BM25-ranked results over normalized message text, or filters grep does not have (`cwd`, `role`, `since`, `until`).

- Requires `build_index` first
- `mode`: `fts` (default) or `hybrid`
- `hybrid` requires a later `build_index` with `semantic: true`

## Index

`search_transcripts` reads the local FTS5 index (`~/.transcripts-mcp/index.db`, overridable via `TRANSCRIPTS_MCP_INDEX`).

1. Call `build_index` before the first FTS search. Incremental is the default; `full: true` rebuilds from scratch.
2. Call `build_index` again with `semantic: true` before `mode: "hybrid"`. First semantic build downloads ~23 MB ONNX (`all-MiniLM-L6-v2`).

If search returns `INDEX_REBUILD_REQUIRED` after a server upgrade, call `build_index` with `full: true`. This replaces only the local cache. Use `semantic: true` to recreate embeddings, and give concurrently running incompatible server versions separate `TRANSCRIPTS_MCP_INDEX` paths.

The server works without the semantic tier. Hybrid is optional. Do not assume embeddings are available until a semantic build succeeds; they are not guaranteed in every published binary.

## Session id to transcript

Hits from `grep_transcripts` and `search_transcripts` include `provider`, `sessionId`, and `path`. `list_sessions` returns the same `id`, `provider`, and `path`.

Call `get_transcript` with:

- `provider` (required)
- `id` (the session id)
- `path?` (pass it when you have it)
- `limit?` (1–1000, default 200)

`list_sessions` returns summaries only. Dump the session with `get_transcript`.

## Scope

- Call `list_providers` first when you do not know what is installed.
- Pass `provider` on `list_sessions`, `grep_transcripts`, and `search_transcripts` to stay on one harness (`cursor`, `claude-code`, or `codex`).
- Pass `cwd` on `list_sessions` and `search_transcripts` to stay in the current project. Grep has no cwd filter — open the matching session instead.

## Search tiers

1. **grep** — `grep_transcripts`. No index. Native fuzzy/plain/regex when available; otherwise a streaming scan.
2. **FTS5** — `search_transcripts` with `mode: "fts"`. Requires `build_index`.
3. **semantic** (optional) — `build_index` with `semantic: true`, then `search_transcripts` with `mode: "hybrid"` (BM25 + vectors, reciprocal rank fusion).

The published platform binary has native fff grep and FTS5. Semantic/hybrid needs the Bun in-process path (`bunx --bun` or `bun apps/mcp/src/index.ts`). If native fff fails to load, grep falls back to a streaming scan.
