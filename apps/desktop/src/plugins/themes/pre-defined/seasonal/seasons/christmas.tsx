import { useState } from "react";
import { useTranslation } from "react-i18next";
import { daysUntil } from "@/lib/seasonal-themes";
import { AdventCalendar } from "../advent-calendar";
import { SantaHat } from "../art";
import { AmbientLayer } from "../effect-canvas";
import { createSnow } from "../effects";
import type { Season } from "../season";

const LIGHTS = [
  [30, 22, "hsl(42 100% 70%)"],
  [24, 34, "hsl(352 70% 58%)"],
  [37, 38, "hsl(36 100% 82%)"],
  [19, 50, "hsl(42 100% 70%)"],
  [31, 52, "hsl(36 100% 82%)"],
  [42, 54, "hsl(352 70% 58%)"],
] as const;

const ChristmasTree = () => (
  <svg aria-hidden viewBox='0 0 60 72' className='seasonal-tree'>
    <rect x='26' y='60' width='8' height='10' rx='1' fill='hsl(25 45% 28%)' />
    <path d='M30 8 14 30H46Z' fill='hsl(140 30% 32%)' />
    <path d='M30 18 10 44H50Z' fill='hsl(140 32% 27%)' />
    <path d='M30 30 6 62H54Z' fill='hsl(142 34% 23%)' />
    <path
      d='M17 27q13 5 25-1M13 42q18 6 33-2M10 58q20 6 40-2'
      stroke='hsl(42 85% 62%)'
      strokeWidth='1.2'
      fill='none'
      opacity='0.8'
    />
    <path
      d='M30 1 32 6 37 6 33 9 35 14 30 11 25 14 27 9 23 6 28 6Z'
      className='seasonal-tree-star'
    />
    {LIGHTS.map(([cx, cy, fill], index) => (
      <circle
        key={`${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r='2.2'
        fill={fill}
        className='seasonal-tree-light'
        style={{ animationDelay: `${index * 0.35}s` }}
      />
    ))}
  </svg>
);

const Sidebar = () => {
  const { t } = useTranslation();
  const [lightsOn, setLightsOn] = useState(true);
  const days = daysUntil(new Date(new Date().getFullYear(), 11, 25));
  const label = t(
    lightsOn
      ? "plugins.seasonal.christmas.lightsOff"
      : "plugins.seasonal.christmas.lightsOn",
  );

  return (
    <>
      <div className='seasonal-sidebar-row'>
        <button
          type='button'
          className='seasonal-sidebar-art'
          data-lights={lightsOn ? "on" : "off"}
          aria-label={label}
          title={label}
          onClick={() => setLightsOn((on) => !on)}>
          <ChristmasTree />
        </button>
        <div className='flex min-w-0 flex-col'>
          <span className='text-sm font-medium'>
            {days <= 1
              ? t("plugins.seasonal.christmas.greeting")
              : t("plugins.seasonal.christmas.countdown", { count: days })}
          </span>
          <span className='seasonal-tagline text-xs text-muted-foreground'>
            {t("plugins.seasonal.christmas.tagline")}
          </span>
        </div>
      </div>
      <AdventCalendar />
    </>
  );
};

const Hearth = () => <AmbientLayer className='seasonal-hearth' />;

export const christmas: Season = {
  i18nKey: "christmas",
  rootClass: "seasonal-christmas-theme-active",
  backdrop: {
    backgroundColor: "#140c09",
    backgroundImage: `
      radial-gradient(ellipse 65% 55% at 0% 100%, rgba(255, 140, 50, 0.22), transparent 70%),
      radial-gradient(ellipse 55% 45% at 100% 0%, rgba(190, 50, 60, 0.16), transparent 70%),
      radial-gradient(ellipse 80% 40% at 50% 112%, rgba(255, 236, 210, 0.08), transparent 70%),
      radial-gradient(circle, rgba(255, 210, 140, 0.1) 1px, transparent 1.6px)
    `,
    backgroundSize: "100% 100%, 100% 100%, 100% 100%, 34px 34px",
  },
  effect: createSnow,
  layer: "front",
  opacity: 0.85,
  Extra: Hearth,
  Sidebar,
  logo: {
    colors: {
      "--primary": "38 78% 60%",
      "--primary-foreground": "20 38% 11%",
      "--secondary": "352 50% 36%",
    },
    Accessory: SantaHat,
  },
  hideouts: [
    { id: "gingerbread", route: "/", place: "hang", at: 74, drop: 70 },
    { id: "candyCane", route: "/my-mods", place: "right", at: 46 },
    { id: "snowman", route: "/mods", place: "bottom", at: 84 },
    { id: "present", route: "/settings", place: "bottom", at: 60 },
    { id: "bell", route: "/plugins", place: "hang", at: 86, drop: 46 },
  ],
};
