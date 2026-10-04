import type { SeasonalThemeId } from "@/lib/seasonal-themes";
import type { Season } from "../season";
import { christmas } from "./christmas";
import { easter } from "./easter";
import { halloween } from "./halloween";
import { lunarNewYearSeason } from "./lunar-new-year";
import { newYear } from "./new-year";

export const SEASONS = {
  "seasonal-halloween": halloween,
  "seasonal-christmas": christmas,
  "seasonal-new-year": newYear,
  "seasonal-lunar-new-year": lunarNewYearSeason,
  "seasonal-easter": easter,
} satisfies Record<SeasonalThemeId, Season>;
