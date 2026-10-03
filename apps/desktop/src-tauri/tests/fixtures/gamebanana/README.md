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
`RootCategory().name`, `description`, `text`, and `Files().aFiles()` for Mods,
Sounds, and WiPs. It does not return the raw `_aContentRatings` object.

The 2026-10-03 probe corrected how that multicall is reached:

- It only exists on the legacy host, `https://api.gamebanana.com/Core/Item/Data`.
  The `apiv11` path returns `404 NO_SUCH_ROUTE`.
- `itemtype[i]`, `itemid[i]`, and `fields[i]` pair by index, so every item
  repeats its comma-separated field list. 50 items exceed the server's URL
  limit (`414`), so hydration batches hold 40.
- Request-level failures come back as HTTP 200 with an
  `{"error", "error_code"}` object; private or trashed items come back as
  `null` rows.
- The default Index order is unstable near the tail, so full crawls sort with
  `Generic_Oldest`.
- `_sInitialVisibility` is `hide` or `warn` exactly for sexual and suggestive
  ratings (`st`, `sa`, `sc`, `ft`, `lp`, `pn`, `nu`); crude language, gore, and
  other ratings stay `show`. Index pages carry the visibility, so it is the
  catalog NSFW signal.

Catalog synchronization therefore uses Index-plus-bulk-hydrate. Index pages
remain immediately committable, while the missing browse columns are filled
by URL-length-bounded Core multicalls. ProfilePage hydration stays lazy.
