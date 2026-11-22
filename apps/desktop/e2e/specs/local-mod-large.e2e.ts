import { startApplication } from "../support/application";
import {
  ADD_MODS_DROP_AREA,
  dropFilePaths,
  openAddLocalMod,
} from "../support/ui";
import { closeApplication } from "../support/application-exit";
import { observeUntil } from "../support/observations";
import { readLifecycleState } from "../support/lifecycle-oracle";
import { selectNativeFixture } from "../support/native-picker";
import { assertOwnedWorld } from "../support/world";
import { $, browser } from "@wdio/globals";
import { appendFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

type Flow = { source: "picker" | "drop" | "drop-path"; fileName: string };

const flows = {
  "local-mod-large-picker-vpk": { source: "picker", fileName: "large-mod.vpk" },
  "local-mod-large-picker-zip": { source: "picker", fileName: "large-mod.zip" },
  "local-mod-large-drop-vpk": { source: "drop", fileName: "large-mod.vpk" },
  "local-mod-large-drop-zip": { source: "drop", fileName: "large-mod.zip" },
  "local-mod-large-drop-path-vpk": {
    source: "drop-path",
    fileName: "large-mod.vpk",
  },
  "local-mod-large-drop-path-zip": {
    source: "drop-path",
    fileName: "large-mod.zip",
  },
} satisfies Record<string, Flow>;

const dropRendererFile = async (
  fileName: string,
  readFrom: string,
): Promise<void> => {
  await browser.execute(
    async (selector: string, name: string, source: string) => {
      const transfer = new DataTransfer();
      const { invoke } = window.__TAURI_INTERNALS__;
      const rid = await invoke<number>("plugin:fs|open", {
        path: source,
        options: { read: true },
      });
      const parts: Blob[] = [];
      for (;;) {
        const data = await invoke<ArrayBuffer>("plugin:fs|read", {
          rid,
          len: 8 * 1024 * 1024,
        });
        const read = Number(
          new DataView(data).getBigUint64(data.byteLength - 8),
        );
        if (read === 0) break;
        parts.push(new Blob([new Uint8Array(data, 0, read)]));
      }
      await invoke("plugin:resources|close", { rid });
      transfer.items.add(new File(parts, name));
      document.querySelector(selector)?.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    },
    ADD_MODS_DROP_AREA,
    fileName,
    readFrom,
  );
};

const findFile = async (
  directory: string,
  name: string,
): Promise<string | null> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(entryPath, name);
      if (found) return found;
    } else if (entry.name === name) {
      return entryPath;
    }
  }
  return null;
};

describe("large local mod import", () => {
  it("imports a large mod without crashing the webview", async () => {
    const caseId = process.env.DMM_E2E_CASE_ID ?? "";
    const flow = Object.hasOwn(flows, caseId)
      ? flows[caseId as keyof typeof flows]
      : undefined;
    if (!flow) throw new Error(`Unknown case ${caseId}`);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const { roots } = (await assertOwnedWorld(world)).configuration;
    const fixtures =
      flow.source === "drop"
        ? path.join(roots.appData, "e2e-drop")
        : path.join(world, "fixtures");
    const fixture = path.join(fixtures, flow.fileName);
    const log = path.join(world, "artifacts", "local-mod-large.log");
    const before = (await readLifecycleState(world)).localMods.length;

    const link = await $('a[href="/my-mods"]');
    await link.waitForClickable();
    await link.click();
    await openAddLocalMod();
    const dropArea = await $(ADD_MODS_DROP_AREA);
    await dropArea.waitForClickable();

    const started = Date.now();
    if (flow.source === "picker") {
      await selectNativeFixture(
        runtime.processId,
        world,
        () => dropArea.click(),
        flow.fileName,
      );
    } else if (flow.source === "drop-path") {
      await dropFilePaths([fixture]);
    } else {
      await dropRendererFile(flow.fileName, fixture);
    }

    const dialog = await $('[role="dialog"]');
    const add = await dialog.$("button=Add");
    await add.waitForClickable({ timeout: 240_000 });
    await add.click();

    await dialog.waitForDisplayed({ reverse: true, timeout: 240_000 });
    const state = await observeUntil(
      "Large mod was not added",
      () => readLifecycleState(world),
      (value) => value.localMods.length > before,
      240_000,
    );
    const elapsed = Date.now() - started;
    const memory = await browser.execute(() => {
      const heap = (
        performance as Performance & {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory;
      return heap
        ? { used: heap.usedJSHeapSize, limit: heap.jsHeapSizeLimit }
        : null;
    });
    const modId = state.localMods.at(-1)?.remoteId ?? "";
    const imported = await findFile(
      path.join(roots.appData, "mods", modId),
      "large-mod.vpk",
    );
    const importedSize = imported ? (await stat(imported)).size : null;
    await appendFile(
      log,
      `${JSON.stringify({ caseId, elapsed, memory, modId, imported, importedSize })}\n`,
    );
    const expectedSize = (await stat(path.join(fixtures, "large-mod.vpk")))
      .size;
    if (importedSize !== expectedSize)
      throw new Error(
        `Imported VPK ${imported} has ${importedSize} bytes, expected ${expectedSize}`,
      );
    await observeUntil(
      "Staged drop was not discarded",
      () =>
        stat(path.join(roots.appData, "dropped-mods")).then(
          () => true,
          () => false,
        ),
      (staged) => !staged,
    );
    await closeApplication(world, runtime.processId);
  });
});
