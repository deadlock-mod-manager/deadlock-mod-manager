#!/usr/bin/env python3
"""Sample aggregate Linux process-group CPU, RSS, and /proc I/O counters."""

from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path
import signal
import time


stopping = False


def request_stop(_signum: int, _frame: object) -> None:
    global stopping
    stopping = True


def read_stat(pid: int) -> tuple[int, int, int] | None:
    try:
        raw = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8")
        fields = raw[raw.rfind(")") + 2 :].split()
        process_group = int(fields[2])
        cpu_ticks = int(fields[11]) + int(fields[12])
        return process_group, cpu_ticks, pid
    except (FileNotFoundError, PermissionError, IndexError, ValueError):
        return None


def read_rss_kib(pid: int) -> int:
    try:
        for line in Path(f"/proc/{pid}/status").read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    except (FileNotFoundError, PermissionError, IndexError, ValueError):
        pass
    return 0


def read_io(pid: int) -> tuple[int, int, int]:
    values = {"write_bytes": 0, "syscw": 0, "wchar": 0}
    try:
        for line in Path(f"/proc/{pid}/io").read_text(encoding="utf-8").splitlines():
            key, value = line.split(":", 1)
            if key in values:
                values[key] = int(value.strip())
    except (FileNotFoundError, PermissionError, ValueError):
        pass
    return values["write_bytes"], values["syscw"], values["wchar"]


def snapshot(process_group: int) -> tuple[int, int, int, int, int, int]:
    process_count = 0
    cpu_ticks = 0
    rss_kib = 0
    write_bytes = 0
    write_syscalls = 0
    write_chars = 0

    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        stat = read_stat(pid)
        if stat is None or stat[0] != process_group:
            continue
        process_count += 1
        cpu_ticks += stat[1]
        rss_kib += read_rss_kib(pid)
        io_values = read_io(pid)
        write_bytes += io_values[0]
        write_syscalls += io_values[1]
        write_chars += io_values[2]

    return process_count, cpu_ticks, rss_kib, write_bytes, write_syscalls, write_chars


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pgid", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--interval", type=float, default=0.25)
    args = parser.parse_args()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    clock_ticks = os.sysconf("SC_CLK_TCK")
    start = time.monotonic()
    previous_time = start
    previous_cpu_ticks = 0

    with args.output.open("x", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            (
                "elapsed_ms",
                "epoch_ms",
                "process_count",
                "cpu_percent_one_core",
                "rss_kib",
                "write_bytes",
                "write_syscalls",
                "write_chars",
            )
        )

        first_sample = True
        while not stopping:
            now = time.monotonic()
            values = snapshot(args.pgid)
            elapsed = now - previous_time
            cpu_delta = 0 if first_sample else max(0, values[1] - previous_cpu_ticks)
            cpu_percent = 100.0 * cpu_delta / clock_ticks / elapsed if elapsed > 0 else 0.0
            writer.writerow(
                (
                    round((now - start) * 1000),
                    round(time.time() * 1000),
                    values[0],
                    f"{cpu_percent:.3f}",
                    values[2],
                    values[3],
                    values[4],
                    values[5],
                )
            )
            handle.flush()
            previous_time = now
            previous_cpu_ticks = values[1]
            first_sample = False
            if values[0] == 0:
                break
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
