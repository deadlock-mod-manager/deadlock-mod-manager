import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { writeFile } from "node:fs/promises";

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

export const terminateProcessTree = (child: ChildProcess): void => {
  if (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
    return;
  if (process.platform === "win32")
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
      timeout: 5000,
    });
  if (child.exitCode === null) child.kill("SIGKILL");
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
  const terminate = (reason: "timeout" | "interrupted") => {
    if (termination) return;
    termination = reason;
    output += `\nSupervisor termination: ${reason}\n`;
    const exited = child.exitCode !== null || child.signalCode !== null;
    if (exited)
      output +=
        "Launcher already exited; descendant pipe ownership cannot be recovered. Releasing output handles and failing this run.\n";
    // Sending a kill signal does not mean the process has exited yet. Reap the
    // child before reporting completion, even after releasing inherited pipes.
    if (!exited) child.once("exit", finishTermination);
    terminateProcessTree(child);
    child.stdout.destroy();
    child.stderr.destroy();
    if (exited) finishTermination();
  };
  const interrupt = () => terminate("interrupted");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  options.signal?.addEventListener("abort", interrupt, { once: true });
  const timer = setTimeout(() => terminate("timeout"), options.timeoutMs);
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      finishTermination = () => resolve(1);
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
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
