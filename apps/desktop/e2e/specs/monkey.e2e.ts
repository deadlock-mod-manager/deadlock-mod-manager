import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  addMonkeyExternal,
  deleteMonkeyFile,
  installMonkeyMod,
  launchMonkey,
  lockMonkeyReorder,
  monkeyCheckpointSchema,
  openMonkeyMod,
  reorderMonkey,
  repairMonkey,
  switchMonkeyProfile,
  updateMonkeyMod,
  waitMonkeyStatus,
  writeMonkeyCheckpoint,
} from "../support/monkey-actions";
import {
  assertMonkeyInvariants,
  monkeyPaths,
  readMonkeyManifest,
  readMonkeyStore,
  type MonkeyModel,
} from "../support/monkey-oracle";
import {
  monkeyPlanSchema,
  monkeyReplay,
  type MonkeyStep,
  type MonkeyPlan,
} from "../support/monkey-plan";
import { MULTIPAK_MODS } from "../support/multipak-update-fixtures";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  BETA_MODS,
} from "../support/profile-fixtures";
import { setModEnabled } from "../support/shard-actions";
import { navigate, reveal } from "../support/ui";
import { observeUntil } from "../support/observations";

const choose = <T>(items: readonly T[], choice: number): T | undefined =>
  items[Math.floor(choice * items.length)];

describe("seeded monkey", () => {
  it("keeps mod state consistent through reproducible user sequences", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const planPath = path.join(world, "artifacts", "monkey-steps.json");
    const plan = monkeyPlanSchema.parse(
      JSON.parse(await readFile(planPath, "utf8")),
    );
    console.log(`Monkey seed: ${plan.seed}; steps: ${plan.stepCount}`);
    const save = () => writeFile(planPath, JSON.stringify(plan, null, 2));
    let model: MonkeyModel = { [ALPHA.id]: {}, [BETA.id]: {} };
    for (const [profileId, ids] of [
      [ALPHA.id, ALPHA_MODS],
      [BETA.id, BETA_MODS],
    ] satisfies Array<[string, string[]]>)
      for (const id of ids)
        model[profileId][id] = { enabled: true, version: "v1" };
    const external = new Set<string>();
    const consumedDownloadFaults = new Set<string>();
    let index = -3;
    const record = async (
      operation: string,
      action: (details: string[]) => Promise<boolean | void>,
    ) => {
      const executed: MonkeyPlan["executed"][number] = {
        index,
        operation,
        details: [],
        outcome: "running",
      };
      plan.executed.push(executed);
      await save();
      try {
        const skipped = await step(`monkey ${index}: ${operation}`, () =>
          action(executed.details),
        );
        await assertMonkeyInvariants(world, String(index), model, external);
        executed.outcome = skipped ? "skipped" : "passed";
        await save();
      } catch (error) {
        executed.outcome = "failed";
        await save();
        await Promise.allSettled([
          assertMonkeyInvariants(world, `failure-${index}`, model, external),
        ]);
        throw error;
      }
    };

    const run = async (planned: MonkeyStep, details: string[]) => {
      const { state, base } = await monkeyPaths(world);
      const active = model[state.activeProfileId];
      const ids = Object.keys(active).sort();
      const enabled = ids.filter((id) => active[id].enabled);
      const remotes = ids.filter((id) =>
        MULTIPAK_MODS.some((mod) => mod.id === id),
      );
      const manifest = await readMonkeyManifest(base);
      const skip = (reason: string) => {
        details.push(reason);
        return true;
      };
      switch (planned.operation) {
        case "profile":
          details.push(`switch to ${await switchMonkeyProfile(world)}`);
          break;
        case "toggle": {
          const id = choose(ids, planned.choice);
          if (!id) return skip("no mods");
          const next = !active[id].enabled;
          details.push(`${id}: ${next ? "enable" : "disable"}`);
          if (id.startsWith("local-")) {
            await navigate("my-mods");
            await setModEnabled(world, id, next);
            await waitMonkeyStatus(
              world,
              id,
              next ? "installed" : "downloaded",
            );
          } else {
            const mod = state.localMods.find((item) => item.remoteId === id);
            assert(mod);
            await openMonkeyMod(mod.name);
            await reveal(await $('[role="switch"]'));
            await $('[role="switch"]').waitForClickable();
            await $('[role="switch"]').click();
            await expect($('[role="switch"]')).toHaveAttribute(
              "aria-checked",
              String(next),
            );
            await waitMonkeyStatus(
              world,
              id,
              next ? "installed" : "downloaded",
            );
          }
          active[id].enabled = next;
          break;
        }
        case "update": {
          const id = choose(
            remotes.filter(
              (id) => active[id].enabled && active[id].version === "v1",
            ),
            planned.choice,
          );
          if (!id) return skip("no enabled v1 multipak mod");
          const fault =
            plan.downloadFaults.includes(id) && !consumedDownloadFaults.has(id);
          details.push(
            `${id}: v1 -> v2${fault ? "; HTTP 401, verify rollback, retry" : ""}`,
          );
          await updateMonkeyMod(world, id, fault, () =>
            assertMonkeyInvariants(
              world,
              `${index}-download-failed`,
              model,
              external,
            ),
          );
          if (fault) consumedDownloadFaults.add(id);
          active[id].version = "v2";
          break;
        }
        case "uninstall": {
          const id = choose(
            remotes.filter((id) => active[id].version === "v2"),
            planned.choice,
          );
          if (!id) return skip("no updated remote mod to uninstall");
          const mod = state.localMods.find((item) => item.remoteId === id);
          assert(mod);
          details.push(`delete ${id}`);
          await openMonkeyMod(mod.name);
          const remove = await $("button=Delete Mod");
          await reveal(remove);
          await remove.click();
          await $('[role="alertdialog"]').$("button=Delete").click();
          await observeUntil(
            "Removed mod",
            () => readMonkeyStore(world),
            (current) =>
              !current.localMods.some((item) => item.remoteId === id),
          );
          delete active[id];
          break;
        }
        case "install": {
          if (state.activeProfileId !== ALPHA.id)
            return skip("store installs are scoped to Alpha");
          const mod = choose(
            MULTIPAK_MODS.filter((mod) => !active[mod.id]),
            planned.choice,
          );
          if (!mod) return skip("both store mods already installed");
          details.push(`reinstall ${mod.id} v2 from store`);
          await installMonkeyMod(world, mod.id);
          active[mod.id] = { enabled: true, version: "v2" };
          break;
        }
        case "reorder":
        case "lock": {
          if (enabled.length < 2) return skip("fewer than two enabled mods");
          if (planned.operation === "lock" && process.platform !== "win32")
            return skip("Windows lock fault skipped on this platform");
          const current = enabled.toSorted(
            (a, b) =>
              manifest.mods[a].shard - manifest.mods[b].shard ||
              manifest.mods[a].currentVpks[0].localeCompare(
                manifest.mods[b].currentVpks[0],
              ),
          );
          const offset = 1 + Math.floor(planned.choice * (current.length - 1));
          const order = current.slice(offset).concat(current.slice(0, offset));
          details.push(`order ${order.join(", ")}`);
          if (planned.operation === "lock") {
            await lockMonkeyReorder(world, order);
            details.push("locked reorder rejected; handle released");
          } else {
            assert.equal(await reorderMonkey(world, order), null);
            details.push(
              "switch away and back for frontend manifest reconciliation",
            );
            await switchMonkeyProfile(world);
            await switchMonkeyProfile(world);
          }
          break;
        }
        case "modded":
        case "vanilla":
          details.push(`record ${planned.operation} launch`);
          await launchMonkey(world, planned.operation === "vanilla");
          await assertMonkeyInvariants(
            world,
            `${index}-launch`,
            model,
            external,
            new Set(),
            planned.operation,
          );
          break;
        case "repair":
          details.push(`repair ${state.activeProfileId}`);
          await repairMonkey(world, external);
          break;
        case "external-add":
          details.push(
            `add ${await addMonkeyExternal(world, index, external)}`,
          );
          break;
        case "external-delete": {
          const id = choose(
            remotes.filter(
              (id) => active[id].enabled && active[id].version === "v2",
            ),
            planned.choice,
          );
          if (!id)
            return skip("no enabled v2 remote VPK to delete and restore");
          details.push(
            `delete one VPK of ${id}; require blocked launch; reinstall from library`,
          );
          await deleteMonkeyFile(world, id, model, external, String(index));
          break;
        }
      }
    };

    try {
      if (process.env.DMM_E2E_PHASE === "restart-monkey") {
        const checkpoint = monkeyCheckpointSchema.parse(
          JSON.parse(
            await readFile(
              path.join(world, "artifacts", "monkey-checkpoint.json"),
              "utf8",
            ),
          ),
        );
        assert.notEqual(
          runtime.processId,
          checkpoint.processId,
          "Restart must use a fresh process",
        );
        assert.equal(
          (await readMonkeyStore(world)).activeProfileId,
          checkpoint.activeProfileId,
        );
        model = checkpoint.model;
        for (const file of checkpoint.external) external.add(file);
        index = plan.stepCount;
        await record("restart", async (details) => {
          details.push("fresh process; persisted profiles, manifest and bytes");
        });
      } else {
        assert.equal(process.env.DMM_E2E_PHASE, "sequence");
        await record("initial", async () => {});
        for (const mod of MULTIPAK_MODS) {
          index++;
          await record("install-v1", async (details) => {
            details.push(mod.id);
            await installMonkeyMod(world, mod.id);
            model[ALPHA.id][mod.id] = { enabled: true, version: "v1" };
          });
        }
        for (const [stepIndex, planned] of plan.planned.entries()) {
          index = stepIndex;
          await record(planned.operation, (details) => run(planned, details));
        }
        await writeMonkeyCheckpoint(world, runtime.processId, model, external);
      }
      await closeApplication(world, runtime.processId);
      await assertMonkeyInvariants(
        world,
        `closed-${process.env.DMM_E2E_PHASE}`,
        model,
        external,
      );
    } catch (error) {
      throw new Error(
        `${monkeyReplay(plan, index)}\n${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });
});
