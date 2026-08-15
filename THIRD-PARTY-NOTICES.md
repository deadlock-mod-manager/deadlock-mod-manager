# Third-party notices

This project is licensed under the GNU General Public License v3.0. See
[LICENSE.md](LICENSE.md).

The following bodies of third-party source are copied into this repository
(not ordinary crates.io / npm dependencies). MIT is one-way compatible with
GPL-3.0: the combined work is distributed under GPL-3.0, and each upstream
copyright notice and permission text is preserved here.

Ordinary crates.io and npm dependencies are **not** listed. Agent skill
reference material under `.agents/skills/` is not shipped with the application
and is also omitted.

## vpkmerge (`morphic`)

- **Upstream:** [Slush97/vpkmerge](https://github.com/Slush97/vpkmerge), `morphic` crate
- **License:** MIT, © 2026 esoc
- **Scope:** [packages/vpkmanager/src/source2/](packages/vpkmanager/src/source2/)
- **Revision:** vendored from
  [`142373c2`](https://github.com/Slush97/vpkmerge/commit/142373c2cfcac522624519dcb64e616c8d58998e)
  (2026-08-08), which was upstream `main` when the crate was added on 2026-08-12
- **Modifications:** the KV3 re-wrap is stricter than upstream's reader so files
  Source 2 rejects are refused at pack time
- **License text:** [packages/vpkmanager/LICENSE-vpkmerge](packages/vpkmanager/LICENSE-vpkmerge)

Related adaptations (not a copy of the `morphic` subtree):

- [packages/vpkmanager/src/audio.rs](packages/vpkmanager/src/audio.rs) — MP3
  frame layout from `vpkmerge-core/src/mp3.rs`
- [packages/vpkmanager/src/pattern.rs](packages/vpkmanager/src/pattern.rs) —
  noise and color-space approach; the style set and tuning are original

## ValveResourceFormat

- **Upstream:** [ValveResourceFormat/ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat)
- **License:** MIT, © 2015 ValveResourceFormat Contributors
- **Scope:**
  - [packages/vpkmanager/src/source2/](packages/vpkmanager/src/source2/) —
    binary KV3 reader/writer, `VTexFormat` mapping, resource container layout
    (via vpkmerge's `morphic` port)
  - [packages/source2-model](packages/source2-model) — model decode and glTF
    export behavior mirrored from VRF
- **License text:**
  [packages/vpkmanager/LICENSE-ValveResourceFormat](packages/vpkmanager/LICENSE-ValveResourceFormat)
  and
  [packages/source2-model/LICENSE-ValveResourceFormat](packages/source2-model/LICENSE-ValveResourceFormat)

## shadcn/ui

- **Upstream:** [shadcn-ui/ui](https://github.com/shadcn-ui/ui)
- **License:** MIT, © 2023 shadcn
- **Scope:** [packages/ui](packages/ui) — components copied in by design via
  `pnpm dlx shadcn@latest add`
- **License text:** [packages/ui/LICENSE-shadcn-ui](packages/ui/LICENSE-shadcn-ui)

## Deadlock Rich Presence

- **Upstream:** [Jelloge/Deadlock-Rich-Presence](https://github.com/Jelloge/Deadlock-Rich-Presence)
- **Scope:** [packages/deadlock-discord-presence](packages/deadlock-discord-presence)
  — log-event mapping for Discord rich presence is derived from this project
- **License text:** not vendored as source; credited here and in Settings → About
