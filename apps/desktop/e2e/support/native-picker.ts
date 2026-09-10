import { spawn } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertOwnedWorld, REPOSITORY_ROOT } from "./world";

export const nativePickerBinary = path.join(
  REPOSITORY_ROOT,
  "apps",
  "desktop",
  "e2e",
  "native",
  "Picker",
  "bin",
  "Release",
  "net10.0-windows",
  "Picker.exe",
);

export const selectNativeFixture = async (
  processId: number,
  world: string,
  openPicker: () => Promise<void>,
): Promise<void> => {
  await assertOwnedWorld(world);
  await access(nativePickerBinary);
  const child = spawn(nativePickerBinary, [String(processId), world], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const result = new Promise<number>((resolve) => {
    child.once("error", (error) => {
      output += error.message;
      resolve(1);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
  const deadline = setTimeout(() => child.kill(), 20_000);
  try {
    await openPicker();
    if ((await result) !== 0)
      throw new Error(`Native picker failed: ${output}`);
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null) child.kill();
    await result;
    await writeFile(path.join(world, "artifacts", "native-picker.log"), output);
  }
};
