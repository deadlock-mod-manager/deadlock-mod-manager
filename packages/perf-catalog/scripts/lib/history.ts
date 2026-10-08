/** Name (lower-case) to flags, from a DumpSource2 `convars.txt`. */
export const parseConvarDump = (text: string): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>();
  for (const line of text.split("\n")) {
    if (!line || line[0] === "\t" || line[0] === " ") continue;
    const trimmed = line.replace(/\r$/, "");
    const name = trimmed.split(" ", 1)[0];
    const flagMatch = /\(([^()]*)\)\s*$/.exec(trimmed);
    const flags = new Set(
      (flagMatch?.[1] ?? "")
        .split(/[\s,]+/)
        .filter((flag) => flag && !flag.includes(":")),
    );
    out.set(name.toLowerCase(), flags);
  }
  return out;
};

export interface DumpVersion {
  build: number;
  convars: Map<string, Set<string>>;
}

/**
 * The build where a convar entered its current state, scanning the dump
 * history oldest to newest. `blocked`: first build of the latest unbroken run
 * with `gameinfo_cannot_override`. `removed`: first build of the latest run
 * where the convar is absent.
 *
 * Only a change the history shows counts: when the oldest dump is already in
 * the state, the change happened before the window and the build is unknown.
 */
export const statusSince = (
  name: string,
  status: "blocked" | "removed",
  history: DumpVersion[],
): number | null => {
  const key = name.toLowerCase();
  const oldestFirst = [...history].sort((a, b) => a.build - b.build);
  let since: number | null = null;
  let sawOtherState = false;
  for (const version of oldestFirst) {
    const flags = version.convars.get(key);
    const inState =
      status === "blocked"
        ? Boolean(flags?.has("gameinfo_cannot_override"))
        : !flags;
    if (inState) {
      if (since === null && sawOtherState) since = version.build;
    } else {
      sawOtherState = true;
      since = null;
    }
  }
  return since;
};
