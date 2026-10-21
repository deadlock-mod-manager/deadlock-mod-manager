import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL(
  "../../apps/desktop/src-tauri/src/flatpak/relaunch.sh",
  import.meta.url,
).pathname;
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const waitFor = async (condition: () => Promise<boolean>) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await condition()) return;
    await Bun.sleep(10);
  }
  throw new Error("Flatpak relaunch did not reach the expected state");
};

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "flatpak-relaunch-"));
  directories.push(root);
  await writeFile(join(root, "running"), "123\n9123\n");
  await writeFile(
    join(root, "flatpak"),
    `#!/bin/sh
case "$1" in
  ps) [ ! -e "$TEST_ROOT/ps-fails" ] || exit 1
      cat "$TEST_ROOT/running" ;;
  run) printf '%s\\n' "$@" > "$TEST_ROOT/launched" ;;
  *) exit 2 ;;
esac
`,
    { mode: 0o700 },
  );
  await writeFile(join(root, "sleep"), "#!/bin/sh\n/bin/sleep 0.01\n", {
    mode: 0o700,
  });
  return {
    root,
    start: (scope = "--user", log = join(root, "relaunch.log")) =>
      Bun.spawn(
        [
          "sh",
          script,
          "123",
          scope,
          "dev.stormix.deadlock-mod-manager/x86_64/master",
          log,
        ],
        {
          env: {
            ...process.env,
            PATH: `${root}:${process.env.PATH}`,
            TEST_ROOT: root,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      ),
  };
};

test.skipIf(process.platform === "win32")(
  "relaunch waits for the old sandbox and preserves installation scope and ref",
  async () => {
    for (const scope of ["--user", "--system"]) {
      const { root, start } = await fixture();
      expect(await start(scope).exited).toBe(0);
      await Bun.sleep(50);
      expect(await Bun.file(join(root, "launched")).exists()).toBe(false);
      // A different sandbox whose ID contains the old ID must not block launch.
      await writeFile(join(root, "running"), "9123\n");
      await waitFor(() => Bun.file(join(root, "launched")).exists());
      expect(await readFile(join(root, "launched"), "utf8")).toBe(
        `run\n${scope}\ndev.stormix.deadlock-mod-manager/x86_64/master\n`,
      );
    }
  },
);

test.skipIf(process.platform === "win32")(
  "relaunch does not race a sandbox that never exits",
  async () => {
    const { root, start } = await fixture();
    expect(await start().exited).toBe(0);
    await waitFor(async () =>
      (await readFile(join(root, "relaunch.log"), "utf8")).includes(
        "Timed out",
      ),
    );
    expect(await Bun.file(join(root, "launched")).exists()).toBe(false);
  },
);

test.skipIf(process.platform === "win32")(
  "failure to list instances does not start a duplicate application",
  async () => {
    const { root, start } = await fixture();
    await writeFile(join(root, "ps-fails"), "");
    expect(await start().exited).toBe(0);
    await waitFor(async () =>
      (await readFile(join(root, "relaunch.log"), "utf8")).includes(
        "Could not list",
      ),
    );
    expect(await Bun.file(join(root, "launched")).exists()).toBe(false);
  },
);

test.skipIf(process.platform === "win32")(
  "invalid log destination reports failure before the app exits",
  async () => {
    const { root, start } = await fixture();
    expect(
      await start("--user", join(root, "missing", "relaunch.log")).exited,
    ).not.toBe(0);
    await unlink(join(root, "running"));
    expect(await Bun.file(join(root, "launched")).exists()).toBe(false);
  },
);
