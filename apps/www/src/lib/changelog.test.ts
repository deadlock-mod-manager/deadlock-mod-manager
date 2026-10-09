import { describe, expect, it } from "vitest";
import { changeKind, parseChangelog, parseChangeset } from "./changelog";
import { DESKTOP_RELEASES, PREVIEW_VERSION } from "./desktop-changelog";

const CHANGELOG = `# desktop

## 1.1.0

### Minor Changes

- cd10b4d: Add retry actions for failed downloads.
- 00f82c8: Add opt-in match data sharing.

  It never sends your token.

### Experimental Changes

- 6d8293c: Add performance configs

### Patch Changes

- 727bc7c: Fix the Linux Flatpak crashing on launch
- 6d9be1e: Show download progress on mod action buttons
  - @deadlock-mods/shared@2.1.0
- Updated dependencies [1f98b35]
  - @deadlock-mods/shared@2.1.0

## 0.1.1

### Patch Changes

- 079f045: Fixed mods unintall and added a stop game button
  - Add game stop button to toolbar
  - Add support for 7zip archives
`;

describe("parseChangelog", () => {
  const [latest, oldest] = parseChangelog(CHANGELOG);

  it("reads every release, newest first", () => {
    expect(latest?.version).toBe("1.1.0");
    expect(oldest?.version).toBe("0.1.1");
  });

  it("strips commit hashes and skips dependency bumps", () => {
    expect(latest?.changes.map((change) => change.summary)).toEqual([
      "Add retry actions for failed downloads.",
      "Add opt-in match data sharing.",
      "Add performance configs",
      "Fix the Linux Flatpak crashing on launch",
      "Show download progress on mod action buttons",
    ]);
    expect(latest?.changes[4]?.details).toEqual([]);
  });

  it("keeps extra paragraphs and nested lists as details", () => {
    expect(latest?.changes[1]?.details).toEqual(["It never sends your token."]);
    expect(oldest?.changes[0]?.details).toEqual([
      "- Add game stop button to toolbar",
      "- Add support for 7zip archives",
    ]);
  });

  it("sorts entries into new, experimental, improved and fixed", () => {
    expect(latest?.changes.map((change) => change.kind)).toEqual([
      "new",
      "new",
      "experimental",
      "fixed",
      "improved",
    ]);
  });
});

describe("changeKind", () => {
  it("goes by the wording before the bump", () => {
    expect(changeKind("minor", "Fix mod deletion")).toBe("fixed");
    expect(changeKind("patch", "Fixes zoom")).toBe("fixed");
    expect(changeKind("patch", "Add a search box")).toBe("new");
    expect(changeKind("patch", "Fixture cleanup")).toBe("improved");
    expect(changeKind("patch", "Address lag")).toBe("improved");
  });
});

describe("parseChangeset", () => {
  const changeset = `---
"@deadlock-mods/api": minor
"@deadlock-mods/desktop": patch
---

Preserve installed mods after upgrading from V1

Avoid intermittent database lock failures.
`;

  it("reads the entry for the requested package", () => {
    expect(parseChangeset(changeset, "@deadlock-mods/desktop")).toEqual({
      kind: "improved",
      summary: "Preserve installed mods after upgrading from V1",
      details: ["Avoid intermittent database lock failures."],
    });
  });

  it("ignores changesets for other packages and files without frontmatter", () => {
    expect(parseChangeset(changeset, "@deadlock-mods/www")).toBeNull();
    expect(parseChangeset("# Changesets", "@deadlock-mods/desktop")).toBeNull();
  });

  it("handles Windows line endings", () => {
    expect(
      parseChangeset(changeset.replace(/\n/g, "\r\n"), "@deadlock-mods/desktop")
        ?.summary,
    ).toBe("Preserve installed mods after upgrading from V1");
  });
});

describe("DESKTOP_RELEASES", () => {
  it("parses the real desktop changelog", () => {
    expect(DESKTOP_RELEASES.length).toBeGreaterThan(10);
    for (const release of DESKTOP_RELEASES) {
      expect(release.version).toMatch(/^(\d+\.\d+\.\d+|Next)$/);
    }
  });

  it("files pending changesets under the preview release", () => {
    if (!PREVIEW_VERSION) return;
    expect(DESKTOP_RELEASES[0]?.version).toBe(PREVIEW_VERSION);
  });
});
