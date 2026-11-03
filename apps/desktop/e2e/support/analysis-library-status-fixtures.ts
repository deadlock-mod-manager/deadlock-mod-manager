import { z } from "zod";
import type { FixtureRoute } from "./fixture-server";
import {
  CATALOG_MOD_ID,
  catalogVpk,
  createCatalogRoutes,
} from "./gamebanana-fixtures";
import { readPersistedDocument } from "./observations";
import { ALPHA, BETA, prepareInstalledProfiles } from "./profile-fixtures";
import type { CreatedWorld } from "./world";

const HASH_PATH = "/api/v2/vpk-analyse-hashes";
const PROFILE_PAGE = `/apiv11/Mod/${CATALOG_MOD_ID}/ProfilePage`;
/** Long enough to switch profiles away and back while restoring waits on it. */
export const RESTORE_METADATA_DELAY_MS = 15_000;

/** Every analyzed file is identified as the catalog mod's `common.vpk`. */
const matchedHashRoute: FixtureRoute = {
  method: "POST",
  path: HASH_PATH,
  status: 200,
  body: JSON.stringify([
    {
      matchedVpk: {
        id: "vpk_library_status",
        provider: "gamebanana",
        submissionType: "mod",
        submissionId: CATALOG_MOD_ID,
        fileId: "910001",
        sourcePath: "common.vpk",
      },
      match: { certainty: 100, matchType: "sha256" },
    },
  ]),
};

const withRoute = (
  routes: readonly FixtureRoute[],
  path: string,
  change: Partial<FixtureRoute>,
): FixtureRoute[] =>
  routes.map((route) =>
    route.path === path ? { ...route, ...change } : route,
  );

/** Onboarding's Analyze identifies the existing VPK as a catalog mod. */
export const onboardingIdentifiedRoutes = async () => {
  const catalogRoutes = await createCatalogRoutes("gamebanana-switch-onboard");
  return (origin: string): FixtureRoute[] => [
    ...catalogRoutes(origin),
    matchedHashRoute,
  ];
};

/**
 * The file is identified, but the mod page Analyze needs to register it fails
 * and the catalog index doesn't list the mod, so the mod never reaches the
 * library.
 */
export const registrationFailureRoutes = async () => {
  const catalogRoutes = await createCatalogRoutes("gamebanana-switch-register");
  return (origin: string): FixtureRoute[] => [
    ...withRoute(
      withRoute(catalogRoutes(origin), PROFILE_PAGE, {
        status: 503,
        body: "{}",
      }),
      "/apiv11/Mod/Index",
      {
        body: JSON.stringify({
          _aMetadata: { _nRecordCount: 0, _nPerpage: 50, _bIsComplete: true },
          _aRecords: [],
        }),
      },
    ),
    matchedHashRoute,
  ];
};

/**
 * Restoring the catalog mod from DMM's records waits on its mod page, which
 * leaves time to switch profiles before the restore lands.
 */
export const interruptedRestoreRoutes = async () => {
  const catalogRoutes = await createCatalogRoutes("gamebanana-switch-restore");
  return (origin: string): FixtureRoute[] => [
    ...withRoute(catalogRoutes(origin), PROFILE_PAGE, {
      headerDelayMs: RESTORE_METADATA_DELAY_MS,
    }),
    { method: "POST", path: HASH_PATH, status: 200, body: "[]" },
  ];
};

/** Alpha has the catalog mod installed as `pak01`; Beta is empty. */
export const prepareInterruptedRestoreWorld = (world: CreatedWorld) =>
  prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: [CATALOG_MOD_ID],
        slots: [1],
        payload: () => catalogVpk("common.vpk"),
      },
      { profile: BETA, modIds: [] },
    ],
    ALPHA.id,
  );

const ANALYSIS_DIALOG =
  '//div[@role="dialog"][.//h2[normalize-space()="Local Addon Analysis"]]';

/** The results dialog's card for an analyzed file. */
export const analysisCard = (fileName: string) =>
  `${ANALYSIS_DIALOG}//p[normalize-space()="${fileName}"]/ancestor::div[contains(@class,"rounded-lg")][1]`;

/** Library mod ids saved for the active library and for one profile. */
export const readLibraryIds = async (world: string, profileId: string) => {
  const { state } = z
    .object({
      state: z.object({
        localMods: z.array(z.object({ remoteId: z.string() })).default([]),
        profiles: z.record(
          z.string(),
          z.object({
            mods: z.array(z.object({ remoteId: z.string() })).default([]),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world));
  return {
    active: state.localMods.map((mod) => mod.remoteId),
    profile: (state.profiles[profileId]?.mods ?? []).map((mod) => mod.remoteId),
  };
};
