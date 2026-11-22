# Reuse the profile share format for cloud backups

Versioned backups wrap the share payload so restores use the same import path, while keeping enough metadata for older stored backups and unavailable mods. Revisions prevent one device from overwriting a newer save, and serializing creates per user enforces the backup limit under concurrent saves.
