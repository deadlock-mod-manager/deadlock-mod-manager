# Keep existing profiles in the first VPK directory

Source 2 loads at most 99 numbered VPKs from each search-path directory. The manager adds sibling directories when a profile outgrows that limit and keeps each mod’s VPKs together. The original directory stays first so older manifests still resolve their files without a migration.
