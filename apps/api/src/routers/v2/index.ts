import { announcementsRouter } from "./announcements";
import { authRouter } from "./auth";
import { dashboardRouter } from "./dashboard";
import { featureFlagsRouter } from "./feature-flags";
import { friendsRouter } from "./friends";
import { modsRouter } from "./mods";
import { profilesRouter } from "./profiles";
import { reportsRouter } from "./reports";
import { vpkRouter } from "./vpk";

export const v2Router = {
  ...announcementsRouter,
  ...authRouter,
  ...dashboardRouter,
  ...friendsRouter,
  ...modsRouter,
  ...vpkRouter,
  ...profilesRouter,
  ...reportsRouter,
  ...featureFlagsRouter,
};
