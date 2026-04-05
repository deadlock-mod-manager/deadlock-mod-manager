import { announcementsRouter } from "./announcements";
import { authRouter } from "./auth";
import { crosshairsRouter } from "./crosshairs";
import { dashboardRouter } from "./dashboard";
import { featureFlagsRouter } from "./feature-flags";
import { fileserversRouter } from "./fileservers";
import { kvRouter } from "./kv";
import { modsRouter } from "./mods";
import { profilesRouter } from "./profiles";
import { reportsRouter } from "./reports";
import { vpkRouter } from "./vpk";

export const v2Router = {
  ...announcementsRouter,
  ...authRouter,
  ...crosshairsRouter,
  ...dashboardRouter,
  ...fileserversRouter,
  ...kvRouter,
  ...modsRouter,
  ...vpkRouter,
  ...profilesRouter,
  ...reportsRouter,
  ...featureFlagsRouter,
};
