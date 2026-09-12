import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { filesystemPaths } from "./filesystem-oracle";

export const holdVpkLock = async (
  world: string,
): Promise<() => Promise<void>> => {
  if (process.platform !== "win32")
    throw new Error("The lock scenario requires Windows");
  const { alpha, artifacts } = await filesystemPaths(world);
  const script = path.join(artifacts, "hold-vpk-lock.ps1");
  await writeFile(
    script,
    'param([string]$FilePath)\n$ErrorActionPreference = "Stop"\n$stream = [IO.File]::Open($FilePath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)\ntry { [Console]::WriteLine("locked"); Start-Sleep -Seconds 25 } finally { $stream.Dispose() }\n',
  );
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      path.join(alpha, "pak03_dir.vpk"),
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  const release = async (): Promise<void> => {
    if (child.exitCode === null) child.kill();
    await closed;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("Windows lock readiness timed out")),
        10_000,
      );
      child.stdout.once("data", (data: Buffer) => {
        clearTimeout(deadline);
        if (data.toString().trim() === "locked") resolve();
        else reject(new Error("Unexpected Windows lock readiness response"));
      });
      child.once("error", (error) => {
        clearTimeout(deadline);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(deadline);
        reject(new Error(`Windows lock exited: ${code}\n${stderr.trim()}`));
      });
    });
    return release;
  } catch (error) {
    await release();
    throw error;
  }
};
