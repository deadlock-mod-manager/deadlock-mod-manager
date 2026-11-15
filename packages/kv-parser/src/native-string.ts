import { RuntimeError } from "@deadlock-mods/common";
import type { Pointer } from "bun:ffi";

/** Copy an owned native string before releasing its allocation, even if copying fails. */
export function takeNativeString(
  result: Pointer | null,
  copy: (pointer: Pointer) => string,
  free: (pointer: Pointer) => void,
): string {
  if (result === null) {
    throw new RuntimeError("Native KV parser returned a null pointer");
  }
  try {
    return copy(result);
  } finally {
    free(result);
  }
}
