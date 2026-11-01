import { describe, expect, it } from "bun:test";
import { type ModDownloadItem, ModStatus } from "@/types/mods";
import { calculateFrenchTax } from "./tax";

function download(size: number): ModDownloadItem {
  return {
    name: "skin.zip",
    url: "https://example.com/skin.zip",
    size,
    createdAt: null,
    updatedAt: null,
    md5Checksum: null,
  };
}

describe("French bandwidth tax", () => {
  it("adds selected archives from installed and disabled mods before calculating tax", () => {
    const tax = calculateFrenchTax([
      {
        status: ModStatus.Installed,
        selectedDownloads: [download(1_000_000_000), download(500_000_000)],
      },
      {
        status: ModStatus.Downloaded,
        selectedDownloads: [download(1_000_000_000)],
      },
    ]);

    expect(tax.totalBytes).toBe(2_500_000_000);
    expect(tax.gigabytes).toBe(2.5);
    expect(tax.taxEuro).toBeCloseTo(0.1375);
    expect(tax.missingSizes).toBe(0);
  });

  it("does not tax unchosen variants or incomplete downloads", () => {
    const mod = {
      status: ModStatus.Installed,
      selectedDownloads: [download(1_000_000_000)],
      downloads: [download(1_000_000_000), download(9_000_000_000)],
    };

    const tax = calculateFrenchTax([
      mod,
      ...[
        ModStatus.Downloading,
        ModStatus.Paused,
        ModStatus.FailedToDownload,
        ModStatus.Removed,
      ].map((status) => ({
        status,
        selectedDownloads: [download(5_000_000_000)],
      })),
    ]);

    expect(tax.totalBytes).toBe(1_000_000_000);
    expect(tax.taxEuro).toBe(0.055);
  });

  it("counts unknown sizes without inventing bytes or subtracting negative metadata", () => {
    const tax = calculateFrenchTax([
      { status: ModStatus.Installed },
      { status: ModStatus.Downloaded, selectedDownloads: [] },
      {
        status: ModStatus.Installed,
        selectedDownloads: [download(0), download(-1), download(500_000_000)],
      },
    ]);

    expect(tax.totalBytes).toBe(500_000_000);
    expect(tax.taxEuro).toBe(0.0275);
    expect(tax.missingSizes).toBe(3);
  });

  it("returns zero for an empty library", () => {
    expect(calculateFrenchTax([])).toEqual({
      totalBytes: 0,
      gigabytes: 0,
      taxEuro: 0,
      missingSizes: 0,
    });
  });
});
