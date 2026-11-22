# Reconcile GameBanana profiles and download listings separately

GameBanana can update engagement counts without advancing index timestamps, and a download page can lag a newly edited profile. Refresh selected profiles independently, keep newer revisions pending until downloads resolve and apply persistence, hooks and cache updates once the download list is complete.
