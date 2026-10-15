import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

type WritablePrompt = (path: string) => Promise<boolean>;
let writablePrompt: WritablePrompt | null = null;

export const setWritablePrompt = (prompt: WritablePrompt | null): void => {
  writablePrompt = prompt;
};

const readOnlyError = z.object({
  kind: z.literal("readOnlyFile"),
  message: z.string(),
  path: z.string(),
});

export const readOnlyFilePath = <T>(error: T): string | null => {
  const parsed = readOnlyError.safeParse(error);
  return parsed.success ? parsed.data.path : null;
};

export const runWithWritableRecovery = async <T>(
  action: () => Promise<T>,
  repair: WritablePrompt,
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    const path = readOnlyFilePath(error);
    if (!path || !(await repair(path))) throw error;
    return action();
  }
};

export const withWritableRecovery = <T>(action: () => Promise<T>): Promise<T> =>
  runWithWritableRecovery(
    action,
    (path) => writablePrompt?.(path) ?? Promise.resolve(false),
  );

export const makeFileWritable = (path: string): Promise<void> =>
  invoke("make_file_writable", { path });
