# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Panel-by-panel perceptual pixel diff between design exports and app screenshots.

usage: uv run pixeldiff.py <spec.json> <out_dir>

Paths in the spec resolve against the spec's own directory. See ../SKILL.md for the format.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

THRESHOLD = 0.1  # pixelmatch default: share of the maximum YIQ delta
MAX_DELTA = 35215.0
LABEL_HEIGHT = 22


def yiq_delta(a, b):
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    dr, dg, db = (a[..., i] - b[..., i] for i in range(3))
    y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223
    i = dr * 0.59597799 - dg * 0.27417610 - db * 0.32180189
    q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694
    return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q


def load_design(path, bg):
    """Design exports have transparent rounded corners; put them on the page colour."""
    raw = Image.open(path).convert("RGBA")
    design = Image.new("RGBA", raw.size, tuple(bg) + (255,))
    design.alpha_composite(raw)
    return design.convert("RGB")


def diff_panel(panel, spec, base, out):
    design = load_design(base / panel["design"], spec.get("bg", [0, 0, 0]))
    app = Image.open(base / panel.get("app", spec.get("app"))).convert("RGB")
    x, y, w, h = (int(round(v)) for v in panel["rect"])
    shot = app.crop((x, y, x + w, y + h))

    width, height = max(design.width, shot.width), max(design.height, shot.height)
    d = np.zeros((height, width, 3), np.uint8)
    a = np.zeros((height, width, 3), np.uint8)
    d[: design.height, : design.width] = np.asarray(design)
    a[: shot.height, : shot.width] = np.asarray(shot)

    mask = yiq_delta(d, a) > (THRESHOLD**2) * MAX_DELTA
    # A real change spans more than a 1px anti-aliased edge.
    mask = ndimage.binary_opening(mask, structure=np.ones((2, 2)))
    for ix, iy, iw, ih in panel.get("ignore", []):
        mask[iy : iy + ih, ix : ix + iw] = False
    ratio = mask.mean() * 100

    labels, _ = ndimage.label(ndimage.binary_dilation(mask, iterations=4))
    regions = sorted(
        (
            (
                int((labels[s] == k + 1).sum()),
                s[1].start,
                s[0].start,
                s[1].stop - s[1].start,
                s[0].stop - s[0].start,
            )
            for k, s in enumerate(ndimage.find_objects(labels))
        ),
        reverse=True,
    )[:8]

    gray = np.asarray(Image.fromarray(d).convert("L").convert("RGB")) * 0.35
    overlay = gray.astype(np.uint8)
    overlay[mask] = (255, 40, 60)
    heat = Image.fromarray(overlay)
    draw = ImageDraw.Draw(heat)
    for _, rx, ry, rw, rh in regions:
        draw.rectangle((rx, ry, rx + rw, ry + rh), outline=(255, 220, 0))

    strip = Image.new("RGB", (width, (height + LABEL_HEIGHT) * 3), (30, 30, 30))
    caption = ImageDraw.Draw(strip)
    rows = (
        (Image.fromarray(d), f"DESIGN {design.width}x{design.height}", (255, 220, 120)),
        (Image.fromarray(a), f"APP {shot.width}x{shot.height}", (120, 220, 255)),
        (heat, f"DIFF {ratio:.1f}%", (255, 120, 120)),
    )
    for row, (img, text, color) in enumerate(rows):
        top = row * (height + LABEL_HEIGHT)
        caption.text((4, top + 5), text, fill=color)
        strip.paste(img, (0, top + LABEL_HEIGHT))
    path = out / f"diff-{panel['name']}.png"
    strip.save(path)

    return {
        "panel": panel["name"],
        "mismatch_pct": round(ratio, 2),
        "size_design": [design.width, design.height],
        "size_app": [shot.width, shot.height],
        "regions_xywh": [r[1:] for r in regions],
        "image": str(path),
    }


def main():
    spec_path = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    spec = json.loads(spec_path.read_text())
    base = spec_path.parent
    report = [diff_panel(panel, spec, base, out) for panel in spec["panels"]]
    (out / "report.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


main()
