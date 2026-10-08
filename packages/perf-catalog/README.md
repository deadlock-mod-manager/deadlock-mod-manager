# @deadlock-mods/perf-catalog

The performance-config catalog: curated presets, GameBanana references, metadata for every Deadlock convar, the history of Valve's stock `gameinfo.gi`, and the rules for what the app never writes. The desktop app bundles `data/catalog.json` and the API serves it at `GET /api/v2/perf-catalog`. The shape is `src/schema.ts` (zod) and `apps/desktop/src-tauri/src/mod_manager/perf_config/catalog.rs` (serde); change both together and bump `SCHEMA_VERSION`.

Developer guide: `apps/docs/content/docs/developer-docs/performance-catalog.mdx`.

## Generating

```bash
pnpm perf:catalog            # regenerate data/catalog.json from the pins in sources.json
pnpm perf:catalog --check    # exit 1 if data/catalog.json is stale
pnpm perf:catalog --refresh  # move the pins to the newest upstream state, then regenerate
```

- Needs network: pinned files come from raw.githubusercontent.com and gamebanana.com. Downloads are cached in `.cache/` by hash.
- `--refresh` uses the GitHub API; set `GITHUB_TOKEN` or `GH_TOKEN` (for example `GH_TOKEN=$(gh auth token)`).
- GameBanana archives (zip, rar, 7z) are extracted with `bsdtar` (Windows' `tar.exe` is bsdtar) or `7z`.
- Every file is checked against its pinned sha256 (md5 for GameBanana); a mismatch stops the run.
- The output is deterministic: if nothing but `version`/`generatedAt` would change, the file is left alone. `version` is `YYYY.MM.DD-N`.
- `.github/workflows/perf-catalog.yml` runs `--refresh` weekly and opens a pull request when the catalog changes.

## Layout

| Path | What |
| --- | --- |
| `sources.json` | Pins: SchemaExplorer commit, GameTracking commits for `gameinfo.gi` and `convars.txt`, upstream preset files, GameBanana file ids. Written by `--refresh`. |
| `curated/presets.ts` | Upstream files (repo, path, lineage) and the presets built from them. |
| `curated/community.ts` | GameBanana configs we list (tier, blurb, which variant to import). |
| `curated/convars.ts` | Labels, descriptions and side effects for the convars presets use most. |
| `curated/categories.ts` | Categories, weights and the name rules that assign them. |
| `curated/gameplay.ts` | Camera, visibility and developer-tool classification. |
| `curated/consensus.ts` | How DMM Clean is derived. |
| `curated/rules.ts` | Excluded, guarded and denied sections and keys. |
| `curated/video.ts` | In-game video menu labels for authors' video.txt settings. |
| `curated/removed.ts` | Kind and help for convars Valve's dump no longer has. |
| `scripts/` | The generator (`generate.ts`) and its parts in `scripts/lib/`. |

## How entries are derived

- A preset's `entries` are the author's changes against the stock file it was built on: the stock build whose `PGIVersion` matches (closest among builds sharing it), otherwise the closest stock file by section values. Values compare normalized (`true`/`1`, `false`/`0`, canonical numbers).
- ConVars that are new or differ; section scalars that are new or differ (the app writes those only when the user includes engine sections); section keys the author commented out (value `null`). A missing key is never a deletion.
- Left out: FileSystem, list sections (MaterialSystem2/RenderModes), root keys (`PGIVersion`), editor-only sections. A preset that edits another list section or a section stock doesn't have fails the run.
- Blocked and removed convars stay in `entries`; the app shows them as not applying.

### DMM Clean

DMM's own preset is computed from the pinned GPL-3.0 configs. Configs that derive from each other count as one lineage (sqooky: Sqooky, Eskay, Max FPS; kaizu: minimum spec, extreme low; boot; piggy; optilock: FPS, Potato). Each lineage votes with the value its configs set (majority within the lineage). A value is kept when at least 3 lineages vote for it and they are at least 75% of the lineages that change the key, the convar is active (in the dump, not `gameinfo_cannot_override`), it has no gameplay class and isn't in Camera & visibility, the in-game video menu doesn't control it, it doesn't hide things (`HIDES_THINGS`: draw distance, culling, LOD, draw toggles, sun and fog, PVS, grass and clutter, decals, splashes and blood, ropes, effect caps, Doorman's indicator, dark portraits), it is inside the convar's min/max, and it differs from the latest stock value.

### Gameplay classification

Every ConVar a preset sets whose name matches a pattern in `curated/gameplay.ts` (outline, glow, see_thru, `_fov$`, aspectratio, camera, camera_pitch, `citadel_unit_status_`, debug_draw, debug_show, hideout, timescale) must be classified camera, visibility or devtools, listed in `ALLOW_IN_BODY` with a reason, or denied. Otherwise the generator fails. Camera and visibility settings apply as the author set them; devtools stay off unless the user enables them.

### Community configs

GameBanana files are downloaded only to compute `settingsCount` (ConVars the app would write: active, not denied, not developer tools), `categoryCounts` (the same, per category), `engineEditCount` and `baseBuild`. No file content is stored.

## Sources and licences

- Convar facts: [ValveResourceFormat/SchemaExplorer](https://github.com/ValveResourceFormat/SchemaExplorer) `schemas/deadlock.json` (repository MIT; the dumped data is Valve's).
- Stock `gameinfo.gi` and `convars.txt` history: [SteamTracking/GameTracking-Deadlock](https://github.com/SteamTracking/GameTracking-Deadlock).
- Presets: [Sqooky/OptimizationLock](https://github.com/Sqooky/OptimizationLock) (Sqooky, Eskay, Kaizuchaneru, boot, Piggy and contributors) and [dacooderr/OptiLock](https://github.com/dacooderr/OptiLock) (dacooderr and contributors), both GPL-3.0. DMM Clean is derived from them.
- Some descriptions in `curated/convars.ts` are adapted from upstream configs' inline comments, the OptimizationLock README FAQ, and the curated notes of [simulieren/deadtune](https://github.com/simulieren/deadtune) (GPL-3.0).
- The gameplay-classification rule and parts of the exclusion list follow [Slush97/grimoire](https://github.com/Slush97/grimoire) (MIT).
- GameBanana configs are referenced by id; the app downloads them from GameBanana.
