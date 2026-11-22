# Version and serialize persistent UI state

Serialize and coalesce whole-state writes while preserving deletion order, and require successful initial hydration before saving so startup errors cannot overwrite user state. Bound save waits at shutdown so stalled storage cannot prevent exit.
