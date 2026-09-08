import { afterEach, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { processExists, runProcess } from "./process-control";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const setup = async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "dmm-process-test-"));
  directories.push(cwd);
  return {
    cwd,
    outputPath: path.join(cwd, "child.log"),
    executable: process.execPath,
    timeoutMs: 1200,
  };
};

it("terminates a hung process and its descendant and retains output", async () => {
  const options = await setup();
  const result = await runProcess({
    ...options,
    args: [
      "-e",
      'const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",windowsHide:true}); console.log(JSON.stringify({parent:process.pid,child:child.pid})); setInterval(()=>{},1000);',
    ],
  });
  const pids = z
    .object({ parent: z.number(), child: z.number() })
    .parse(JSON.parse(result.output.split("\n")[0]));
  expect(result.termination).toBe("timeout");
  expect(result.exitCode).not.toBe(0);
  expect(processExists(pids.parent)).toBe(false);
  if (process.platform === "win32")
    expect(processExists(pids.child)).toBe(false);
  else process.kill(pids.child);
  expect(await readFile(options.outputPath, "utf8")).toContain(
    "Supervisor termination: timeout",
  );
});

it("cleans up an interrupted process", async () => {
  const options = await setup();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const result = await runProcess({
      ...options,
      signal: controller.signal,
      args: ["-e", "console.log(process.pid);setInterval(()=>{},1000)"],
    });
    expect(result.termination).toBe("interrupted");
    expect(processExists(Number(result.output.split("\n")[0]))).toBe(false);
  } finally {
    clearTimeout(timer);
  }
});

it("bounds the deadline when an exited launcher leaves inherited output pipes", async () => {
  const options = await setup();
  const started = Date.now();
  // Bun closes inherited pipes differently. Exercise the actual supervisor runtime.
  const script = `import { runProcess } from ${JSON.stringify(new URL("./process-control.ts", import.meta.url).href)};
    import { writeFile } from "node:fs/promises";
    const result = await runProcess({ ...${JSON.stringify(options)}, executable: process.execPath,
      args: ["-e", 'const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e","setTimeout(()=>{},10000)"],{stdio:"inherit",windowsHide:true}); console.log(child.pid); process.exit(0);'] });
    await writeFile(${JSON.stringify(path.join(options.cwd, "result.json"))}, JSON.stringify(result));`;
  await promisify(execFile)(
    "node",
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      windowsHide: true,
      timeout: 5000,
    },
  );
  const result = z
    .object({
      output: z.string(),
      exitCode: z.number(),
      termination: z.string().nullable(),
    })
    .parse(
      JSON.parse(await readFile(path.join(options.cwd, "result.json"), "utf8")),
    );
  const pid = Number(result.output.split("\n")[0]);
  try {
    expect(Date.now() - started).toBeLessThan(4000);
    if (process.platform === "win32") {
      // Windows closes this launcher's pipe handles immediately; Unix keeps
      // them open until the inheriting descendant exits.
      expect(result.termination).toBeNull();
      expect(result.exitCode).toBe(0);
    } else {
      expect(result.termination).toBe("timeout");
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("Launcher already exited");
    }
  } finally {
    // This test owns the descendant directly; the runner must not guess an
    // orphan's identity from a potentially reused launcher PID.
    if (processExists(pid)) process.kill(pid, "SIGKILL");
  }
});

it("retains a log when launching the executable fails", async () => {
  const options = await setup();
  await expect(
    runProcess({
      ...options,
      executable: path.join(options.cwd, "missing.exe"),
      args: [],
    }),
  ).rejects.toThrow();
  expect(await readFile(options.outputPath, "utf8")).toBe("");
});
