import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function updateMetadata(files: Record<string, string>) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "dmm-release-test-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  const action = fs
    .readFileSync(
      path.resolve(
        import.meta.dir,
        "../../.github/actions/update-latest-json/action.yml",
      ),
      "utf8",
    )
    .replaceAll("\r\n", "\n");
  const script = action
    .split("        script: |\n")[1]
    ?.replace(/^          /gm, "");
  if (!script) throw new Error("Updater action script missing");

  let uploaded = "";
  let deleted = false;
  const latest = {
    platforms: {
      "linux-x86_64": {
        signature: "linux-signature",
        url: "https://example.com/app.AppImage",
      },
    },
  };
  await (runInNewContext(`(async () => {${script}})()`, {
    require: (name: string) => {
      if (name === "fs") return fs;
      if (name === "path") return path;
      throw new Error(`Unexpected module: ${name}`);
    },
    process: {
      env: { RELEASE_ID: "42", VERSION: "v1.0.0", ARTIFACT_PATH: directory },
    },
    Buffer,
    console: { log: () => {} },
    context: { repo: { owner: "example", repo: "dmm" } },
    github: {
      rest: {
        repos: {
          getRelease: async () => ({
            data: { assets: [{ name: "latest.json", id: 1 }] },
          }),
          getReleaseAsset: async () => ({
            data: Buffer.from(JSON.stringify(latest)),
          }),
          deleteReleaseAsset: async () => {
            deleted = true;
          },
          uploadReleaseAsset: async (asset: { data: Buffer }) => {
            uploaded = asset.data.toString();
          },
        },
      },
    },
  }) as Promise<void>);
  return { uploaded, deleted };
}

test("updater selects the NSIS installer and its matching signature beside standalone and CEF executables", async () => {
  const result = await updateMetadata({
    "Deadlock Mod Manager_1.0.0_x64-portable.exe": "standalone",
    "Deadlock Mod Manager_1.0.0_x64-portable.exe.sig": "wrong-signature",
    "DMM-cef-setup.exe": "cef-installer",
    "DMM-cef-setup.exe.sig": "cef-signature",
    "DMM-setup.exe": "installer",
    "DMM-setup.exe.sig": "installer-signature\n",
  });
  const expected = {
    signature: "installer-signature",
    url: "https://github.com/example/dmm/releases/download/v1.0.0/DMM-setup.exe",
  };
  const metadata = JSON.parse(result.uploaded) as {
    platforms: Record<string, { signature: string; url: string }>;
  };
  expect(metadata.platforms["windows-x86_64"]).toEqual(expected);
  expect(metadata.platforms["windows-x86_64-nsis"]).toEqual(expected);
  expect(metadata.platforms["linux-x86_64"]?.signature).toBe("linux-signature");
  expect(result.deleted).toBe(true);
});

test("updater rejects a standalone executable without an installer", async () => {
  await expect(
    updateMetadata({
      "Deadlock Mod Manager_1.0.0_x64-portable.exe": "standalone",
    }),
  ).rejects.toThrow("Expected one NSIS installer");
});

test("updater rejects ambiguous installers", async () => {
  await expect(
    updateMetadata({
      "DMM-setup.exe": "installer",
      "Other-setup.exe": "other-installer",
    }),
  ).rejects.toThrow("Expected one NSIS installer");
});

test("updater rejects an installer without its own signature", async () => {
  await expect(
    updateMetadata({
      "DMM-setup.exe": "installer",
      "Deadlock Mod Manager_1.0.0_x64-portable.exe.sig": "wrong-signature",
    }),
  ).rejects.toThrow("Missing updater signature for DMM-setup.exe");
});
