import { announcementsRouter } from "./announcements";
import { authRouter } from "./auth";
import { crosshairsRouter } from "./crosshairs";
import { dashboardRouter } from "./dashboard";
import { featureFlagsRouter } from "./feature-flags";
import { friendsRouter } from "./friends";
import { heartbeatRouter } from "./heartbeat";
import { modsRouter } from "./mods";
import { profilesRouter } from "./profiles";
import { reportsRouter } from "./reports";
import { vpkRouter } from "./vpk";

export const v2Router = {
  ...announcementsRouter,
  ...authRouter,
  ...crosshairsRouter,
  ...dashboardRouter,
  ...friendsRouter,
  ...heartbeatRouter,
  ...modsRouter,
  ...vpkRouter,
  ...profilesRouter,
  ...reportsRouter,
  ...featureFlagsRouter,
};
