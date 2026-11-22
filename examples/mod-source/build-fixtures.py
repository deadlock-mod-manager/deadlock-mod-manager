"""Regenerate harmless, valid VPK/ZIP fixtures using Python standard libraries.

The VPK v1 tree stores one inline file, its actual CRC32 and byte length.
No generated fixture replaces a game asset. JSON digests are updated together.
"""

import hashlib
import json
from pathlib import Path
import struct
import zipfile
import zlib


def vpk(filename: str, payload: bytes) -> bytes:
    tree = (
        b"txt\0resource\0"
        + filename.encode("ascii")
        + b"\0"
        + struct.pack("<IHHIIH", zlib.crc32(payload), 0, 0x7FFF, 0, len(payload), 0xFFFF)
        + b"\0\0\0"
    )
    return struct.pack("<III", 0x55AA1234, 1, len(tree)) + tree + payload


def archive(path: Path, entries: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, "w") as output:
        for name, content in entries.items():
            entry = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(entry, content)


def update_digest(detail_path: Path, artifact_bytes: bytes) -> None:
    detail = json.loads(detail_path.read_text(encoding="utf-8"))
    artifact = detail["release"]["artifacts"][0]
    artifact["size"] = len(artifact_bytes)
    artifact["hashes"] = {"sha256": hashlib.sha256(artifact_bytes).hexdigest()}
    detail_path.write_text(json.dumps(detail, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    simple = vpk(
        "dmm-source-example",
        b"DMM custom-source example. This harmless text entry changes no game assets.\n",
    )
    (root / "files/example.vpk").write_bytes(simple)
    archive(root / "files/example.zip", {"example.vpk": simple})
    archive(root / "files/example-choices.zip", {
        "base/notice.vpk": vpk("dmm-source-base", b"Required harmless example text.\n"),
        "blue/choice.vpk": vpk("dmm-source-choice", b"Blue harmless choice text.\n"),
        "red/choice.vpk": vpk("dmm-source-choice", b"Red harmless choice text.\n"),
    })
    update_digest(root / "mods/example.json", simple)
    update_digest(root / "mods/choices.json", (root / "files/example-choices.zip").read_bytes())
