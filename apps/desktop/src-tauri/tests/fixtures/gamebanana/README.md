# GameBanana fixture corpus

The endpoint fixtures were captured from public GameBanana responses on
2026-08-29 and reduced to the stable fields DMM retains. The Mod fixture uses
submission `711387`; the Sound fixture uses `92659`. Volatile member metadata,
medals, and aggregate fileserver traffic counters were removed.

`edge-cases.json` is synthetic. It isolates provider states that are difficult
to capture reliably from live records: null fields, malformed values, private,
trashed, and withheld submissions.

`normalized-retained.json` is the language-neutral parity oracle. The current
TypeScript normalizer and the Rust provider must produce those fields from the
same profile fixtures.

## Index field coverage spike

The 2026-08-29 live probe established that `Mod/Index` ignores
`_csvProperties`; requesting download count, category, content ratings, and
text still returned the default Index shape. `Core/Item/Data` multicall accepts
multiple item IDs and returns `downloads`, `Category().name`,
`RootCategory().name`, `Nsfw().bIsNsfw()`, `description`, and `text` for both
Mods and Sounds. It does not return the raw `_aContentRatings` object.

Catalog synchronization therefore uses Index-plus-bulk-hydrate. Index pages
remain immediately committable, while the missing browse columns are filled
by URL-length-bounded Core multicalls. ProfilePage hydration stays lazy.
