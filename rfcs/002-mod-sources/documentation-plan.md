# Plan: build a mod registry documentation

Status: implemented; documentation and examples only. Docs build, repository
type checks, lint/format checks, ten example tests and rendered snippet/link
checks pass. A desktop walkthrough was deferred while another task held
exclusive access to the shared app; no source was enrolled or installed by
this task.

## Goal

A registry author can publish a compatible source, add it to DMM, browse and
install a mod, and publish an update using the guide and its examples. They can
discover every currently supported author-facing feature and understand its
limits without reading Rust or treating RFC proposals as implemented behavior.

Use the fictional **Example Community**, `my-community`, and
`https://mods.example.org` throughout. Do not name external registry projects,
copy their branding, link to their repositories, or imply a partnership,
endorsement, or affiliation.

## Findings that shape the work

- The live [Customization section](https://docs.deadlockmods.app/using-mod-manager/customization#installs-from-other-mod-sites)
  explains the player experience of an older allowlisted one-click integration.
  It does not explain how an independent author publishes a browsable source.
  Its mandatory SHA-256 statement must not be generalized to native sources,
  whose hashes are optional.
- [Custom mod sources](../../apps/docs/content/docs/developer-docs/mod-sources.mdx)
  already documents static hosting, links, identity, choices, and some limits.
  Keep its URL and existing section anchors working, including links in the
  desktop and example README. A new complete author guide can build on this
  quick start without creating competing protocol references.
- [The static example](../../examples/mod-source/README.md) is executable and
  includes harmless VPK fixtures, choices, and an offline checker. Its scope
  section is stale: it calls source-enrollment links and release-history browsing
  future work, although both exist. Its local-development guidance also needs
  to reflect the current development-build Settings flow.
- Native static and API catalogs are implemented. DMM refreshes a complete local
  catalog, including linked details/releases, then searches titles and tags
  locally. A registry's own server search, filter, and sorting endpoints do not
  establish DMM UI support.
- [The public taxonomy](https://deadlockmods.app/v1/taxonomy.json) returned
  `dmm-taxonomy`, version `1`, with 45 heroes and 12 content types during this
  investigation. Fetch the current document in examples rather than hardcoding
  a hero count or copying a list that will become stale.
- Contracts and validation live in the native-source implementation; the RFC
  describes a broader target. There is no published canonical JSON Schema,
  OpenAPI definition, or full conformance validator to promise to authors.

## Deliverables and navigation

1. Add `apps/docs/content/docs/developer-docs/build-a-mod-registry.mdx`, titled
   **Build a mod registry**, at `/developer-docs/build-a-mod-registry`.
2. Add it beside `mod-sources` in developer navigation and add a registry-author
   card to the developer overview. The opening should say that public HTTPS
   hosting is enough and DMM infrastructure registration is unnecessary.
3. Retain `mod-sources.mdx` as the static quick start. Link prominently to the
   complete guide. Keep existing section IDs, using short summaries and links
   where detailed reference material moves to the new page.
4. Preserve `customization#installs-from-other-mod-sites`. Distinguish native
   sources from the allowlisted one-click path, link authors to the new guide,
   and link players to the existing add-source instructions.
5. Correct the static example README's outdated capability statements and link
   to the new guide. Keep the README focused on running that example.
6. Add `examples/mod-source-api/` with a small, dependency-free Node.js server
   and a focused README. Reuse the existing harmless fixture bytes; accept the
   fixture directory as an explicit argument. Do not introduce a database,
   upload system, login flow, storage service, or new dependency.

The new page owns the complete author-facing contract reference. Existing
pages own onboarding and player instructions. Keep shared examples consistent;
do not maintain separate, contradictory capability lists.

## Proposed page outline

| Section                           | Content and examples                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Choose your integration           | Static JSON hosting versus a public JSON API; native sources versus the older allowlisted `//install` protocol. Explain that a custom source needs no DMM backend registration.                                                                                          |
| Publish your first mod            | A short static walkthrough: descriptor, index, detail, release, artifact, digest, publish, add source, install. Link the complete existing fixture.                                                                                                                      |
| Source descriptor reference       | Required and optional fields, protocol `1.0`, game `deadlock`, `static`/`api` catalogs, origin lists, identity, relative URLs, capabilities, raster icon and homepage. Explain that `.well-known/dmm-source.json` is a convention; users supply the full descriptor URL. |
| Build an API-backed source        | Route table, complete request/response examples, cursor pagination, linked detail hydration, embedded current release or `releaseUrl`, history and resolver endpoints. Explain which paths are examples and which field names are contractual.                           |
| Listing metadata and taxonomy     | Fetch/validate/cache taxonomy; stable IDs versus display names; single `hero`, `contentType`, tags, NSFW classification, author, timestamps, descriptions, homepage and screenshots. Include category mapping and absent/multi-hero handling.                            |
| Releases and downloadable files   | Stable listing/release/artifact identities, `contentRevision`, version labels, safe filenames, formats, size, optional hashes, direct URLs and download resolvers. Include a Node.js SHA-256/size example.                                                               |
| Variants and installation choices | Manual selection versus components, required base, mutually exclusive colors, optional groups, defaults, exact archive-relative VPK paths and update behavior. Include one complete component plan.                                                                      |
| Add website buttons               | Framework-independent JavaScript plus HTML for `sources/add` and `sources/install`, parameter table, percent encoding, optional current-release/artifact targeting, enrollment/disabled/already-installed flows and fallback links.                                      |
| Publish and maintain updates      | Metadata-only changes, content revisions, rotating URLs, publishing order, consistent pagination, explicit availability/tombstones, interrupted refreshes, saved selections, source removal and retained provenance.                                                     |
| Optional presentation             | Plain/Markdown descriptions and restrictions, media formats/MIME/size, icon limits, read-only release history and capability gates.                                                                                                                                      |
| Hosting and troubleshooting       | Public HTTPS, declared API/download/media origins, CDN redirects, no credentials/login requirement, JSON responses, local-development restrictions, budgets, common validation failures and a publishing checklist.                                                      |
| Supported features and limits     | A concise matrix separating working behavior, accepted-but-unused metadata and unsupported features. Link the RFC as design context.                                                                                                                                     |

For each wire object, include a table with field name, type, required/default
behavior, constraints and DMM behavior. Do not expose IPC-only fields such as
`remoteId`, `previewToken`, internal source keys, or internal artifact schemes as
requirements for a registry's JSON.

## API example contract

These are example paths on the author's host, not endpoints served by DMM:

| Example endpoint                               | Response and conditions                                                                                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /.well-known/dmm-source.json`             | `dmm-source` descriptor with `catalog.kind: "api"`, `listUrl`, applicable URL templates and accepted origins.                                                                                                                                         |
| `GET /dmm/v1/mods`                             | `{ "items": [...], "nextCursor": "opaque-cursor" }`; final page explicitly sets `nextCursor: null`, including an empty catalog. Continuations use `cursor` and `limit=100`. Serve the complete source catalog without requiring UI search parameters. |
| `GET /dmm/v1/mods/{listingId}`                 | Full listing with the matching `id`; an available listing must resolve to an installable current release. DMM fetches these during refresh when linked/configured.                                                                                    |
| `GET /dmm/v1/mods/{listingId}/current-release` | Optional release document referenced by `releaseUrl`, instead of embedding `release`. Never provide both.                                                                                                                                             |
| `GET /dmm/v1/mods/{listingId}/releases`        | Optional `{ "items": [releaseDocuments], "nextCursor": null }`; paginated with explicit completion. Requires `capabilities.releaseHistory: true` and a history URL/template.                                                                          |
| `GET /dmm/v1/files/{artifactId}/resolve`       | Optional `{ "url": "https://files.example.org/example.vpk" }`, used by `download.resolverUrl` to obtain a fresh URL on demand. The resolver uses an API origin and its result must use a download origin.                                             |

Keep a descriptor, two catalog pages, full listing, release, history page,
resolver response, component plan, and tombstone copyable in the guide. Use
consistent IDs, actual fixture sizes and digests, and resolvable relative URLs.
The API sample should expose these same shapes and reuse real artifact bytes.

`releaseUrlTemplate` is accepted in API descriptors, but the current catalog
reader resolves the current release from `listing.release` or
`listing.releaseUrl`. Do not present a templated historical-release endpoint as
necessary or as enabling old-release installs.

## Taxonomy guidance

- Show `GET https://deadlockmods.app/v1/taxonomy.json` and its
  `{ format, version, heroes, contentTypes }` response shape.
- Show schema validation before storing a local copy, using the accepted
  `format` and `version`. Keep the last good copy if fetching or validation
  fails; refresh it explicitly or on a documented schedule.
- Store stable kebab-case IDs such as `lady-geist` and `mo-and-krill`; display
  the supplied names separately. Never derive IDs from a display name at
  runtime or invent renamed IDs for the same concept.
- Include the current 12 content types and their desktop tab mappings, sourced
  from the shared taxonomy and frontend mapping. Hero IDs should be fetched,
  with a few representative examples rather than a maintained full copy.
- Explain that `hero` is a single optional value. A registry with several hero
  associations must choose a representative hero or omit it; there is no
  native listing `heroes` array. Verify the actual presentation before making
  claims about hero filtering or Hero Skins integration.
- Keep free-form tags separate from taxonomy. Do not promise that arbitrary
  category IDs will create new desktop tabs or filters.
- Explain `isNsfw: true`, `false`, and missing/null. Only explicitly classified
  non-adult listings pass the adult-content hiding filter.

## Features the guide must classify accurately

| Area               | Current behavior to document                                                                                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogs           | Static `snapshotId` + optional `nextUrl`; API cursor pages with explicit `nextCursor: null`. Static pages must agree on the snapshot ID. Do not claim API pages require that field.                                                                                                                        |
| Search             | Local title/tag search after catalog refresh. `search: "server"` is accepted but does not enable server-side queries. `supportedFilters` and `supportedSorts` are not consumed by this client.                                                                                                             |
| Downloads          | Exactly one of `download.url` or `download.resolverUrl`; allowed-origin artifact redirects; lowercase `.vpk`, `.zip`, `.rar`, `.7z`; optional SHA-256/MD5 with all supplied supported hashes verified.                                                                                                     |
| Choices            | Manual files or explicit components. Every component belongs to the required set or exactly one choice group. Defaults satisfy the group's bounds and suggest first-install choices.                                                                                                                       |
| Updates            | Installation-relevant changes need a new `contentRevision`; metadata or URL rotation alone does not. Changed/removed saved choices can require user selection; failed replacement retains the current installation.                                                                                        |
| History            | Read-only Changelog tab, fetched on demand. Older releases can be listed but are not install targets. History failure must not prevent current-release installation.                                                                                                                                       |
| Media              | PNG/JPEG/WebP/GIF/ICO raster validation with matching MIME. Current refresh hydrates at most four listing images; each media response is limited to 2 MiB and retained source icons have a tighter size limit. Inline Markdown images are dropped.                                                         |
| Trust              | Public HTTPS in release-build enrollment. Local HTTP/private-network enrollment is development-only in the current UI. Accepted origin plus `sourceId` defines identity; a matching ID elsewhere does not transfer trust. Document/media redirects are refused; artifact redirects are separately checked. |
| Removal            | Explicit `available`, `unavailable`, or `removed` listing states. An outage is not removal. Disabling/removing a source retains local files and provenance.                                                                                                                                                |
| Unimplemented      | Mapped adapters, authenticated source access, dependency installation, equivalence links, automatic origin migration, older-release installation, portable source-aware profile sharing, version holds, unified progressive search, canonical schemas and full conformance validation.                     |
| Other capabilities | Advertising `comments` or `dependencies` does not enable them; nonempty release dependencies are rejected. Do not promise votes, statistics, mirrors, arbitrary install scripts or destinations, or native `.dmodpkg` downloads.                                                                           |

Document practical budgets together: 10 MiB per JSON response, 100 catalog
pages, 10,000 listings, 1,000 JSON documents per refresh, 64 MiB normalized
catalog, and a two-minute refresh budget. History has separate limits of 20
pages and 500 releases. Explain that linked details/releases consume the
document budget and inline records can reduce requests for larger catalogs.

## Implementation sequence

1. Inventory the public fields and constraints from the sources below. Produce
   the descriptor/listing/release/artifact/choice reference directly from those
   contracts, with unsupported behavior clearly marked.
2. Build the neutral API sample using the static fixtures. Verify pagination,
   detail hydration, current release, history, resolver, downloads and explicit
   removal. Include the run command and emitted descriptor URL in its README.
3. Write the new MDX page, from first install through taxonomy and updates.
   Keep JSON and JavaScript samples consistent with the executable examples.
4. Wire navigation and cross-links, preserve existing anchors, and correct stale
   statements in the static example README.
5. Validate snippets, examples and the docs build, then manually verify the
   documented source flow against an available desktop dev session. Coordinate
   exclusive desktop access first; ask the user to start the dev server if one
   is needed. Do not start or rebuild the desktop for this documentation task.

## Acceptance and validation

- An independent author can follow either hosting path without editing DMM,
  obtaining a DMM token, registering with a central service, or cloning an
  unrelated project.
- Every currently supported author-facing field is explained. Capability flags
  do not imply features beyond the behavior traced above.
- Samples cover initial install, two-page completion, update, removal,
  required-base plus color choice, history, URL resolution and taxonomy sync.
- Failure checks cover missing terminal cursors, mismatched listing IDs,
  undeclared origins, an incorrect digest, inconsistent static snapshots,
  changed installation evidence without a revision bump, and preservation of a
  cached catalog/current installation after failure. Reuse existing tests where
  they already cover the behavior; add focused checks only for new sample code.
- Run the static example checker and its existing tests. Run the new API sample
  through real HTTP requests and validate emitted shapes; exercise native
  ingestion with the existing integration fixture approach where practical.
- Parse every JSON snippet and execute reusable JavaScript examples. Verify
  taxonomy-fetch failure preserves the saved copy and deep links encode spaces,
  `&`, `=`, and opaque IDs correctly.
- Run `pnpm --filter @deadlock-mods/docs build`; verify navigation, cross-links,
  retained anchors, headings, tables and code blocks. Run repository formatting,
  lint and type checks required for the eventual implementation, without
  overwriting other threads' work.
- All public text, examples and sample metadata use fictional identities and
  contain no external registry branding or affiliation claims.
- No changeset is needed for documentation-only work and illustrative samples.
  No desktop feature changes, dependency installation, commit, or PR is part of
  this plan.

## Implementation evidence

- [Native wire types](../../apps/desktop/src-tauri/src/providers/native_sources/types.rs)
- [Descriptor, listing, release and choice validation](../../apps/desktop/src-tauri/src/providers/native_sources/validation.rs)
- [Catalog ingestion, pagination, resolvers, history and revision invariants](../../apps/desktop/src-tauri/src/providers/native_sources/store.rs)
- [Network origin and redirect rules](../../apps/desktop/src-tauri/src/providers/native_sources/network.rs)
- [Media validation](../../apps/desktop/src-tauri/src/providers/native_sources/media.rs)
- [Source identity and hash verification](../../apps/desktop/src-tauri/src/providers/native_sources/mod.rs)
- [Website deep links](../../apps/desktop/src-tauri/src/providers/native_sources/links.rs)
- [Frontend category mappings and adult-content visibility](../../apps/desktop/src/lib/mod-sources.ts)
- [Native source browsing UI](../../apps/desktop/src/components/mod-browsing/catalog/native-source-catalog.tsx)
- [Shared taxonomy](../../packages/shared/src/taxonomy.ts)
- [Public taxonomy route](../../apps/www/src/routes/v1/taxonomy%5B.%5Djson.ts)
- [Executable native-source fixtures](../../apps/desktop/src-tauri/src/providers/native_sources/integration_fixture_tests.rs)
- [Existing static preflight](../../examples/mod-source/check.mjs)
- [RFC 002 design context](./proposal.md)
