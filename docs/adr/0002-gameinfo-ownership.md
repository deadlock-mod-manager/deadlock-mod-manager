# Edit only the parts of GameInfo the manager owns

Steam can replace GameInfo during an update, and players and other tools can add their own search paths. The manager stores desired settings separately so it can reapply them to the current file. For search paths, it uses block markers and per-entry ownership information to change its mounts while preserving surrounding entries and their load order.
