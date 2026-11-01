import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, $$, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  UNKNOWN_ADDONS,
  unknownAddonBytes,
} from "../support/analyze-known-files-fixtures";
import { step } from "../support/evidence";
import { observeUntil, readPersistedDocument } from "../support/observations";
import { navigate, waitForOverlaysClosed } from "../support/ui";

type Row = (typeof UNKNOWN_ADDONS)[number];

// Both files are named pak01_dir.vpk; Analyze lists the base shard first.
const rowAt = async (index: number) => {
  const rows = await $$(
    '//div[@role="dialog"]//p[normalize-space()="pak01_dir.vpk"]/ancestor::div[contains(@class,"rounded-lg")][1]',
  );
  return rows[index];
};
const rowState = async (index: number) => {
  const row = await rowAt(index);
  if (!row) return "missing";
  if (await row.$("button=Add to Library").isExisting()) return "addable";
  return (await row.getText()).includes("Added to Library")
    ? "in library"
    : "other";
};
const expectRows = (expected: readonly string[]) =>
  browser.waitUntil(
    async () => {
      const states = await Promise.all(
        expected.map((_, index) => rowState(index)),
      );
      return states.every((state, index) => state === expected[index]);
    },
    { timeoutMsg: `Analysis rows never showed ${expected.join(", ")}` },
  );

const closeResults = () =>
  step("close the analysis results", async () => {
    await $(
      '//div[@role="dialog"][.//h2[normalize-space()="Local Addon Analysis"]]//button[.//span[normalize-space()="Close"]]',
    ).click();
    await waitForOverlaysClosed();
  });

const analyze = () =>
  step("run Analyze", async () => {
    await navigate("my-mods");
    await waitForOverlaysClosed();
    // An empty library shows Analyze as a button; otherwise it is in the menu.
    if (await $("button=Analyze").isExisting()) {
      await $("button=Analyze").click();
    } else {
      await $('button[aria-label="More actions"]').click();
      await browser.keys("ArrowDown");
      await $('[role="menuitem"]=Analyze Local Addons').click();
    }
    await browser.waitUntil(async () => (await rowState(1)) !== "missing", {
      timeoutMsg: "Analysis never listed both addons",
    });
  });

const libraryState = async (world: string) =>
  z
    .object({
      state: z.object({
        localMods: z.array(
          z.object({
            remoteId: z.string(),
            name: z.string(),
            installedVpks: z.array(z.string()).nullish(),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state.localMods;

const addRow = (world: string, index: number, row: Row) =>
  step(`add ${row.locator} to the library`, async () => {
    const before = (await libraryState(world)).length;
    const button = await (await rowAt(index)).$("button=Add to Library");
    await button.waitForDisplayed();
    await button.click();
    const name = await $('input[placeholder="Awesome Mod"]');
    await name.waitForDisplayed();
    await name.setValue(row.name);
    await $('//div[@role="dialog"][.//h2[normalize-space()="Add to Library"]]')
      .$("button=Add to Library")
      .click();
    await observeUntil(
      `${row.name} never reached the library`,
      () => libraryState(world),
      (mods) => mods.length === before + 1,
    );
  });

const addonsRoot = (world: string, root: string) =>
  path.join(world, "game-install", "game", "citadel", root);

const readManifest = async (world: string) =>
  z
    .object({
      mods: z.record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          shard: z.number(),
          currentVpks: z.array(z.string()),
        }),
      ),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(addonsRoot(world, "addons"), ".dmm.json"),
          "utf8",
        ),
      ),
    );

const expectOneOwnerPerFile = (world: string) =>
  step("each file has exactly one library mod", async () => {
    const mods = await libraryState(world);
    assert.deepEqual(
      mods.map((mod) => mod.name).sort(),
      UNKNOWN_ADDONS.map((row) => row.name).sort(),
    );
    const manifest = await observeUntil(
      "the manifest never recorded both mods",
      () => readManifest(world).catch(() => ({ mods: {} })),
      (value) => Object.keys(value.mods).length === UNKNOWN_ADDONS.length,
    );
    for (const [index, row] of UNKNOWN_ADDONS.entries()) {
      const shard = index + 1;
      const owners = Object.entries(manifest.mods).filter(
        ([, entry]) =>
          entry.enabled &&
          entry.shard === shard &&
          entry.currentVpks.includes("pak01_dir.vpk"),
      );
      assert.equal(owners.length, 1, `${row.locator} owners`);
      assert.equal(
        mods.find((mod) => mod.remoteId === owners[0][0])?.name,
        row.name,
      );
      assert.deepEqual(
        await readFile(path.join(addonsRoot(world, row.root), "pak01_dir.vpk")),
        unknownAddonBytes(row.root),
      );
    }
  });

describe("Analyze and files already in the library", () => {
  it("stops offering to add a file once a library mod owns it", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    if (process.env.DMM_E2E_PHASE === "add-files") {
      await analyze();
      await expectRows(["addable", "addable"]);
      await addRow(world, 0, UNKNOWN_ADDONS[0]);
      await step("only the added file shows as in the library", () =>
        expectRows(["in library", "addable"]),
      );
      await addRow(world, 1, UNKNOWN_ADDONS[1]);
      await expectRows(["in library", "in library"]);
      await closeResults();
      await analyze();
      await step("a new analysis recognizes both files", () =>
        expectRows(["in library", "in library"]),
      );
      await expectOneOwnerPerFile(world);
    } else {
      await expectOneOwnerPerFile(world);
      await analyze();
      await step("after a restart, Analyze still recognizes both files", () =>
        expectRows(["in library", "in library"]),
      );
      await expectOneOwnerPerFile(world);
    }
    await closeResults();
    await closeApplication(world, runtime.processId);
  });
});
