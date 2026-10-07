# Localization history fingerprints

`localization-history.bin` contains SHA-256 fingerprints of token values from
all 120 Unstoppable releases published from 2026-03-24 through 2026-08-22.
Those were all releases available within the requested six-month window when
the index was generated on 2026-08-30.

Only these files are indexed:

- `resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt`
- `resource/localization/citadel_heroes/citadel_heroes_english.txt`

The index contains no localization text. DMM always starts from the user's
installed game files. It uses the index only to recognize and ignore a mod
value that differs from the installed game but exactly matches a past vanilla
value.

The binary format is `DMMLOC01`, followed by a little-endian `u32` count and
that many sorted 32-byte SHA-256 fingerprints. Regenerate it with the
`localization-history-index` command in
`examples/localization_overlay_poc.rs` after downloading the desired
Unstoppable release VPKs into one directory.
