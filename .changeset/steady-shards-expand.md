---
"@deadlock-mods/desktop": minor
---

Lift the 99 enabled addon limit. Deadlock only loads 99 addon files per folder, so profiles now spread their enabled VPKs across sibling `citadel/addonsN` folders and register one search path per folder in gameinfo.gi. Existing profiles migrate the first time you switch to them or launch the game, keeping their load order. A mod whose addon files have gone missing on disk is now shown as downloaded instead of enabled, and developer mode gains a Shards page for inspecting the layout.
