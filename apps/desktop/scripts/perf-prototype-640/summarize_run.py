#!/usr/bin/env python3
"""Summarize raw issue #640 process and webview measurements."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
import statistics


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, math.ceil(len(ordered) * fraction) - 1))
    return ordered[index]


def load_events(path: Path) -> dict[str, int]:
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["event"]: int(row["epoch_ms"]) for row in csv.DictReader(handle)}


def load_samples(path: Path) -> list[dict[str, float]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [
            {key: float(value) for key, value in row.items()}
            for row in csv.DictReader(handle)
        ]


def phase_summary(
    samples: list[dict[str, float]], start_ms: int, end_ms: int
) -> dict[str, float]:
    selected = [row for row in samples if start_ms <= row["epoch_ms"] <= end_ms]
    if not selected:
        return {}
    cpu = [row["cpu_percent_one_core"] for row in selected]
    rss = [row["rss_kib"] / 1024.0 for row in selected]
    return {
        "durationMs": selected[-1]["epoch_ms"] - selected[0]["epoch_ms"],
        "cpuMedianPercentOneCore": statistics.median(cpu),
        "cpuP95PercentOneCore": percentile(cpu, 0.95),
        "rssMedianMiB": statistics.median(rss),
        "rssP95MiB": percentile(rss, 0.95),
        "writeBytesDelta": selected[-1]["write_bytes"] - selected[0]["write_bytes"],
        "writeSyscallsDelta": selected[-1]["write_syscalls"] - selected[0]["write_syscalls"],
        "writeCharsDelta": selected[-1]["write_chars"] - selected[0]["write_chars"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("run_root", type=Path)
    args = parser.parse_args()

    rows: list[dict[str, object]] = []
    for probe_path in sorted(args.run_root.glob("*/*/probe.json")):
        case_root = probe_path.parent
        probe = json.loads(probe_path.read_text(encoding="utf-8"))
        events = load_events(case_root / "events.csv")
        samples = load_samples(case_root / "process-samples.csv")
        rows.append(
            {
                "artifact": case_root.parent.name,
                "case": case_root.name,
                "searchToOne": probe["searchToOne"],
                "searchToAll": probe["searchToAll"],
                "frames": probe["frames"],
                "idle": phase_summary(
                    samples, events["idle_start"], events["idle_complete"]
                ),
                "probe": phase_summary(
                    samples,
                    probe["probeStartedEpochMs"],
                    probe["probeFinishedEpochMs"],
                ),
            }
        )

    output = {"schema": 1, "runRoot": str(args.run_root), "cases": rows}
    (args.run_root / "summary.json").write_text(
        json.dumps(output, indent=2) + "\n", encoding="utf-8"
    )

    lines = [
        "| Artifact | Case | Search→one median (ms) | Search→all median (ms) | Frame p95 (ms) | >50 ms (%) | Idle CPU median (%) | Idle RSS median (MiB) | Idle write bytes |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        search_one = row["searchToOne"]
        search_all = row["searchToAll"]
        frames = row["frames"]
        idle = row["idle"]
        lines.append(
            "| {artifact} | {case} | {one:.2f} | {all:.2f} | {frame:.2f} | {over:.2f} | {cpu:.2f} | {rss:.2f} | {writes:.0f} |".format(
                artifact=row["artifact"],
                case=row["case"],
                one=search_one["medianMs"],
                all=search_all["medianMs"],
                frame=frames["p95Ms"],
                over=frames["over50Percent"],
                cpu=idle.get("cpuMedianPercentOneCore", 0.0),
                rss=idle.get("rssMedianMiB", 0.0),
                writes=idle.get("writeBytesDelta", 0.0),
            )
        )
    (args.run_root / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(args.run_root / "summary.md")


if __name__ == "__main__":
    main()
