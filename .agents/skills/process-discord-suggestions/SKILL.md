---
name: process-discord-suggestions
description: Fetches forum suggestion threads from the Deadlock Mod Manager Discord via the user-discord-mcp, classifies each as MOD/SKIN_REQUEST, MOD_MANAGER_FEATURE, or OTHER, writes one markdown file per thread under .suggestions/ with author metadata, and applies the processed forum tag. Use when the user runs a suggestion sweep, "process Discord suggestions", "export suggestions from Discord", "tag processed suggestions", or when integrating the Discord MCP with the suggestions backlog workflow.
---

# Process Discord Suggestions (MCP)

End-to-end workflow for an agent with access to **user-discord-mcp** (`call_mcp_tool` with server `user-discord-mcp`). Read each tool’s JSON schema under the MCP `tools/` folder before calling it.

## Constants

| Key              | Value                 |
| ---------------- | --------------------- |
| Processed tag ID | `1497626100849840250` |

Do not change this ID unless the server’s forum tag is recreated.

## Prerequisite IDs

You need the **guild (server) ID** and the **forum channel ID** for the suggestions board.

- If the user does not pass IDs: `find_channel` with `guildId` (if known) and `channelName` matching the forum; or `list_forum_channels` with `guildId` and pick the correct channel.
- If tools require `channelId` / `guildId` and the user can provide them from Discord (Developer Mode: copy ID), prefer those to avoid name collisions.

## Classification (exactly one per thread)

| Value                 | Meaning                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MOD/SKIN_REQUEST`    | In-game visuals, models, VPK/GameBanana content, sound packs, map/mod content for Deadlock itself.         |
| `MOD_MANAGER_FEATURE` | DMM / Deadlock Mod Manager app: UI, install flow, API, Tauri, settings, mod library, sync, error handling. |
| `OTHER`               | Off-topic, meta Discord, unparseable, or not fitting the two above (still export and tag if processed).    |

**Rules**

- If the first message mixes topics, pick the **primary** user ask.
- When uncertain between mod content and app feature, use `MOD_MANAGER_FEATURE` if the text is about _how the manager works_; otherwise `MOD/SKIN_REQUEST` for _what to add in-game_.

## Output layout (repository root)

Create the directory tree on first use:

```text
.suggestions/
  mod-skin-request/     # maps to category MOD/SKIN_REQUEST
  mod-manager-feature/  # maps to category MOD_MANAGER_FEATURE
  other/                # maps to category OTHER
```

**Files**: one file per thread, path:

`.suggestions/<subfolder>/{threadId}.md`

Use the Discord **thread (post) ID** as the filename stem so re-runs do not duplicate.

### File format

Each file is valid Markdown with YAML front matter, then the thread body for humans to edit later.

**Front matter (required fields)**

- `title`: Thread name as shown in Discord.
- `thread_id`: Snowflake of the thread / forum post.
- `forum_channel_id`: Parent forum channel ID.
- `guild_id`: Guild ID, if available from the tool context.
- `author_username`: Display name or username at time of export (best effort).
- `author_id`: Author snowflake of the **first** (parent) post.
- `parent_message_id`: ID of the first message in the thread, if returned by `read_messages`.
- `category`: One of `MOD/SKIN_REQUEST`, `MOD_MANAGER_FEATURE`, `OTHER` (match table above, not the folder slug).
- `processed_tag_id`: `1497626100849840250`
- `exported_at`: ISO-8601 UTC timestamp when the file was written.

**Body**

1. A single `#` heading with the thread title (same as `title` is fine).
2. The text of the **first message** (starter post) as the main content.
3. If follow-up messages add material constraints or acceptance criteria, add a `## Thread notes` section with a short bulleted summary only when it changes meaning; do not dump full history by default to keep files reviewable.

## Fetch workflow

1. **List threads**: `list_forum_posts` with `channelId` (forum). If the result is known to be active-only, note that **archived** threads may be missing. Optionally `list_active_threads` with `guildId` to cross-check, then only process IDs that belong to the suggestions forum.
2. **Filter**: For each candidate thread, determine if it is already “processed”:
   - If the list payload includes `applied_tags` / tag IDs, skip when `1497626100849840250` is already present.
   - If tag membership is not visible, `read_messages` is still used for export; before tagging, merge tag IDs with care (see next section).
3. **Read content**: `read_messages` with `channelId` set to the **thread** ID, `count` as needed (max 100 per call; paginate with `before` if the thread is long; include enough to classify the _starter_ and optional notes for `## Thread notes`).
4. **Classify** using the table above; assign the `category` and target subfolder.
5. **Write** the file under `.suggestions/...` as specified.
6. **Tag the thread**: `modify_forum_post` with `postId` equal to the thread ID and `tagIds` a **comma-separated** list of tag snowflakes. **Merging tags**: the API sets the full set. If the listing response for the thread includes existing tag IDs, set `tagIds` to the union of those IDs and `1497626100849840250` (de-duplicated). If existing tags are unknown, prefer asking the user before applying a tag that might clear other tags; if the user has confirmed replace-with-processed-only is OK, you may set `tagIds: "1497626100849840250"` only.
7. **Idempotency**: If a file for `{threadId}.md` already exists in the correct subfolder and the thread already has the processed tag, skip writing and re-tagging unless the user asked for a full refresh.

## Ordering and rate limits

Process threads in a stable order (e.g. ascending `thread_id` or as returned). Space MCP calls reasonably; on failures, log which `threadId` failed and continue or retry that ID once.

## Privilege note

`modify_forum_post` requires the bot account behind user-discord-mcp to have **Manage Threads** and permission to set **forum tags** in that channel. If tagging fails, still write the export file and report the error so a moderator can tag manually.

## What not to do

- Do not store bot tokens in the repo or in front matter.
- Do not replace this skill with raw instructions that bypass MCP tool schemas; always read the tool descriptor before the first use in a session.

## Optional follow-up (not automatic)

- Add `.suggestions/` to `.gitignore` if exports should stay local and contain PII.
- Reconcile `OTHER` and misclassified files after human review (move file + update front matter `category` if needed).
