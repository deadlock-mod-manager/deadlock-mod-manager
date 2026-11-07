# A static mod source you can copy

This directory shows how to publish a small static mod catalog for DMM on
public HTTPS file hosting. You don't need a database, account integration or
DMM server registration. The example covers the implemented static-source
subset; some features in the wider RFC are still proposals.

For complete field tables, taxonomy, release history and an API-backed example,
see [Build a mod registry](https://docs.deadlockmods.app/developer-docs/build-a-mod-registry).

1. Copy this directory. Set a permanent `sourceId` and a display `name` in
   `dmm-source.json`. Replace `https://mods.example.org` in `networkOrigins` and
   the detail's `homepageUrl` with your public HTTPS origin (scheme and host,
   with an optional port; no path or trailing slash).
2. Replace `files/example.vpk` with your mod. The provided file is a valid VPK v1
   containing only `resource/dmm-source-example.txt`, a harmless text entry.
   `files/example.zip` contains that same VPK for archive-selection fixtures;
   the catalog deliberately offers one artifact to keep initial selection simple.
3. Set the artifact's filename, format, byte size, and SHA-256 in
   `mods/example.json`. To print size and hash:

   ```sh
   node -e "const fs=require('node:fs'),c=require('node:crypto'),b=fs.readFileSync('examples/mod-source/files/example.vpk');process.stdout.write(JSON.stringify({size:b.length,sha256:c.createHash('sha256').update(b).digest('hex')})+'\n')"
   ```

4. Run the offline preflight (Node.js 24 or newer; no install needed):

   ```sh
   node examples/mod-source/check.mjs examples/mod-source
   node --test examples/mod-source/check.test.mjs
   ```

   If you copied the directory elsewhere, adjust the paths. Preflight verifies
   the static document graph, IDs, snapshots, local byte sizes and supplied
   digests. It intentionally accepts only relative document/artifact URLs in one
   directory tree. It covers this static example and does not parse VPKs.
   DMM validates your hosted source again.

5. Upload the directory to your HTTPS host. Serve JSON as `application/json`,
   and artifacts as files. Do not put login pages or expiring HTML links in
   front of JSON/downloads. No browser CORS configuration is needed: Rust fetches
   these documents. Relative URLs resolve against the document containing them.
6. In DMM, open **Settings > Mods > Mod sources > Add source** and enter the
   complete public URL of `dmm-source.json`. Check the displayed name and origin
   before adding it. Select your source in the Mods Store, open the example,
   and download/install through the usual selection flow.
7. Optionally add **Add to DMM** and **Install with DMM** buttons to your site.
   They use `deadlock-mod-manager://sources/add` and
   `deadlock-mod-manager://sources/install` links; see
   [Links for your website](https://docs.deadlockmods.app/developer-docs/mod-sources#links-for-your-website).

## Publishing another mod or update

Add another index item and corresponding detail file for another listing.
Listing, release, and artifact IDs are opaque, case-sensitive strings: keep them
stable and never reuse them for unrelated content. DMM scopes identity by the
accepted origin plus source ID; a matching ID at another origin is a different
source.

Change `contentRevision` whenever installable bytes or required file selection
changes. Update size and digest together. A description/title edit alone must
not change `contentRevision`; a changed download URL alone is not an update.
Keep prior release artifacts available while clients may still reference them.
Changing an artifact ID or the VPK selection can require user confirmation
before an update replaces an installed mod.

For paginated catalogs, put `nextUrl` in each page and use the same `snapshotId`
on every page. Publish new detail/artifact files first, then complete pages,
then atomically replace the entry index. A failed or incomplete refresh keeps
DMM's previous complete catalog. Do not use request failures as deletion signals;
use explicit listing availability instead.

Disabling/removing a source stops its remote updates. Downloaded and installed
mods keep their local files and provenance. Re-adding the same origin and
source ID reconnects the identity. Moving a source to another origin is not an
automatic migration.

Changing any declared API, download or media origin set blocks refresh until
users remove the source, review the new descriptor and add it again. This
includes adding a CDN. URLs can change within accepted origins without this
review.

## Implemented authoring subset

- Static descriptors, complete local catalog snapshots, embedded current release,
  direct download URLs, manual file selection, and explicit component choices.
- Optional SHA-256 and MD5 checks. A supplied supported digest must match before
  installation. Omit a hash only when you cannot publish one; omission gives no
  publisher-digest verification.
- Native sources currently support `.vpk`, `.zip`, `.rar`, and `.7z`, with
  lowercase extensions and the existing Rust installation rules. `.dmodpkg`
  source artifacts are rejected until the package-specific choice flow is wired.
  Sources cannot provide installation scripts or arbitrary destination paths.
- Optional description (plain text, or Markdown with
  `descriptionFormat: "markdown"`), author, hero/content-type, tags, images,
  homepage, update date and `isNsfw` classification as accepted by the native
  implementation. Use `isNsfw: false` only for content you have classified as
  non-adult; `true` means adult and omission/null means unknown. DMM excludes
  unknown classifications when the user hides adult content. No invented
  counts, comments, author enrichment, mirrors or other GameBanana-only metadata.

Source enrollment/install links and read-only release history are available.
For history, declare `capabilities.releaseHistory: true` and a listing
`releaseHistoryUrl` returning release documents in `{ items, nextCursor }` pages
with explicit `nextCursor: null` completion. Installs still use the current
release. This fixture does not include a history document.

Mapped adapters, equivalence links, dependency resolution, authentication and
automatic origin migration remain later RFC stages. Native API catalog ingestion
is available in the [API example](../mod-source-api/README.md), but this static
example does not implement an API service or server-side search.

Local profile membership retains source provenance, but portable source-aware
profile sharing/import, version holds, progressive all-source search, and the
RFC's canonical schemas/full conformance validator are not implemented here.
This preflight checks the copyable static subset. Conditional HTTP caching and
retry/backoff policies also remain later work; failed requests retain cached
results and users can retry refresh explicitly. Release-build Settings enrollment
requires public HTTPS. Development builds also allow local HTTP sources in the
Add source dialog; the executable fixtures exercise the native local-network
option directly.

## Optional component choices

`mods/choices.json` and `files/example-choices.zip` are a second, executable
example. The archive contains three real VPKs: a required base notice and two
alternative notices, blue and red. Each VPK contains harmless text only. Add this
item to `catalog.json`'s `items` array to publish it alongside the simple example:

```json
{
  "id": "choices",
  "title": "Harmless component choices",
  "availability": "available",
  "isNsfw": false,
  "detailUrl": "./mods/choices.json"
}
```

Its `installation.mode: "components"` maps exact archive-relative VPK paths to
stable component IDs. `requiredComponents` always installs the base;
`choiceGroups` requires one color and suggests blue for a first installation.
Every component belongs to exactly one required set or choice group. Groups'
minimum/maximum bounds and defaults must be satisfiable. Paths use forward
slashes, contain no `..`, and never name a game destination.

A saved blue choice is not silently changed to red if an update removes blue.
DMM asks for a new decision while keeping the old installation. Manual releases
use the existing VPK file selector when an archive's saved file choices no longer
fit. Sources cannot reinterpret package-native choices or bypass archive checks.

To regenerate the harmless VPK/ZIP bytes and JSON digests exactly, use the
optional Python 3 standard-library helper:

```sh
python examples/mod-source/build-fixtures.py
```

## Executable lifecycle checks in the DMM checkout

```sh
node --test examples/mod-source/check.test.mjs
cd apps/desktop
cargo test --lib --no-default-features --features tauri-wry providers::native_sources::integration_fixture_tests
```

The Rust fixtures serve these same documents over an isolated loopback HTTP
server with explicit local-network consent. They exercise descriptor preview and
enrollment, origin-scoped identity, cached browsing and restart, exact artifact
resolution, native API pagination completion, failed-refresh rollback,
metadata-only versus content changes, and removal/re-addition. They download and
verify real ZIP/VPK bytes through DMM's native download helper, then use existing
archive extraction, selected-VPK placement, enable/disable operations and
manifest persistence. A bad-hash update leaves the installed bytes and manifest
untouched; changed component choices reject reuse of the old decision.

These automated boundary/lifecycle tests complement live desktop verification;
they do not substitute for operating the worktree's UI in a running app.
