import { expect, it } from "bun:test";
import JSZip from "jszip";
import { z } from "zod";
import {
  assertCatalogNetwork,
  catalogVpk,
  createCatalogRoutes,
} from "./gamebanana-fixtures";
import { startFixtureServer } from "./fixture-server";

it("serves origin-bound GameBanana files, separates bulk queries, and rejects an unselected download", async () => {
  const server = await startFixtureServer(
    await createCatalogRoutes("gamebanana-multifile"),
  );
  try {
    const profile = await fetch(
      `${server.origin}/apiv11/Mod/900001/ProfilePage`,
    );
    const parsed = z
      .object({ _aFiles: z.array(z.object({ _sDownloadUrl: z.string() })) })
      .parse(await profile.json());
    const download = await fetch(parsed._aFiles[0]._sDownloadUrl);
    const zip = await JSZip.loadAsync(await download.arrayBuffer());
    expect(await zip.file("base.vpk")?.async("nodebuffer")).toEqual(
      catalogVpk("base.vpk"),
    );
    const hydration = await fetch(
      `${server.origin}/apiv11/Core/Item/Data?fields[]=name`,
    );
    const updates = await fetch(
      `${server.origin}/apiv11/Core/Item/Data?fields[]=Url().sProfileUrl()`,
    );
    expect(await hydration.text()).not.toEqual(await updates.text());
    const rejected = await fetch(parsed._aFiles[2]._sDownloadUrl);
    expect(rejected.status).toBe(501);
    await rejected.text();
    expect(server.unmatchedRequests()).toHaveLength(1);
    expect(() =>
      assertCatalogNetwork("gamebanana-multifile", server.requests()),
    ).toThrow();
  } finally {
    await server.close();
  }
});

it("requires exactly the chosen archive downloads and actual provider metadata requests", async () => {
  const server = await startFixtureServer(
    await createCatalogRoutes("gamebanana-single"),
  );
  try {
    for (const endpoint of [
      "/apiv11/Mod/Index",
      "/apiv11/Mod/900001/ProfilePage",
      "/apiv11/Mod/900001/DownloadPage",
      "/dl/910001",
    ])
      await (await fetch(`${server.origin}${endpoint}`)).arrayBuffer();
    assertCatalogNetwork("gamebanana-single", server.requests());
    await (await fetch(`${server.origin}/dl/910001`)).arrayBuffer();
    expect(() =>
      assertCatalogNetwork("gamebanana-single", server.requests()),
    ).toThrow();
  } finally {
    await server.close();
  }
});
