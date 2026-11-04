---
name: pixel-diff
description: Prove a desktop screen matches its Pencil (.pen) design with a panel-by-panel pixel diff. Use when implementing or polishing UI from a Pencil design, or when asked whether a screen matches the design.
---

# Pixel diff against a Pencil design

A screen matches its design when every panel diffs to text-rasterisation noise at the design's exact size. Eyeballed side-by-sides miss 1px borders, radii, padding and colour drift; this loop finds them for you, so the user never has to.

You need the running dev app (drive it with [verify-desktop](../verify-desktop/SKILL.md)), the Pencil MCP tools, and `uv` on the PATH. Write every artifact under `.verify/pixel-diff/<run-id>/` (gitignored).

## 1. Same data on both sides

A diff of different numbers is noise. Feed the screen mock data equal to the design's: the same names, values, order, clock and selected tab. Where the design is internally inconsistent (a grade that doesn't follow from its value, a bar split that doesn't match its totals), fix the design rather than bending the code. Done when every visible string and number agrees.

## 2. Export the design panels

Pick one design node per app panel (a card, strip or table) rather than the whole screen, so a 1px shift in one panel doesn't flag everything below it. Export them at the app's `devicePixelRatio` (usually 1):

```js
Export(["<nodeId>", ...], "png", "<abs>/.verify/pixel-diff/<run-id>/design", { scale: 1 })
```

Each file is named `<nodeId>.png`.

## 3. Capture the app panels

Size the window to the design's width with `manage_window`, scroll the panels into the viewport, take a `webview_screenshot` with an absolute `filePath`, and read each panel's rect in the same scroll position:

```js
(() => [...document.querySelectorAll("<panel selector>")].map((el) => {
  const r = el.getBoundingClientRect();
  return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * devicePixelRatio));
}))()
```

Panels below the fold need a second screenshot and their own `app` entry.

## 4. Run the diff

The spec sits beside the images; its paths resolve from its own directory:

```json
{
  "bg": [17, 15, 14],
  "app": "app.png",
  "panels": [
    { "name": "pace", "design": "design/rWPdY.png", "rect": [256, 425, 760, 404] },
    { "name": "board", "design": "design/H1c3v.png", "app": "app-below.png", "rect": [256, 502, 1166, 484], "ignore": [[28, 120, 44, 340]] }
  ]
}
```

- `bg`: the page colour behind the panels, composited under the design's transparent corners.
- `ignore`: `[x, y, w, h]` boxes in panel coordinates for content the two sides cannot share, such as hero portraits drawn from different image files.

```bash
uv run .agents/skills/pixel-diff/scripts/pixeldiff.py .verify/pixel-diff/<run-id>/spec.json .verify/pixel-diff/<run-id>/out
```

It prints and writes `report.json` (mismatch %, design and app sizes, the eight largest diff regions) and one `diff-<name>.png` per panel stacking DESIGN, APP and a red heatmap.

## 5. Fix, then rerun

Fix size deltas first: until a panel's height matches, everything inside it is offset. Then open each heatmap and work through the regions, largest first. Read the exact spec from Pencil (`Get` the node: padding, gap, stroke, radius, font size, weight, line height) instead of estimating from pixels.

Known causes:

- A Pencil stroke sits inside the frame; a CSS `border` adds to the box. CSS padding is the Pencil padding minus the stroke width.
- Text with no explicit `leading-*` takes the theme's default line height, which is taller than Pencil's. Set it from the Pencil text node.
- This theme's radius scale is custom (`rounded-sm` is 4px). Use arbitrary values such as `rounded-[2px]` for exact radii.
- Colours from Tailwind's palette rarely equal design hexes. Use the hex, unless the app has a shared token for the role (such as `--viz-win`) that other screens already use; keep the token and say so.

Rerun after each batch. Done when every panel's size matches exactly and each remaining region in the heatmaps is one of:

- glyph edges (Pencil rasterises with Skia, the app with Chromium; a few percent on text-heavy panels);
- app-shell differences shared by every page, such as a wider content area;
- an `ignore`d asset.

Report the per-panel table (mismatch % before and after, sizes) and name every residual with its cause.
