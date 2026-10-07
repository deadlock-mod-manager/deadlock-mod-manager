import changelog from "../../../desktop/CHANGELOG.md?raw";
import { parseChangelog, parseChangeset, type Release } from "./changelog";

const DESKTOP_PACKAGE = "@deadlock-mods/desktop";

/**
 * The release pending changesets will ship in. While it is set they are shown
 * as part of that release; set it to null once it is out, so changesets merged
 * afterwards show up under "Next" instead of being added to a shipped version.
 */
export const PREVIEW_VERSION: string | null = "2.0.0";

export const NEXT_VERSION = "Next";

// Read at build time; the Dockerfile copies .changeset and the desktop
// CHANGELOG.md into the image build for this.
const changesets = import.meta.glob<string>("../../../../.changeset/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const pending = Object.values(changesets).flatMap(
  (markdown) => parseChangeset(markdown, DESKTOP_PACKAGE) ?? [],
);

const withPending = (releases: Release[]): Release[] => {
  if (pending.length === 0) return releases;
  const preview = releases.find(
    (release) => release.version === PREVIEW_VERSION,
  );
  if (preview) {
    return releases.map((release) =>
      release === preview
        ? { ...release, changes: [...pending, ...release.changes] }
        : release,
    );
  }
  return [
    { version: PREVIEW_VERSION ?? NEXT_VERSION, changes: pending },
    ...releases,
  ];
};

/** Lists each summary once per release; the page keys entries by summary. */
const dedupe = (release: Release): Release => ({
  ...release,
  changes: [
    ...new Map(
      release.changes.map((change) => [change.summary, change]),
    ).values(),
  ],
});

/** Desktop app releases, newest first, including unreleased changes. */
export const DESKTOP_RELEASES = withPending(parseChangelog(changelog)).map(
  dedupe,
);
