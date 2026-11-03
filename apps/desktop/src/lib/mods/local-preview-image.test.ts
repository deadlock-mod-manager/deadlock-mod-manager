import { expect, test } from "bun:test";
import { generateFallbackModSVG } from "@/lib/file-patterns";
import { needsLocalThumbnail } from "./local-preview-image";

const mod = { remoteId: "local-test", images: [], isAudio: false };

test("recognizes DMM placeholders with UTF8, base64 and charset metadata", () => {
  const svg = generateFallbackModSVG();
  for (const image of [
    `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    `data:image/svg+xml;base64,${btoa(svg)}`,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  ])
    expect(needsLocalThumbnail({ ...mod, images: [image] })).toBe(true);
});

test("preserves supplied art and excludes audio and remote mods", () => {
  expect(needsLocalThumbnail(mod)).toBe(true);
  for (const image of [
    "https://example.com/author.png",
    `data:image/svg+xml;utf8,${encodeURIComponent("<svg><text>My art</text></svg>")}`,
    "data:image/svg+xml;base64,invalid!!!",
  ])
    expect(needsLocalThumbnail({ ...mod, images: [image] })).toBe(false);
  expect(needsLocalThumbnail({ ...mod, isAudio: true })).toBe(false);
  expect(needsLocalThumbnail({ ...mod, remoteId: "gb-123" })).toBe(false);
});
