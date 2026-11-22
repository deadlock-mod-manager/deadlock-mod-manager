# Limit memory-heavy Lockdex work separately from downloads

Downloads stream to disk, while archive extraction and VPK hashing can hold large buffers in memory. Allow downloads to overlap while throttling the memory-heavy phase independently.
