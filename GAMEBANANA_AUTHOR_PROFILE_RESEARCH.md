# GameBanana author profile feasibility

Research date: 2026-08-28

## Verdict

An in-app author page is feasible and is a better destination than leaving the
store permanently filtered by a display name. GameBanana exposes a numeric member
ID, profile URL, avatars, small identity graphics, structured bio fields, and
author-scoped submission listings. The important limitation is that it does **not**
document a member banner, header, or background-art field. The page should
therefore use Deadlock Mod Manager's own header treatment around the author's HD
avatar rather than copying or interpreting the member's GameBanana theme.

The app should key the page by GameBanana member ID, not username. Usernames can
change and are not unique enough to serve as a durable foreign key.

## First-party API findings

| Need                       | Available?      | Evidence and caveats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable submitter/member ID | Yes             | A submission record's `_aSubmitter._idRow` is the same numeric ID used in `https://gamebanana.com/members/{id}`. The current [Deadlock Mod/Index response](https://gamebanana.com/apiv11/Mod/Index?_nPerpage=3&_aFilters%5BGeneric_Game%5D=20948&_nPage=1) exposes it, and GameBanana's documented [Member/IdentifyById endpoint](https://api.gamebanana.com/docs/endpoints/Core/Member/IdentifyById) resolves an ID back to the current username.                                                                                                                                                                                                                                                                                                                                                                                            |
| Profile page URL           | Yes             | The documented Member fields include [`Url().sProfileUrl()`](https://api.gamebanana.com/Core/Item/Data/AllowedFields?help=&itemtype=Member), and a live first-party [Member ProfilePage response](https://gamebanana.com/apiv11/Member/4833990/ProfilePage) returns `_sProfileUrl`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Avatar                     | Yes             | Documented fields include `Url().sAvatarUrl()` and `Url().sHdAvatarUrl()` in the [Member allowed-fields response](https://api.gamebanana.com/Core/Item/Data/AllowedFields?help=&itemtype=Member). The live ProfilePage response above also returns `_sAvatarUrl` and, where configured, `_sHdAvatarUrl`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Other profile art          | Limited         | GameBanana documents `Url().sUpicUrl()` and `Url().sSigUrl()` in the [Member allowed-fields response](https://api.gamebanana.com/Core/Item/Data/AllowedFields?help=&itemtype=Member). These are small identity/signature images, not a documented full-width hero. There is no dedicated banner, header, background, cover, or theme-image field in that allowed-fields list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bio                        | Yes, structured | `DefinitionList().aBio()` is a documented [Member data field](https://api.gamebanana.com/Core/Item/Data/AllowedFields?help=&itemtype=Member). It returns an array of label/value entries rather than a guaranteed prose biography.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| List a user's submissions  | Yes             | The documented [Core/List/New endpoint](https://api.gamebanana.com/docs/endpoints/Core/List/New) accepts both `userid` and `gameid`; its [allowed item types](https://api.gamebanana.com/Core/List/New/AllowedItemTypes?help=) include `Mod` and `Sound`. A live [author-and-game query](https://api.gamebanana.com/Core/List/New?page=1&userid=4833990&gameid=20948) returns the member's Deadlock submission type/ID pairs. For card-ready data, the currently used API also accepts `Generic_Submitter` together with `Generic_Game` on [Mod/Index](https://gamebanana.com/apiv11/Mod/Index?_nPerpage=50&_aFilters%5BGeneric_Submitter%5D=4833990&_aFilters%5BGeneric_Game%5D=20948) and [Sound/Index](https://gamebanana.com/apiv11/Sound/Index?_nPerpage=50&_aFilters%5BGeneric_Submitter%5D=4833990&_aFilters%5BGeneric_Game%5D=20948). |

GameBanana's documented [`Core/Item/Data`](https://api.gamebanana.com/docs/endpoints/Core/Item/Data)
endpoint can request only the profile fields needed and supports multicall. That is
preferable for profile refreshes to depending on the much larger ProfilePage
payload.

## Fit with the current repository

The sync already receives the submitter ID, profile URL, and avatar in the
GameBanana response: [`BaseUser`](packages/shared/src/providers/game-banana.ts)
models those values. During ingestion, however, the provider keeps only the
submitter's display name as `author` in
[`createRegularModPayload`](apps/api/src/providers/game-banana/index.ts), and
the [`mods` table](packages/database/src/schema/mods.ts) has an `author` string
but no remote author ID. Consequently, author-name filtering can work today, but
a durable profile route cannot distinguish renames or two members with the same
display name.

Recommended data shape:

- Add a provider-scoped author record keyed by `(provider, remoteAuthorId)` with
  current name, profile URL, avatar URL, HD avatar URL, optional upic/signature,
  optional structured bio, and `refreshedAt`.
- Associate each GameBanana mod with that author record during the existing sync.
- Route to `/authors/gamebanana/{memberId}` and obtain its mod cards from the
  already-synchronized Deadlock catalog. Do not call GameBanana once per card.
- Refresh profile metadata lazily or on a coarse schedule. Treat absent fields as
  removals so deleted avatars and scrubbed profiles do not live forever.
- Label the identity as "Submitted by" unless the product also models GameBanana
  credits; the submitter is not necessarily every creator credited on a mod.

## Recommended page treatment

Use the existing Mod Store grid and card behavior below a compact author header:

- HD avatar (falling back to the normal avatar or a local placeholder), current
  display name, optional title, and a clear "View on GameBanana" link;
- a DMM-owned gradient/texture derived from normal design tokens, not the member's
  custom CSS;
- optional structured bio entries after sanitizing and limiting their length;
- Deadlock Mod and Sound cards from DMM's catalog, with the normal NSFW,
  withheld, trashed, and downloadable-state rules.

The small upic or signature can be shown as an optional accent if it fits without
upscaling. It should not be stretched into a full-width banner. Do not fetch,
parse, or inject `_sSubjectShaperCssCode` from the larger ProfilePage payload:
that field is undocumented and custom CSS/URLs are an unnecessary security and
stability boundary.

## Stability, terms, privacy, and caching risks

- **API stability:** the public API documentation describes `Core/*`, but does
  not document the `apiv11/*/ProfilePage` and `Generic_Submitter` contracts used
  above. The repository already depends on `apiv11` for mod sync, but author
  profile ingestion should stay behind the same provider adapter and validate
  every optional field. Prefer documented `Core/Item/Data` and `Core/List/New`
  where they supply enough data.
- **No published SLA/rate-limit contract found:** the endpoint documentation
  gives request shapes but no quota, freshness, or uptime guarantee. Cache author
  metadata server-side, deduplicate refreshes, use timeouts/backoff, and render
  stale metadata or a local placeholder during GameBanana outages.
- **Caching:** do not rely on upstream HTTP caching semantics. Use an application
  TTL (for example, 24 hours plus jitter) and refresh-on-view only when stale.
  Continue serving cards from DMM's own catalog.
- **Rights:** GameBanana's [Terms of Service](https://gamebanana.com/wikis/334)
  say users retain responsibility for their submitted content and grant a broad
  license to GameBanana. That text does not expressly grant Deadlock Mod Manager
  an independent license to reproduce arbitrary profile artwork. Public API
  availability is technical access, not a complete reuse license. Keep
  attribution and source links, avoid permanently copying artwork without
  clarification, and ask GameBanana for approval before making custom profile art
  a prominent branded feature.
- **Privacy/deletion:** GameBanana's [Privacy Policy](https://gamebanana.com/wikis/1873)
  describes avatars, HD avatars, signatures, contact data, and other profile data
  as optional, publicly visible data that members can remove or scrub. Do not
  expose contact or donation fields on this page, retain only the public display
  fields needed, and expire removed assets promptly.

## Bottom line

Build the unique page, but make it a DMM author page powered by a GameBanana
member ID, not a visual clone of the GameBanana profile. Phase one can be the
author identity header plus all of that member's already-synced Deadlock cards.
Treat GameBanana-specific art as optional enhancement work pending explicit reuse
clarity and a resilient fallback design.
