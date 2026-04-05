---
"@deadlock-mods/logging": minor
"@deadlock-mods/bot": patch
---

Add wide event helpers (`createWideEvent`, `createWideEventContext`, `runWithWideEvent`) and refactor the Discord bot to emit one canonical log line per HTTP request, Redis message, and Discord interaction.
