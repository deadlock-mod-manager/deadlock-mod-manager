import type { ThemeOverrides } from "@/types/theme-overrides";
import { FrenchBanner } from "./banner";
import { FrenchLogo } from "./logo";

export const overrides: ThemeOverrides = {
  brandName: "Le Deadlock",
  libraryBanner: FrenchBanner,
  topbarLogo: FrenchLogo,
};
