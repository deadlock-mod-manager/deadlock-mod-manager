# Fit database backups within RustFS storage and request limits

The RustFS volume needs room for the incoming database dump, and its endpoint rejects single uploads above roughly 1 GB. Prune to three old backups before uploading the new backup in parts.
