import { watch } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type FilesystemEvent = {
  at: string;
  root: string;
  event: "rename" | "change" | "error";
  path: string;
};

export const startFilesystemJournal = (
  roots: Record<string, string>,
  artifactsDirectory: string,
): { close: () => Promise<void> } => {
  const events: FilesystemEvent[] = [];
  const watchers = Object.entries(roots).map(([name, root]) =>
    watch(root, { recursive: true }, (event, fileName) => {
      events.push({
        at: new Date().toISOString(),
        root: name,
        event,
        path: fileName?.toString().replaceAll("\\", "/") ?? "",
      });
    }).on("error", (error) => {
      // Linux emulates recursive watching and fails when a directory vanishes
      // before it is scanned. The journal is evidence; record and continue.
      events.push({
        at: new Date().toISOString(),
        root: name,
        event: "error",
        path: error.message,
      });
    }),
  );
  return {
    close: async () => {
      for (const watcher of watchers) watcher.close();
      await mkdir(artifactsDirectory, { recursive: true });
      await writeFile(
        path.join(artifactsDirectory, "filesystem.ndjson"),
        events.map((event) => JSON.stringify(event)).join("\n") +
          (events.length > 0 ? "\n" : ""),
      );
    },
  };
};
