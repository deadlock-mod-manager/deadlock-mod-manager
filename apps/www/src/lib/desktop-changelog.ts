import changelog from "../../../desktop/CHANGELOG.md?raw";
import { parseChangelog, parseChangeset, type Release } from "./changelog";

const DESKTOP_PACKAGE = "@deadlock-mods/desktop";

export const PREVIEW_VERSION: string | null = null;

export const NEXT_VERSION = "Next";

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

const images = import.meta.glob<string>(
  "../../../desktop/public/whats-new/*.webp",
  { query: "?url", import: "default", eager: true },
);

const IMAGE_PATHS = Object.keys(images).sort();

export const releaseImages = (version: string): string[] =>
  IMAGE_PATHS.filter((path) =>
    path.split("/").at(-1)?.startsWith(`${version}-`),
  ).map((path) => images[path] ?? "");

const dedupe = (release: Release): Release => ({
  ...release,
  changes: [
    ...new Map(
      release.changes.map((change) => [change.summary, change]),
    ).values(),
  ],
});

export const DESKTOP_RELEASES = withPending(parseChangelog(changelog)).map(
  dedupe,
);
