import type { SeasonalThemeId } from "@/lib/seasonal-themes";
import {
  ThemeBackdrop,
  useThemeRootClass,
} from "../../components/theme-backdrop";
import { EffectCanvas } from "./effect-canvas";
import { Hideouts } from "./hideouts";
import { SEASONS } from "./seasons";

export const SeasonalTheme = ({ themeId }: { themeId: SeasonalThemeId }) => {
  const season = SEASONS[themeId];
  useThemeRootClass("seasonal-theme-active");

  return (
    <>
      <ThemeBackdrop rootClass={season.rootClass} style={season.backdrop} />
      <EffectCanvas
        create={season.effect}
        layer={season.layer}
        opacity={season.opacity}
      />
      {season.Extra ? <season.Extra /> : null}
      <Hideouts themeId={themeId} hideouts={season.hideouts} />
    </>
  );
};
