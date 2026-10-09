/**
 * Turns the desktop app's Changesets output into release notes for the
 * /changelog page: the generated CHANGELOG.md for shipped versions, plus the
 * pending .changeset/*.md files that haven't been versioned yet.
 */

export type ChangeKind = "new" | "experimental" | "improved" | "fixed";

export interface Change {
  kind: ChangeKind;
  /** First line of the entry. */
  summary: string;
  /** Remaining lines; lines starting with "- " are list items. */
  details: string[];
}

export interface Release {
  version: string;
  changes: Change[];
}

const BUMPS = ["major", "minor", "patch"] as const;

type Bump = (typeof BUMPS)[number];

const parseBump = (text = "") =>
  BUMPS.find((bump) => bump === text.trim().toLowerCase());

/**
 * The wording wins over the bump: "Fix …" is a fix and "Add …" is new even in
 * a patch. Otherwise minor and major changes are new and patches improve.
 */
export const changeKind = (bump: Bump, summary: string): ChangeKind => {
  if (/^fix(es|ed)?\b/i.test(summary)) return "fixed";
  if (/^add(s|ed)?\b/i.test(summary)) return "new";
  return bump === "patch" ? "improved" : "new";
};

/** "- @deadlock-mods/shared@2.1.0": Changesets lists dependency bumps as sub-items. */
const DEPENDENCY_BUMP = /^- @[\w-]+\/[\w-]+@\d/;

const toChange = (
  bump: Bump,
  lines: string[],
  experimental = false,
): Change | null => {
  const [summary = "", ...rest] = lines;
  if (!summary || summary.startsWith("Updated dependencies")) return null;
  return {
    kind: experimental ? "experimental" : changeKind(bump, summary),
    summary,
    details: rest
      .map((line) => line.trim())
      .filter((line) => line && !DEPENDENCY_BUMP.test(line)),
  };
};

const normalize = (markdown: string) => markdown.replace(/\r\n/g, "\n");

/**
 * Releases in a Changesets-generated CHANGELOG.md, newest first. A hand-added
 * "### Experimental Changes" section files its entries as experimental.
 */
export const parseChangelog = (markdown: string): Release[] =>
  normalize(markdown)
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [version = "", ...lines] = section.split("\n");
      const changes: Change[] = [];
      let bump: Bump = "patch";
      let experimental = false;
      let entry: string[] | null = null;

      const flush = () => {
        const change = entry && toChange(bump, entry, experimental);
        if (change) changes.push(change);
        entry = null;
      };

      for (const line of lines) {
        const heading = line.match(/^### (\w+) Changes/);
        if (heading) {
          flush();
          experimental = heading[1] === "Experimental";
          bump = parseBump(heading[1]) ?? bump;
        } else if (line.startsWith("- ")) {
          flush();
          // Drop the commit hash Changesets prefixes entries with.
          entry = [line.slice(2).replace(/^[0-9a-f]{7,40}: /, "")];
        } else if (entry && (line.startsWith("  ") || line === "")) {
          entry.push(line.slice(2));
        }
      }
      flush();

      return { version: version.trim(), changes };
    });

/** A pending changeset's entry for one package, or null if it doesn't touch it. */
export const parseChangeset = (
  markdown: string,
  packageName: string,
): Change | null => {
  const match = normalize(markdown).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const [, frontmatter = "", body = ""] = match;
  const bump = parseBump(
    frontmatter
      .split("\n")
      .map((line) => line.match(/^["']?([^"':]+)["']?:\s*(\w+)\s*$/))
      .find((line) => line?.[1] === packageName)?.[2],
  );
  if (!bump) return null;
  return toChange(bump, body.trim().split("\n"));
};
