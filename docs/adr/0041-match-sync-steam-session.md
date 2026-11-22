# Keep Steam match sync account-scoped and pause it while playing

Steam’s Game Coordinator enforces per-account cadence and routes traffic to a running Deadlock instance. Serialize persisted quota updates, preserve throttles across setting changes and share that cadence with account-specific queries used to fill delayed public match history. Hold the refresh token in memory, report the session as playing only for individual requests and stop sync while the user’s game is running.
