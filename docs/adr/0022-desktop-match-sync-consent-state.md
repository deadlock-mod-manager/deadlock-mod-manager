# Persist versioned Steam match-sync consent

Keep opt-in consent and durable quotas in their own state file to prevent UI snapshots from racing the engine. Use the consent version to require a new user choice when its rules change.
