import { z } from "zod";
import type { ModdingWorkspaceSource } from "@/types/generated/ModdingWorkspaceSource";

export const WORKSPACE_SOURCE_DRAG = "application/x-dmm-workbench-source";
const addon = z.object({
  id: z.string(),
  name: z.string(),
  sdkRoot: z.string(),
  contentPath: z.string(),
  gamePath: z.string(),
  archivePath: z.string(),
});
const workspaceSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addon"),
    addonId: z.string(),
    hierarchy: z.enum(["content", "game"]),
    path: z.string(),
  }),
  z.object({
    kind: z.literal("archive"),
    filePath: z.string(),
    label: z.string(),
  }),
  z.object({ kind: z.literal("local"), addon, path: z.string() }),
]);
export type WorkspaceSource = ModdingWorkspaceSource;
const selection = z.object({
  path: z.string(),
  directory: z.boolean(),
  selected: z.boolean(),
  fileCount: z.number(),
});
const workspaceViewSchema = z.object({
  hierarchy: z.enum(["content", "game"]).default("content"),
  path: z.string().default(""),
  directory: z.string().default(""),
  search: z.string().default(""),
  regex: z.boolean().default(false),
  searchMode: z.enum(["paths", "contents"]).default("paths"),
  contentCaseSensitive: z.boolean().default(false),
  contentPathFilter: z.string().default(""),
  selection: z.array(selection).default([]),
});
export type WorkspaceView = z.infer<typeof workspaceViewSchema>;
const snapshotSchema = z.object({
  source: workspaceSourceSchema.nullable(),
  recent: z.array(workspaceSourceSchema).default([]),
  view: workspaceViewSchema,
});
export type WorkspaceSnapshot = z.infer<typeof snapshotSchema>;
export const emptyWorkspaceView = (): WorkspaceView =>
  workspaceViewSchema.parse({});
export const emptyWorkspace = (): WorkspaceSnapshot => ({
  source: null,
  recent: [],
  view: emptyWorkspaceView(),
});
export function readWorkspaceSnapshot(value: string): WorkspaceSnapshot {
  try {
    return snapshotSchema.parse(JSON.parse(value));
  } catch {
    return emptyWorkspace();
  }
}
export function readWorkspaceSource(value: string): WorkspaceSource | null {
  try {
    return workspaceSourceSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
export function sourceKey(source: WorkspaceSource): string {
  return source.kind === "addon"
    ? `${source.addonId}:${source.hierarchy}:${source.path}`
    : source.kind === "archive"
      ? source.filePath
      : `${source.addon.id}:${source.path}`;
}
export function workspaceForSource(source: WorkspaceSource): WorkspaceSnapshot {
  return {
    source,
    recent: [],
    view: {
      ...emptyWorkspaceView(),
      hierarchy: source.kind === "addon" ? source.hierarchy : "game",
      path: source.kind === "archive" ? "" : source.path,
    },
  };
}
export function droppedPaths(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      if (line.startsWith("file:")) {
        try {
          const url = new URL(line);
          const path = decodeURIComponent(url.pathname);
          return [
            url.hostname && url.hostname !== "localhost"
              ? `//${url.hostname}${path}`
              : /^\/[A-Za-z]:\//.test(path)
                ? path.slice(1)
                : path,
          ];
        } catch {
          return [];
        }
      }
      return /^(\/|\\\\|[A-Za-z]:[\\/])/.test(line) ? [line] : [];
    });
}
