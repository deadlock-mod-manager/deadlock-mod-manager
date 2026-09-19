---
"@deadlock-mods/desktop": minor
---

Add connection diagnostics. When a page fails to load, the error screen now offers "Diagnose connection" next to "Try again", and the same button lives in Settings → Tools. It opens a dialog that runs through your network adapter, internet reachability, DNS, the Deadlock Mod Manager API, GameBanana, both Deadlock API hosts and the local mod catalog one by one. Every failing check shows the exact address it tried, with a button to copy it, and explains what to do — including telling a failed name lookup apart from a blocked connection, so you are not sent hunting through firewall rules over a DNS problem.
