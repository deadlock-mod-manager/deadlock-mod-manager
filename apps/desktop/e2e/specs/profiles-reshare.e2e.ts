// Re-sharing an imported profile passes the archives the import fetched, so
// a friend importing the re-share gets every mod with the same files.
import { browser } from "@wdio/globals";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { serializeEnabledProfileMods } from "../../src/lib/profiles/serialize-profile-mods";
import type { LocalMod } from "../../src/types/mods";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { readPersistedDocument } from "../support/observations";
import { importShareCode } from "../support/profile-share";
import {
  RESHARE_CODE,
  SHARE_CODE,
  SHARE_MODS,
  SHARED_LOAD_ORDER,
} from "../support/profile-share-fixtures";
import { activateProfile, navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const localModSchema = z.custom<LocalMod>(
  (value) => z.looseObject({ remoteId: z.string() }).safeParse(value).success,
);
const readState = async (world: string) =>
  z
    .object({
      state: z.looseObject({
        activeProfileId: z.string(),
        localMods: z.array(localModSchema),
        profiles: z.record(
          z.string(),
          z.looseObject({
            id: z.string(),
            name: z.string(),
            folderName: z.string().nullable(),
            mods: z.array(localModSchema),
            enabledMods: z.record(
              z.string(),
              z.object({
                remoteId: z.string(),
                enabled: z.boolean(),
                lastModified: z.coerce.date(),
              }),
            ),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state;

const fixtureRequests = async (world: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const response = await fetch(
    `${configuration.endpoints[0].origin}/__control/requests`,
  );
  return z
    .object({
      requests: z.array(
        z.looseObject({
          method: z.string(),
          url: z.string(),
          body: z.string().optional(),
        }),
      ),
    })
    .parse(await response.json()).requests;
};

const archiveNames = new Map(
  SHARE_MODS.flatMap((mod) => mod.archives).map((archive) => [
    `/dl/${archive.id}`,
    archive.name,
  ]),
);
/** The archives fetched since the journal had `from` entries. */
const downloadsSince = async (world: string, from: number) =>
  (await fixtureRequests(world))
    .slice(from)
    .flatMap((request) => archiveNames.get(request.url) ?? []);

const sharedSelection = Object.fromEntries(
  SHARE_MODS.map((mod) => [
    mod.id,
    mod.archives
      .filter((archive) => archive.shared)
      .map((archive) => archive.name),
  ]),
);
const expectedArchives = SHARED_LOAD_ORDER.flatMap((id) => sharedSelection[id]);
const expectedVpks = Object.fromEntries(
  SHARE_MODS.map((mod) => [
    mod.id,
    mod.archives
      .filter((archive) => archive.shared)
      .map((archive) => archive.vpk),
  ]),
);

const picksOf = (mods: LocalMod[]) =>
  Object.fromEntries(
    mods.map((mod) => [
      mod.remoteId,
      mod.selectedDownloads?.map((download) => download.name) ?? null,
    ]),
  );

/** Every shared mod is installed in the profile, from only the shared picks,
 *  and no other VPK sits in its folder. */
const assertProfileMatchesShare = (
  world: string,
  profileId: string,
  label: string,
) =>
  step(`${label} has every shared mod with its picked files`, async () => {
    const state = await readState(world);
    const profile = state.profiles[profileId];
    assert.ok(profile, `${label}: the profile exists`);
    const {
      configuration: { roots },
    } = await assertOwnedWorld(world);
    assert.ok(profile.folderName);
    const folder = path.join(
      roots.game,
      "game",
      "citadel",
      "addons",
      profile.folderName,
    );
    const manifest = z
      .object({
        mods: z.record(
          z.string(),
          z.looseObject({
            currentVpks: z.array(z.string()),
            originalVpkNames: z.array(z.string()).default([]),
          }),
        ),
      })
      .parse(
        JSON.parse(await readFile(path.join(folder, ".dmm.json"), "utf8")),
      );
    await writeFile(
      path.join(world, "artifacts", `reshare-${label}.json`),
      JSON.stringify({ profile, manifest }, null, 2),
    );
    assert.deepEqual(
      Object.fromEntries(profile.mods.map((mod) => [mod.remoteId, mod.status])),
      Object.fromEntries(SHARE_MODS.map((mod) => [mod.id, "installed"])),
      `${label}: every shared mod is installed`,
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(manifest.mods).map(([id, entry]) => [
          id,
          [...entry.originalVpkNames].sort(),
        ]),
      ),
      expectedVpks,
      `${label}: the manifest lists only the picked files`,
    );
    assert.deepEqual(
      (await readdir(folder)).filter((name) => name.endsWith(".vpk")).sort(),
      Object.values(manifest.mods)
        .flatMap((entry) => entry.currentVpks)
        .sort(),
      `${label}: the folder holds no other VPK`,
    );
  });

describe("re-sharing an imported profile", () => {
  it("passes on the archives the import fetched", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    const firstStart = (await fixtureRequests(world)).length;
    const first = await importShareCode(world, SHARE_CODE);
    assert.deepEqual(
      await downloadsSince(world, firstStart),
      expectedArchives,
      "The import fetches only the shared picks",
    );
    await assertProfileMatchesShare(world, first.id, "first-import");
    const recordedPicks = picksOf(
      (await readState(world)).profiles[first.id]?.mods ?? [],
    );

    await activateProfile(first.name);
    await navigate("my-mods");
    // Sharing reads each mod's download list, which the library also fills
    // in for mods that lack one; share once it's there.
    await browser.waitUntil(
      async () => {
        const state = await readState(world);
        return (
          state.activeProfileId === first.id &&
          state.localMods.length === SHARE_MODS.length &&
          state.localMods.every((mod) => (mod.downloads?.length ?? 0) > 0)
        );
      },
      {
        timeout: 30_000,
        timeoutMsg: "The imported mods never got their download lists",
      },
    );

    const shared = await step("share the imported profile", async () => {
      // E2E builds have no hardware ID, so the header's Share button stays
      // disabled. Build the payload with the share dialog's serializer from
      // the persisted active profile and post it to the share API.
      const state = await readState(world);
      const active = state.profiles[state.activeProfileId];
      assert.ok(active);
      const profile = {
        version: "3",
        payload: serializeEnabledProfileMods(active, state.localMods),
      };
      const { configuration } = await assertOwnedWorld(world);
      const response = await fetch(
        `${configuration.endpoints[0].origin}/api/v2/profiles`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hardwareId: "e2e",
            name: active.name,
            version: "e2e",
            profile,
          }),
        },
      );
      assert.equal(response.status, 200);
      await writeFile(
        path.join(world, "artifacts", "reshare-payload.json"),
        JSON.stringify(profile, null, 2),
      );
      return profile.payload;
    });

    const secondStart = (await fixtureRequests(world)).length;
    const second = await importShareCode(world, RESHARE_CODE);
    const secondDownloads = await downloadsSince(world, secondStart);
    await writeFile(
      path.join(world, "artifacts", "reshare-second-downloads.json"),
      JSON.stringify(secondDownloads),
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", "reshare-second-import.png"),
    );
    await assertProfileMatchesShare(world, second.id, "second-import");
    assert.deepEqual(
      secondDownloads,
      expectedArchives,
      "The friend's import fetches only the original picks",
    );
    assert.deepEqual(
      Object.fromEntries(
        shared.mods.map((mod) => [
          mod.remoteId,
          mod.selectedDownloads?.map((download) => download.file) ?? null,
        ]),
      ),
      sharedSelection,
      "The re-share names the archives the import fetched",
    );
    assert.deepEqual(shared.loadOrder, SHARED_LOAD_ORDER);
    assert.deepEqual(
      recordedPicks,
      sharedSelection,
      "The first import recorded the picks it fetched",
    );
    await closeApplication(world, runtime.processId);
  });
});
