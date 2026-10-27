import { z } from "zod";

export const ADDON_FILE_DRAG = "application/x-dmm-addon-file";
const payload = z.object({
  addonId: z.string(),
  workspaceId: z.string().optional(),
  directory: z.boolean().optional(),
  hierarchy: z.enum(["content", "game"]),
  path: z.string().min(1),
});

export function readAddonDrag(value: string) {
  try {
    const result = payload.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function addonMoveDestination(source: string, folder: string) {
  if (folder === source || folder.startsWith(`${source}/`)) return null;
  const target = [folder, source.split("/").at(-1)].filter(Boolean).join("/");
  return target === source ? null : target;
}
