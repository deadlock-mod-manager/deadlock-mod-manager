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
