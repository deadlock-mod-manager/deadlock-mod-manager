import { describe, expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { LaunchRepairDetails } from "@/components/launch-repair-details";
import type {
  ReinstallOutcome,
  ReinstallResult,
} from "@/hooks/use-reinstall-mod";
import en from "@/locales/en.json";
import { type LocalMod, ModStatus } from "@/types/mods";
import {
  launchRepairTargets,
  repairLaunchFiles,
  resolveLaunchRepairMods,
} from "./launch-repair";

const mod: LocalMod = {
  id: "fixture",
  remoteId: "42",
  name: "Yamato Remodel",
  description: null,
  remoteUrl: "https://gamebanana.com/mods/42",
  category: "Skins",
  likes: 0,
  author: "Fixture",
  modAuthorId: null,
  downloadable: true,
  tags: [],
  images: [],
  hero: null,
  isAudio: false,
  isMap: false,
  audioUrl: null,
  downloadCount: 0,
  isNSFW: false,
  isObsolete: false,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  filesUpdatedAt: null,
  metadata: null,
  dependencies: null,
  overrides: null,
  createdAt: null,
  updatedAt: null,
  remoteAddedAt: new Date(0),
  remoteUpdatedAt: new Date(0),
  status: ModStatus.Installed,
  installedVpks: ["pak01_dir.vpk"],
};
const targets = (mods: LocalMod[]) =>
  resolveLaunchRepairMods(
    mods.map((item) => ({ id: item.remoteId, name: item.remoteId })),
    mods,
  );
const operations = () => ({
  reinstall: mock(
    async (): Promise<ReinstallResult> => ({
      outcome: "restored",
      missingOnDisk: true,
    }),
  ),
  disable: mock(async () => {}),
  launch: mock(async () => {}),
  onProgress: mock(() => {}),
});
const translations = async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return i18n;
};

describe("launch repair", () => {
  it("reinstalls sequentially before retrying the launch", async () => {
    const calls: string[] = [];
    const ops = operations();
    const second = { ...mod, remoteId: "43" };
    const failures = await repairLaunchFiles(
      targets([mod, second]),
      "reinstall",
      {
        ...ops,
        reinstall: async (target) => {
          calls.push(`start:${target.remoteId}`);
          await Promise.resolve();
          calls.push(`end:${target.remoteId}`);
          return { outcome: "restored", missingOnDisk: true };
        },
        launch: async () => {
          calls.push("launch");
        },
      },
    );
    expect(failures).toEqual([]);
    expect(calls).toEqual([
      "start:42",
      "end:42",
      "start:43",
      "end:43",
      "launch",
    ]);
    expect(ops.onProgress).toHaveBeenCalledWith({
      index: 2,
      total: 2,
      name: mod.name,
    });
    expect(ops.disable).not.toHaveBeenCalled();
  });

  it("keeps a failed reinstall visible in the dialog and does not launch", async () => {
    const ops = operations();
    const mods = targets([mod]);
    const failures = await repairLaunchFiles(mods, "reinstall", {
      ...ops,
      reinstall: async () => ({
        outcome: "failed",
        error: "Download unavailable",
        missingOnDisk: true,
      }),
    });
    expect(ops.launch).not.toHaveBeenCalled();
    const i18n = await translations();
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <LaunchRepairDetails mods={mods} failures={failures} progress={null} />
      </I18nextProvider>,
    );
    expect(html).toContain("Yamato Remodel");
    expect(html).toContain("Download unavailable");
    expect(html).toContain("Disable them to launch, or cancel.");
    expect(await repairLaunchFiles(mods, "disable", ops)).toEqual([]);
    expect(ops.disable).toHaveBeenCalledWith(mods[0]);
    expect(ops.launch).toHaveBeenCalledTimes(1);
  });

  const unrestored: ReinstallOutcome[] = ["manual", "downloadedOnly", "failed"];
  it.each(unrestored)("blocks launch for the %s outcome", async (outcome) => {
    const ops = operations();
    expect(
      await repairLaunchFiles(targets([mod]), "reinstall", {
        ...ops,
        reinstall: async () => ({ outcome, missingOnDisk: true }),
      }),
    ).toEqual([{ id: mod.remoteId, error: undefined }]);
    expect(ops.launch).not.toHaveBeenCalled();
  });

  it("records a thrown reinstall failure and still repairs the next mod", async () => {
    const ops = operations();
    const failures = await repairLaunchFiles(
      targets([mod, { ...mod, remoteId: "43" }]),
      "reinstall",
      {
        ...ops,
        reinstall: async (target) => {
          if (target.remoteId === "42") throw new Error("Files in use");
          return { outcome: "restored", missingOnDisk: true };
        },
      },
    );
    expect(failures).toEqual([{ id: "42", error: "Files in use" }]);
    expect(ops.onProgress).toHaveBeenCalledTimes(2);
    expect(ops.launch).not.toHaveBeenCalled();
  });

  it("disables local imports instead of reinstalling them", async () => {
    const ops = operations();
    const local = {
      ...mod,
      remoteId: "local-550e8400-e29b-41d4-a716-446655440000",
    };
    const mods = targets([local]);
    expect(await repairLaunchFiles(mods, "reinstall", ops)).toEqual([]);
    expect(ops.disable).toHaveBeenCalledWith(mods[0]);
    expect(ops.reinstall).not.toHaveBeenCalled();
    expect(ops.launch).toHaveBeenCalledTimes(1);
  });

  it("disables every affected mod before launch and stops if disabling fails", async () => {
    const ops = operations();
    const mods = targets([mod, { ...mod, remoteId: "43" }]);
    expect(await repairLaunchFiles(mods, "disable", ops)).toEqual([]);
    expect(ops.disable).toHaveBeenCalledTimes(2);
    expect(ops.reinstall).not.toHaveBeenCalled();
    expect(ops.launch).toHaveBeenCalledTimes(1);
    ops.launch.mockClear();
    await repairLaunchFiles(mods, "disable", {
      ...ops,
      disable: async () => {
        throw new Error("In use");
      },
    });
    expect(ops.launch).not.toHaveBeenCalled();
  });

  it("disables only the mods a partial reinstall left unrepaired", async () => {
    const ops = operations();
    const mods = targets([mod, { ...mod, remoteId: "43" }]);
    const failures = await repairLaunchFiles(
      launchRepairTargets(mods, null),
      "reinstall",
      {
        ...ops,
        reinstall: async (target) =>
          target.remoteId === "43"
            ? {
                outcome: "failed",
                error: "Download failed",
                missingOnDisk: true,
              }
            : { outcome: "restored", missingOnDisk: true },
      },
    );
    expect(failures).toEqual([{ id: "43", error: "Download failed" }]);
    expect(
      await repairLaunchFiles(
        launchRepairTargets(mods, failures),
        "disable",
        ops,
      ),
    ).toEqual([]);
    expect(ops.disable).toHaveBeenCalledTimes(1);
    expect(ops.disable).toHaveBeenCalledWith(mods[1]);
    expect(ops.launch).toHaveBeenCalledTimes(1);
  });

  it("targets every mod before a pass and none once all were repaired", () => {
    const mods = targets([mod, { ...mod, remoteId: "43" }]);
    expect(launchRepairTargets(mods, null)).toEqual(mods);
    expect(launchRepairTargets(mods, [{ id: "42" }])).toEqual([mods[0]]);
    expect(launchRepairTargets(mods, [])).toEqual([]);
  });

  it("resolves library names with backend fallbacks and recognizes imports without a source", () => {
    const mods = resolveLaunchRepairMods(
      [
        { id: "42", name: "Backend" },
        { id: "43", name: "Fallback" },
      ],
      [{ ...mod, downloadable: false }],
    );
    expect(mods.map((item) => item.name)).toEqual([mod.name, "Fallback"]);
    expect(mods[0].local).toBe(true);
  });

  it("renders local-import disclosure, progress, and singular/plural titles", async () => {
    const i18n = await translations();
    expect(i18n.t("launchRepair.title", { count: 1 })).toBe(
      "1 mod is missing files",
    );
    expect(i18n.t("launchRepair.title", { count: 2 })).toBe(
      "2 mods are missing files",
    );
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <LaunchRepairDetails
          mods={targets([{ ...mod, downloadable: false }])}
          failures={[]}
          progress={{ index: 1, total: 2, name: mod.name }}
        />
      </I18nextProvider>,
    );
    expect(html).toContain("Local import");
    expect(html).toContain("Reinstall and launch will disable them instead.");
    expect(html).toContain("Reinstalling 1 of 2: Yamato Remodel");
  });
});
