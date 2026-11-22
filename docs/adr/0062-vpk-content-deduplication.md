# Deduplicate VPK metadata by content hash

The database keeps one row per VPK content hash even when duplicate files have different download identities. A current file may claim a legacy row from the same submission so the original data stays available without allowing unrelated submissions to take ownership.
