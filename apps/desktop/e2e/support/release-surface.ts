import assert from "node:assert/strict";
import { createReadStream } from "node:fs";

export const HARNESS_MARKERS = [
  "e2e_status",
  "e2e-wdio",
  "WDIO_EMBEDDED_SERVER",
  "__wdio_original_core__",
];

export const assertNoHarnessDependencies = (tree: string): void => {
  assert.doesNotMatch(
    tree,
    /tauri-plugin-wdio(?:-webdriver)?\s+v/,
    "Ordinary build includes a harness dependency",
  );
};

export const assertNoHarnessText = (text: string, source: string): void => {
  for (const marker of [
    ...HARNESS_MARKERS,
    "wdio:default",
    "wdio-webdriver:default",
  ])
    assert(
      !text.includes(marker),
      `${source} contains harness marker ${marker}`,
    );
};

export const assertNoHarnessBinary = async (
  file: string,
  chunkSize = 64 * 1024,
): Promise<void> => {
  const needles = HARNESS_MARKERS.flatMap((marker) => [
    Buffer.from(marker),
    Buffer.from(marker, "utf16le"),
  ]);
  const overlap = Math.max(...needles.map((needle) => needle.length)) - 1;
  let tail = Buffer.alloc(0);
  for await (const chunk of createReadStream(file, {
    highWaterMark: chunkSize,
  })) {
    const bytes = Buffer.concat([tail, Buffer.from(chunk)]);
    for (const needle of needles)
      assert(
        !bytes.includes(needle),
        `Ordinary executable contains a harness marker (${needle.toString("hex")})`,
      );
    tail = bytes.subarray(Math.max(0, bytes.length - overlap));
  }
};
