export type ChangeKind = "new" | "experimental" | "improved" | "fixed";

export interface Change {
  kind: ChangeKind;
  summary: string;
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

export const changeKind = (bump: Bump, summary: string): ChangeKind => {
  if (/^fix(es|ed)?\b/i.test(summary)) return "fixed";
  if (/^add(s|ed)?\b/i.test(summary)) return "new";
  return bump === "patch" ? "improved" : "new";
};

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
          entry = [line.slice(2).replace(/^[0-9a-f]{7,40}: /, "")];
        } else if (entry && (line.startsWith("  ") || line === "")) {
          entry.push(line.slice(2));
        }
      }
      flush();

      return { version: version.trim(), changes };
    });

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
