# Purge expired OAuth tokens in indexed batches

Better Auth rejects expired tokens before checking revocation or rotation reuse and retains their rows. Purge expired tokens in bounded, expires-at-ordered batches so maintenance can reclaim space while avoiding repeated scans of rows already deleted.
