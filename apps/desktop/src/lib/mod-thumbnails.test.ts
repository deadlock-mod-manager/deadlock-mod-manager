import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { FoundryModel } from "@/types/foundry";
import type { ModPreviewInfo } from "@/types/generated/ModPreviewInfo";
import { ModStatus } from "@/types/mods";

const disk = new Map<string, string>();
const commands: string[] = [];
let captures = 0;
let releases = 0;
const info: ModPreviewInfo = {
  identity: "f".repeat(64),
  filePath: "staged-mod.vpk",
  modelPath: "models/hero.vmdl_c",
  stockFilePath: null,
  hero: "Haze",
  ambiguousHero: false,
  gameAssetsAvailable: true,
};
const model: FoundryModel = {
  assetId: "test-asset",
  filePath: "test.glb",
  byteLength: 1,
  vertexCount: 3,
  indexCount: 3,
};

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (
    command: string,
    args: { identity?: string; png?: string } = {},
  ) => {
    commands.push(command);
    if (command === "foundry_read_thumbnail")
      return disk.get(args.identity ?? "") ?? null;
    if (command === "foundry_save_thumbnail") {
      disk.set(args.identity ?? "", `data:image/png;base64,${args.png}`);
      return;
    }
    if (command === "foundry_mod_preview_info") return info;
    throw new Error(`Unexpected command: ${command}`);
  },
}));
mock.module("./foundry", () => ({ resolveModVpk: async () => "mod.vpk" }));
mock.module("./model-assets", () => ({
  decodeFoundryModel: async () => model,
  releaseFoundryModel: () => releases++,
}));
mock.module("@/components/foundry/model-thumbnail", () => ({
  renderModelThumbnail: async () => {
    captures++;
    return new Blob(["rendered image"], { type: "image/png" });
  },
}));

import { localModThumbnailOptions } from "./mod-thumbnails";

const clients: QueryClient[] = [];
const client = () => {
  const value = new QueryClient();
  clients.push(value);
  return value;
};
afterEach(() => {
  for (const queryClient of clients.splice(0)) queryClient.clear();
  disk.clear();
  commands.length = 0;
  captures = 0;
  releases = 0;
});

test("import generates once; enablement, VPK renaming and reopening reuse the cover", async () => {
  const queryClient = client();
  const mod = {
    remoteId: "local-toggle",
    installedVpks: ["disabled-mod.vpk"],
    status: ModStatus.Downloaded,
  };
  await queryClient.prefetchQuery(localModThumbnailOptions(mod, null));
  const imported = queryClient.getQueryData(
    localModThumbnailOptions(mod, null).queryKey,
  );
  expect(imported).toContain("data:image/png;base64,");
  expect(captures).toBe(1);
  expect(releases).toBe(1);
  const before = [...commands];
  for (const status of [ModStatus.Installed, ModStatus.Downloaded]) {
    const changed = { ...mod, status, installedVpks: ["pak99_dir.vpk"] };
    const observer = new QueryObserver(
      queryClient,
      localModThumbnailOptions(changed, "another-profile"),
    );
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data).toBe(imported);
    expect(observer.getCurrentResult().isFetching).toBe(false);
    unsubscribe();
  }
  expect(commands).toEqual(before);
  expect(captures).toBe(1);
});

test("a saved cover is read without resolving or decoding the mod after memory eviction", async () => {
  const queryClient = client();
  const mod = { remoteId: "local-persisted" };
  const first = await queryClient.fetchQuery(
    localModThumbnailOptions(mod, null),
  );
  for (let index = 0; index < 65; index++) {
    const other = { remoteId: `local-eviction-${index}` };
    disk.set(await identity(other.remoteId), "data:image/png;base64,c2F2ZWQ=");
    await queryClient.fetchQuery(localModThumbnailOptions(other, null));
  }
  const before = captures;
  commands.length = 0;
  const restored = await client().fetchQuery(
    localModThumbnailOptions({ ...mod, installedVpks: ["moved.vpk"] }, null),
  );
  expect(restored).toBe(first);
  expect(commands).toEqual(["foundry_read_thumbnail"]);
  expect(captures).toBe(before);
});

test("existing content-keyed covers are reused without another capture", async () => {
  const image = "data:image/png;base64,bGVnYWN5";
  disk.set(info.identity, image);
  const result = await client().fetchQuery(
    localModThumbnailOptions({ remoteId: "local-legacy" }, null),
  );
  expect(result).toBe(image);
  expect(disk.get(await identity("local-legacy"))).toBe(image);
  expect(captures).toBe(0);
});

const identity = async (remoteId: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`dmm-local-cover-1:${remoteId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};
