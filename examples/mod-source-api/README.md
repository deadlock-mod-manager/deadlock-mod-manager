# An API mod source you can run

Run this example with Node.js 24 or newer; you don't need packages. The server
implements DMM's public native API contract using the harmless VPK and ZIP
fixtures in `../mod-source`. It has two catalog pages, manual and component
releases, a tombstone, release history and a download resolver. The files contain
text notices only.

From the repository root:

```sh
node examples/mod-source-api/server.mjs examples/mod-source
```

The printed descriptor URL is
`http://127.0.0.1:8787/.well-known/dmm-source.json`. Only DMM development builds
can enroll this loopback HTTP source. In a development build, open **Settings >
Mods > Mod sources > Add source**, paste that URL, and select the source in the
Mods Store. The server is independent of the desktop dev server.

For public hosting, put the server behind an HTTPS reverse proxy and set
`PUBLIC_ORIGIN` to the external origin, for example `https://mods.example.org`.
The server binds to `127.0.0.1`; `PORT` changes its listening port. Use your
shell's environment-variable syntax. The emitted API/download origins and URLs
always use `PUBLIC_ORIGIN`; a public origin is required for release-build DMM.
After enrollment, changing any declared API, download or media origin set
requires users to remove the source, review its descriptor and add it again.
Re-adding the same accepted origin and source ID reconnects local provenance.

The server has no publishing service. It reads the two fixture documents on
startup, so restart it after changing them. Replace the artifacts,
sizes, hashes, IDs and installation paths together before publishing real mods.
The example responds with `Cache-Control: no-store` to make editing predictable.
For production, keep each paginated catalog consistent throughout a refresh.

| Route | Demonstration |
| --- | --- |
| `/.well-known/dmm-source.json` | API descriptor and origins |
| `/dmm/v1/mods` | First catalog page |
| `/dmm/v1/mods?cursor=second-page&limit=100` | Final page, components listing and removed listing |
| `/dmm/v1/mods/example` | Detail with a linked current release |
| `/dmm/v1/mods/choices` | Detail with an embedded component release |
| `/dmm/v1/mods/example/current-release` | Current release using a download resolver |
| `/dmm/v1/mods/example/releases` | Read-only release history |
| `/dmm/v1/files/example-vpk/resolve` | Fresh download URL response |
| `/files/example.vpk` | Actual fixture bytes matching the published size/hash |

Unknown cursors fail with HTTP 400, unknown routes with 404, and non-GET requests
with 405. The API catalog explicitly terminates with `nextCursor: null`.

Run the checks without starting a persistent server:

```sh
node --test examples/mod-source-api/server.test.mjs
```

The checks fetch both catalog pages, listing details and releases over HTTP,
then verify artifact sizes and SHA-256. They also cover renamed IDs and files,
history, component choices, error responses and taxonomy refresh failures.

## Keep taxonomy current

```sh
node examples/mod-source-api/sync-taxonomy.mjs taxonomy.json
```

The script fetches `https://deadlockmods.app/v1/taxonomy.json`, validates the format,
version, entries and unique IDs, then atomically replaces the destination.
Failures leave an existing copy intact and exit unsuccessfully. Read the saved
copy in your application and run the script when publishing or on a schedule.
`TAXONOMY_URL` overrides the endpoint for testing. The destination's parent
directory must already exist.

See [Build a mod registry](https://docs.deadlockmods.app/developer-docs/build-a-mod-registry)
for field tables, website buttons, taxonomy, updates and current limitations.
