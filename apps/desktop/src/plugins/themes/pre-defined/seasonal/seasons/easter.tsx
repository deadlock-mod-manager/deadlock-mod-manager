import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import { BunnyEars } from "../art";
import {
  BASKET_EGGS,
  EasterEgg,
  EGG_COUNT,
  EggHunt,
  useEggHunt,
} from "../egg-hunt";
import { createPetals } from "../effects";
import type { Season } from "../season";

const Sidebar = () => {
  const { t } = useTranslation();
  const found = useEggHunt((state) => state.found.length);
  const reset = useEggHunt((state) => state.reset);
  const allFound = found >= EGG_COUNT;

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-2'>
      <div className='seasonal-basket' aria-hidden>
        {BASKET_EGGS.map((egg, index) => (
          <EasterEgg
            key={egg.colors[0]}
            colors={egg.colors}
            pattern={egg.pattern}
            className={index < found ? "is-found" : undefined}
          />
        ))}
      </div>
      <span className='text-sm font-medium' role='status'>
        {allFound
          ? t("plugins.seasonal.easter.allFound")
          : t("plugins.seasonal.easter.progress", { found, total: EGG_COUNT })}
      </span>
      {allFound ? (
        <Button size='sm' variant='outline' type='button' onClick={reset}>
          {t("plugins.seasonal.easter.hideAgain")}
        </Button>
      ) : (
        <span className='seasonal-tagline text-xs text-muted-foreground'>
          {t("plugins.seasonal.easter.hint")}
        </span>
      )}
    </div>
  );
};

export const easter: Season = {
  i18nKey: "easter",
  rootClass: "seasonal-easter-theme-active",
  backdrop: {
    backgroundColor: "#0d1a13",
    backgroundImage: `
      radial-gradient(ellipse 90% 45% at 50% 112%, rgba(120, 200, 90, 0.26), transparent 70%),
      radial-gradient(ellipse 70% 50% at 50% -12%, rgba(140, 200, 255, 0.18), transparent 70%),
      radial-gradient(ellipse 45% 40% at 100% 30%, rgba(255, 170, 205, 0.14), transparent 70%),
      radial-gradient(ellipse 40% 35% at 0% 40%, rgba(255, 225, 120, 0.1), transparent 70%),
      radial-gradient(circle, rgba(255, 245, 190, 0.07) 1.5px, transparent 2px)
    `,
    backgroundSize: "100% 100%, 100% 100%, 100% 100%, 100% 100%, 28px 28px",
  },
  effect: createPetals,
  layer: "front",
  opacity: 0.8,
  Extra: EggHunt,
  Sidebar,
  logo: {
    colors: {
      "--primary": "48 96% 66%",
      "--primary-foreground": "150 35% 12%",
      "--secondary": "338 70% 72%",
    },
    Accessory: BunnyEars,
  },
  hideouts: [
    { id: "bunny", route: "/", place: "bottom", at: 72 },
    { id: "chick", route: "/my-mods", place: "right", at: 58 },
    { id: "carrot", route: "/mods", place: "bottom", at: 40 },
    { id: "tulip", route: "/settings", place: "bottom", at: 76 },
    { id: "eggOrnament", route: "/plugins", place: "hang", at: 80, drop: 60 },
  ],
};
