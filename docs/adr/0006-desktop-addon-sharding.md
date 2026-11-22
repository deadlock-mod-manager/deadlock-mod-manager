# Shard VPKs across addon roots

Source 2 loads at most 99 numbered VPKs per search-path directory, so use sibling directories to extend capacity. Preserve the original directory as shard one for old manifests and keep each mod together, with metadata and disabled VPKs in the base directory.
