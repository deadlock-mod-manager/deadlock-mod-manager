import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { observeUntil } from "../support/observations";
import { readLifecycleState } from "../support/lifecycle-oracle";
import { selectNativeFixture } from "../support/native-picker";
import { assertOwnedWorld } from "../support/world";
import { $, browser } from "@wdio/globals";
import { appendFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const DROP_AREA =
  '[role="button"][aria-label="Drop files/folders here, or click to select"]';

// A drop carries either a renderer File, read here from app data, or only a
// file:// path, as drops from some applications do. A path takes the same
// route as a picked file. The File is assembled from 8 MiB Blobs because one
// 1 GiB IPC read takes the webview down before the app sees the drop.
const dispatchDrop = async (
  fileName: string,
  payload: { readFrom: string } | { uri: string },
): Promise<void> => {
  await browser.execute(
    async (selector: string, name: string, dropped: typeof payload) => {
      const transfer = new DataTransfer();
      if ("uri" in dropped) {
        transfer.setData("text/uri-list", dropped.uri);
      } else {
        const { invoke } = window.__TAURI_INTERNALS__;
        const rid = await invoke<number>("plugin:fs|open", {
          path: dropped.readFrom,
          options: { read: true },
        });
        const parts: Blob[] = [];
        for (;;) {
          // The last 8 bytes hold the big-endian count of bytes read.
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
      }
      document.querySelector(selector)?.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    },
    DROP_AREA,
    fileName,
    payload,
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
    const addLocal = await $("button=Add Local Mod");
    await addLocal.waitForClickable();
    await addLocal.click();
    const dropArea = await $(DROP_AREA);
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
      await dispatchDrop(flow.fileName, { uri: pathToFileURL(fixture).href });
    } else {
      await dispatchDrop(flow.fileName, { readFrom: fixture });
    }

    // A dropped File is staged to disk before the dialog opens.
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 240_000 });
    const add = await dialog.$("button=Add");
    await add.waitForClickable();
    await add.click();

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
    // The copy staged when the file was dropped is removed once it is imported.
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
