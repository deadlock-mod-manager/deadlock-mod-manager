# Serialize distributed lease renewals

Overlapping database renewals can deliver an older expiry after a newer one and move the local deadline backward. Serialize renewals and keep the prior deadline after a failed renewal while the existing lease still excludes other owners.
