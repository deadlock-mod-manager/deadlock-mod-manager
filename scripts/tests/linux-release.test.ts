import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

interface Platform {
  signature: string;
  url: string;
}

interface Metadata {
  version: string;
  platforms: Record<string, Platform>;
}

const repository = "https://github.com/example/dmm";
const deb = "Deadlock.Mod.Manager_2.0.0_amd64.deb";
const rpm = "Deadlock.Mod.Manager-2.0.0-1.x86_64.rpm";
const cefDeb = "Deadlock.Mod.Manager_2.0.0_amd64-cef.deb";

const releaseAssets = [
  { id: 1, name: "latest.json" },
  { id: 2, name: deb },
  { id: 3, name: rpm },
  { id: 4, name: cefDeb },
  { id: 5, name: `${cefDeb}.sig` },
  { id: 6, name: "deadlock-mod-manager.flatpak" },
  { id: 7, name: "deadlock-mod-manager-cef.flatpak" },
  { id: 8, name: "DMM-setup.exe" },
].map((asset) => ({
  id: asset.id,
  name: asset.name,
  url: `https://api.github.com/repos/example/dmm/releases/assets/${asset.id}`,
  browser_download_url: `${repository}/releases/download/untagged-draft/${asset.name}`,
}));

async function generateMetadata(
  action: "update-latest-json" | "update-latest-cef-json",
  tag: string,
  platforms: Record<string, Platform> = {
    "linux-x86_64": { signature: "deb-signature", url: releaseAssets[1].url },
    "linux-x86_64-deb": {
      signature: "deb-signature",
      url: releaseAssets[1].url,
    },
    "linux-x86_64-rpm": {
      signature: "rpm-signature",
      url: releaseAssets[2].url,
    },
  },
) {
  const yaml = readFileSync(
    new URL(`../../.github/actions/${action}/action.yml`, import.meta.url),
    "utf8",
  );
  const script = yaml
    .split("        script: |\n")[1]
    ?.replace(/^          /gm, "");
  if (!script) throw new Error("Missing metadata action script");
  let uploaded: Metadata | undefined;
  let deleted = false;
  await runInNewContext(`(async () => {${script}})()`, {
    Buffer,
    console: { log: () => {} },
    require: (name: string) => {
      if (name === "fs") {
        return {
          readdirSync: () => ["DMM-setup.exe", "DMM-setup.exe.sig"],
          readFileSync: () => "windows-signature",
        };
      }
      if (name === "path")
        return { join: (...parts: string[]) => parts.join("/") };
      throw new Error(`Unexpected module ${name}`);
    },
    process: {
      env: {
        RELEASE_ID: "42",
        VERSION: tag,
        APP_VERSION: "2.0.0",
        ARTIFACT_PATH: "/signed",
      },
    },
    context: { repo: { owner: "example", repo: "dmm" } },
    github: {
      rest: {
        repos: {
          getRelease: async () => ({ data: { assets: releaseAssets } }),
          getReleaseAsset: async ({ asset_id }: { asset_id: number }) => ({
            data: Buffer.from(
              asset_id === 1
                ? JSON.stringify({ version: "2.0.0", platforms })
                : "cef-deb-signature",
            ),
          }),
          deleteReleaseAsset: async () => {
            deleted = true;
          },
          uploadReleaseAsset: async ({ data }: { data: Buffer }) => {
            uploaded = JSON.parse(data.toString());
          },
        },
      },
    },
  });
  if (!uploaded) throw new Error("Metadata was not uploaded");
  return { metadata: uploaded, deleted };
}

for (const tag of ["nightly", "v2.0.0"]) {
  test(`Linux ${tag} metadata resolves asset API IDs to real download filenames`, async () => {
    const { metadata } = await generateMetadata("update-latest-json", tag);
    for (const [target, name, signature] of [
      ["linux-x86_64", deb, "deb-signature"],
      ["linux-x86_64-deb", deb, "deb-signature"],
      ["linux-x86_64-rpm", rpm, "rpm-signature"],
      ["linux-x86_64-flatpak", "deadlock-mod-manager.flatpak", ""],
    ]) {
      expect(metadata.platforms[target]).toEqual({
        signature,
        url: `${repository}/releases/download/${tag}/${name}`,
      });
    }
  });

  test(`CEF ${tag} metadata supports exact Debian and Flatpak targets`, async () => {
    const { metadata } = await generateMetadata("update-latest-cef-json", tag);
    for (const target of ["linux-x86_64", "linux-x86_64-deb"]) {
      expect(metadata.platforms[target]).toEqual({
        signature: "cef-deb-signature",
        url: `${repository}/releases/download/${tag}/${cefDeb}`,
      });
    }
    expect(metadata.platforms["linux-x86_64-flatpak"]).toEqual({
      signature: "",
      url: `${repository}/releases/download/${tag}/deadlock-mod-manager-cef.flatpak`,
    });
  });
}

test("unresolved asset IDs fail before replacing published metadata", async () => {
  await expect(
    generateMetadata("update-latest-json", "nightly", {
      "linux-x86_64-deb": {
        signature: "deb-signature",
        url: "https://api.github.com/repos/example/dmm/releases/assets/999",
      },
    }),
  ).rejects.toThrow("999");
});
