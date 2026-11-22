import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ESRCH"
    )
      throw error;
    return false;
  }
};

const terminateProcessTree = async (child: ChildProcess): Promise<void> => {
  if (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
    return;
  const target = process.platform === "win32" ? child.pid : -child.pid;
  if (process.platform === "win32") {
    const result = spawnSync(
      "taskkill.exe",
      ["/pid", String(child.pid), "/t", "/f"],
      {
        windowsHide: true,
        stdio: "ignore",
        timeout: 5000,
      },
    );
    if (result.status !== 0 && processExists(target))
      throw new Error(`Could not terminate owned process tree ${child.pid}`);
  } else {
    // runProcess creates a dedicated Unix process group, including descendants.
    try {
      process.kill(target, "SIGKILL");
    } catch (error) {
      if (processExists(target)) throw error;
    }
  }
  const deadline = Date.now() + 5000;
  while (
    (child.exitCode === null && child.signalCode === null) ||
    processExists(target)
  ) {
    if (Date.now() >= deadline)
      throw new Error(`Owned process tree ${child.pid} did not terminate`);
    await delay(25);
  }
};

export const runProcess = async (options: {
  executable: string;
  args: string[];
  cwd: string;
  environment?: NodeJS.ProcessEnv;
  outputPath: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{
  exitCode: number;
  output: string;
  termination: "timeout" | "interrupted" | null;
}> => {
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: options.environment,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let termination: "timeout" | "interrupted" | null = null;
  const receive = (bytes: Buffer) => {
    output += bytes.toString();
    process.stdout.write(bytes);
  };
  child.stdout.on("data", receive);
  child.stderr.on("data", receive);
  let finishTermination = () => {};
  let failTermination = (_error: Error) => {};
  const terminate = (reason: "timeout" | "interrupted") => {
    if (termination) return;
    termination = reason;
    output += `\nSupervisor termination: ${reason}\n`;
    const exited = child.exitCode !== null || child.signalCode !== null;
    if (exited)
      output +=
        "Launcher already exited; descendant pipe ownership cannot be recovered. Releasing output handles and failing this run.\n";
    child.stdout.destroy();
    child.stderr.destroy();
    if (exited) finishTermination();
    else
      void terminateProcessTree(child).then(
        finishTermination,
        (error: Error) => {
          output += `Process cleanup failed: ${error.message}\n`;
          failTermination(error);
        },
      );
  };
  const interrupt = () => terminate("interrupted");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  options.signal?.addEventListener("abort", interrupt, { once: true });
  const timer = setTimeout(() => terminate("timeout"), options.timeoutMs);
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      finishTermination = () => resolve(1);
      failTermination = reject;
      child.once("error", reject);
      child.once("close", (code) => {
        if (!termination) resolve(code ?? 1);
      });
      if (options.signal?.aborted) interrupt();
    });
    return { exitCode: termination ? 1 : exitCode, output, termination };
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    options.signal?.removeEventListener("abort", interrupt);
    await writeFile(options.outputPath, output);
  }
};
