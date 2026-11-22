# Record permanently failed Lockdex file revisions

Record the revision marker when ingestion permanently rejects a file so backfill can wait for an upstream revision. Transient infrastructure failures remain eligible for retries.
