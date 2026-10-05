import { expect, it } from "bun:test";
import JSZip from "jszip";
import { z } from "zod";
import {
  assertCatalogNetwork,
  BULK_HYDRATION_FIELDS,
  BULK_UPDATE_FIELDS,
  catalogVpk,
  catalogRecipe,
  createCatalogRoutes,
  OPTIONAL_FILE_ID,
  UPDATE_SKIP_DATES,
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
      `${server.origin}/Core/Item/Data?fields[]=${BULK_HYDRATION_FIELDS}`,
    );
    const updates = await fetch(
      `${server.origin}/Core/Item/Data?fields[]=${BULK_UPDATE_FIELDS}`,
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

it("builds multiple VPKs in each selected archive and rejects the unselected archive", async () => {
  const server = await startFixtureServer(
    await createCatalogRoutes("gamebanana-remembered"),
  );
  try {
    for (const archive of catalogRecipe("gamebanana-remembered").filter(
      (item) => item.selected,
    )) {
      const response = await fetch(`${server.origin}/dl/${archive.id}`);
      const zip = await JSZip.loadAsync(await response.arrayBuffer());
      expect(Object.keys(zip.files).sort()).toEqual(archive.files.toSorted());
      for (const name of archive.files)
        expect(await zip.file(name)?.async("nodebuffer")).toEqual(
          catalogVpk(name),
        );
    }
    const rejected = await fetch(`${server.origin}/dl/910003`);
    expect(rejected.status).toBe(501);
    await rejected.text();
  } finally {
    await server.close();
  }
});

it("requires a failed variant fetch followed by a successful retry with no extra downloads", async () => {
  const scenario = "gamebanana-switch-failure";
  const server = await startFixtureServer(await createCatalogRoutes(scenario));
  try {
    for (const endpoint of [
      "/apiv11/Mod/Index",
      "/apiv11/Mod/900001/ProfilePage",
      "/apiv11/Mod/900001/DownloadPage",
      "/dl/910001",
      "/dl/910002",
    ])
      await (await fetch(`${server.origin}${endpoint}`)).arrayBuffer();
    const failed = await fetch(`${server.origin}/dl/910003`);
    expect(failed.status).toBe(503);
    await failed.text();
    expect(() => assertCatalogNetwork(scenario, server.requests())).toThrow();
    const recovered = await fetch(`${server.origin}/dl/910003`);
    expect(recovered.status).toBe(200);
    const zip = await JSZip.loadAsync(await recovered.arrayBuffer());
    expect(await zip.file("red.vpk")?.async("nodebuffer")).toEqual(
      catalogVpk("red.vpk"),
    );
    assertCatalogNetwork(scenario, server.requests());
    await (await fetch(`${server.origin}/dl/910003`)).arrayBuffer();
    expect(() => assertCatalogNetwork(scenario, server.requests())).toThrow();
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

it("serves one bulk update per expired check: optional file, then two updates of the installed file", async () => {
  const scenario = "gamebanana-update-skip";
  const server = await startFixtureServer(await createCatalogRoutes(scenario));
  const snapshot = z.tuple([
    z.string(),
    z.number(),
    z.array(z.object({ _idRow: z.number(), _tsDateAdded: z.number() })),
  ]);
  try {
    const dates = [];
    for (let check = 0; check < 3; check++) {
      const response = await fetch(
        `${server.origin}/Core/Item/Data?fields[]=${BULK_UPDATE_FIELDS}`,
      );
      const [, , files] = snapshot.parse(await response.json());
      dates.push(files.map((file) => [file._idRow, file._tsDateAdded]));
    }
    const { optionalFile, updatedFile, newerFile } = UPDATE_SKIP_DATES;
    expect(dates).toEqual([
      [
        [910001, 1_780_000_000],
        [OPTIONAL_FILE_ID, optionalFile],
      ],
      [
        [910001, updatedFile],
        [OPTIONAL_FILE_ID, optionalFile],
      ],
      [
        [910001, newerFile],
        [OPTIONAL_FILE_ID, optionalFile],
      ],
    ]);
    for (const endpoint of [
      "/apiv11/Mod/Index",
      "/apiv11/Mod/900001/ProfilePage",
      "/apiv11/Mod/900001/DownloadPage",
      "/dl/910001",
    ])
      await (await fetch(`${server.origin}${endpoint}`)).arrayBuffer();
    assertCatalogNetwork(scenario, server.requests());
    await fetch(
      `${server.origin}/Core/Item/Data?fields[]=${BULK_UPDATE_FIELDS}`,
    ).then((response) => response.arrayBuffer());
    expect(() => assertCatalogNetwork(scenario, server.requests())).toThrow();
  } finally {
    await server.close();
  }
});
