# Check process state before changing game files

Windows can hold open VPKs and the engine may observe inconsistent load order while files move. Check process state before mutating the game tree and require explicit user bypasses, recognizing that a process started outside the app cannot share an atomic lock.
