import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getPluginAssetUrl } from "@/lib/plugins";
import type { ThemeOverrides } from "@/types/theme-overrides";
import { Remling } from "./remling";

const artworkUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/remlock/artwork.png",
);

function SidebarContentExtra() {
  const { t } = useTranslation();
  const [discovery, setDiscovery] = useState<"awake" | "naptime" | "remlings">(
    "awake",
  );
  const label = t(
    discovery === "awake"
      ? "plugins.remlock.letRemNap"
      : discovery === "naptime"
        ? "plugins.remlock.summonRemlings"
        : "plugins.remlock.sendRemlingsHome",
  );

  return (
    <div className='group-data-[collapsible=icon]:hidden px-3 pb-4'>
      <button
        type='button'
        className='remlock-artwork relative block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
        aria-label={label}
        title={label}
        onClick={() =>
          setDiscovery((current) =>
            current === "awake"
              ? "naptime"
              : current === "naptime"
                ? "remlings"
                : "awake",
          )
        }>
        <img src={artworkUrl} alt={t("plugins.remlock.artworkAlt")} />
        {discovery !== "awake" && (
          <span className='remlock-discovery' data-discovery={discovery}>
            <span className='remlock-visitors' aria-hidden='true'>
              <Remling sleeping={discovery === "naptime"} />
              {discovery === "naptime" ? (
                <span className='remlock-zzz'>z z Z</span>
              ) : (
                <>
                  <Remling />
                  <Remling />
                </>
              )}
            </span>
            <span className='text-xs' role='status'>
              {t(
                discovery === "naptime"
                  ? "plugins.remlock.naptime"
                  : "plugins.remlock.tagAlong",
              )}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}

export const overrides: ThemeOverrides = {
  sidebarContentExtra: SidebarContentExtra,
};
