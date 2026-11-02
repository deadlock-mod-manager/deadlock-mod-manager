# desktop

## 2.3.0

### Minor Changes

- 713ebd4: Move Stats and its Live tab out of experimental, with an off switch in Privacy
- 22558d3: Move the background image to Settings > Background and remove the Flashbang plugin
- c2f9ff5: Add 1-click installs from allowlisted mod sites, starting with Divine Skins
- ee6a03f: Redesign the Mod Foundry and add sound volume, mute, OGG and FLAC support
- f295a32: Show a possible crash cause when a fatal error names a resource supplied by a mounted mod VPK.
- d16b676: Check mod requirements against the active profile and warn before enabling a mod with missing requirements.
- 5df195a: Add the Coding theme: an editor-style dark theme with a graph-paper grid, monospace headings and a customizable accent
- 285a4bd: Bring back the Live tab: both teams' records while a match loads, then your team's graded stats, via a HUD mod
- 415b146: Add opt-in faster downloads that fetch large files in 4 parts at once
- 80805b4: Paint single sections of a hero skin in the Mod Foundry, picked on the 3D model
- cc4eacc: Add author socials and a Commission button for verified authors on author pages
- 2ac7658: Show in diagnostics when Windows TCP auto-tuning is turned off
- 1f4fbe2: Add permissioned plugin events for game, mod, download, and profile activity
- d13eed9: Pin a mod of the week for a set number of days with the /modoftheweek bot command
- 1f4fbe2: Enable Plugins in Experimental settings to install sandboxed plugins with access you grant per plugin.
- 7fd9a1a: Order the VPKs inside a mod in the load order dialog, defaulting to author order

### Patch Changes

- Keep painted skin sections visible in the Foundry's 3D preview after applying a color.
- Simplify the Foundry export confirmation and keep its actions visible in shorter windows.
- f9fc83b: Keep failed mod updates ready to retry without refreshing the file list again.
- 0a6395d: Retry a server without Range when it fails the first segment's request
- 5d01b0b: Stop match sync from adding Deadlock playtime to Steam while it waits between requests
- da6c64d: Keep match sync running after turning it off and quickly back on
- 1f4fbe2: Bind plugin consent to the reviewed package, verify installed archive bytes, and fix update, snapshot, activity, and SDK validation errors.
- 1e83ca6: Check for updates through the Deadlock Mods API
- ab4d11a: Remove retained segment files when cancelling a paused download.
- 1427110: Stop a mod deleted while its download was queued from downloading anyway
- 1f4fbe2: Enable plugins in desktop dev builds. Release builds need the plugins feature; turning Plugins off stops workers and sessions while preserving settings.
- da6c64d: Match sync now also recovers the matches your Steam friends most likely just played, before falling back to deadlock-api's global list of missing matches.
- aa5c6ad: Back up only the mods an update replaces, not every installed mod
- b095153: Add the linked file to an installed mod instead of ignoring 1-click links
- 2b42d25: Show sounds favorited before the sound rename in the Favorites filter
- 0fabb85: Name the unreachable host when the diagnostics internet check fails
- 0c78d2a: Fix downloads staying at "Downloading 100%" forever when the selected profile had been deleted, by falling back to the default profile on startup
- e9bcd02: Delete a mod's disabled variants when the mod is deleted
- 4a2c8c4: Re-enable disabled variants from disk when their files are present and current
- 018a945: Keep match sync from pausing for a day while another Steam game is running
- 1a7024a: Stop showing a slow download notice on a retry still waiting in the queue
- d1bc28b: Let the next queued download start while another one is paused
- 6858261: Keep the author's file order in the download picker and when a mod's file list is rebuilt from its folder
- 9571e72: Let cancel remove a download that is still waiting in the queue
- dfbf3bd: Stop a cancelled download from holding up the queue while it is still connecting
- 680ab68: Try another download server when a mirror fails or stalls during a transfer.
- e04686c: Install the Deadworks UI bootstrap when joining Deadworks servers
- 6dd15f2: Stop a queued download that a window reload marked as failed
- 8eac39f: Translate download, 1-click install and collection download notifications
- 33b4d32: Stop signing users out when several requests refresh their login at once
- 2cf5f39: Move match sharing settings into their own tab and fix the onboarding default
- 1463319: Keep multi-VPK mod updates working after an author re-uploads a pack
- 61e36bc: Show one error notification, not two, when a download can't be queued
- 018a945: Skip Steam accounts whose saved login expired instead of retrying them
- ba50fd7: Offer collection mods whose download failed for download again
- aa99dcf: Stop flagging GameBanana mods as updated when the author only archives a file
- 1463319: Keep a mod's custom VPK order when it updates
- a15971f: Keep the Files tab and offer Try again when a mod's file list fails to load
- 4b461ce: Keep console logging out of game launches and server joins when it is disabled
- acf32f2: Fix 0 B sizes for variants added from the Manage files dialog
- 5141ae4: Show downloads waiting in the queue as "Waiting" instead of "Downloading"
- Updated dependencies [1f4fbe2]
- Updated dependencies [1f4fbe2]
  - @deadlock-mods/plugin-sdk@0.2.0
  - @deadlock-mods/shared@2.5.0

## 2.2.0

### Minor Changes

- e177093: Redesign the Stats page and add a page for each match
- 8f45bc5: Preview mods in 3D on your device, with animations, cloth, effects and glow.
- 143c777: Add GameBanana Remote Install: queue mods from your phone and install them here
- 4b36850: Back up profiles to your account and restore them on another PC
- 61ad97b: Feature Remlock as mod of the week during the Remlock release
- f942eb4: Fix outdated mods with one button and see each step while fixes prepare

### Patch Changes

- 5ff1bfa: Show every set of video settings a config author ships
- 5f14adb: Open the mod library and mod store faster
- f7d40bc: Right-click a library mod to select or deselect it while selecting mods
- 4912c80: Remove the autoexec launch option, since Deadlock runs autoexec.cfg on its own
- 7f5ed12: Fix late and repeating mod update alerts (thanks basicfuton from Discord)
- 4aa173c: Check for performance catalog updates hourly and add a refresh button
- 278e25e: Add rolling date presets and custom ranges to the Updated and Added filters
- ae57e5b: Stop broken mod records in other profiles blocking updates (thanks Labargoin)
- faf4716: Remove the file server picker and fall back when a mirror lacks the file
- 19e8ec5: Keep popovers and tooltips visible when a model preview is fullscreen.
- 1882221: Stop writing custom crosshairs to autoexec.cfg, which the game already loads
- 7474ed8: Show download progress as a ring on compact mod buttons
- 821a2c5: Fix the app failing to start on Windows with a missing MSVCP140.dll error
- 0130866: Fix the Mods Store freezing on Linux when many NSFW thumbnails are blurred
- 23c0e08: Stop a deleted profile from coming back after an interrupted import
- d06d9b1: Update Tauri and its plugins for security fixes and fewer Windows crashes
- ee96289: Keep performance config edits in editor and compiler sections
- 7f5ed12: Keep mod pages open when the catalog is busy syncing
- e2c8e9d: Keep the mod library responsive while mods download
- 6e44dbd: Recover downloads that stall after a reload and add a cancel button
- 1200188: Install Windows updates with a progress bar instead of installer prompts
- 75477e2: Find the hero and category of skins in GameBanana's new hero subcategories
- bd88f25: Reduce memory overhead for large 3D previews using local model files, with cancellation and cleanup when previews close.
- Updated dependencies [4b36850]
- Updated dependencies [19e8ec5]
- Updated dependencies [75477e2]
  - @deadlock-mods/shared@2.5.0
  - @deadlock-mods/ui@0.3.2
  - @deadlock-mods/crosshair@0.2.9

## 2.1.1

### Patch Changes

- Fix launching on profiles named with non-Latin characters

## 2.1.0

### Minor Changes

- f4f9c21: Feature one mod per category on the dashboard, with previews for sound mods
- 6f4891a: Turn on Performance configs by default
- 59b328f: Flag launch options and autoexec commands the current game build no longer has
- 8a10da1: Offer to save gameinfo.gi edits made outside the mod manager as a config
- 154ef2d: Move Nuke & Reinstall to the library menu with a backup and retries
- c41e76b: Browse mods by hero from the dashboard, or roll a random hero

### Patch Changes

- 240c143: Add Violet and Nurse Harrow ability slots and official hero cards
- 8f0f0c4: Fix Discord Rich Presence connections in Linux Flatpak builds
- f83ecdc: Stop asking deadlock-api for all of history on the Stats page when no start date is picked.
- ea4f5d2: Restore available mods and allow discarding an incomplete broken mod search
- 0f679b5: Keep engine-section edits on when switching sources in the config import
- 7fbc30f: Apply performance configs as written, including engine sections and dev tools
- 7fbc30f: Keep Install for performance configs that also ship VPKs
- bebea12: Reduce stutter and GPU load from the seasonal theme animations
- 7f9681f: Show update failure details and affected mods, and retry only failed updates.
- aa32737: Recover mods stranded by interrupted load-order changes before V2
- 83a81d2: Remove the Live tab's match scoreboard, whose broadcast requests exhausted deadlock-api's global spectate quota.
- 7fbc30f: Add /perfconfig to mark GameBanana uploads as performance configs
- 1dbe9ca: Link privacy settings to a page listing every service the app contacts
- 7fbc30f: Send performance configs listed as mods to the Performance page
- 9c28ea8: Fix Flatpak updates requiring a second manual restart to take effect
- 7fbc30f: Add OptiLock Ultra Potato and place performance presets by their tier
- 8f0f0c4: Fix finding Network Activity in settings search
- Updated dependencies [240c143]
- Updated dependencies [7fbc30f]
  - @deadlock-mods/deadlock-discord-presence@0.1.2
  - @deadlock-mods/shared@2.4.1
  - @deadlock-mods/crosshair@0.2.8

## 2.0.0

### Major Changes

- Ship 2.0 with a local catalog and new addon folder layout

### Minor Changes

- a7cd243: Add selection-based enable and disable actions to the mod library
- 4970162: Show every Deadworks server and fetch the maps and addons each one advertises
- a0f2cbd: Add a setting to move the download cache to another folder or drive
- 293d350: Add profile mod groups with drag, undo, bulk toggles and organization copying
- 3c5a8ff: Add bulk update, delete, and copy actions to library selection
- Add a Collections tab with GameBanana collections, local search and filters, and downloads for an entire collection or selected mods
- f440325: Refresh the GameBanana catalog about every 30 minutes instead of every 6 hours, and show catalog sync status in the bottom bar.
- 72ea72c: Customize the Stats page: add, arrange and resize widgets on your own tabs.
- 712f690: Add ranked, unranked, and start-date filters to Overview, Heroes, and Items stats.
- e31d615: Sort the mod library by install order, hero, name, or recently added, and tidy the library toolbar.
- b4b34a2: Show update badges in My Mods, including disabled mods, and add a setting to hide them. Keep disabled mods disabled when updating them.
- 5246248: Add occasional tips that point out features you haven't tried yet
- 8eb3a21: Add the Drututt theme with channel art and emote easter eggs
- cdec390: Add a tour of experimental features you can enable and reopen later
- 5246248: Add a Check mods for repairs action to the Mods Library menu
- 5246248: Keep the menu bar open after a single tap of Alt
- cdec390: Tell users when a slow or failed download is on GameBanana's side
- cdec390: Add a Contributors page crediting the core team and GitHub contributors
- 932aa5c: Add an NSFW Only filter to the mod browser and My Mods
- d8d6e74: Add Find a broken mod, which tests mods in halves to find the one breaking the game
- 5246248: Allow dropping mod files anywhere in the window
- 85b515a: Show GameBanana comments and changelogs on mod pages and when updating
- d0d29cd: Add an OLED theme with true-black backgrounds and a customizable accent
- c52fc90: Add seasonal themes with mini-games for Halloween, Christmas, Easter and more
- 2fa0b19: Warn when your mods stop loading. If a Steam update or another tool rewrites Deadlock's gameinfo.gi, a bar under the title bar says how many enabled mods are affected and re-applies them in one click. Game updates are detected too, and Valve's latest patch notes now show on the Dashboard.
- 8547a02: Add rich GameBanana author profiles to mod browsing
- e3b1c3c: Import mods, profiles and crosshairs from Grimoire or a mod-interchange file; export them too
- 07cdeaf: Add the Lovelock theme, a plum and pink preset inspired by Asteria's Lovelock Companion. Status bar icons now follow the active theme's accent colour.
- ae910d5: Enable match data sharing by default. New users can turn it off during onboarding, and existing users see a one-time notice with the option to turn it off. Users who had already turned it off keep it off.
- d43255c: Remove a mod from My Mods when all of its files are deleted from the addons folder, even while the mod manager is open. A mod that lost only some of its files stays and shows a "Files missing" badge, so you can reinstall or delete it.
- 2a8af42: Show which enabled mods change the same files

  The Mods Library has a new Conflicts tab listing every overlap between enabled mods, with the mod used in game first and a Load first button for the others. Mods whose model is hidden by another mod get a badge in the library, and overlaps you're happy with can be ignored per profile. It is on by default and can be turned off under Settings > Experimental.

- cbd4c9d: Browse the Mods Store by section: Mods, Sounds, Albums and WiPs have their own tabs, and Maps joins them with the Custom Maps experimental option. Hero and category pickers sit next to search, while the rarer filters (updated, added, NSFW, outdated) live in the Filters menu.
- a9d8a8b: Block mod changes while Deadlock is running, with a setting to turn it off.
- a9d8a8b: Add a connection diagnostics tool that pinpoints why a page failed to load.
- e991797: Add a Privacy setting to clear saved NSFW choices and restore preview blurring.
- 799d231: Add an opt-in setting that restores the vanilla gameinfo.gi when Deadlock closes, so launching from Steam starts the game without mods
- 374d9c9: Flashbang now randomly forces Light Mode when the app loads (configurable chance, 1 minute cooldown) instead of using a fixed time window
- 5de7f61: Let users skip a mod update until a newer one is published, and stop flagging updates when an author only adds files you didn't install
- 85b515a: Organize mod pages into Overview, Changelog, Comments and Files tabs
- edf83d7: Add an items tab and live match charts to Stats
- 1f98b35: Show catalog sync activity and add a clear-and-resync action in Settings Tools.
- edf83d7: Add detailed match history and interactive item timelines to player stats
- 615beb0: Browse mods from a local copy of the GameBanana catalog
- 8b9bcee: Add a Shards page to developer mode for inspecting addon folders
- 12e5de0: Add an Experimental shortcut to the sidebar for quicker access to experimental features
- 8ad9a4b: Manage every mod for a hero on the Hero Skins page, and retry failed downloads
- 5c14a56: Add and delete hero skins directly from the Skins page
- fc07a56: Download and check GameBanana mods directly with verified, locally cached metadata.
- edf83d7: Add a Stats page with performance, hero and teammate dashboards
- 3240213: Add opt-in 1-click installs from DeadlockForge, with confirmation.
- 12e5de0: Add the Mod Foundry: import a skin, recolor it, swap its cards and sounds, and export a working VPK
- edf83d7: Add a live tab to Stats showing ranks and stats for everyone in your match
- fd012ce: Add tools to reinstall broken mods and rebuild mod state
- 8b9bcee: Migrate existing profiles to the new addon folder layout on first use
- 1e1cadf: Show download progress and remaining content count in the server join dialog
- 8b9bcee: Allow more than 99 enabled addons by spreading them across addon folders
- edf83d7: Keep the live match board across restarts, show the matchmaking queue beside it, and cut the cost of following a running match
- 208f11d: Add catalog refresh and skip fetching details for unchanged mods
- 300ab77: Choose which VPK files of an installed mod are enabled from the Installed Files list

### Experimental Changes

- Add Mod Compatibility Repairs for outdated skins, animation rigs, camera interfaces, materials, and shared game data. Enable it under Settings > Experimental, then select Compatibility for the affected mods in My Mods. Repairs use a separate package and leave original mod files unchanged.
- Fix the camera and aim points in skins built before Deadlock changed its root attachment frame, while preserving custom attachment offsets.

- 6d8293c: Add performance configs: apply curated community gameinfo.gi configs, configs from GameBanana or your own imports on a new Performance page, edit every setting they change with typed controls, and share them. The manager edits gameinfo.gi in place next to your mods, leaves out settings Deadlock no longer reads and engine-section edits unless you include them, and writes the config again after game updates. A crash check after launch lists what changed since your last normal session.
- f3bfa9e: Fix compatibility repairs for overlapping skins and mod variations
- f3bfa9e: Fix skipped skin camera repairs caused by small exported root rotation differences
- f3bfa9e: Fix repaired Grey Talon ultimate models failing to load
- f3bfa9e: Repair custom animations after skeleton changes and group repeated repair details
- f3bfa9e: Fix skin animation repairs blocked by retired UI animation graphs
- f3bfa9e: Validate rebuilt mesh and control blocks before applying compatibility repairs
- f3bfa9e: Fix outdated skin cameras when the authored root has a position offset
- f3bfa9e: Detect untracked enabled VPKs and use actual load order in compatibility reviews

### Patch Changes

- b370dbb: Fix the What's New heading for releases without translated notes
- a7cd243: Fix local mod names showing internal IDs and recover saved names
- 5554546: Return to the Default profile when the active profile's folder was deleted
- c763011: Fix Linux CEF crashes when opening file and folder dialogs
- b370dbb: Preserve frontend error messages in desktop logs without custom error fields
- 0c45865: Choose which skin to keep and review replacements when enabling mods
- 5554546: Fix switching to profiles whose names contain non-English letters
- f22926b: Validate animation dependencies before and after repairs, restore camera metadata from valid attachments, and repair legacy movement-sound bindings.
- 0c45865: Restore original conflicting skins after a diagnostic mod search
- 71c0ee4: Spread seasonal hideouts across real pages, including settings sub-pages
- b370dbb: Reduce updater log spam while keeping download totals and failure details
- 5554546: Install imported profile mods in the load order the sharer set
- 0c45865: Speed up compatibility checks and explain mixed skin animation dependencies
- 0e657f7: Stop addon analysis from listing leftover files in profile subfolders
- 45851c9: Fix updates installing mod variants that were never selected
- a7cd243: Fix library rendering, consent, downloads, update checks and profile labels
- f22926b: Keep compatibility repairs current after library changes, report stale fixes accurately, and reuse unchanged data to speed up rebuilds and launches.
- 0e657f7: Show the addon review list whenever analysis reports an error
- fa0ff6d: Keep a running download from being marked failed when it is requested again
- b9916d0: Fix fixed mods losing their repairs after other library changes
- b51a4b8: Keep the active profile loaded in game after enabling a mod
- 08d0fbf: Back up an unreadable settings file and explain why settings were reset
- 6f1547d: Keep the library responsive while the repair package rebuilds
- f815b69: Keep variant file names attached to the right files after repairing a mod folder
- fa0ff6d: Show each download error once when several files of a mod fail the same way
- 6819b31: Keep both skins when one mod is made to go on top of another
- 21e7900: Fix modded launch failing when a mod file cannot be read
- 41bbeca: Fix Steam launch warnings when match sync is still fetching matches
- 21e7900: Fix mods that ship older copies of game data or text
- cdec390: Fix duplicate and missing heroes in the Discord Rich Presence hero picker
- 39dc269: Improve app responsiveness and cut idle GPU use from the animated background
- 8215ed4: Fix game launches on Linux when Steam is installed as a Flatpak or Snap
- 718218b: Starting Deadlock with match sync on no longer shows Steam's "logged in on another computer" prompt.
- 21e7900: Fix silent footsteps and movement sounds on older hero skins
- cdec390: Fix Linux GPU detection and preserve explicit compatibility settings
- 21e7900: Fix adjusted and missing camera points on older hero skins
- 3920c28: Turn match data sharing off by default and only start it after the user consents
- 6c300f5: Fix Linux updates for Flatpak, Debian, RPM, and CEF installations
- 21e7900: Update mod animation skeletons when the game adds bones
- a1f2286: Check installed mods against the current game after installs and game updates, badge mods made for an older version, and fix them from the library or before launch without the experimental flag. Mod files are never changed, and any mod can go back to its original files
- 9b06f22: Fix access-denied errors when combining shared mod changes on Windows.
- 5382703: Add Enable all mods to the library menu, with a recap of what was enabled, skipped or failed and a button to finish each one
- 2628eea: Smoke test Wry and CEF Flatpak bundles before publishing releases
- 344c40e: Cancel a launch from the launch overlay or the toolbar instead of waiting up to three minutes for Deadlock to start
- 2628eea: Use packaged protocol associations for Flatpak deep links
- c9cfea6: Read the live GameBanana file list in Manage files, show download progress while applying, and show the real error when a file cannot be fetched
- 2025231: Open Manage files for mods that ship several VPKs, so their files can be turned on and off from the library as well as the mod page, alongside variants
- 5f0b3b6: Add optional minimize to tray and close to tray, with a tray icon to restore or quit the app
- fa994af: Fix mod updates failing with "GameBanana file was not found" after an author replaces their files
- 2a4b721: Keep the new install date for every mod after a batch update, so updated mods stop showing as outdated
- 861b13c: Align Settings switches across rows and window sizes; titles no longer toggle
- d45d8ad: Reinstalling a mod whose files were deleted outside the app now installs it again instead of leaving it only downloaded
- 64eb750: Close the variant picker on backdrop click instead of opening the mod page.
- 220b9f7: Fix variants that share a VPK filename overwriting each other when installed
- 220b9f7: Fix re-enabling a file after a mod update restoring its pre-update copy
- d9d0cb1: Add mod folder repair with restorable backups and safe staging recovery.
- 9c42228: Fix gap where no Back button is visible while scrolling a mod page
- bc90972: Stop crashing when adding large local mods (up to about 1 GB), whether dropped or chosen in the file picker.
- 300ab77: Fix enabling a GameBanana mod file that was not installed yet, which failed with "Download URL scheme must be http or https"
- 220b9f7: Fix profile imports failing with "no VPKs found" while mods still extract
- 40531b3: Fix gameinfo resets and offer to make read-only mod files writable
- c284339: Fix failed update checks incorrectly reporting the latest version
- 9dc0d04: Fix mod updates dropping newly added or renamed VPK files
- 220b9f7: Show the read-only file prompt again when installing over a read-only VPK
- 5019a5e: Add Baba, Chessmaster, Deadpack and Rat King to hero pickers, Foundry imports and Discord presence portraits
- d45d8ad: Retrying a mod update right after it failed no longer fails with "Backup already exists"
- 9dc0d04: Keep the saved VPK selection when re-enabling a disabled mod
- 9dc0d04: Remove stale installed mods when their addons folder was wiped outside DMM
- b96bc35: Download cards now show the size of only the variants you downloaded.
- 9dc0d04: Check for missing mod files before a modded launch and offer to reinstall or disable the affected mods
- Preserve original addon filenames when identifying mods, including compatibility ownership checks.
- Keep load order when re-enabling mods in profiles with more than 99 mods.
- Open the Performance editor on changed settings and clarify settings the game ignores.

- 2aa45ef: Fix updating a mod to a variant you had not installed before failing with "No VPKs matched the update selection"
- b0c5da5: Fix Skip for Now not advancing setup past existing mods
- 93763a8: Fix catalog sync after upgrading older development databases
- 6d8293c: Give confirmation dialogs an icon, more room for the message and a separate button row
- 8102f13: Fix lost imports and stale VPK ownership after Grimoire moves files
- 6d8293c: Mark Mod Foundry, Stats and Performance with a "New" badge in the sidebar until you open them
- dec4de2: Fix updates failing for mods whose author archived older files: the update dialog now marks archived files as outdated, selects only current files by default, and explains why one file must stay selected
- 173b044: Restore author profiles from Mods Library and preserve the return destination
- 3134bd5: Fix detected mods showing their installed archives as needing download
- 1e48334: Open release notes on the website changelog instead of GitHub from What's New, the Dashboard, About and the splash screen
- 7294b28: Mod updates now remember the files they actually installed, delete their downloaded archives afterwards, and no longer leave a failed update stuck on "Extracting..."
- bea17db: Preserve installed mods when enabling another mod after upgrading from V1

  Avoid intermittent database lock failures when initializing the local mod catalog.

- eaeb8ae: Fix native Steam game detection on Linux alongside leftover Flatpak installs
- 0a5a109: Add missing Simplified Chinese translations for catalog sync, filters, and patch notes
- d58f469: Add a button to wipe the local GameBanana catalog from Debug and Settings
- 4365ba4: Fix zoom in and zoom out so the app keeps filling the window instead of shrinking into the corner.
- fa943c9: Fix Discord presence showing Street Brawl as a bot match with a 6-player party.
- dffeec5: Fix download progress and speed jumping around, and never reaching 100%
- 5e14be5: Save the latest mod state before the app closes, so a mod enabled or installed just before closing keeps its status after a restart
- fdb5f3f: Fix hero filters in the Mods Store returning nothing. Mod details such as heroes, download counts, and descriptions now load for the whole catalog, sound previews play from the store, and update badges show when a mod has new files. NSFW blurring now matches what GameBanana hides, and the catalog no longer drops mods that move between pages while it syncs.
- aeca5f4: Fix localized hero name art (e.g. Korean) showing as plain text when mods are enabled by writing the current `Game_UILanguage` and `Game_LowViolence` search paths to gameinfo.gi
- 5e14be5: Show the Discord presence preview image from the app instead of loading it from Discord's CDN
- 2f18d23: Add Baba, Deadman Danny, Nurse Harrow, Rat King, Solomon and Violet to hero detection, the Skins page and the Foundry.
- 757dfe5: Remember the variant picked at download when enabling a mod
- b0992fe: Hide NSFW mods on author pages when Hide NSFW Content is enabled
- 5970027: Fix the Nix package failing to start when launched with `--disable-auto-update`
- 530ff46: Restore installed mods a migrated library showed as unfinished downloads
- 02300e2: Preserve gameinfo.gi line endings when toggling mods or updating profile and server search paths.
- 899eb4b: Update outdated mod warnings and filtering for the City Never Sleeps update.
- 09ea114: Only read Steam account configuration for match sync after consent is accepted and sync is enabled.
- c7cc89c: Add a match data sharing step to onboarding, so new users can turn it off before it starts.
- 3fd7fe4: Stop the Mods Store from rescanning your addons folder for every card that scrolls into view.
- 0cadbbe: Fix mod update checks failing after a restart because saved install dates were read back as text
- 5c0ae7e: Show download progress while updating mods, in the update dialog and on the Update buttons. The update dialog can now be closed while the update keeps running.
- 7c868fb: Add a search box to the settings sidebar. Results show where each setting lives, and selecting one opens its tab and highlights the section.
- 8ce81cd: Polish the Mod Foundry: solid entry cards, a cleaner skin import dialog, a pinned Paint button, a clearer toolbar, and no more lag selecting files or sounds in large skins
- d09fb11: Keep active downloads intact when the same mod is requested twice
- 8f89901: Fix CEF builds after Tauri moved the CEF runtime into its own crate, and read the hardware ID without the machine-uid plugin. The CEF Flatpak starts again, and the CEF `.deb` now declares the NSS, GBM, ALSA and xkbcommon-x11 libraries it needs.
- 25a668d: Make the mod store, dashboard and search much faster: cards load small thumbnails, the store loads mods as you scroll, searches return in milliseconds, and browsing no longer uses up the GameBanana request limit needed for mod pages and downloads.
- b7c9278: Improve crosshair browsing with clear selection, previews, and visible actions.
- d86526d: Improve Mod Foundry tabs with visible labels and clearer selection states.
  Soften panel backgrounds to improve readability over theme artwork.
- b91614b: Add a standalone Windows executable download using the default data locations.
- 2cc198e: Fix custom crosshairs in Steam account settings and restore them when disabled
- 933f547: Clean up saved match sync data for removed Steam accounts when match sync is enabled
- cbab84a: Report failed download lookups per mod instead of aborting the whole batch update or profile import
- c864567: Turn off the Background plugin when a theme is selected
- 1d8e407: Process every selected archive when installing multi-file mods. Preserve selected variants and their exact file mappings when switching, re-enabling, and updating mods.

  Report accurate file counts for multiple single-VPK downloads without an extra selection prompt, and cap direct variant downloads at 2 GiB.

- 5aaf4f8: Install a Deadworks server's maps and addons before joining it
- 29f1e21: Fix enabled mod counts and profile mod names
- cbab84a: Fix direct GameBanana downloads, catalog recovery, and policy metadata.
- ab1339d: Fix Flatpak startup crashes on Wayland compositors
- 573b665: Fix buttons showing a spinner next to their icon while loading
- db77591: Report Steam launch failures and confirm Deadlock starts after each request
- 8b9bcee: Fix addon backups being modified while being validated, and reject mod IDs containing path separators
- 0097615: Respect remembered NSFW show/hide choices only when enabled
- 5beaed9: Recover from stale VPK records instead of failing the mod load order save
- fc3f7b4: Show the active variant count next to a mod's file settings button
- c864567: Fix themes turning off permanently when the Background plugin is enabled
- 8b9bcee: Show mods whose addon files are missing as downloaded, not enabled
- 1e1cadf: Fix server content progress showing "0.00 B" while unpacking maps and addons
- 1d8e407: Apply the global NSFW hide preference to the mod library, hero skins, assignment choices, and direct mod-detail links.
- 12e5de0: Credit vpkmerge and ValveResourceFormat in Settings → About
- 0097615: Fix hidden NSFW mods appearing on the dashboard
- 1d8e407: Fix older saves overwriting recent mod installation and download state
- 1872459: Show only selected VPKs in the mod page's installed files list.
- 99b4b6b: Fix a security issue where a malicious mod archive could write files outside the extraction folder. Archives whose entries use absolute paths or `..` segments are now rejected instead of installed.
- 9c43d25: Join the server you clicked instead of landing in the hideout
- 9c43d25: Keep server passwords out of logs and launch-option injection
- d91d030: Fix VPK state drift during deletes, batch updates, profile switches, and restore
- d91d030: Preserve mod metadata during VPK replacement, clean up failed update extractions, and recognize uppercase VPK downloads. Reconcile profiles without overwriting concurrent changes, verify restored files on disk, and retry unavailable mod metadata. Keep inactive-profile cleanup from clearing active-profile progress and visibility.
- edf83d7: Improve Stats dashboard and player card loading performance
- 1f98b35: Show GameBanana preview images and likes on the Mods Store and Dashboard
- fd4234f: Show Deadworks community servers with live ping and their custom maps
- a83049b: Fix hero mod swaps from the mod store not applying
- Updated dependencies [8547a02]
- Updated dependencies [2f18d23]
- Updated dependencies [25a668d]
- Updated dependencies [2cc198e]
- Updated dependencies [1f98b35]
- Updated dependencies [cbab84a]
- Updated dependencies [34cbd98]
- Updated dependencies [55be2ff]
- Updated dependencies [437e943]
- Updated dependencies [cbab84a]
- Updated dependencies [fd4234f]
- Updated dependencies [c1a5b52]
- Updated dependencies [cdec390]
- Updated dependencies [cdec390]
- Updated dependencies [4970162]
  - @deadlock-mods/shared@2.4.0
  - @deadlock-mods/hero-parser@1.1.2
  - @deadlock-mods/crosshair@0.2.7
  - @deadlock-mods/common@1.3.1
  - @deadlock-mods/vpk-parser@1.1.0

## 1.1.0

### Minor Changes

- cd10b4d: Add retry actions for failed downloads in the queue and mod screen.
- 00f82c8: Add opt-in match data sharing. When enabled, the app recovers your local Steam login on your machine to fetch your own Deadlock match salts through Steam's Game Coordinator and contributes them to deadlock-api trackers. It never sends your token, password, or personal data, only runs while Deadlock is closed, and is throttled and hard-capped at 40 fetches per 24 hours per account.
- 335aa31: Add a Skins page for choosing which single skin each hero wears
- 911a0e6: Show GameBanana requirements and local mod links on detail pages

### Patch Changes

- 727bc7c: Fix the Linux Flatpak crashing to "Aw, Snap!" on launch
- 380477d: Fix unreliable mod load order saves
- fec53a9: Fix custom crosshairs remaining active after they are disabled
- 6d9be1e: Show download progress on mod action buttons
- 4522cf8: Fix deleting a mod whose download never finished
- 727bc7c: Show the correct app version in software stores on Flatpak
  - @deadlock-mods/shared@2.1.0

## 1.0.0

### Major Changes

- 9fe835d: Complete UI overhaul with redesigned navigation, layouts, and visual styling

### Minor Changes

- c6b3e4b: Improve local mod drag-and-drop handling on Linux
- e0f2bc6: Add mod variant picker for multi-VPK installed mods
- 9946781: Add parallel batch detection and reduce lock contention
- 9946781: Add hero detection for mods via VPK path analysis with conflict warnings when activating multiple mods for the same hero
- 8073e73: Add telemetry consent to onboarding and show a one-time prompt when analytics is off
- 79388f9: Add mod favorites with star toggle on cards and inline favorites filter in the Mods Store
- 2aaad71: Add multi-select file management for mods with multiple download archives
- be4f982: Sort mods in the library by load order by default
- 4032210: Add Belarusian language support (thanks drodn from Discord)
- 83ba839: Add "Disable all mods" button to My Mods page overflow menu
- b2a753f: Show active mod VPK filenames on the mod detail page
- 0c77517: Add optional custom Steam path setting with auto-detection as the default
- 222cb30: Add autoexec command library with search, clear, and launch toggle
- 0ea2c42: Automatically reset gameinfo.gi to vanilla and retry launch when game configuration is corrupted
- 9946781: Improve hero parser with header-only VPK parsing and caching
- 0920a18: Redesign onboarding wizard with gold gradient border, segmented stepper, animated step transitions, and Deadlock-themed styling
- d6f9d6e: Improve rich HTML mod descriptions with GameBanana color classes, styled lists, copyable code blocks, and in-app navigation for GameBanana mod links
- 053ec35: Overhaul Custom Theme Builder with ambient effects and controls
- 60761cb: Add Server Browser page to discover live Deadlock servers, filter by region, mode, password and player counts, view player and required mod details, and join games directly from the app.
- 9946781: Pause hero parser automatically when Deadlock is running
- 63fc8d2: Remove Discord Rich Presence plugin in favor of the dedicated Discord Game Presence feature
- c6b3e4b: Add bundled font install prompts and cleanup for local mods
- 9946781: Add critical game path detection with warning dialog
- 76f0c96: Add optional CEF runtime support as an alternative to the system WebView
- f897fa2: Split monolithic commands.rs into 18 domain-aligned modules and split api.ts into separate HTTP client and Tauri IPC modules for better code locality and maintainability
- 9c20240: Add stable/nightly update channel selection in Settings, with a rolling nightly release tag and version-pinned updater URLs.
- c3e0364: Add Flatpak self-update support with secure bundle download and installation
- 23dd041: Add Korean language option in settings
- 9946781: Move hero parser to async background thread to prevent UI lag during mod scanning
- 87380df: Add proxy support with HTTP, HTTPS, and SOCKS5 configuration in Settings

### Patch Changes

- 9873701: Add "Delete All" button to the unrecognized VPK scan alert for bulk-removing rogue VPK files from the addons folder
- 9946781: Fix hero detection edge cases and improve reliability
- 74eeb46: Fix CEF Flatpak bundle missing the CEF runtime by using a dedicated manifest that preserves the full runtime directory layout
- 6dbaf58: Fix variant switching dialog losing previously downloaded archives and not showing which variant is active
- 43a3acf: Redesign the unrecognized VPK alert in My Mods as a compact recovery task.
- 8a3a8bb: Improve NSFW label contrast on mod previews (destructive styling, ring, shadow).
- 909fb79: Show "Extracting..." state in multi-file download dialog after download completes
- 2d45d0e: Replace dashboard trending rail scrollbars with a minimal scroll progress indicator
- 8a3a8bb: Fix Mods Library header overlapping title and actions at narrow window widths
- f86809b: Enable themes plugin by default for new installs
- 8a3a8bb: Improve featured Mod of the Week selection so highlights rotate more evenly across top mods, and omit obsolete or outdated listings (same rules as the mod store).
- 688cbd5: Fix broken skeleton loading state on Mods Store page to match actual card and search bar layout
- b8bded5: Fix local addon paths stored as absolute instead of relative filenames
- 87380df: Harden proxy config logging, health check, and port validation
- 6f3eb36: Fix slow mod detail loads by showing cached mod data immediately
- 6871199: Remove CrabNebula OTA updater; app updates now use the native Tauri updater only
- 1eeb5d3: Fix manifest sync: persist analyzed mods to .dmm.json and hydrate mod repository from manifest on profile load
- 87380df: Move proxy settings from Application to Network settings tab
- 3ee2cd1: Hide Themes plugin from the plugins list
- a9284a3: Fix mod toggle in store cards navigating to mod detail page
- e243a4c: Fix update dialog to preselect only previously installed downloads
- 1eeb5d3: Fix profile VPK manifest state drift and audio preview playback clicks.
- 89120ff: Fix addon analysis not linking all VPK files when multiple VPKs belong to the same mod
- ee8c1ae: Add skeleton loading state to individual mod detail page
- 82baed6: Fix locally added mods opening a blank detail page instead of showing mod info
- 688cbd5: Show user-friendly error messages in error boundary instead of raw technical error codes
- 38d8222: Fix audio preview creating separate OS audio streams per mod card, causing volume mixer spam on Linux/PipeWire
- 82baed6: Fix VPK files being rejected as invalid when dragged into the add mods drop zone
- 8a3a8bb: Add plain-language descriptions next to each Danger Zone action in settings tools.
- 8a3a8bb: Fix Mods Store and Maps store lists being clipped at the bottom so the last row scrolls fully into view
- aa089d7: Fix sidebar transparency slider direction so that 0% is fully transparent and 100% is fully opaque
- 0675fd8: Make the Plugins settings section available without the show-plugins feature flag
- 8a3a8bb: Fix dashboard "In Queue" stat to only count mods actively downloading
- 8a3a8bb: Tighten collapsed sidebar logo spacing.
- 46353b6: Stop showing a global error toast when optional hero avatar images fail to load
- 8a3a8bb: Remove duplicate NSFW badges on dashboard previews when the blur overlay already shows the label.
- 2d45d0e: Fix VPK scan alert text clipping into the mod grid when the unrecognized files list is visible
- db10d13: Fix missing libcef.dll in CEF builds by centralizing CEF flag injection.
- 749945f: Remove duplicate addons backup section from Settings (Tools tab); backups remain under Backups.
- 52139a6: Preserve My Mods library order when filtering by install status.
- a1f165b: Improve VPK disable and delete reliability on Windows with retries and clearer in-use errors
- 1b2fa95: Fix installedFileTree not being populated for multi-archive downloads, addon analysis, and manual local addons
- 2aaad71: Fix multi-archive download file count, variant switching with shared VPK names, and stale VPK content after variant swap
- 5fcc73d: Fix Deadlock launch failures on Linux when Steam is installed via Flatpak by probing additional fallback Steam directories.
- 832ba1d: Fix settings UI consistency, store persistence, and theme isolation
- 9b65961: Fix non-scrollable lists in dialogs (file download, file selector, mod options, server join, font install, server detail)
- 3400254: Fix game path resetting to auto-detect on every restart on Linux
- 0665051: Align server browser required mods with Deadworks Relay and show mod source links
- 9946781: Move VPK caching and parallel detection to shared package
- 43a3acf: Fix mod button loader not spinning during extraction and pause
- a9284a3: Fix themes being permanently disabled after the themes settings migration removed the manual enable toggle
- 2d45d0e: Fix sidebar group labels overlapping menu items at small window heights
- 9946781: Remove duplicate Mods Backup section from Tools settings
- 8a3a8bb: Fix false "update available" for mods restored from the VPK manifest by recording download time during restore.
- 8a3a8bb: Shorten nightly build version in the sidebar and splash with a visible Nightly label, full build details on hover, and fix release notes links for nightly builds
- Updated dependencies [9946781]
- Updated dependencies [9946781]
- Updated dependencies [700bfe8]
- Updated dependencies [2c9d7a0]
- Updated dependencies [9946781]
- Updated dependencies [0665051]
- Updated dependencies [9946781]
- Updated dependencies [2dfceee]
  - @deadlock-mods/hero-parser@1.1.0
  - @deadlock-mods/shared@2.1.0
  - @deadlock-mods/common@1.3.0
  - @deadlock-mods/crosshair@0.2.4
  - @deadlock-mods/vpk-parser@1.0.1

## 0.18.0

### Minor Changes

- 0687f21: Add GameBanana file server selection with latency testing
- b573253: Add HTTP request/response logging for outgoing fetch calls
- 2c60dab: Add "How to Play" card with instructions for custom maps
- 83915cf: Better image display in mod gallery and mod detail page.
- 9b7ea81: Add button to open installed map mods in file explorer
- b866299: Apply pagination setting to Mod Library page
- 8c82dfc: Add tooltips to collapsed sidebar icons showing the navigation label on hover
- d226a46: Add dedicated Maps section to sidebar for browsing custom maps
- 7074850: Add ability to disable mod report submissions for specific mods
- bdfbd79: Replace report dialog with streamlined broken-mod reporting flow
- b573253: Add custom map support with sync, installation, and browsing
- 795024d: Add Launch Map button with pre-launch safety warnings
- 0687f21: Add download server selection step to onboarding

### Patch Changes

- 333e9dd: Update game config error message to reference Settings > Game
- 74c9952: Disable reports on maps
- 84c90d7: Decouple archive extraction from the download queue
- 5eb1395: Make the What's New dialog scroll when release notes are long
- Updated dependencies [795024d]
- Updated dependencies [0687f21]
- Updated dependencies [2c60dab]
- Updated dependencies [82ec280]
- Updated dependencies [791de90]
- Updated dependencies [7074850]
- Updated dependencies [bca8aae]
- Updated dependencies [b573253]
  - @deadlock-mods/shared@2.0.0
  - @deadlock-mods/ui@0.3.1
  - @deadlock-mods/crosshair@0.2.3

## 0.17.0

### Minor Changes

- a1f5cac: Add time period filtering to mod store and allow sort stacking with filters.
- 35a5c5e: Use Deadlock game directory for crash dumps instead of Windows CrashDumps
- 35a5c5e: Add logging settings with log file access and AI troubleshooting help
- cdc7e96: Add an Application setting to choose between paginated and continuous scrolling in the Mods Store, with pagination enabled by default on Linux.
- e7b2601: Add theme override system to decouple themes from base components
- 35a5c5e: Add crash dump parsing for AI troubleshooting support
- 14f25fb: Add configurable backup strategy with options to disable auto-backup before batch updates and limit the maximum number of backups kept on disk
- 35a5c5e: Add log source selection for Ask AI feature with context-aware prompts
- 1ed5477: Users should be less likely to be signed out now.
- 76f0355: Add GameBanana sound categories as category filters with clearer labels (Ability Sounds, Weapon Sounds, Voice Lines, Kill Sounds, Music)
- e7b2601: Add Deadlock API theme with electric border effects and red glow accents
- e41a185: Add unified HSV color picker component.

### Patch Changes

- a1f5cac: Switch mod store sort to relevance while searching and restore the previous sort when the search is cleared.
- d10b424: Fix "Stop Game" button incorrectly showing when the game is not running
- 054a358: Make quick filters respect include/exclude mode
- 25ee389: Fixed installation hang if user exits the install popup.
- 14f25fb: Fix manual backup creation not enforcing retention limit, and warn users before oldest backups are removed
- e41a185: Made settings sidebar scrollable.
- 35a5c5e: Fix Ask AI log copy to clipboard on desktop.
- 14f25fb: Move addons backup settings into a dedicated Backups tab in Settings
- a1f5cac: Tighten mod store fuzzy search so fewer weak matches appear in results.
- b2fa246: Improve gallery navigation arrows visibility and add missing translations
- 3616512: Check for CrabNebula OTA updates only when using Check for updates; native updater still checks on a schedule
- 35a5c5e: Add T3 Chat as AI provider option for logging
- f3b9fed: Fix mod card showing stale state after enable, disable, or delete
- Updated dependencies [a8a0e2c]
  - @deadlock-mods/shared@1.8.1
  - @deadlock-mods/crosshair@0.2.2

## 0.16.0

### Minor Changes

- 6b97042: Replace AppImage with Flatpak for Linux distribution. The `.deb` and `.rpm` targets are retained.
- 8a71272: Auto-detect NVIDIA GPU on Wayland with Auto/Force On/Force Off modes to avoid perf loss on non-NVIDIA
- 45c90ca: Fix macOS compatibility: platform detection, game path sync, deep links, and cross-platform mods storage

### Patch Changes

- ab3984c: Improve Flatpak packaging: bump GNOME runtime to 49, enrich metainfo with developer info and input controls, ship standalone .desktop file
- a94cf40: Fix local mod installs getting stuck with invalid state
- af92a10: Throttle app update checker to prevent excessive requests to the update server
- 87fa249: Fix false update prompt right after mod installation
- 6b97042: Show download progress percentage in multi-file download dialog
- e591195: Update OTA plugin version
- 6b97042: Add volume slider in bottom bar for quick audio level adjustment
- e7342a2: Throttle React Query usage: shared constants, remove unused OTA hook, and sensible defaults to avoid rate-limiting and excessive refetches
- 87fa249: Fix wrong mod file deletion after reordering
- 6b97042: Fix critical and high security vulnerabilities by updating dependencies and adding pnpm overrides
- 87fa249: Fix empty Mod Load Order dialog on first open
- a94cf40: Replace console.log with structured logging in store migrations

## 0.15.0

### Minor Changes

- 609d464: Add opt-in Linux GPU optimization setting to improve WebKit rendering compatibility on Linux systems with specific hardware/driver combinations
- 5dc0961: Add individual mod update button on mod detail page
- a833006: Add polling and separate install flow for app updates with visual indicator in bottom bar
- 5dc0961: Add "Update All" button to mass update all mods with automatic backup and new check-updates API endpoint

### Patch Changes

- 7f22230: Fix opening folders, URLs, and browser flows on Linux AppImage by restoring proper PATH with fix-path-env and migrating from deprecated tauri-plugin-shell to tauri-plugin-opener
- 8dc4d25: Keep Game_Language in gameinfo.gi SearchPaths rewrites
- e5c33c0: Fix security issue where embedded links in mod descriptions and announcements could navigate the webview away from the app
- 4308745: Fix "Back to Mods" button navigation to return to the previous page (Mods Library or Mods Store) instead of always going to Mods Store

## 0.14.1

### Patch Changes

- 89fc9be: Fix eyedropper button closing color picker modal immediately after click
- 89fc9be: Replace plugin enable/disable button with a toggle switch and update back button to match app-wide ghost style
- 89fc9be: Fix Arcane theme border colors not updating when accent color changes

## 0.14.0

### Minor Changes

- 5492b25: Remove sudo plugin from desktop application
- cb40fc6: Detect when mod files change during sync, set filesUpdatedAt, dismiss unverified reports, and show "Updated recently" and "Update available" in the desktop UI
- 5492b25: Add Arcane theme with customizable accent colors and gradient effects
- e71c61f: Add GameBanana issues page disclaimer to report dialog with direct link

### Patch Changes

- 2c13cda: Fix local analysis mods being deleted instead of renamed when disabled
- 2c13cda: Fix reordering mods re-enabling disabled mods and deleting a disabled mod leaving files behind
- 70c00ca: Fix local mods imported via Add page not being toggleable
- 2fef46f: Fix split replay storage by symlinking to a single location
- cb40fc6: Add stale mod warning when a mod has multiple open reports and has not been updated for 30+ days.
- Updated dependencies [48f028f]
- Updated dependencies [cb40fc6]
  - @deadlock-mods/shared@1.8.0
  - @deadlock-mods/crosshair@0.2.1

## 0.13.1

### Patch Changes

- 3176d05: Add third-party content disclaimer as first onboarding step to meet code signing requirements
- 30074df: Add translation helper script (`pnpm translate`) with step-by-step workflow and pause/resume support
- c95b5e1: Add SignPath code signing integration for Windows builds in release and nightly workflows
- 552a5bd: Add Bulgarian language support to the desktop app
  - @deadlock-mods/shared@1.7.0

## 0.13.0

### Minor Changes

- 6cbb882: Fixed broken deep links

### Patch Changes

- 6cbb882: Improved logging in desktop app
- 6cbb882: Ensure we identify logged in users using their USER ID

## 0.12.0

### Minor Changes

- Auth refactor

## 0.11.1

### Patch Changes

- - UX improvements to custom crosshairs (option to disable, delete them)
  - Japanese translations

## 0.11.0

### Minor Changes

- f48352c: Add crosshair publishing feature with database schema, API endpoints, and desktop UI for creating, publishing, and applying crosshairs

### Patch Changes

- 1f3ef82: Fix plugin asset import handling in the desktop app.
- f92b2fd: Improve Cache Ingestion to be more efficient
- f381901: fix(desktop): update zoom shortcut key and improve shortcut display formatting
- Updated dependencies [f48352c]
  - @deadlock-mods/crosshair@0.2.0
  - @deadlock-mods/shared@1.7.0

## 0.10.1

### Patch Changes

- 4812ebe: Fix VPK numbering to fill gaps sequentially instead of appending to the end
- 4812ebe: Fix profile import not skipping file-tree dialog for multi-file mods
- 3118884: Fix VPK file selection dialog appearing when re-enabling mods with multiple files

## 0.10.0

### Minor Changes

- 3127b8d: Annoucements and admin dashboard
- 6d48f52: Add developer mode toggle and dedicated developer tools page
- f02f058: Add user-specific feature flag overrides with experimental features UI
- bca1b80: Add comprehensive plugin system with dynamic loading, global rendering, and extensibility. Includes official plugins: Background (custom backgrounds with opacity/blur), Discord (Rich Presence integration), Flashbang (scheduled light mode), Themes (UI theming including Nightshift), and Sudo (mod conflict detection). Plugin system is hidden behind show-plugins feature flag for controlled rollout.
- bca1b80: Add feature flag to show plugins functionality and implement it in settings page
- a15e7ca: Add VPK file replacement feature for mod developers. Mod creators can now replace VPK files directly from the mod detail page when developer mode is enabled, allowing for rapid iteration during mod development without full reinstallation.
- 82aad00: Folder based profile management
- bca1b80: Add Bloodmoon theme with black-red gradients and crimson accents
- 56686c9: Add Ingest Tool
- 6d48f52: Overhauled download system with Rust-based implementation that downloads mods directly to the addons folder

### Patch Changes

- 6d48f52: Fix download total size displaying as 0.00 B by properly storing download file information
- 8f80182: Don't remove mods from addons folder in vanilla mode
- Updated dependencies [f02f058]
- Updated dependencies [82aad00]
  - @deadlock-mods/shared@1.5.0
  - @deadlock-mods/ui@0.2.0
- Updated dependencies [3127b8d]
  - @deadlock-mods/shared@1.6.0
  - @deadlock-mods/ui@0.3.0

## 0.9.2

### Minor Changes

- 6f93442: Game path settings

## 0.9.1

### Patch Changes

- Fix Posthog integration

## 0.9.0

### Minor Changes

- Fix linux builds required GLS by pre-bundling it. Should also help with scroll problems (I think).
- 42c5aab: Mods Ordering
- Ability to scan local packages for existing addons
- Reporting system

### Patch Changes

- @deadlock-mods/shared@1.4.0

## 0.8.3

### Patch Changes

- Updated dependencies [5e75639]
  - @deadlock-mods/vpk-parser@1.0.0

## 0.8.2

### Patch Changes

- Fixed prefetch failures on Linux (thanks to Thyron on discord)

## 0.8.1

### Patch Changes

- Use HTTP plugin for all API calls

## 0.8.0

### Minor Changes

- 45d2f75: Major desktop UI features and enhancements
  - Add new bottom bar component for improved navigation
  - Implement filter mode for enhanced mod browsing experience
  - Add file drag-and-drop functionality for easier mod processing
  - Enhanced file selection dialogs and mod management UI
  - Integrate PostHog analytics for user behavior insights
  - Add Reddit and X (Twitter) links to the application
  - Implement audio volume control for mod management
  - Add ability to upload custom mods with enhanced processing
  - Persist filters and sort options through navigation for better UX
  - Add scrollbar to file selector dialog
  - Update ModStatus enum with better state management
  - Improved dialog handling for multi-file downloads

- 45d2f75: Comprehensive internationalization support
  - Add multiple new language support with locale files
  - Add confirmation messages for mod deletion and disabling across all languages
  - Support for Arabic, German, French, Polish, Russian, Turkish, and Swiss German
  - Enhanced localization infrastructure
  - Improved language file organization in /apps/desktop/src/locales/
  - Better language detection and switching capabilities

- 45d2f75: Enhanced theme support and visual improvements
  - Add comprehensive light mode support with system theme detection
  - Switch default theme to dark mode with updated logo colors
  - Recognize and respond to system default theme value
  - Add flashbang prevention option in settings for accessibility
  - Improved theme switching capabilities
  - Better visual consistency across light and dark modes

### Patch Changes

- 45d2f75: Dependencies and maintenance updates
  - Update dependencies in Cargo.lock and Cargo.toml for Rust components
  - Update dependencies and scripts across multiple packages
  - Improve code formatting and consistency across files
  - General maintenance and dependency updates for better security and performance

- 45d2f75: Desktop refactoring and performance optimizations
  - Optimize useDeepLink and useInstall hooks for better performance
  - Replace static fallback SVG with dynamic generation
  - Remove unused DownloadProgress component and update related UI elements
  - Split and reorganize all components for better maintainability
  - Refactor mod buttons and related components
  - Improve code structure and component organization
  - Enhanced component separation and modularity
  - Better state management and hook optimization

- 41ee2fc: Light theme support

## 0.7.0

### Minor Changes

- 7f379a5: ## 🎉 Major Features

  ### Multi-File Download System
  - **Multi-file download support**: Mods can now have multiple download files per version
  - **File selection dialogs**: Choose which files to install when mods have multiple archives or VPK files
  - **Streamlined download handling**: Improved UI and backend processing for better user experience

  ### Content Management & Safety
  - **NSFW content detection and filtering**: Automatic detection and filtering of NSFW content with user controls
  - **Gameinfo.gi management**: Advanced gameinfo.gi section replacement and management features
  - **Enhanced mod descriptions**: Rich text support using Interweave for better mod descriptions

  ### New Logging System
  - **Dedicated logging package**: New `@deadlock-mods/logging` package for better error tracking and debugging across all applications

  ## 🎨 UI/UX Improvements

  ### Visual Updates
  - **New logo design**: Updated logo across desktop and web applications with modern design
  - **Enhanced settings layout**: Improved settings page styling and organization
  - **Launch button animation**: Added smooth animations to launch buttons
  - **Improved button styling**: Better visual feedback and animation handling throughout the app

  ### Enhanced Navigation & Performance
  - **Scroll position management**: Maintains scroll position in mod cards and mods page for better navigation
  - **Improved search sorting**: Enhanced search results relevance and sorting capabilities
  - **Better mod card functionality**: Enhanced mod card components with improved interactions

  ## 🔧 Technical Improvements

  ### API Enhancements
  - **Version handling in health checks**: Better API version management and health check responses
  - **Enhanced backend structure**: Improved API architecture to support new multi-file features

  ### Web Application Updates
  - **Fixed image sources**: Corrected image references in web HeroSection component
  - **Updated documentation**: Improved README with better development instructions and screenshots

  ## 🛠️ Development & Maintenance
  - **Package.json updates**: Refined build scripts and development workflow
  - **Documentation updates**: Updated README with new screenshots and development instructions
  - **Code quality improvements**: Various refactoring and optimization across the codebase

### Patch Changes

- 4e5202f: Fix search results relevance
- Updated dependencies [7f379a5]
  - @deadlock-mods/shared@1.4.0

## 0.6.1

### Patch Changes

- 9dcc699: Support for 1-click deep links

## 0.6.0

### Minor Changes

- ba5faa1: Added support for audio mods

### Patch Changes

- 2cc1984: Removed the assumption that every launch option has a "+" prefix
- Updated dependencies [ba5faa1]
  - @deadlock-mods/shared@1.3.0

## 0.5.1

### Minor Changes

- **Enhancement:** Integrated virtualization for mods page to significantly improve performance with large mod lists
- **Fix:** Resolved "last updated" sort option not accurately reflecting actual mod update timestamps
- **Feature:** Added category and hero filters to the mods page for better mod discovery
- **Enhancement:** Added clear button (X) to search input for quick search reset
- **Enhancement:** Improved filtering and searching functionality on the mods page
- **Enhancement:** Updated UI to acknowledge GameBanana as data source

### Patch Changes

- **Fix:** Resolved Docker images compatibility issues
- **Enhancement:** Added comprehensive project guidelines and development workflows
- Enhanced mod card layout and styling for better user experience
- Various performance optimizations and stability improvements

## 0.5.0

### Minor Changes

- **Fix:** Resolved Windows crash issue caused by tauri-plugin-single-instance null pointer dereference
- **Feature:** Added "What's New" dialog to showcase new features and updates
- **Feature:** Added outdated mod warning system to alert users about outdated modifications
- **Enhancement:** Improved mod management and user experience
- **Enhancement:** Updated various UI components and layout improvements

### Patch Changes

- **Fix:** Custom Launch Options enabled/disabled status is now properly respected when launching modded games
- Updated tauri-plugin-single-instance from 2.2.0 to 2.2.2 to fix Windows stability issues
- Enhanced about dialog functionality
- Improved mod card display and functionality
- Updated utility functions for better performance
- Various bug fixes and stability improvements

## 0.4.0

### Minor Changes

- Fix mod deletion (thanks @Skeptic-systems)

## 0.3.0

### Minor Changes

- UI refactor + better download management

### Patch Changes

- Updated dependencies
  - @deadlock-mods/shared@1.1.0

## 0.2.0

### Minor Changes

- Add sentry issue tracking and fix updater permissions

## 0.1.1

### Patch Changes

- 079f045: Fixed mods unintall and added a stop game button
  - Add game stop button to toolbar
  - Fixed mod uninstallation process
  - Add support for 7zip archives
