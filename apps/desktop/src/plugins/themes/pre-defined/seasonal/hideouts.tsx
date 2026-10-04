import { toast } from "@deadlock-mods/ui/components/sonner";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import type { SeasonalThemeId } from "@/lib/seasonal-themes";
import { ART } from "./art";
import { recordFind, useFinds } from "./progress";
import type { Hideout } from "./season";

const onRoute = (route: string, pathname: string) =>
  route === "/"
    ? pathname === "/"
    : pathname === route || pathname.startsWith(`${route}/`);

type HideoutsProps = { themeId: SeasonalThemeId; hideouts: Hideout[] };

export const Hideouts = ({ themeId, hideouts }: HideoutsProps) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const found = useFinds(themeId);

  return createPortal(
    <>
      {hideouts
        .filter((hideout) => onRoute(hideout.route, pathname))
        .map((hideout) => {
          const Art = ART[hideout.id];
          const item = t(`plugins.seasonal.items.${hideout.id}`);
          const isFound = found.includes(hideout.id);
          return (
            <button
              key={hideout.id}
              type='button'
              className='seasonal-hideout'
              data-place={hideout.place}
              data-found={isFound}
              style={
                {
                  [hideout.place === "right" ? "top" : "left"]:
                    `${hideout.at}%`,
                  "--drop": `${hideout.drop ?? 0}px`,
                } as CSSProperties
              }
              aria-label={item}
              title={item}
              onClick={() => {
                if (isFound) return;
                recordFind(themeId, hideout.id);
                toast(
                  t("plugins.seasonal.hideouts.found", {
                    item,
                    found: found.length + 1,
                    total: hideouts.length,
                  }),
                );
              }}>
              <Art />
            </button>
          );
        })}
    </>,
    document.body,
  );
};
