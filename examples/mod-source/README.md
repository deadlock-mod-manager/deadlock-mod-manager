# A static mod source you can copy

This directory is a complete small example for DMM's native **static-source
subset**. It needs ordinary public HTTPS file hosting, not a registry service,
database, account integration, or DMM server registration. The wider RFC remains
a work in progress; this example does not promise every RFC capability.

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
   directory tree. It is **not** the full protocol validator or a VPK parser;
   DMM's Rust boundary validates your hosted source again.

5. Upload the directory to your HTTPS host. Serve JSON as `application/json`,
   and artifacts as files. Do not put login pages or expiring HTML links in
   front of JSON/downloads. No browser CORS configuration is needed: Rust fetches
   these documents. Relative URLs resolve against the document containing them.
6. In DMM, open **Settings > Mods > Mod sources > Add source** and enter the
   complete public URL of `dmm-source.json`. Check the displayed name and origin
   before adding it. Select your source in the Mods Store, open the example,
   and download/install through the usual selection flow.

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

## Implemented authoring subset

- Static descriptors, complete local catalog snapshots, embedded current release,
  direct download URLs, manual file selection, and explicit component choices.
- Optional SHA-256 and MD5 checks. A supplied supported digest must match before
  installation. Omit a hash only when you cannot publish one; omission gives no
  publisher-digest verification.
- Native sources currently support `.vpk`, `.zip`, `.rar`, and `.7z`, with
  lowercase extensions and the existing Rust installation rules. `.dmodpkg`
  source artifacts are rejected until the package-specific choice flow is wired.
  Sources
  cannot provide installation scripts or arbitrary destination paths.
- Optional description (plain text, or Markdown with
  `descriptionFormat: "markdown"`), author, hero/content-type, tags, images,
  homepage, update date and `isNsfw` classification as accepted by the native
  implementation. Use `isNsfw: false` only for content you have classified as
  non-adult; `true` means adult and omission/null means unknown. DMM excludes
  unknown classifications when the user hides adult content. No invented
  counts, comments, author enrichment, mirrors or other GameBanana-only metadata.

Mapped adapters, equivalence links, dependency resolution, authentication,
release-history browsing, automatic origin migration, and one-click source
enrollment remain later RFC stages. Native API snapshot ingestion is available,
but this example requires only static hosting; it does not implement an API
service or server-side search.

Local profile membership retains source provenance, but portable source-aware
profile sharing/import, version holds, progressive all-source search, and the
RFC's canonical schemas/full conformance validator are not implemented here.
This preflight checks the copyable static subset. Conditional HTTP caching and
retry/backoff policies also remain later work; failed requests retain cached
results and users can retry refresh explicitly. Public enrollment uses HTTPS;
the loopback HTTP opt-in used by the executable fixtures is currently a native
command option, not a Settings control.

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
