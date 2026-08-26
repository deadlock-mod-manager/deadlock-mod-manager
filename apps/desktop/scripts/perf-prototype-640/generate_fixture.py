#!/usr/bin/env python3
"""Generate an isolated, production-shaped Tauri store for issue #640."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


STORE_RELATIVE_PATH = Path("dev.stormix.deadlock-mod-manager/state.json")
FIXTURE_DATE = "2026-08-25T12:00:00.000Z"


def make_mod(index: int) -> dict[str, object]:
    remote_id = str(900000 + index)
    return {
        "id": f"mod_fixture_{index:04d}",
        "remoteId": remote_id,
        "name": f"Fixture Mod {index:04d}",
        "description": f"Deterministic issue 640 fixture entry {index:04d}",
        "remoteUrl": f"local://issue-640/{remote_id}",
        "category": "Other/Misc",
        "likes": index % 100,
        "author": f"Fixture Author {index % 12:02d}",
        "downloadable": False,
        "remoteAddedAt": FIXTURE_DATE,
        "remoteUpdatedAt": FIXTURE_DATE,
        "tags": ["issue-640", f"bucket-{index % 8}"],
        "images": [],
        "hero": None,
        "isAudio": False,
        "isMap": False,
        "audioUrl": None,
        "downloadCount": index * 10,
        "isNSFW": False,
        "isObsolete": False,
        "isBlacklisted": False,
        "blacklistReason": None,
        "blacklistedAt": None,
        "blacklistedBy": None,
        "filesUpdatedAt": FIXTURE_DATE,
        "metadata": None,
        "overrides": None,
        "dependencies": None,
        "createdAt": FIXTURE_DATE,
        "updatedAt": FIXTURE_DATE,
        "status": "downloaded",
        "downloadedAt": FIXTURE_DATE,
        "installedVpks": [],
        "installOrder": index,
    }


def make_state(count: int, pagination: bool, occult: str) -> dict[str, object]:
    mods = [make_mod(index) for index in range(count)]
    setting = {
        "id": "mods-store-pagination",
        "key": "",
        "value": "",
        "type": "boolean",
        "description": "Issue #640 fixture override",
        "enabled": pagination,
        "createdAt": FIXTURE_DATE,
        "updatedAt": FIXTURE_DATE,
    }
    return {
        "localMods": mods,
        "defaultSort": "last updated",
        "profiles": {
            "default": {
                "id": "default",
                "name": "Default Profile",
                "description": "Issue #640 isolated fixture",
                "createdAt": FIXTURE_DATE,
                "lastUsed": FIXTURE_DATE,
                "enabledMods": {},
                "isDefault": True,
                "folderName": None,
                "mods": mods,
            }
        },
        "activeProfileId": "default",
        "gamePath": "",
        "settings": {"mods-store-pagination": setting},
        "nsfwSettings": {
            "hideNSFW": False,
            "blurStrength": 16,
            "showLikelyNSFW": False,
            "rememberPerItemOverrides": True,
            "disableBlur": False,
        },
        "telemetrySettings": {
            "analyticsEnabled": False,
            "hasSeenTelemetryPrompt": True,
        },
        "perItemNSFWOverrides": {},
        "developerMode": False,
        "ingestToolEnabled": False,
        "autoUpdateEnabled": False,
        "foundry3dPreviewEnabled": False,
        "foundrySoundVolume": 0.0,
        "crosshairsEnabled": False,
        "linuxGpuOptimization": "auto",
        "enabledPlugins": {"themes": True},
        "gamePresenceEnabled": False,
        "forgeInstallEnabled": False,
        "backupEnabled": False,
        "maxBackupCount": 0,
        "fileserverPreference": "default",
        "fileserverLatencyMs": {},
        "audioVolume": 0,
        "modsFilters": {
            "selectedCategories": [],
            "selectedHeroes": [],
            "audioQuickFilter": "off",
            "mapQuickFilter": "off",
            "hideNSFW": False,
            "hideOutdated": False,
            "currentSort": "last updated",
            "timePeriod": "all time",
            "filterMode": "include",
            "searchQuery": "",
            "showFavoritesOnly": False,
        },
        "crosshairFilters": {
            "selectedHeroes": [],
            "selectedTags": [],
            "currentSort": "last updated",
            "filterMode": "include",
            "searchQuery": "",
        },
        "hasCompletedOnboarding": True,
        "pluginSettings": {},
        "scrollPositions": {"/my-mods": 0},
        "activeCrosshair": None,
        "activeCrosshairHistory": [],
        "stagedServers": {},
        "lastServerJoin": None,
        "proxyConfig": {
            "enabled": False,
            "protocol": "http",
            "host": "",
            "port": 8080,
            "authEnabled": False,
            "username": "",
            "password": "",
            "noProxy": "",
        },
        "showOccultGeometry": occult != "off",
        "animateOccultGeometry": occult == "animated",
        "useCustomSteamPath": False,
        "steamPath": "",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xdg-data-home", type=Path, required=True)
    parser.add_argument("--count", type=int, default=250)
    parser.add_argument("--pagination", choices=("on", "off"), required=True)
    parser.add_argument("--occult", choices=("animated", "static", "off"), required=True)
    args = parser.parse_args()

    if args.count < 0:
        raise SystemExit("--count must be non-negative")

    state = make_state(args.count, args.pagination == "on", args.occult)
    persisted = json.dumps({"state": state, "version": 24}, separators=(",", ":"))
    store = {"local-config": persisted}
    destination = args.xdg_data_home / STORE_RELATIVE_PATH
    destination.parent.mkdir(parents=True, exist_ok=False)
    destination.write_text(json.dumps(store, separators=(",", ":")), encoding="utf-8")
    print(destination)


if __name__ == "__main__":
    main()
