import { featureFlagsRouter } from "./feature-flags";
import { modsRouter } from "./mods";
import { profilesRouter } from "./profiles";
import { reportsRouter } from "./reports";
import { vpkRouter } from "./vpk";

export const v2Router = {
  ...modsRouter,
  ...vpkRouter,
  ...profilesRouter,
  ...reportsRouter,
  ...featureFlagsRouter,
};
