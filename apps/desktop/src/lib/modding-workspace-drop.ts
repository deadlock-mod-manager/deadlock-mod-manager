import { getFileName, getSourceFilePath } from "./file-utils";
import { ADDON_FILE_DRAG, readAddonDrag } from "./modding-file-drag";
import {
  droppedPaths,
  readWorkspaceSource,
  WORKSPACE_SOURCE_DRAG,
  type WorkspaceSource,
} from "./modding-workspace";

type WorkspaceTransfer = Pick<DataTransfer, "getData"> & {
  files: Iterable<File>;
  items: Iterable<DataTransferItem>;
};
export interface WorkspaceDrop {
  internal: WorkspaceSource | null;
  files: File[];
  paths: string[];
  directory: boolean;
}

export function acceptsWorkspaceDrop(
  types: readonly string[],
  comparison: boolean,
): boolean {
  if (types.includes(ADDON_FILE_DRAG)) return comparison;
  return (
    types.includes(WORKSPACE_SOURCE_DRAG) ||
    types.includes("Files") ||
    types.includes("text/uri-list")
  );
}

// Capture archive opens before file trees can import the VPK itself. Other
// external files reach child import/projection targets before workspace fallback.
export function workspaceDropRoute(
  transfer: WorkspaceTransfer & { types: readonly string[] },
  comparison: boolean,
  workspaceId: string,
): "capture" | "fallback" | "ignore" {
  if (!acceptsWorkspaceDrop(transfer.types, comparison)) return "ignore";
  if (transfer.types.includes(ADDON_FILE_DRAG)) {
    const file = readAddonDrag(transfer.getData(ADDON_FILE_DRAG));
    return file?.workspaceId === workspaceId ? "ignore" : "capture";
  }
  if (transfer.types.includes(WORKSPACE_SOURCE_DRAG)) return "capture";
  const files = [
    ...transfer.files,
    ...Array.from(transfer.items).flatMap((item) => {
      const file = item.kind === "file" ? item.getAsFile() : null;
      return file ? [file] : [];
    }),
  ];
  const names = [
    ...files.map(getFileName),
    ...droppedPaths(
      transfer.getData("text/uri-list") || transfer.getData("text/plain"),
    ),
    ...(transfer.getData("text/html").match(/file:\/\/[^"'\s<>]+/g) ?? []),
  ];
  return names.some((name) => /\.(vpk|zip|7z|rar|dmodpkg)$/i.test(name))
    ? "capture"
    : "fallback";
}

export function handlesWorkspaceDrop(
  route: ReturnType<typeof workspaceDropRoute>,
  phase: "capture" | "bubble",
  defaultPrevented: boolean,
): boolean {
  return phase === "capture"
    ? route === "capture"
    : route === "fallback" && !defaultPrevented;
}

// Start all browser reads before the drop handler returns and drag data expires.
export async function captureWorkspaceDrop(
  transfer: WorkspaceTransfer,
): Promise<WorkspaceDrop> {
  const files = Array.from(transfer.files);
  const items = Array.from(transfer.items);
  const addonFile = readAddonDrag(transfer.getData(ADDON_FILE_DRAG));
  const internal =
    readWorkspaceSource(transfer.getData(WORKSPACE_SOURCE_DRAG)) ??
    readWorkspaceSource(transfer.getData("text/plain")) ??
    (addonFile
      ? ({
          kind: "addon",
          addonId: addonFile.addonId,
          hierarchy: addonFile.hierarchy,
          path: addonFile.directory ? "" : addonFile.path,
        } satisfies WorkspaceSource)
      : null);
  const paths = droppedPaths(
    transfer.getData("text/uri-list") || transfer.getData("text/plain"),
  );
  let directory = false;
  for (const item of items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (
      file &&
      !files.includes(file) &&
      !files.some(
        (candidate) =>
          candidate.name === file.name && candidate.size === file.size,
      )
    )
      files.push(file);
    directory ||= item.webkitGetAsEntry?.()?.isDirectory ?? false;
  }
  const strings = await Promise.all(
    items
      .filter((item) => item.kind === "string")
      .map(
        (item) =>
          new Promise<string>((resolve) =>
            item.getAsString((value) => {
              resolve(
                item.type === "text/html"
                  ? (value.match(/file:\/\/[^"'\s<>]+/g) ?? []).join("\n")
                  : value,
              );
            }),
          ),
      ),
  );
  return {
    internal,
    files,
    paths: [
      ...new Set([
        ...paths,
        ...files.flatMap((file) => {
          const path = getSourceFilePath(file);
          return path ? [path] : droppedPaths(getFileName(file));
        }),
        ...strings.flatMap(droppedPaths),
      ]),
    ],
    directory,
  };
}
