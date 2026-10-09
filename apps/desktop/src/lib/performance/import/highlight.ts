import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";

/** What happens to a line, matching the colors in the import legend. */
export type LineTone =
  | "applies"
  | "ignored"
  | "stripped"
  | "optIn"
  | "skipped"
  | "plain";

type Token = {
  kind: "word" | "comment" | "space";
  text: string;
  /** Column the token starts at, unique within its line. */
  start: number;
};

type HighlightedLine = { line: number; tone: LineTone; tokens: Token[] };

const TOKEN_PATTERN = /\/\/.*|"(?:[^"\\]|\\.)*"?|[{}]|[^\s"{}]+|\s+/g;
const ROOT_KEY = "gameinfo";

const toneFor = (entry: ResolvedEntry): LineTone => {
  // Matches the review's camera & visibility group, which has its own toggle.
  if (
    (entry.gameplay === "camera" || entry.gameplay === "visibility") &&
    ["applies", "unchanged", "omitted"].includes(entry.status)
  ) {
    return "optIn";
  }
  switch (entry.status) {
    case "applies":
    case "unchanged":
      return "applies";
    case "blocked":
    case "removed":
    case "notConvar":
      return "ignored";
    case "engineSection":
    case "denied":
    case "unsupported":
      return "stripped";
    case "omitted":
      return entry.gameplay === "devtools" ? "optIn" : "skipped";
    case "excluded":
      return "skipped";
  }
};

const tokenizeLine = (line: string): Token[] =>
  Array.from(line.matchAll(TOKEN_PATTERN), ({ 0: text, index }) => ({
    start: index,
    kind: text.startsWith("//")
      ? "comment"
      : /^\s/.test(text)
        ? "space"
        : "word",
    text,
  }));

const unquote = (word: string) => word.replace(/^"|"$/g, "").toLowerCase();

const pathId = (path: string[]) => path.join("\u0000");

/** Tone per entry path, plus a tone for each section whose entries all agree. */
const indexTones = (entries: ResolvedEntry[]) => {
  const exact = new Map<string, LineTone>();
  const sections = new Map<string, LineTone | null>();
  for (const entry of entries) {
    const path = entry.path.map((part) => part.toLowerCase());
    const tone = toneFor(entry);
    exact.set(pathId(path), tone);
    for (let depth = 0; depth < path.length; depth++) {
      const id = pathId(path.slice(0, depth + 1));
      const seen = sections.get(id);
      sections.set(id, seen === undefined || seen === tone ? tone : null);
    }
  }
  return { exact, sections };
};

/**
 * Splits pasted gameinfo.gi, ConVars or autoexec text into lines and colors
 * each one by what the import review says happens to it. Lines the review
 * doesn't mention take their section's tone when the section is uniform.
 */
export const highlightConfig = (
  source: string,
  entries: ResolvedEntry[] | null,
): HighlightedLine[] => {
  const { exact, sections } = indexTones(entries ?? []);
  const stack: string[] = [];
  let pendingSection: string | null = null;

  const sectionTone = (path: string[]): LineTone => {
    for (let depth = path.length; depth > 0; depth--) {
      const tone = sections.get(pathId(path.slice(0, depth)));
      if (tone) return tone;
    }
    return "plain";
  };

  const lookup = (path: string[]): LineTone =>
    exact.get(pathId(path)) ??
    (path.length === 1 ? exact.get(pathId(["convars", path[0]])) : undefined) ??
    sectionTone(path);

  /** Entry paths leave out the GameInfo root. */
  const pathTo = (key: string) => {
    const path = [...stack, key];
    return path[0] === ROOT_KEY ? path.slice(1) : path;
  };

  return source.split("\n").map((line, lineNumber) => {
    const tokens = tokenizeLine(line);
    const words = tokens
      .filter((token) => token.kind === "word")
      .map((token) => token.text);
    let tone: LineTone = "plain";

    for (const [index, word] of words.entries()) {
      if (word === "{") {
        if (pendingSection !== null) stack.push(pendingSection);
        pendingSection = null;
        tone = sectionTone(pathTo("").slice(0, -1));
      } else if (word === "}") {
        tone = sectionTone(pathTo("").slice(0, -1));
        stack.pop();
      } else if (index === 0) {
        const key = unquote(word);
        const path = pathTo(key);
        const hasValue = words.length > 1 && words[1] !== "{";
        pendingSection = hasValue ? null : key;
        tone = hasValue
          ? lookup(path)
          : path.length === 0
            ? "plain"
            : sectionTone(path);
      }
    }
    return { line: lineNumber, tone, tokens };
  });
};
