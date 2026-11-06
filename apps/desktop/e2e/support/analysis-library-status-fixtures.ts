import { z } from "zod";
import type { FixtureRoute } from "./fixture-server";
import { CATALOG_MOD_ID, createCatalogRoutes } from "./gamebanana-fixtures";
import { readPersistedDocument } from "./observations";

/** Every analyzed file is identified as the catalog mod's `common.vpk`. */
const matchedHashRoute: FixtureRoute = {
  method: "POST",
  path: "/api/v2/vpk-analyse-hashes",
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

/** Onboarding's Analyze identifies the existing VPK as a catalog mod. */
export const onboardingIdentifiedRoutes = async () => {
  const catalogRoutes = await createCatalogRoutes("gamebanana-switch-onboard");
  return (origin: string): FixtureRoute[] => [
    ...catalogRoutes(origin),
    matchedHashRoute,
  ];
};

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
