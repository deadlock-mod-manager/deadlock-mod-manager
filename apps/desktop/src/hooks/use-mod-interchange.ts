import type { HeroDetectionResult } from "@deadlock-mods/hero-parser";
import { resolveDetectedHeroLabel } from "@deadlock-mods/hero-parser";
import type { ModDto } from "@deadlock-mods/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getMod } from "@/lib/api-client";
import logger from "@/lib/logger";
import {
  buildImportedLocalMod,
  crosshairFromConvars,
  crosshairToConvars,
  documentForProfile,
  exportInputFromProfile,
  type IdentifyResult,
  type ImportedMod,
  type InterchangeCrosshair,
  type InterchangeDocument,
  type InterchangeExportReport,
  type InterchangeImportReport,
  type InterchangeProgress,
  type InterchangeSourceInfo,
  isLocalModId,
  uniqueName,
} from "@/lib/mod-interchange";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";
import type { ProfileId } from "@/types/profiles";

export type InterchangeSource =
  | { kind: "manager"; id: string; name: string; location?: string }
  | { kind: "bundle"; path: string };

export type ImportSelection = {
  /** Library mods to import into the active profile. */
  modKeys: string[];
  /** Source profiles to recreate as DMM profiles. */
  profileKeys: string[];
  /** Crosshair entries to add to the crosshair history. */
  crosshairKeys: string[];
};

export type ImportStageProgress = {
  stage: "library" | "profile" | "crosshairs";
  label: string;
  stageIndex: number;
  stageCount: number;
  current: number;
  total: number;
  itemName: string;
};

export type ImportedProfile = {
  name: string;
  profileId: string | null;
  report: InterchangeImportReport | null;
  error: string | null;
};

export type UnrecognizedMod = {
  modId: string;
  name: string;
};

export type ImportOutcome = {
  library: InterchangeImportReport | null;
  profiles: ImportedProfile[];
  crosshairs: number;
  imported: number;
  skipped: number;
  failed: number;
  unrecognized: UnrecognizedMod[];
};

const CATALOG_LOOKUP_CONCURRENCY = 4;
const IMPORT_PROGRESS_EVENT = "interchange-import-progress";
const EXPORT_PROGRESS_EVENT = "interchange-export-progress";

/** Catalog metadata for GameBanana imports; missing entries keep the
 *  document's own data (offline, removed submission, rate limit). */
const fetchCatalogMods = async (
  modIds: string[],
): Promise<Map<string, ModDto>> => {
  const found = new Map<string, ModDto>();
  let next = 0;
  const worker = async () => {
    while (next < modIds.length) {
      const modId = modIds[next++];
      try {
        found.set(modId, await getMod(modId));
      } catch (error) {
        logger
          .withMetadata({ modId })
          .withError(error)
          .warn("Using interchange metadata for imported mod");
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(CATALOG_LOOKUP_CONCURRENCY, modIds.length) },
      worker,
    ),
  );
  return found;
};

const detectHeroes = (modIds: string[]) => {
  const { setDetectedHero } = usePersistedStore.getState();
  void (async () => {
    for (const modId of modIds) {
      try {
        const detection = await invoke<HeroDetectionResult>("detect_mod_hero", {
          modId,
        });
        setDetectedHero(
          modId,
          resolveDetectedHeroLabel(detection),
          detection.usesCriticalPaths,
        );
      } catch {
        setDetectedHero(modId, null);
      }
    }
  })();
};

export const useInterchangeSources = (enabled = true) =>
  useQuery({
    queryKey: ["interchange-sources"],
    queryFn: () => invoke<InterchangeSourceInfo[]>("list_interchange_sources"),
    enabled,
    staleTime: 10_000,
  });

export const useInterchangeLedger = (enabled = true) =>
  useQuery({
    queryKey: ["interchange-ledger"],
    queryFn: () =>
      invoke<Record<string, string>>("get_interchange_ledger").catch(
        () => ({}),
      ),
    enabled,
  });

export const readInterchangeSource = (source: InterchangeSource) =>
  source.kind === "manager"
    ? invoke<InterchangeDocument>("read_interchange_source", {
        sourceId: source.id,
        location: source.location ?? null,
      })
    : invoke<InterchangeDocument>("read_interchange_bundle", {
        path: source.path,
      });

export const useReadInterchangeSource = () =>
  useMutation({ mutationFn: readInterchangeSource });

/** Import `keys` of `document` into one profile and register the results in
 *  the library store. */
const importIntoProfile = async (
  document: InterchangeDocument,
  keys: string[],
  profileId: ProfileId,
): Promise<InterchangeImportReport> => {
  const state = usePersistedStore.getState();
  const profile = state.profiles[profileId];
  const libraryMods = profile?.mods ?? state.localMods;
  const startOrder =
    libraryMods.reduce(
      (max, mod) => Math.max(max, mod.installOrder ?? -1),
      -1,
    ) + 1;

  const report = await invoke<InterchangeImportReport>(
    "import_interchange_mods",
    {
      request: {
        document,
        keys,
        profileFolder: profile?.folderName ?? null,
        startOrder,
        knownModIds: libraryMods.map((mod) => mod.remoteId),
      },
    },
  );

  const imported = report.results.filter(
    (result): result is ImportedMod & { modId: string } =>
      result.status === "imported" && result.modId !== null,
  );
  const entriesByKey = new Map(document.mods.map((mod) => [mod.key, mod]));
  const catalogMods = await fetchCatalogMods(
    imported
      .filter(
        (result) =>
          entriesByKey.get(result.key)?.origin.provider === "gamebanana",
      )
      .map((result) => result.modId),
  );

  const { addLocalMod, setModEnabledInProfile } = usePersistedStore.getState();
  for (const result of imported) {
    const entry = entriesByKey.get(result.key);
    if (!entry) continue;
    const { mod, additional } = buildImportedLocalMod(
      entry,
      result,
      catalogMods.get(result.modId) ?? null,
    );
    addLocalMod(mod, additional, profileId);
    if (result.enabled) setModEnabledInProfile(profileId, result.modId, true);
  }
  detectHeroes(imported.map((result) => result.modId));
  return report;
};

const count = (reports: InterchangeImportReport[], status: string) =>
  reports.reduce(
    (sum, report) =>
      sum + report.results.filter((result) => result.status === status).length,
    0,
  );

export const useRunInterchangeImport = () =>
  useMutation({
    mutationFn: async ({
      document,
      selection,
      onProgress,
    }: {
      document: InterchangeDocument;
      selection: ImportSelection;
      onProgress: (progress: ImportStageProgress) => void;
    }): Promise<ImportOutcome> => {
      const profiles = document.profiles.filter((profile) =>
        selection.profileKeys.includes(profile.key),
      );
      const crosshairs = document.crosshairs.filter((crosshair) =>
        selection.crosshairKeys.includes(crosshair.key),
      );
      const stages: Array<{
        stage: ImportStageProgress["stage"];
        label: string;
      }> = [
        ...(selection.modKeys.length > 0
          ? [{ stage: "library" as const, label: "library" }]
          : []),
        ...profiles.map((profile) => ({
          stage: "profile" as const,
          label: profile.name,
        })),
        ...(crosshairs.length > 0
          ? [{ stage: "crosshairs" as const, label: "crosshairs" }]
          : []),
      ];

      let stageIndex = 0;
      const report = (current: number, total: number, itemName: string) => {
        const stage = stages[stageIndex];
        if (!stage) return;
        onProgress({
          ...stage,
          stageIndex,
          stageCount: stages.length,
          current,
          total,
          itemName,
        });
      };
      const unlisten = await listen<InterchangeProgress>(
        IMPORT_PROGRESS_EVENT,
        (event) =>
          report(
            event.payload.current,
            event.payload.total,
            event.payload.name,
          ),
      );

      const reports: InterchangeImportReport[] = [];
      let library: InterchangeImportReport | null = null;
      const importedProfiles: ImportedProfile[] = [];
      let crosshairCount = 0;
      try {
        if (selection.modKeys.length > 0) {
          report(0, selection.modKeys.length, "");
          const activeProfileId = usePersistedStore.getState().activeProfileId;
          library = await importIntoProfile(
            document,
            selection.modKeys,
            activeProfileId,
          );
          reports.push(library);
          stageIndex++;
        }

        for (const profile of profiles) {
          report(0, profile.mods.length, "");
          const state = usePersistedStore.getState();
          const name = uniqueName(
            profile.name,
            Object.values(state.profiles).map((p) => p.name),
          );
          const profileId = await state.createProfile(
            name,
            profile.description ?? undefined,
          );
          if (!profileId) {
            importedProfiles.push({
              name,
              profileId: null,
              report: null,
              error: "could not create the profile folder",
            });
            stageIndex++;
            continue;
          }
          try {
            const scoped = documentForProfile(document, profile);
            const profileReport = await importIntoProfile(
              scoped,
              scoped.mods.map((mod) => mod.key),
              profileId,
            );
            reports.push(profileReport);
            importedProfiles.push({
              name,
              profileId,
              report: profileReport,
              error: null,
            });
          } catch (error) {
            importedProfiles.push({
              name,
              profileId,
              report: null,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          stageIndex++;
        }

        if (crosshairs.length > 0) {
          // The source's active crosshair is applied last, so it ends up
          // selected; the rest land in the history.
          const ordered = [...crosshairs].sort(
            (a, b) => Number(a.active) - Number(b.active),
          );
          const { setActiveCrosshair } = usePersistedStore.getState();
          ordered.forEach((crosshair, index) => {
            report(index, ordered.length, crosshair.name);
            const config = crosshairFromConvars(crosshair.convars);
            if (config) {
              setActiveCrosshair(config);
              crosshairCount++;
            }
          });
          report(ordered.length, ordered.length, "");
        }
      } finally {
        unlisten();
      }

      const names = new Map(document.mods.map((mod) => [mod.key, mod.name]));
      const unrecognized = new Map<string, UnrecognizedMod>();
      for (const result of reports.flatMap((r) => r.results)) {
        if (
          result.status === "imported" &&
          result.modId &&
          isLocalModId(result.modId)
        ) {
          unrecognized.set(result.modId, {
            modId: result.modId,
            name: names.get(result.key) ?? result.modId,
          });
        }
      }

      return {
        library,
        profiles: importedProfiles,
        crosshairs: crosshairCount,
        imported: count(reports, "imported"),
        skipped: count(reports, "skipped"),
        failed: count(reports, "failed"),
        unrecognized: [...unrecognized.values()],
      };
    },
  });

export const useIdentifyMods = () =>
  useMutation({
    mutationFn: (modIds: string[]) =>
      invoke<IdentifyResult[]>("identify_interchange_mods", { modIds }),
  });

const replaceIdentity = (
  mod: LocalMod,
  from: string,
  to: string,
  catalog: ModDto | null,
): LocalMod => {
  if (mod.remoteId !== from) return mod;
  const base = catalog
    ? { ...mod, ...catalog }
    : {
        ...mod,
        downloadable: true,
        remoteUrl: `https://gamebanana.com/${to.startsWith("snd-") ? "sounds" : "mods"}/${to.replace(/^snd-/, "")}`,
      };
  return { ...base, id: to, remoteId: to };
};

/** Link an imported local mod to its GameBanana submission everywhere: disk
 *  (every profile and the mod store) first, then every library record. */
export const useLinkMod = () =>
  useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const state = usePersistedStore.getState();
      const inUse = Object.values(state.profiles).some((profile) =>
        profile.mods.some((mod) => mod.remoteId === to),
      );
      if (inUse) {
        throw new Error(
          `GameBanana mod ${to} is already in your library; remove it first or skip this mod`,
        );
      }
      const catalog = await getMod(to).catch(() => null);
      await invoke("relabel_interchange_mod", { from, to });

      usePersistedStore.setState((current) => {
        const profiles = Object.fromEntries(
          Object.entries(current.profiles).map(([id, profile]) => {
            const enabledMods = { ...profile.enabledMods };
            const entry = enabledMods[from];
            if (entry) {
              delete enabledMods[from];
              enabledMods[to] = { ...entry, remoteId: to };
            }
            return [
              id,
              {
                ...profile,
                enabledMods,
                mods: profile.mods.map((mod) =>
                  replaceIdentity(mod, from, to, catalog),
                ),
              },
            ];
          }),
        );
        return {
          profiles,
          localMods: current.localMods.map((mod) =>
            replaceIdentity(mod, from, to, catalog),
          ),
        };
      });
      return { name: catalog?.name ?? to };
    },
  });

export type ExportSelection = {
  profiles: boolean;
  crosshairs: boolean;
};

export const useExportInterchangeBundle = () =>
  useMutation({
    mutationFn: async ({
      destinationDir,
      selection,
      onProgress,
    }: {
      destinationDir: string;
      selection: ExportSelection;
      onProgress: (progress: InterchangeProgress) => void;
    }) => {
      const state = usePersistedStore.getState();
      const active = state.getActiveProfile();
      const profiles = Object.values(state.profiles)
        .filter((profile) => selection.profiles || profile.id === active?.id)
        .map((profile) =>
          exportInputFromProfile(profile, profile.id === active?.id),
        );
      if (profiles.length === 0 && active) {
        profiles.push(exportInputFromProfile(active, true));
      }

      const crosshairs: InterchangeCrosshair[] = [];
      if (selection.crosshairs) {
        const seen = new Set<string>();
        const configs = [
          ...(state.activeCrosshair ? [state.activeCrosshair] : []),
          ...state.activeCrosshairHistory,
        ];
        configs.forEach((config, index) => {
          const fingerprint = JSON.stringify(config);
          if (seen.has(fingerprint)) return;
          seen.add(fingerprint);
          crosshairs.push({
            key: `crosshair:dmm:${index}`,
            name: index === 0 ? "Active crosshair" : `Crosshair ${index + 1}`,
            active: index === 0 && !!state.activeCrosshair,
            convars: crosshairToConvars(config),
          });
        });
      }

      const unlisten = await listen<InterchangeProgress>(
        EXPORT_PROGRESS_EVENT,
        (event) => onProgress(event.payload),
      );
      try {
        return await invoke<InterchangeExportReport>(
          "export_interchange_bundle",
          {
            request: {
              destinationDir,
              managerVersion: await getVersion().catch(() => null),
              profiles,
              includeProfiles: selection.profiles,
              crosshairs,
            },
          },
        );
      } finally {
        unlisten();
      }
    },
  });
