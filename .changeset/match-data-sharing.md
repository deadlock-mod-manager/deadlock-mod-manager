---
"@deadlock-mods/desktop": minor
---

Add opt-in match data sharing. When enabled, the app recovers your local Steam login on your machine to fetch your own Deadlock match salts through Steam's Game Coordinator and contributes them to deadlock-api trackers. It never sends your token, password, or personal data, only runs while Deadlock is closed, and is throttled and hard-capped at 40 fetches per 24 hours per account.
