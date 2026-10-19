import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getPluginAssetUrl } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import type { ThemeOverrides } from "@/types/theme-overrides";

// Clicking the sidebar emote cycles through these, starting with the peek.
const SIDEBAR_EMOTES = ["peek", "w", "popcorn", "cozy", "sleep"].map((name) =>
  getPluginAssetUrl("themes", `public/pre-defined/drututt/${name}.png`),
);

const SidebarContentExtra = () => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const label = t("plugins.drututt.pokeEmote");

  return (
    <div className='group-data-[collapsible=icon]:hidden -ml-2 pb-1'>
      <button
        aria-label={label}
        className='transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
        onClick={() => setIndex((i) => (i + 1) % SIDEBAR_EMOTES.length)}
        title={label}
        type='button'>
        {/* The peek art has a wall on its right; mirrored, the window edge becomes the wall. */}
        <img
          alt={t("accessibility.drututtEmoteAlt")}
          className={cn(
            "size-14 object-contain",
            index === 0 && "-scale-x-100",
          )}
          src={SIDEBAR_EMOTES[index]}
        />
      </button>
    </div>
  );
};

export const overrides: ThemeOverrides = {
  brandName: "Drututt Mod Manager",
  sidebarContentExtra: SidebarContentExtra,
};
