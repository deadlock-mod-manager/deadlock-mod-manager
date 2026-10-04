import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { daysUntil } from "@/lib/seasonal-themes";
import { WitchHat } from "../art";
import { AmbientLayer } from "../effect-canvas";
import { createBatsAndEmbers } from "../effects";
import type { Season } from "../season";

const JackOLantern = () => (
  <svg aria-hidden viewBox='0 0 64 56' className='seasonal-pumpkin'>
    <path d='M30 10Q29 3 35 1L37 4Q33 5 34 10Z' fill='hsl(95 45% 32%)' />
    <ellipse cx='20' cy='32' rx='15' ry='20' fill='hsl(24 95% 42%)' />
    <ellipse cx='44' cy='32' rx='15' ry='20' fill='hsl(24 95% 42%)' />
    <ellipse cx='32' cy='32' rx='16' ry='22' fill='hsl(27 100% 52%)' />
    <g className='seasonal-pumpkin-glow' fill='hsl(48 100% 65%)'>
      <path d='M17 25 25 21 24 30Z' />
      <path d='M47 25 39 21 40 30Z' />
      <path d='M30 31 32 27 34 31Z' />
      <path d='M14 37Q32 50 50 37L45 39 42 36 38 41 32 38 26 41 22 36 19 39Z' />
    </g>
  </svg>
);

const Sidebar = () => {
  const { t } = useTranslation();
  const [boo, setBoo] = useState(false);
  const days = daysUntil(new Date(new Date().getFullYear(), 9, 31));

  useEffect(() => {
    if (!boo) return;
    const timer = setTimeout(() => setBoo(false), 1400);
    return () => clearTimeout(timer);
  }, [boo]);

  return (
    <div className='seasonal-sidebar-row'>
      <button
        type='button'
        className='seasonal-sidebar-art'
        data-boo={boo}
        aria-label={t("plugins.seasonal.halloween.poke")}
        title={t("plugins.seasonal.halloween.poke")}
        onClick={() => setBoo(true)}>
        <JackOLantern />
      </button>
      <div className='flex min-w-0 flex-col'>
        <span className='text-sm font-medium' role='status'>
          {boo
            ? t("plugins.seasonal.halloween.boo")
            : days <= 0
              ? t("plugins.seasonal.halloween.greeting")
              : t("plugins.seasonal.halloween.countdown", { count: days })}
        </span>
        <span className='seasonal-tagline text-xs text-muted-foreground'>
          {t("plugins.seasonal.halloween.tagline")}
        </span>
      </div>
    </div>
  );
};

const Fog = () => <AmbientLayer className='seasonal-fog' />;

export const halloween: Season = {
  i18nKey: "halloween",
  rootClass: "seasonal-halloween-theme-active",
  backdrop: {
    backgroundColor: "#0d0812",
    backgroundImage: `
      radial-gradient(circle at 84% 13%, #fff3d0 0 3.2vmin, rgba(255, 228, 160, 0.22) 3.5vmin, transparent 13vmin),
      radial-gradient(ellipse 90% 45% at 50% 108%, rgba(255, 110, 20, 0.3), transparent 70%),
      radial-gradient(ellipse 60% 55% at 8% 0%, rgba(120, 50, 170, 0.28), transparent 70%)
    `,
  },
  effect: createBatsAndEmbers,
  layer: "front",
  opacity: 0.9,
  Extra: Fog,
  Sidebar,
  logo: {
    colors: {
      "--primary": "27 100% 55%",
      "--primary-foreground": "275 40% 8%",
      "--secondary": "270 26% 19%",
    },
    Accessory: WitchHat,
  },
  hideouts: [
    { id: "spider", route: "/", place: "hang", at: 68, drop: 96 },
    { id: "ghost", route: "/my-mods", place: "right", at: 38 },
    { id: "cauldron", route: "/mods", place: "bottom", at: 80 },
    { id: "blackCat", route: "/settings", place: "bottom", at: 56 },
    { id: "tombstone", route: "/plugins", place: "bottom", at: 88 },
  ],
};
