export const MOD_REGISTRY_AGENT_PROMPT = `Build a mod registry that integrates with Deadlock Mod Manager (DMM).

Work in the current repository and follow its conventions. If a registry already exists, add DMM support to its catalog and publishing workflow. For a new registry, build a compatible mod catalog with a documented way to publish mods. Use the existing stack where possible and choose static hosting or a public JSON API to suit the project.

Require only the source contract DMM needs to browse and install mods. Static JSON files and downloadable artifacts are enough. Website pages, authentication, upload forms, moderation, object storage and social features are optional. Add them only when requested or needed to fit the existing project; a new registry does not need them to integrate with DMM.

Read the current author guide before implementing the protocol:
https://docs.deadlockmods.app/llms.mdx/developer-docs/build-a-mod-registry/content.md

Working examples:
- Static source: https://github.com/deadlock-mod-manager/deadlock-mod-manager/tree/main/examples/mod-source
- API source and taxonomy sync: https://github.com/deadlock-mod-manager/deadlock-mod-manager/tree/main/examples/mod-source-api
- Current taxonomy: https://deadlockmods.app/v1/taxonomy.json

Use the guide and current native-source implementation as the compatibility references. RFC 002 includes unimplemented proposals. There is no published canonical schema package or full conformance validator to depend on.

1. Establish the registry's name, permanent sourceId, public HTTPS origin and hosting approach. Infer these from project configuration; ask for any essential missing choices. Use fictional sample content until real publishing details and mod files are available.

2. Model listings, their current releases and downloadable artifacts with stable, case-sensitive IDs. Include optional descriptions, author names, tags, homepage links and accurate adult-content classifications where available. When assigning heroes or content types, fetch and validate DMM's taxonomy, store its stable IDs separately from display names, and preserve the last good local copy if synchronization fails. A listing accepts a single optional hero and an optional contentType; use the published IDs.

3. Publish a dmm-source descriptor with protocolVersion "1.0", gameId "deadlock", sourceId, name, catalog and networkOrigins. Declare the exact API, download and media origins, including CDN and artifact redirect destinations. The descriptor can live at /.well-known/dmm-source.json or another documented URL. Public source reads must work without login, cookies or tokens; DMM infrastructure registration is unnecessary. Changing any declared origin set requires users to remove, review and add the source again.

4. Implement the complete catalog contract for the chosen approach. Static pages share a snapshotId and paginate with nextUrl. API pages return items and nextCursor, explicitly ending with nextCursor: null; continuations use cursor and limit=100. Keep pagination consistent and listing IDs unique. Linked details must have the same ID and include all metadata because they replace the index record. Available listings need an embedded current release or an explicit releaseUrl, never both. Keep publishing within the guide's request, size and refresh limits. DMM currently searches the downloaded catalog locally.

5. Publish actual installable .vpk, .zip, .rar or .7z artifacts with safe filenames and matching lowercase extensions, within the guide's download and extraction limits. Size and hashes are optional; recommend publishing the byte size and SHA-256 of each exact downloadable file. MD5 is also supported. Each artifact needs exactly one download.url or download.resolverUrl; a resolver returns { "url": "..." } on a declared download origin. Preserve artifact identity when URLs rotate. Change contentRevision when installable bytes or selection meaning changes, and keep it stable for metadata-only edits.

6. Start with installation.mode "manual". Optionally add component plans for mods with known required files or variants, using exact artifact IDs and archive-relative VPK paths. Every component must be required or belong to exactly one bounded choice group, with valid defaults. Preserve saved choices across updates and require a new decision when they no longer fit. Publish explicit unavailable/removed states; a network failure is not a removal signal. Publish complete catalogs so a failed refresh can retain the previous one.

7. Generate Add source to DMM and Install with DMM links. If the registry has a website, offer them as buttons; otherwise include them in the publishing instructions. Use deadlock-mod-manager://sources/add with url, and deadlock-mod-manager://sources/install with url, source and listing. Encode every parameter value with encodeURIComponent; optional release and artifact values target the current release and a specific artifact. Include a visible descriptor URL and a Download DMM link as fallbacks. Users must still review a new source in DMM.

8. Add screenshots and Markdown descriptions if requested, following the guide's media limits. If release-history browsing is wanted, enable capabilities.releaseHistory and provide releaseHistoryUrl or releaseHistoryUrlTemplate with complete release documents in explicitly terminated cursor pages. History is read-only. Advertise capabilities only where supported; DMM cannot consume authenticated sources or comments, install dependencies or older releases, migrate origins automatically, or download native .dmodpkg artifacts. A website may independently support author sign-in or comments; neither is required for DMM integration.

9. Verify the result with real HTTP requests through every catalog page and artifact download, including linked details, releases, history and resolvers where implemented. Check the downloaded bytes against any supplied size and every supplied supported digest. Test publication of an update and tombstones. Where implemented, test invalid API cursors, taxonomy-fetch failure and component choices. Run the project's relevant tests, lint, formatting, type checks and build. If a DMM build is available, also exercise enrollment, browsing and installation with harmless fixtures; local HTTP enrollment requires a DMM development build. Report any desktop behavior you could not verify.

Deliver the implementation with local run/publish instructions, the descriptor URL, generated DMM links, verification results and remaining limitations. Prepare deployment instructions; deploy only if the user has authorized it.`;
