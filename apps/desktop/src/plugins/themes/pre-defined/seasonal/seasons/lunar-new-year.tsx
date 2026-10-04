import { useTranslation } from "react-i18next";
import { daysUntil, lunarNewYear, zodiacAnimal } from "@/lib/seasonal-themes";
import { createLanterns } from "../effects";
import { useLuckyCoins } from "../progress";
import { RedEnvelopes } from "../red-envelopes";
import type { Season } from "../season";

const Lantern = ({ x }: { x: number }) => (
  <g transform={`translate(${x} 0)`}>
    <line
      x1='12'
      y1='0'
      x2='12'
      y2='8'
      stroke='hsl(43 90% 55%)'
      strokeWidth='1.5'
    />
    <rect x='6' y='7' width='12' height='3' rx='1' fill='hsl(43 90% 55%)' />
    <ellipse cx='12' cy='22' rx='11' ry='13' fill='hsl(356 85% 46%)' />
    <path
      d='M12 9V35M5 12Q2 22 5 32M19 12Q22 22 19 32'
      stroke='hsl(352 70% 30%)'
      fill='none'
    />
    <rect x='6' y='34' width='12' height='3' rx='1' fill='hsl(43 90% 55%)' />
    <path d='M12 37V48' stroke='hsl(43 90% 55%)' strokeWidth='1.5' />
  </g>
);

const Sidebar = () => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const thisYear = lunarNewYear(year);
  // Keep the greeting through the Lantern Festival, two weeks after the new year.
  const festival =
    thisYear && daysUntil(thisYear) >= -14 ? thisYear : lunarNewYear(year + 1);
  const days = festival ? daysUntil(festival) : undefined;
  const animal = zodiacAnimal(festival?.getFullYear() ?? year);
  const coins = useLuckyCoins(year);

  return (
    <>
      <div className='seasonal-sidebar-row'>
        <svg aria-hidden viewBox='0 0 52 50' className='seasonal-lanterns'>
          <Lantern x={0} />
          <Lantern x={27} />
        </svg>
        <div className='flex min-w-0 flex-col'>
          <span className='text-sm font-medium'>
            {t("plugins.seasonal.lunarNewYear.yearOf", {
              animal: t(`plugins.seasonal.zodiac.${animal}`),
            })}
          </span>
          <span className='text-xs text-muted-foreground'>
            {days !== undefined && days > 0
              ? t("plugins.seasonal.lunarNewYear.countdown", { count: days })
              : t("plugins.seasonal.lunarNewYear.greeting")}
          </span>
        </div>
      </div>
      <span className='text-sm font-medium' role='status'>
        {t("plugins.seasonal.lunarNewYear.coins", { count: coins })}
      </span>
      <span className='seasonal-tagline text-xs text-muted-foreground'>
        {t("plugins.seasonal.lunarNewYear.envelopeHint")}
      </span>
    </>
  );
};

export const lunarNewYearSeason: Season = {
  i18nKey: "lunarNewYear",
  rootClass: "seasonal-lunar-new-year-theme-active",
  backdrop: {
    backgroundColor: "#170608",
    backgroundImage: `
      radial-gradient(ellipse 70% 60% at 50% -5%, rgba(220, 40, 40, 0.32), transparent 70%),
      radial-gradient(ellipse 60% 40% at 50% 110%, rgba(255, 170, 60, 0.18), transparent 70%),
      repeating-radial-gradient(circle at 0 100%, transparent 0 13px, rgba(255, 200, 90, 0.04) 13px 15px)
    `,
    backgroundSize: "100% 100%, 100% 100%, 30px 30px",
  },
  effect: createLanterns,
  layer: "back",
  Extra: RedEnvelopes,
  Sidebar,
  logo: {
    colors: {
      "--primary": "43 95% 56%",
      "--primary-foreground": "355 55% 16%",
      "--secondary": "356 70% 40%",
    },
  },
  hideouts: [
    { id: "firecrackers", route: "/", place: "hang", at: 82, drop: 40 },
    { id: "luckyCat", route: "/my-mods", place: "bottom", at: 86 },
    { id: "koi", route: "/mods", place: "right", at: 62 },
    { id: "mandarins", route: "/settings", place: "bottom", at: 58 },
    { id: "ingot", route: "/plugins", place: "right", at: 40 },
  ],
};
