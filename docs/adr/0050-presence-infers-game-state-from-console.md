# Infer Discord presence from server-specific console events

Local hosts and dedicated clients emit different game state signals, and transient lobby drops and player counts can occur as a match starts. Combine those signals across the match so presence reflects the current mode and roster despite partial log updates.
