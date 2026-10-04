# Deadlock Mod Interchange format (v1)

A manager-neutral description of an installed Deadlock mod library, used to move
mods between mod managers. Deadlock Mod Manager (DMM) and Grimoire both read and
write it; any other manager can join by implementing the same three adapters:

| Adapter  | Direction                                           |
| -------- | --------------------------------------------------- |
| Reader   | another manager's native on-disk data → interchange |
| Importer | interchange → your own layout                       |
| Exporter | your own layout → interchange bundle                |

A reader for a manager that does not speak the format yet (for example DMM reading
an older Grimoire, or Grimoire reading an older DMM) builds the same document in
memory straight from that manager's files. Importers never need to know where a
document came from.

## Bundle layout

```
<bundle>/
  mod-interchange.json
  files/<entry-folder>/<file>.vpk
```

A bundle may be passed around as a directory or as the path of its
`mod-interchange.json`. File paths inside the document are relative to the
directory that holds `mod-interchange.json`, use forward slashes, and must not
leave that directory. In-memory documents produced by a live reader may carry
absolute paths instead; they are never written to disk that way.

## Document

```jsonc
{
  "format": "deadlock-mod-interchange",
  "version": 1,
  "createdAt": "2026-09-19T12:00:00.000Z",
  "source": {
    "manager": "grimoire", // free-form id of the producing manager
    "managerVersion": "1.26.0", // optional
    "profileName": "Default", // optional
  },
  "mods": [
    {
      "key": "gamebanana:mod:650634",
      "name": "QOL Lock",
      "enabled": true,
      "order": 0,
      "origin": {
        "provider": "gamebanana",
        "submissionType": "mod",
        "submissionId": "650634",
        "fileId": 1720039,
        "fileName": "qol_313.zip",
      },
      "author": "someone",
      "description": null,
      "category": "Quality of Life/Fixes",
      "hero": null,
      "thumbnailUrl": "https://images.gamebanana.com/img/ss/mods/6995649268824.jpg",
      "link": "https://gamebanana.com/mods/650634",
      "nsfw": false,
      "files": [
        {
          "name": "qol_313_dir.vpk",
          "path": "files/0000-qol-lock/qol_313_dir.vpk",
          "sha256": "fcfe4bdeb53cf44dcdd5966e1a4538807ad17dccab80df76400f9397c114f6a5",
          "size": 1667455,
          "selected": true,
        },
      ],
      "extensions": {
        "grimoire": { "metaKey": "pak02_dir.vpk" },
      },
    },
  ],
  "warnings": [],
}
```

### Optional sections

A document is modular: `mods` is always present, everything else only when
the producing manager has it and the user chose to export it. `contents` lists
the sections that were included, so an importer can tell "no profiles" from
"profiles not exported".

```jsonc
{
  "contents": ["mods", "profiles", "crosshairs"],
  "profiles": [
    {
      "key": "profile:default",
      "name": "Ranked",
      "active": true,
      "description": null,
      "mods": [
        { "modKey": "gamebanana:mod:650634", "enabled": true, "order": 0 },
      ],
      "crosshairKey": "crosshair:profile:default",
      "autoexec": ["fps_max 240"],
    },
  ],
  "crosshairs": [
    {
      "key": "crosshair:preset-1",
      "name": "Small dot",
      "active": false,
      "convars": {
        "citadel_crosshair_color_r": "255",
        "citadel_crosshair_pip_gap": "4",
      },
    },
  ],
}
```

- `mods` is the library: every mod any exported profile uses, once. Its
  `enabled`/`order` describe the source's active profile, which is also the
  whole state of a manager without profiles.
- `profiles[].mods[].modKey` points into `mods`. An importer that has no
  profiles ignores the section. An importer that has profiles but receives a
  document without them imports into its active profile.
- `crosshairs[].convars` are the game's own `citadel_crosshair_*` console
  variables as strings, so no manager-specific crosshair model leaks in.
  Importers keep the convars they understand and ignore the rest.
- `profiles[].autoexec` is a list of console commands saved with the profile.

### Fields

- `format` must be `deadlock-mod-interchange`. `version` is the major version;
  readers reject a higher major they do not understand. Additive fields do not
  bump the version, so readers ignore unknown fields.
- `key` is unique within a document and stable across exports of the same mod:
  `gamebanana:mod:<id>`, `gamebanana:sound:<id>`, or `local:<id>`. Local ids are
  either the manager's own UUID or `sha256:<hex>` of the primary VPK, so
  importing the same file twice resolves to the same mod.
- `order` is the load order within the document, ascending. Lower values take
  the lower `pakNN` slot. Values do not need to be contiguous.
- `origin.provider` is `gamebanana` or `local`. For GameBanana, `submissionId` is
  the decimal submission id as a string; `fileId` is the GameBanana file row
  the VPKs came from, when known.
- `files` lists every VPK of the mod. `selected: false` marks an alternative
  variant that is kept but not loaded; a missing `selected` means `true`.
  `sha256` and `size` are optional but let importers deduplicate and verify.
- `extensions` holds manager-private data keyed by manager id. Importers must
  not depend on another manager's extension.
- All other descriptive fields are optional and may be `null`.

## Import rules

Every importer in this repository follows these rules so a transfer always
finishes, even when the source data is incomplete or out of date:

1. An entry whose files cannot be found is skipped with a reason. It never
   aborts the rest of the import.
2. An entry already present in the target library (same GameBanana
   submission, or the same local key) is skipped as a duplicate.
3. Missing names fall back to the source file name. Missing GameBanana
   metadata is fetched from the catalog when available and otherwise kept from
   the document.
4. The importer never deletes source files and never touches files outside
   the folders it manages itself. Both managers share `citadel/addons`, so a
   source file may already sit where the target manager lists its own mods:
   such a file is adopted in place (and moved within those folders when the
   document asks for another state, e.g. disabled), never copied, so the game
   does not load a stray second copy. Everything else is copied.
5. Load order is preserved relative to the other imported entries and placed
   after the mods already in the target profile. Readers take the order the
   source manager shows, not incidental file or key order.
6. An importer remembers which document key became which mod in its library.
   Re-importing after the user re-identified a mod (local to GameBanana) must
   not bring the old copy back.
7. Profile entries that point at a mod which was skipped or failed are
   dropped from that profile, never replaced by a guess.
8. Imported local mods are offered for identification afterwards (hash
   lookup, manual GameBanana link). The step is optional.
