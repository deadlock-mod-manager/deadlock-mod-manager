# Catalog browse

A user searches the online mod catalog and opens a mod to see its details and files. The catalog is read-only, so this proof changes nothing.

## Sub-features

- `catalog-search` filters the catalog by text.
- `catalog-detail` opens a mod page with its files tab.

## How to get to it (user POV)

- Sidebar `Mods Store`, type in the search box, click a result.
- Dashboard featured, trending or latest cards, which open the same mod page.

## Driving it with tauri-mcp

Preconditions:

- Doctor passes, including the `api` check (the catalog needs the API or GameBanana).

- **Open the catalog.** Click `a[href="/mods"]`. Wait for the search input `#search` (placeholder `Search mods or authors`).
- **Search.** `webview_keyboard` `type` into `#search` a term that matches a known mod (for example a hero name). Wait for the result grid to change, then screenshot.
- **Open a result.** Cards are not links. Click one by its title: `webview_interact` `click`, `strategy: "text"`, `selector: "<title>"`, `nth: 0`. The URL moves to `/mods/<id>`; confirm with `webview_execute_js` `location.pathname`, and the page `h1` shows the title.
- **Files tab.** Click `[role="tab"][id$="-trigger-files"]` (accessible name `Files <count>`). Its `aria-selected` becomes `true`. `webview_dom_snapshot` `accessibility` scoped to `[role="tabpanel"]` lists each archive with its size and MD5.
- **Proof.** Screenshot of the filtered grid, screenshot and snapshot of the detail page, and the pathname.

## Gotchas

- The first catalog load can take a while when the GameBanana sync runs. Wait on the grid, not a timer.
- NSFW blur can hide card images; it does not affect the proof.
- Dashboard cards are a separate entry point. Report it unverified unless you drive it.
