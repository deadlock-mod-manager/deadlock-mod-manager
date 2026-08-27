#!/usr/bin/env python3
"""Generate an isolated desktop store for the issue #643 probes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


STORE_RELATIVE_PATH = Path("dev.stormix.deadlock-mod-manager/state.json")
FIXTURE_DATE = "2026-08-26T12:00:00.000Z"


def make_state() -> dict[str, object]:
    setting = {
        "id": "mods-store-pagination",
        "key": "",
        "value": "",
        "type": "boolean",
        "description": "Issue #643 fixture override",
        "enabled": True,
        "createdAt": FIXTURE_DATE,
        "updatedAt": FIXTURE_DATE,
    }
    return {
        "localMods": [],
        "defaultSort": "last updated",
        "profiles": {
            "default": {
                "id": "default",
                "name": "Default Profile",
                "description": "Issue #643 isolated fixture",
                "createdAt": FIXTURE_DATE,
                "lastUsed": FIXTURE_DATE,
                "enabledMods": {},
                "isDefault": True,
                "folderName": None,
                "mods": [],
            }
        },
        "activeProfileId": "default",
        "gamePath": "",
        "settings": {"mods-store-pagination": setting},
        "telemetrySettings": {
            "analyticsEnabled": False,
            "hasSeenTelemetryPrompt": True,
        },
        "developerMode": False,
        "ingestToolEnabled": False,
        "autoUpdateEnabled": False,
        "gamePresenceEnabled": False,
        "forgeInstallEnabled": False,
        "backupEnabled": False,
        "crosshairsEnabled": False,
        "hasCompletedOnboarding": True,
        "showOccultGeometry": False,
        "animateOccultGeometry": False,
        "useCustomSteamPath": False,
        "steamPath": "",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xdg-data-home", type=Path, required=True)
    args = parser.parse_args()

    persisted = json.dumps(
        {"state": make_state(), "version": 24}, separators=(",", ":")
    )
    destination = args.xdg_data_home / STORE_RELATIVE_PATH
    destination.parent.mkdir(parents=True, exist_ok=False)
    destination.write_text(
        json.dumps({"local-config": persisted}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(destination)


if __name__ == "__main__":
    main()
