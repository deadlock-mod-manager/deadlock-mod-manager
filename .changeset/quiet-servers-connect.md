---
"@deadlock-mods/desktop": patch
---

Actually join the server you clicked instead of landing in the hideout.

Joining went through `steam://run/<appid>//+connect`, which Deadlock drops
often enough that the client boots straight into the hideout. Joins now use
Steam's `steam://connect/<ip:port>` handler — the same path the Deadworks
launcher uses — and a background watchdog tails `console.log` to re-issue the
connect if the client came up without it. Hostnames are resolved to `ip:port`
first, and servers that need no mod changes are joined without restarting a
running client.

Deadworks servers also install their maps and addons now. They never publish
`required_mods`; their content sits behind a per-server manifest, so joining
one previously connected without the custom map. DMM now fetches that
manifest, installs maps into `citadel/maps` and addons into the per-server
addons folder, and skips anything already present at the right version.

The registry's `extra_maps` field was parsed away, so the custom maps a server
rotates through never showed up in the browser. They are listed alongside the
content addons now.
