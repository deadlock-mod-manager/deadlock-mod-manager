import { spawn } from "node:child_process";
import { access, realpath, writeFile } from "node:fs/promises";
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
  fixtureName = "e2e-local-mod.vpk",
): Promise<void> => {
  await assertOwnedWorld(world);
  await access(nativePickerBinary);
  const fixtureRoot = await realpath(path.join(world, "fixtures"));
  const fixture = await realpath(path.resolve(fixtureRoot, fixtureName));
  const relative = path.relative(fixtureRoot, fixture);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(
      "Picker fixture must remain inside the owned fixtures directory",
    );
  const child = spawn(
    nativePickerBinary,
    [String(processId), world, "--fixture", fixture],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
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
  const deadline = setTimeout(() => {
    output += "Native picker exceeded its 20 second deadline\n";
    child.kill();
  }, 20_000);
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
